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

Below we have BEAUTY TREATMENTS
* Deep Cleansing (Facial): K1550
* Manicure with Gel Polish: K850
* Pedicure with Gel Polish: K850
* Manicure with Normal Polish: K750
* Pedicure with Normal Polish: K750
* Gel Overlay (Finger Nails): K700
* Gel Overlay (Toe Nails): K700
* Repaint Fingers and Nails with Normal Polish: K700

- ACTIVITIES: 

I. Victoria Falls & Livingstone Island
* Livingstone Island & Devil’s Pool (Seasonal)
* Livingstone Island Walk
* Guided Falls Tours (Zambian or Zimbabwean Side)
* Swimming Under the Falls (Sept–Jan)

II. Aerial Safaris & Steam Train
* Helicopter Flights (15, 20, or 30-Min)
* Microlight Flights (15 or 30-Min)
* Victoria Falls Steam Train

III. Wildlife & Signature Dining
* The Elephant Café
* Lion & Tiger Experiences
* Game Drive (Mosi-oa-Tunya National Park)
* Chobe Day Trip (Botswana)

IV. River Soul & Fishing
* Sunset Cruises (Options: Lion King, African Queen, or River Safari)
* Full Moon Cruise
* Captain’s Cabin Specialty Cruise
* Canoeing (Half, Full, or Overnight)
* Raft Float
* Fishing (Half or Full Day)

V. Adrenaline & Gorge Adventures
* White Water Rafting
* Bungee & Swing
* Gorge Swing
* High Wire (Zipline, Abseiling, Flying Fox)
* Bridge Tour

VI. Land, Culture & Fashion
* Horse Trails
* Quad Bikes
* Livingstone Town Tour
* Mukuni Village Cultural Tour
* Cycling Tours
* Boma Drum Dinner

  
    `.trim();
}

/**
 * Helper: Creates a pending request in the database and notifies Realtime.
 */
async function createPendingRequest(roomNumber, roomName, department, details, guestMsg, totalAmount = "0") {
    const requestData = {
        clientName: "Lodge Guest",
        roomNumber: String(roomNumber),
        roomName: roomName,
        requestType: department,
        details: details, // Now contains specific items/prices extracted from AI response
        fullContext: guestMsg, 
        orderTotal: Number(totalAmount),
        status: "Pending Verification",
        timestamp: new Date(),
        isPrinted: false
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
            const settings = await wixData.query("LodgeSettings")
                .hasSome("title", ["DailyAvailability", "SpaAvailability", "ActivitiesAvailability", "ActivitiesPrices", "DriverInfo"])
                .find({ suppressAuth: true });
            
            settings.items.forEach(item => {
                if (item.title === "ActivitiesPrices") priceContext = `UPDATED ACTIVITY PRICES: ${item.unavailableText}\n`;
                else if (item.title === "DriverInfo") transportRateContext = `LIVE TRANSPORT RATES (Kwacha): ${item.unavailableText}\n`;
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

        // 3. ORGANIZED SYSTEM PROMPT
        const systemPrompt = `
### IDENTITY
Your name is Nkhosi, the Royal Concierge for Nkhosi Livingstone Lodge & SPA. You are sophisticated and authentically Zambian.

### SECTION 1: LIVE CONTEXT
- **Availability:** ${availabilityContext || "Everything is available."}
- **Activity Overrides:** ${priceContext || "Use standard USD prices."}
- **Transport Overrides:** ${transportRateContext || "Refer transport pricing to the front desk."}

### SECTION 2: GREETING & ETIQUETTE
- Start every new conversation with: "${roomInfo.greet}".
- Mention you are serving the **${roomInfo.name}** room.
- Use bolding for all prices (e.g., **K250**).

### SECTION 3: TRANSACTIONAL RULES
1. Provide a detailed summary of the order with a calculated total.
2. Once the guest confirms, append exactly: [ACTION:TRIGGER_CHECKOUT|TOTAL_NUMERIC]
3. If an item is unavailable per the context, suggest an alternative.

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

            // 4. ACTION PROCESSING & ROUTING
            if (aiResponse.includes("[ACTION:TRIGGER_CHECKOUT")) {
                const amountMatch = aiResponse.match(/TRIGGER_CHECKOUT\|(\d+)/);
                const amount = amountMatch ? amountMatch[1] : "0";
                
                // NEW: Extract items and prices from the AI response to show in emails/dashboard
                // This removes the system tag [ACTION:...] and leaves just the text summary
                const cleanDetails = aiResponse.replace(/\[ACTION:TRIGGER_CHECKOUT\|(\d+)\]/g, "").trim();

                const msg = userMessage.toLowerCase();
                let dept = "Activities";
                if (msg.match(/food|dinner|lunch|chicken|bream|kitchen/)) dept = "Kitchen";
                else if (msg.match(/massage|spa|facial|beauty/)) dept = "Spa";
                else if (msg.match(/taxi|driver|transport|airport|ride/)) dept = "Drivers";

                // Save cleanDetails instead of "AI-Generated Order"
                await createPendingRequest(sanitizedRoom, roomInfo.name, dept, cleanDetails, aiResponse, amount);
            }

            return aiResponse;
        } catch (err) {
            return "I apologize, but I am having trouble connecting. Please call +260978178820.";
        }
    }
);
