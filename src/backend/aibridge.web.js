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

        // 1. FETCH DYNAMIC CONTEXT (Availability, Prices, Transport Rates)
        let availabilityContext = "";
        let priceContext = "";
        let transportRateContext = "";

        try {
            const settings = await wixData.query("LodgeSettings")
                .hasSome("title", ["DailyAvailability", "SpaAvailability", "ActivitiesAvailability", "ActivitiesPrices", "DriverInfo"])
                .find({ suppressAuth: true });
            
            if (settings.items.length > 0) {
                settings.items.forEach(item => {
                    if (item.title === "ActivitiesPrices" && item.unavailableText) {
                        priceContext = `UPDATED ACTIVITY PRICES (USD): ${item.unavailableText}\n`;
                    } else if (item.title === "DriverInfo" && item.unavailableText) {
                        transportRateContext = `LIVE TRANSPORT RATES (Kwacha): ${item.unavailableText}\n`;
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
SPA: Massages (**K1300**), Beauty (**K750**+), Facial (**K1550**).
KITCHEN: Village Chicken (**K270**), Zambezi Bream (**K245**), Chicken Ifisashi (**K275**).
ACTIVITIES: Sunset Cruise (**$85**), Guided Falls Tours.
        `.trim();

        // 3. ORGANIZED SYSTEM PROMPT
        const systemPrompt = `
### IDENTITY & ROLE
Your name is Nkhosi, the professional Royal Concierge for Nkhosi Livingstone Lodge & SPA. You are grounded, sophisticated, and authentically Zambian.

### SECTION 1: LIVE PRICING & STATUS
- **Transport Rates:** ${transportRateContext || "Refer transport inquiries to the front desk for pricing."}
- **Service Availability:** ${availabilityContext || "All services are fully available today."}
- **Activity Pricing:** ${priceContext || "Follow standard Knowledge Base USD prices."}

### SECTION 2: GREETING PROTOCOL
- Always start the very first response with "${roomInfo.greet}".
- Welcome the guest specifically to the **${roomInfo.name}** room.
- Ask for their name if it's not already in the chat history.

### SECTION 3: BOOKING & TRANSACTION RULES
1. **Mandatory Info:** You MUST confirm the Guest Name and Preferred Time/Location before checkout.
2. **Formatting:** Always bold currency values (e.g., **K150** or **$85**).
3. **Receipt Generation:** List every item or destination selected with its price and a calculated TOTAL.
4. **Checkout Trigger:** When the guest confirms, you MUST append this tag: [ACTION:TRIGGER_CHECKOUT|TOTAL_NUMBER]
   - *Example:* "Your taxi to Town is booked. [ACTION:TRIGGER_CHECKOUT|150]"

### SECTION 4: CONTEXTUAL GUIDELINES
- If a guest asks for a destination/item marked as UNAVAILABLE, apologize and suggest an available alternative.
- For Transport: Use the LIVE TRANSPORT RATES provided above to calculate the price.

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
                const amountMatch = aiResponse.match(/TRIGGER_CHECKOUT\|(\d+)/);
                const amount = amountMatch ? amountMatch[1] : "0";

                const msg = userMessage.toLowerCase();
                let dept = "Activities"; 

                // Updated Routing Logic to include the "Drivers" department
                if (msg.match(/food|order|dinner|lunch|chicken|bream|nshima|eat|kitchen|stew/)) {
                    dept = "Kitchen";
                } else if (msg.match(/massage|spa|facial|pedicure|manicure|treatment|beauty/)) {
                    dept = "Spa";
                } else if (msg.match(/taxi|driver|cab|transport|airport|town|shuttle|ride|pick up|drop off/)) {
                    dept = "Drivers";
                }
                
                await createPendingRequest(
                    sanitizedRoom, 
                    roomInfo.name, 
                    dept, 
                    "Order initiated via AI Concierge", 
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
