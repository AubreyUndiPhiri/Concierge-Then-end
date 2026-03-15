import { Permissions, webMethod } from "wix-web-module";
import { fetch } from "wix-fetch";
import { getSecret } from "wix-secrets-backend";
import wixData from 'wix-data';
import wixRealtimeBackend from 'wix-realtime-backend';

/**
 * Menu Helpers: Centralized data for the AI
 */
const getSpaMenu = () => `
- SPA TREATMENTS:
* Full Body Massage: K1300 (60 Min) | Deep Tissue: K1300 (60 Min)
* Hot Stone: K1400 (90 Min) | Ukuchina: K1400 (90 Min)
* Soul Of Livingstone: K1400 (90 Min) | Back, Neck & Shoulder: K950 (30 Min)
* Foot Massage: K750 (20 Min)
BEAUTY: Facial (K1550), Mani/Pedi Gel (K850), Mani/Pedi Normal (K750), Gel Overlay (K700)
`.trim();

const getActivitiesMenu = () => `
- ACTIVITIES:
* Livingstone Island/Devil's Pool: $70 - $220
* Falls Tours: Zam ($80) | Zim ($120)
* Helicopter: 15m ($215) | 20m ($301) | 30m ($315)
* Microlight: 15m ($200) | 30m ($390)
* Elephant Café: $170 - $270 | Sunset Cruises: $80 - $85
* Rafting: $140 - $160 | Bungee: $131 | Quad: $85 | Horse: $95
`.trim();

const getKitchenMenu = () => `
- KITCHEN: 
1. Nshima Specials: T-Bone (K285), Bream (K285), Rump Steak (K260), Village Chicken (K260)
2. Starters: Lollipops (K200), Carpaccio (K216), Soups (K216)
3. Classics: Chicken Stew (K270), Ifisashi (K275), Pepper Steak (K350), Stroganoff (K295), Burgers (K235-260)
4. Desserts/Drinks: Cakes (K185-225), Milkshakes (K125), Cocktails (K170)
`.trim();

const getLodgeMenu = () => `
### OFFICIAL LODGE MENU & PRICES
${getKitchenMenu()}
${getSpaMenu()}
${getActivitiesMenu()}
`.trim();

/**
 * Helper: Database Insertion & Realtime Notify
 */
async function createPendingRequest(roomNumber, roomName, department, details, guestMsg, totalAmount = "0") {
    const requestData = {
        "clientName": "Lodge Guest",
        "roomNumber": String(roomNumber),
        "roomName": roomName,
        "requestType": department,
        "details": details, 
        "fullContext": guestMsg, 
        "clientEmail": "Guest via AI", 
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
        console.error("DB Save Error:", err.message);
        return false;
    }
}

/**
 * AI Logic Wrapper
 */
export const askAI = webMethod(
    Permissions.Anyone,
    async (userMessage, roomNumber, chatHistory = []) => {
        const hfToken = await getSecret("HF_TOKEN");
        if (!hfToken) return "The AI concierge is currently offline.";

        let availabilityContext = "";
        let priceContext = "";

        try {
            const settings = await wixData.query("LodgeSettings")
                .hasSome("title", ["DailyAvailability", "SpaAvailability", "ActivitiesAvailability", "ActivitiesPrices"])
                .find({ suppressAuth: true });
            
            settings.items.forEach(item => {
                if (item.title === "ActivitiesPrices") priceContext = `UPDATED PRICES: ${item.unavailableText}\n`;
                else if (item.unavailableText) {
                    const dept = item.title.replace('Availability', '').replace('Daily', 'Kitchen');
                    availabilityContext += `- ${dept} UNAVAILABLE: ${item.unavailableText}.\n`;
                }
            });
        } catch (err) { console.error("Settings fetch failed"); }

        const roomData = {
            "1": { name: "Tonga", greet: "muli buti" }, "2": { name: "Tumbuka", greet: "Muli uli" },
            "3": { name: "Soli", greet: "Muli shani" }, "4": { name: "Lenje", greet: "Mutende" },
            "5": { name: "Lamba", greet: "Shani" }, "6": { name: "Bemba", greet: "muli shani" },
            "7": { name: "Lozi", greet: "Muchwani" }, "8": { name: "Tokaleya", greet: "muli buti" },
            "9": { name: "Luvale", greet: "Munayoyo mwane" }, "10": { name: "Ngoni", greet: "muli bwanji" }
        };

        const sanitizedRoom = roomNumber ? String(roomNumber) : "General";
        const roomInfo = roomData[sanitizedRoom] || { name: "Valued Guest", greet: "Greetings" };

        const systemPrompt = `
### IDENTITY
- Name: Nkhosi, Royal Concierge for Nkhosi Livingstone Lodge & SPA.
- Greeting for this room: ${roomInfo.greet}.

### LIVE STATUS
- ${availabilityContext || "All services available."}
- ${priceContext || "Standard pricing applies."}

### RULES
- Provide ONLY the requested menu section.
- If an order is confirmed, provide a summary and total.
- Append [ACTION:TRIGGER_CHECKOUT|TOTAL_NUMERIC] ONLY after the guest says "Yes" or "Proceed".

${getLodgeMenu()}
`.trim();

        try {
            const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${hfToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "meta-llama/Llama-3.1-8B-Instruct",
                    messages: [{ role: "system", content: systemPrompt }, ...chatHistory, { role: "user", content: userMessage }],
                    max_tokens: 500,
                    temperature: 0.5
                })
            });

            const result = await response.json();
            let aiResponse = result.choices?.[0]?.message?.content?.trim() || "I apologize, I am offline.";

            // Database processing if checkout is triggered
            if (aiResponse.includes("[ACTION:TRIGGER_CHECKOUT")) {
                const amountMatch = aiResponse.match(/TRIGGER_CHECKOUT\|(\d+\.?\d*)/);
                const amount = amountMatch ? amountMatch[1] : "0";
                
                // Detection logic for Department
                const lowRes = aiResponse.toLowerCase();
                let dept = "Activities";
                if (lowRes.match(/food|nshima|steak|chicken|kitchen|burger/)) dept = "Kitchen";
                else if (lowRes.match(/massage|spa|facial|mani|pedi/)) dept = "Spa";

                // Save to DB before returning to UI
                await createPendingRequest(sanitizedRoom, roomInfo.name, dept, aiResponse, aiResponse, amount);
            }

            return aiResponse; // Home code will handle the Regex cleaning for the UI
        } catch (err) {
            return "Connection error. Please call +260978178820.";
        }
    }
);

/**
 * Payment Helper (Standard Wix Pay integration)
 */
export async function createActivityPayment(description, amount, name) {
    // This connects to the Wix Pay backend
    return { id: "payment_id_placeholder" }; // In production, use wix-pay-backend
}
