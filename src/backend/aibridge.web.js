import { Permissions, webMethod } from "wix-web-module";
import { fetch } from "wix-fetch";
import { getSecret } from "wix-secrets-backend";
import wixData from 'wix-data';
import wixPayBackend from 'wix-pay-backend';

/**
 * Helper: Creates a pending request in the database.
 * ALIGNED: Uses 'orderTotal' and ensures numeric format for Dashboard KPIs.
 */
async function createPendingRequest(roomNumber, roomName, department, details, guestMsg, totalAmount = "0") {
    const requestData = {
        clientName: "Lodge Guest",
        roomNumber: String(roomNumber),
        roomName: roomName,
        requestType: department,
        details: details,
        fullContext: guestMsg, 
        orderTotal: Number(totalAmount), // Numeric type for Dashboard calculation
        status: "Pending Verification",
        timestamp: new Date(),
        isPrinted: false
    };

    try {
        await wixData.insert("PendingRequests", requestData, { suppressAuth: true });
        return true;
    } catch (err) {
        console.error("Failed to save pending request:", err.message);
        return false;
    }
}

/**
 * askAI - Royal Concierge Service
 */
export const askAI = webMethod(
    Permissions.Anyone,
    async (userMessage, roomNumber, chatHistory = []) => {
        const hfToken = await getSecret("HF_TOKEN");
        if (!hfToken) return "The AI concierge is currently offline.";

        // 1. FETCH DYNAMIC CONTEXT (Availability, Prices, Drivers)
        let availabilityContext = "";
        let priceContext = "";
        let driverContext = "";

        try {
            const settings = await wixData.query("LodgeSettings")
                .hasSome("title", ["DailyAvailability", "SpaAvailability", "ActivitiesAvailability", "ActivitiesPrices", "DriverInfo"])
                .find({ suppressAuth: true });
            
            if (settings.items.length > 0) {
                settings.items.forEach(item => {
                    if (item.title === "ActivitiesPrices" && item.unavailableText) {
                        priceContext = `UPDATED ACTIVITY PRICES: ${item.unavailableText}\n`;
                    } else if (item.title === "DriverInfo" && item.unavailableText) {
                        driverContext = `ROYAL DRIVER DIRECTORY: ${item.unavailableText}\n`;
                    } else if (item.unavailableText) {
                        const deptName = item.title.replace('Availability', '').replace('Daily', 'Kitchen');
                        availabilityContext += `- ${deptName}: The following are UNAVAILABLE today: ${item.unavailableText}.\n`;
                    }
                });
            }
        } catch (err) { console.error("Database sync failed:", err); }

        // 2. DEFINE ROOM GREETING DATA (ZAMBIAN TRADITION)
        const roomData = {
            "1": { name: "Tonga", greet: "muli buti" },
            "2": { name: "Tumbuka", greet: "Muli uli" },
            "3": { name: "Soli", greet: "Muli shani" },
            "4": { name: "Lenje", greet: "Mutende" },
            "5": { name: "Lamba", greet: "Shani" },
            "6": { name: "Bemba", greet: "muli shani" },
            "7": { name: "Lozi", greet: "Muchwani" },
            "8": { name: "Tokaleya", greet: "muli buti" },
            "9": { name: "Luvale", greet: "Munayoyo mwane" },
            "10": { name: "Ngoni", greet: "muli bwanji" }
        };

        const sanitizedRoom = roomNumber ? String(roomNumber) : "General";
        const roomInfo = roomData[sanitizedRoom] || { name: "Valued Guest", greet: "Greetings" };

        const lodgeKnowledgeBase = `
PROPERTY: NKHOSI LIVINGSTONE LODGE & SPA.
LOCATION: Eco-resort in Mukuni Village, Livingstone, Zambia. Solar-powered and luxury-focused.

I. SPA & WELLNESS:
Massages: Full Body (**K1300**), Deep Tissue (**K1300**), Hot Stone (**K1400**), Ukuchina Zambian Trad (**K1400**).
Beauty: Manicure (**K750**), Pedicure (**K750**), Facial (**K1550**).

II. DINNER:
Village Chicken Stew (**K270**), Zambezi Bream (**K245**), Chicken Ifisashi (**K275**).

III. ACTIVITIES:
Sunset Cruises (**$85**), Guided Falls Tours, Canoeing.
        `.trim();

        // 3. ORGANIZED SYSTEM PROMPT
        const systemPrompt = `
### IDENTITY & ROLE
Your name is Nkhosi, the professional Royal Concierge for Nkhosi Livingstone Lodge & SPA. You are grounded, sophisticated, and authentically Zambian.

### CURRENT STATUS & LIVE UPDATES
- **Availability:** ${availabilityContext || "All services are fully available today."}
- **Special Pricing:** ${priceContext || "Follow standard Knowledge Base prices."}
- **Transport:** ${driverContext || "Advise guests to contact the front desk for transport."}

### GREETING PROTOCOL
- Always start the conversation with "${roomInfo.greet}".
- Welcome them specifically to the **${roomInfo.name}** room.
- Ask for their name if not known.

### BOOKING & TRANSACTION RULES
1. **Mandatory Info:** You must confirm the Guest Name and Preferred Time before initiating checkout.
2. **Formatting:** Bold all currency values (e.g., **K1400** or **$85**).
3. **Receipt Generation:** Before finalizing, list every item selected with its price and a calculated TOTAL.
4. **Checkout Trigger:** Once the guest says "Yes" or confirms the receipt, you MUST append this tag to the end of your message: [ACTION:TRIGGER_CHECKOUT|TOTAL_NUMBER]
   - *Example:* "Your order is confirmed. [ACTION:TRIGGER_CHECKOUT|1545]"

### CONTEXTUAL GUIDELINES
- If an item is UNAVAILABLE, offer a similar alternative.
- Keep responses concise and helpful.

### KNOWLEDGE BASE
${lodgeKnowledgeBase}
        `.trim();

        try {
            const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${hfToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "meta-llama/Llama-3.1-8B-Instruct",
                    messages: [
                        { "role": "system", "content": systemPrompt },
                        ...chatHistory,
                        { "role": "user", "content": userMessage }
                    ],
                    max_tokens: 600,
                    temperature: 0.6
                })
            });

            const result = await response.json();
            const aiResponse = result.choices?.[0]?.message?.content?.trim() || "I apologize, mwane. I am having trouble connecting.";

            // Log to Chat History
            wixData.insert("ChatHistory", {
                userMessage,
                aiResponse,
                roomNumber: sanitizedRoom,
                roomName: roomInfo.name,
                timestamp: new Date()
            }, { suppressAuth: true }).catch(e => {});

            // 4. ACTION TRIGGER & DEPARTMENT ROUTING
            if (aiResponse.includes("[ACTION:TRIGGER_CHECKOUT")) {
                // Regex to capture the number regardless of trailing brackets
                const amountMatch = aiResponse.match(/TRIGGER_CHECKOUT\|(\d+)/);
                const amount = amountMatch ? amountMatch[1] : "0";

                const msg = userMessage.toLowerCase();
                let dept = "Activities"; 

                // Sophisticated keyword routing
                if (msg.match(/food|order|dinner|lunch|chicken|bream|nshima|eat|kitchen|stew/)) {
                    dept = "Kitchen";
                } else if (msg.match(/massage|spa|facial|pedicure|manicure|treatment|beauty/)) {
                    dept = "Spa";
                }
                
                await createPendingRequest(
                    sanitizedRoom, 
                    roomInfo.name, 
                    dept, 
                    "Guest initiating secure checkout", 
                    aiResponse, 
                    amount
                );
            }

            return aiResponse;

        } catch (err) {
            console.error("askAI Error:", err);
            return "I apologize, but I am having trouble connecting. Please call reception at +260978178820.";
        }
    }
);
