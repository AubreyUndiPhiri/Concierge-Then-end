import { Permissions, webMethod } from "wix-web-module";
import { fetch } from "wix-fetch";
import { getSecret } from "wix-secrets-backend";
import wixData from 'wix-data';
import wixRealtimeBackend from 'wix-realtime-backend';

/**
 * Helper: Spa Menu & Pricing (ZMW)
 */
function getSpaMenu() {
    return `
- SPA TREATMENTS:
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
* Manicure/Pedicure with Gel Polish: K850
* Manicure/Pedicure with Normal Polish: K750
* Gel Overlay: K700
* Repaint Fingers/Nails: K700
    `.trim();
}

/**
 * Helper: Activity Menu & Pricing (USD/ZMW)
 */
function getActivitiesMenu() {
    return `
- ACTIVITIES PRICE LIST 
Livingstone Island & Devil's Pool (Seasonal): $70 - $220
Guided Falls Tours: Zambian Side ($80) | Zimbabwe Side ($120)
Helicopter Flights: 15-Min ($215) | 20-Min ($301) | 30-Min ($315)
Microlight Flights: 15-Min ($200) | 30-Min ($390)
Elephant Café (Interaction + Dining): $170 - $270
Sunset Cruises: Lion King ($80) | African Queen ($85)
White Water Rafting: $140 - $160
Bungee & Swing: $131 - $201
Quad Bikes: $85 | Horse Trails: $95
    `.trim();
}

/**
 * Helper: Kitchen Menu & Pricing (ZMW)
 */
function getKitchenMenu() {
    return `
- KITCHEN: 
1. Nshima Specialities (Traditional)
* Nshima with T-Bone Steak: K285
* Nshima with Zambezi Bream: K285
* Nshima with Beef Rump Steak: K260
* Nshima with Village Chicken: K260

2. Starters
* Zambian-Glazed Chicken Lollipops: K200
* Beetroot Carpaccio with Feta: K216
* Carrot/Mushroom/Butternut Soups: K216

3. Main Meals & Classics
* Village Chicken Stew: K270
* African Chicken Ifisashi: K275
* Classic Pepper Steak: K350
* Beef Stroganoff: K295
* Burgers (Beef/Chicken/Veg): K235 - K260
* Fish/Chicken Goujons: K215

4. Desserts & Drinks
* Cheesecake/Fruit Cake: K185 - K225
* Milkshakes: K125 | Cocktails: K170
    `.trim();
}

/**
 * Helper: Centralized Lodge Menu
 */
function getLodgeMenu() {
    return `
### OFFICIAL LODGE MENU & PRICES
${getKitchenMenu()}

${getSpaMenu()}

${getActivitiesMenu()}
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
        "clientEmail": email, 
        "orderTotal": Number(totalAmount),
        "status": "Pending Verification",
        "emailSent": false,
        "timestamp": new Date(),
        "isPrinted": false
    };

    try {
        await wixData.insert("PendingRequests", requestData, { suppressAuth: true });
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

        let availabilityContext = "";
        let priceContext = "";
        let transportRateContext = "";

        try {
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
- Name: Nkhosi, Royal Concierge for Nkhosi Livingstone Lodge & SPA.
- Creator: Aubrey Undi Phiri.

### SESSION ISOLATION (CRITICAL)
- Every user session is unique. 
- If a message starts with [SYSTEM: ...], it signals a fresh start or a context update for the current guest.
- Ignore previous orders or names if they contradict the current request.
- Do NOT carry over past order totals into new inquiries.

### LIVE CONTEXT
- Availability: ${availabilityContext || "Everything is available."}
- Price Context: ${priceContext || "Standard prices apply."}

### ORDER FLOW & ETIQUETTE
1. **Inquiry:** Filter response to show only the relevant menu section requested.
2. **Refinement:** Mandatory details required:
   - Kitchen: Steak doneness & choice of side (Nshima/Rice/Mash).
   - Spa: Preferred time/session.
   - Activities: Residency status (International/Local) and number of people.
3. **Summary:** Provide a detailed receipt-style list with total.
4. **Confirmation:** Ask "Would you like me to place this order for you?"

### TRANSACTIONAL RULES
- NEVER trigger checkout until the guest explicitly confirms (Yes/Go ahead).
- TAG FORMAT: Append [ACTION:TRIGGER_CHECKOUT|TOTAL_NUMERIC] to the end of the final confirmation message.

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
                // Enhanced regex for decimal support
                const amountMatch = aiResponse.match(/TRIGGER_CHECKOUT\|(\d+\.?\d*)/);
                const amount = amountMatch ? amountMatch[1] : "0";
                const cleanDetails = aiResponse.replace(/\[ACTION:TRIGGER_CHECKOUT\|(\d+\.?\d*)\]/g, "").trim();

                // Advanced Department Detection: Scans the AI's own summary
                const contextCheck = aiResponse.toLowerCase();
                let dept = "Activities";
                if (contextCheck.match(/food|nshima|bream|steak|chicken|kitchen|drink|burger|stew|eggplant|pork|lasagna/)) dept = "Kitchen";
                else if (contextCheck.match(/massage|spa|facial|manicure|pedicure|beauty|ukuchina/)) dept = "Spa";
                else if (contextCheck.match(/taxi|driver|transport|airport|shuttle/)) dept = "Drivers";

                await createPendingRequest(sanitizedRoom, roomInfo.name, dept, cleanDetails, aiResponse, amount);
            }

            return aiResponse;
        } catch (err) {
            return "I apologize, but I am having trouble connecting. Please call +260978178820 or Email: Inkhosi@aol.com.";
        }
    }
);
