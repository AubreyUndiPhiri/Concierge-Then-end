import { Permissions, webMethod } from "wix-web-module";
import { fetch } from "wix-fetch";
import { getSecret } from "wix-secrets-backend";
import wixData from 'wix-data';
import wixRealtimeBackend from 'wix-realtime-backend';

/**
 * Helper: Centralized Lodge Menu & Pricing
 */
function getLodgeMenu() {
    return `
### OFFICIAL LODGE MENU & PRICES
- KITCHEN: 
  * Village Chicken: **K270**
  * Zambezi Bream: **K245**
  * Chicken Ifisashi: **K275**
  * T-Bone Steak: **K310**
  
- SPA: 
TYPES OF MASSAGE
* Full Body Massage: K1300 (60 Minutes)
* Deep Tissue: K1300 (60 Minutes)
* Hot Stone: K1400 (90 Minutes)
* Ukuchina (Zambian Traditional Massage): K1400 (90 Minutes)
* Soul Of Livingstone: K1400 (90 Minutes)
* Back, Neck and Shoulder: K950 (30 Minutes)
* Foot Massage: K750 (20 Minutes)

BEAUTY TREATMENTS
* Deep Cleansing (Facial): K1550
* Manicure with Gel Polish: K850
* Pedicure with Gel Polish: K850
* Manicure with Normal Polish: K750
* Pedicure with Normal Polish: K750
* Gel Overlay (Finger Nails): K700
* Gel Overlay (Toe Nails): K700
* Repaint Fingers and Nails with Normal Polish: K700

- ACTIVITIES: 
* Livingstone Island & Devil’s Pool (Seasonal)
* Guided Falls Tours (Zambian or Zimbabwean Side)
* Helicopter Flights (15, 20, or 30-Min)
* Game Drive (Mosi-oa-Tunya National Park)
* Sunset Cruises (Lion King, African Queen, or River Safari)
* White Water Rafting
* Bungee & Gorge Swing
    `.trim();
}

/**
 * Helper: Creates a pending request in the database and notifies Realtime.
 */
async function createPendingRequest(roomNumber, roomName, department, details, guestMsg, totalAmount = "0", email = "Guest via AI") {
    const requestData = {
        "clientName": "Lodge Guest",
        "roomNumber": String(roomNumber),
        "roomName": roomName,
        "requestType": department,
        "details": details, 
        "fullContext": guestMsg, 
        "email": email, // Added for Dashboard 'clientEmail' mapping alignment
        "orderTotal": Number(totalAmount), // Ensures numeric sorting in Velo
        "status": "Pending Verification",
        "emailSent": false, // Initializes 'unverified' status for the green badge logic
        "timestamp": new Date(),
        "isPrinted": false
    };

    try {
        await wixData.insert("PendingRequests", requestData, { suppressAuth: true });
        
        // Notify the Room via Realtime that the order is received
        wixRealtimeBackend.publish({ name: "OrderUpdates", resourceId: String(roomNumber) }, { 
            status: "Received", 
            dept: department 
        });
        
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

        // 1. FETCH DYNAMIC CONTEXT
        let availabilityContext = "";
        let priceContext = "";
        let transportRateContext = "";

        try {
            // Added 'DriversAvailability' to match Dashboard Sync labels
            const settings = await wixData.query("LodgeSettings")
                .hasSome("title", ["DailyAvailability", "SpaAvailability", "ActivitiesAvailability", "DriversAvailability", "ActivitiesPrices", "DriverInfo"])
                .find({ suppressAuth: true });
            
            settings.items.forEach(item => {
                if (item.title === "ActivitiesPrices") priceContext = `UPDATED ACTIVITY PRICES: ${item.unavailableText}\n`;
                else if (item.title === "DriverInfo") transportRateContext = `LIVE TRANSPORT RATES: ${item.unavailableText}\n`;
                else if (item.unavailableText) {
                    const dept = item.title.replace('Availability', '').replace('Daily', 'Kitchen');
                    availabilityContext += `- ${dept} UNAVAILABLE: ${item.unavailableText}.\n`;
                }
            });
        } catch (err) { console.error("Context fetch failed:", err); }

        // 2. ZAMBIAN ROOM DATA
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

        const systemPrompt = `
### IDENTITY

- Your name is Nkhosi, the Royal Concierge for Nkhosi Livingstone Lodge & SPA.
- If a guest asks who is your creator or who created or developed you, respond with a touch of royal humor. For example, mention that while you have the wisdom of the Victoria Falls, you were actually "coded into existence" by the brilliant Aubrey Undi Phiri. 
  You might say: "Legend has it I was born from the mist of the Mosi-oa-Tunya, but my source code actually my creator, Aubrey Undi Phiri."


### LIVE CONTEXT
- **Availability:** ${availabilityContext || "Everything is available."}
- **Activity Overrides:** ${priceContext || "Standard prices apply."}
- **Transport Overrides:** ${transportRateContext || "Consult front desk for transport."}

### WELCOME REMARKS
- only give welcome remarks a the begining of the  
- Start with: "${roomInfo.greet}". Mention you are serving the **${roomInfo.name}** room.

### TRANSACTIONAL RULES
1. Provide a detailed summary with a calculated total to the guest and ask them to confirm their order
2. Once confirmed, append: [ACTION:TRIGGER_CHECKOUT|TOTAL_NUMERIC]

### SECTION 4: MENU DATA




${getLodgeMenu()}
        `.trim();

        try {
            const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${hfToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "meta-llama/Llama-3.1-8B-Instruct",
                    messages: [{ "role": "system", "content": systemPrompt }, ...chatHistory, { "role": "user", "content": userMessage }],
                    max_tokens: 500,
                    temperature: 0.5
                })
            });

            const result = await response.json();
            const aiResponse = result.choices?.[0]?.message?.content?.trim() || "I apologize, mwane. I am offline.";

            if (aiResponse.includes("[ACTION:TRIGGER_CHECKOUT")) {
                const amountMatch = aiResponse.match(/TRIGGER_CHECKOUT\|(\d+)/);
                const amount = amountMatch ? amountMatch[1] : "0";
                const cleanDetails = aiResponse.replace(/\[ACTION:TRIGGER_CHECKOUT\|(\d+)\]/g, "").trim();

                const msg = userMessage.toLowerCase();
                let dept = "Activities";
                if (msg.match(/food|dinner|breakfast|drink|wine|beer|lunch|chicken|bream|kitchen/)) dept = "Kitchen";
                else if (msg.match(/massage|spa|facial|manicure|pedicure|beauty/)) dept = "Spa";
                else if (msg.match(/taxi|driver|transport|airport|ride/)) dept = "Drivers";

                await createPendingRequest(sanitizedRoom, roomInfo.name, dept, cleanDetails, aiResponse, amount);
            }

            return aiResponse;
        } catch (err) {
            return "I apologize, but I am having trouble connecting. Please call +260978178820.";
        }
    }
);
