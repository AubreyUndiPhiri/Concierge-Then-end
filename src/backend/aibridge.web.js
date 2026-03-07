import { Permissions, webMethod } from "wix-web-module";
import { fetch } from "wix-fetch";
import { getSecret } from "wix-secrets-backend";
import wixData from 'wix-data';
import wixPayBackend from 'wix-pay-backend';

/**
 * Helper: Creates a pending request in the database.
 */
async function createPendingRequest(roomNumber, roomName, department, details, guestMsg) {
    const requestData = {
        clientName: "Lodge Guest",
        roomNumber: String(roomNumber),
        roomName: roomName,
        requestType: department,
        details: details,
        fullContext: guestMsg, 
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
 * Generates a payment session for specific activities.
 */
export const createActivityPayment = webMethod(
    Permissions.Anyone,
    async (activityName, price, guestName = "Lodge Guest") => {
        const paymentInfo = {
            amount: price,
            items: [{ name: activityName, price: price }],
            userInfo: { firstName: guestName }
        };
        try {
            return await wixPayBackend.createPayment(paymentInfo);
        } catch (err) {
            console.error("Payment creation error:", err.message);
            return null;
        }
    }
);

/**
 * askAI - Royal Concierge Service
 */
export const askAI = webMethod(
    Permissions.Anyone,
    async (userMessage, roomNumber, chatHistory = []) => {
        const hfToken = await getSecret("HF_TOKEN");

        if (!hfToken) return "The AI concierge is currently offline.";

        // 1. FETCH AVAILABILITY, PRICE, AND DRIVER UPDATES FROM DATABASE
        let availabilityContext = "";
        let priceContext = "";
        let driverContext = "";

        try {
            // IMPROVEMENT: Added "DriverInfo" to the query to ensure AI receives synced driver data
            const settings = await wixData.query("LodgeSettings")
                .hasSome("title", ["DailyAvailability", "SpaAvailability", "ActivitiesAvailability", "ActivitiesPrices", "DriverInfo"])
                .find({ suppressAuth: true });
            
            if (settings.items.length > 0) {
                settings.items.forEach(item => {
                    if (item.title === "ActivitiesPrices" && item.unavailableText) {
                        priceContext = `UPDATED ACTIVITY PRICES: ${item.unavailableText}\n`;
                    } else if (item.title === "DriverInfo" && item.unavailableText) {
                        // IMPROVEMENT: Captured the specific synced driver information
                        driverContext = `ROYAL DRIVER DIRECTORY: ${item.unavailableText}\n`;
                    } else if (item.unavailableText) {
                        const deptName = item.title.replace('Availability', '').replace('Daily', 'Kitchen');
                        availabilityContext += `- ${deptName}: The following are UNAVAILABLE today: ${item.unavailableText}.\n`;
                    }
                });
            }
        } catch (err) { 
            console.error("Database sync failed:", err); 
        }

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
LOCATION: Eco-friendly, solar-powered luxury eco-resort in Mukuni Village, Livingstone, Zambia.

I. SPA & WELLNESS:
- Massages: Full Body (**K1300**/60m), Deep Tissue (**K1300**/60m), Hot Stone (**K1400**/90m), Ukuchina (Zambian Traditional) (**K1400**/90m), Soul Of Livingstone (**K1400**/90m), Back, Neck & Shoulder (**K950**/30m), Foot Massage (**K750**/20m).
- Beauty: Manicure (**K750** standard / **K850** gel), Pedicure (**K750** standard / **K850** gel), Gel Overlay (**K700**), Deep Cleansing Facial (**K1550**).

II. DINNER COLLECTION:
- Main Meals: Village Chicken Stew (**K270**), African Chicken Ifisashi (**K275**), Signature Whole Zambezi Bream (**K245**).

III. ACTIVITIES:
- Victoria Falls: Guided Falls Tours, Livingstone Island & Devil’s Pool (Seasonal).
- River: Sunset Cruises (**$85**), Canoeing, Fishing.
        `.trim();

        const systemPrompt = `
Your name is Nkhosi. You are the professional Royal Concierge for Nkhosi Livingstone Lodge & SPA.

AVAILABILITY, PRICING & TRANSPORT LOGIC:
${priceContext || "Use standard pricing from Knowledge Base."}
${availabilityContext || "All services are available."}
${driverContext || "Refer transport inquiries to the front desk."}

PROTOCOL: 
- If 'ROYAL DRIVER DIRECTORY' is provided above, use that specific list for all transport/taxi inquiries.
- If 'UPDATED ACTIVITY PRICES' is provided above, you MUST prioritize those prices over the Knowledge Base.
- If a guest asks for something marked as UNAVAILABLE, apologize politely and suggest a similar available alternative.

CONVERSATIONAL GUIDELINES:
1. GREETING: Start with "${roomInfo.greet}" and welcome them to the **${roomInfo.name}** room. 
2. STYLE: Professional, welcoming, and helpful. Keep responses concise.
3. ACCURACY: Always bold prices using the currency provided (e.g. **K250** or **$85**).
4. ORDERING: If they want to order food, book a spa treatment, or book an activity, you MUST append this tag to the end of your message: [ACTION:TRIGGER_CHECKOUT].

KNOWLEDGE BASE:
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
            const aiResponse = result.choices?.[0]?.message?.content?.trim() || "I apologize, mwane. I am having trouble processing that request right now.";

            // LOG TO CHAT HISTORY FOR ADMIN KPIs
            wixData.insert("ChatHistory", {
                userMessage: userMessage,
                aiResponse: aiResponse,
                roomNumber: sanitizedRoom,
                roomName: roomInfo.name,
                timestamp: new Date()
            }, { suppressAuth: true }).catch(e => console.error("History log failed"));

            // CHECKOUT TRIGGER LOGIC & DEPARTMENT ROUTING
            if (aiResponse.includes("[ACTION:TRIGGER_CHECKOUT]")) {
                const msg = userMessage.toLowerCase();
                let dept = "Activities"; 

                if (msg.includes("steak") || msg.includes("chicken") || msg.includes("bream") || msg.includes("food") || msg.includes("burger") || msg.includes("nshima") || msg.includes("order") || msg.includes("dinner") || msg.includes("lunch")) {
                    dept = "Kitchen";
                } else if (msg.includes("massage") || msg.includes("spa") || msg.includes("facial") || msg.includes("manicure") || msg.includes("treatment") || msg.includes("pedicure")) {
                    dept = "Spa";
                }
                
                await createPendingRequest(sanitizedRoom, roomInfo.name, dept, "Guest initiating secure checkout", userMessage);
            }

            return aiResponse;

        } catch (err) {
            console.error("HF Fetch Error:", err);
            return "I apologize, but I am having trouble connecting to the royal network. Please call reception at +260978178820.";
        }
    }
);
