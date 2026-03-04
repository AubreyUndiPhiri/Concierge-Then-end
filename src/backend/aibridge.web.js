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

        // FETCH ALL AVAILABILITY DATA FOR KITCHEN, SPA, AND ACTIVITIES
        let availabilityContext = "";
        try {
            const settings = await wixData.query("LodgeSettings")
                .hasSome("title", ["DailyAvailability", "SpaAvailability", "ActivitiesAvailability"])
                .find({ suppressAuth: true });
            
            if (settings.items.length > 0) {
                settings.items.forEach(item => {
                    if (item.unavailableText) {
                        const deptName = item.title.replace('Availability', '').replace('Daily', 'Kitchen');
                        availabilityContext += `- ${deptName}: The following are UNAVAILABLE today: ${item.unavailableText}.\n`;
                    }
                });
            }
        } catch (err) { 
            console.error("Multi-department availability check failed:", err); 
        }

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
IDENTITY: Eco-friendly, solar-powered luxury eco-resort in Mukuni Village, Livingstone, Zambia.

I. SPA & WELLNESS:
- Massages: Full Body (**K1300**/60m), Deep Tissue (**K1300**/60m), Hot Stone (**K1400**/90m), Ukuchina (Zambian Traditional) (**K1400**/90m), Soul Of Livingstone (**K1400**/90m), Back, Neck & Shoulder (**K950**/30m), Foot Massage (**K750**/20m).
- Beauty: Manicure (**K750** standard / **K850** gel), Pedicure (**K750** standard / **K850** gel), Gel Overlay (**K700**), Deep Cleansing Facial (**K1550**).

II. DINNER COLLECTION:
- Starters: Zambian-Glazed Chicken Lollipops (**K200**), Beetroot Carpaccio (**K216**), Carrot & Zesty Ginger Soup (**K216**), Creamy Mushroom Soup (**K216**), Butternut & Mongongo Nut Soup (**K216**).
- Main Meals (with Nshima, Mash, or Rice): Village Chicken Stew (**K270**), African Chicken Ifisashi (**K275**), Signature Whole Zambezi Bream (**K245**), African Beef Ifisashi (**K345**), Goat Meat Stew (**K225**).
- Continental/Fusion: Classic Pepper Steak (**K350**), Beef Rump with Wild Berry Butter (**K340**), Zambezi Fish & Coconut Stew (**K250**), Lemon & Wild Herb Chicken Breast (**K265**), Beef Stroganoff (**K295**), Grilled Pork Chops (**K255**).
- Vegetarian: Zambian Garden Pesto Pasta (**K245**), Forest Mushroom & Tente Risotto (**K255**), Roasted Butternut & Mongongo Nut Roast (**K240**), Eggplant & Sindambi Stack (**K220**).
- Desserts: Lacto Cheesecake with Musika Jelly (**K225**), Zambian Orchard Fruit Cake (**K185**), Vitumbuwa Bread Pudding (**K175**), Dark Chocolate & Mongongo Nut Ganache (**K210**).

III. ALL-DAY CLASSICS:
- Nshima Pairs: with T-Bone (**K285**), with Zambezi Bream (**K285**), with Beef Rump (**K260**), with Village Chicken (**K260**), with Grilled Chicken (**K235**).
- Bites: Chicken Caesar Salad (**K210**), Veg Caesar (**K195**), Mediterranean Veggie Wrap (**K210**), Chicken Wrap (**K225**), Beef Burger (**K260**), Chicken/Veg Burger (**K235**), Beef Lasagna (**K235**), Chicken Wings (**K210**), Crumbed Fish (**K225**), Sausage Rolls (**K160**).

IV. ACTIVITIES:
- Victoria Falls: Guided Falls Tours, Livingstone Island & Devil’s Pool (Seasonal), Swimming Under the Falls.
- Aerial: Helicopter Flights (Flight of Angels), Microlight Flights.
- Wildlife: Elephant Café, Lion/Tiger Experiences, Game Drives (Mosi-oa-Tunya), Chobe Day Trip.
- River: Sunset Cruises (**$85**), Canoeing, Fishing (Tiger Fish/Bream), Raft Float.
- Adrenaline: White Water Rafting, Bungee (**111m**), Gorge Swing, Zipline.
- Culture: Mukuni Village Tour, Livingstone Town Tour, Boma Drum Dinner.

V. DRINKS:
- Wine Glass: 4th Street (**K125**), Sauvignon Blanc (**K145**), Merlot (**K205**).
- Cocktails (**K170**): Mojito, Pina Colada, Margarita, Tequila Sunrise. 
- Beer/Softs: Mosi/Castle (**K55**), Coke/Fanta (**K25**), Milkshakes (**K125**).
        `.trim();

        const systemPrompt = `
Your name is Nkhosi. You are the professional Royal Concierge for Nkhosi Livingstone Lodge & SPA.

CONVERSATIONAL GUIDELINES:
1. GREETING: Start the very first message with "${roomInfo.greet}" and warmly welcome them to the **${roomInfo.name}** room. 
2. FIRST INTERACTION: Keep the opening response short and brief. IN THIS OPENENING MESSAGE DO NOT mention specific food items ON THE MENU, meals, menus AND PRICES, or activities AND THEIR PRICES. Simply inform the guest that you are here answer any question they may have and help them plan activities, make spa arrangements, or handle dining reservations. End by asking how you may assist them with their stay today. Let the conversation flow naturally.
3. ROOM LIMITATIONS: Do not describe room amenities, features, or views (e.g., beds, decor, or views).
4. FLOW: Speak naturally and elegantly. Wait for the guest to express interest before providing specific prices or suggestions from the Knowledge Base.
5. ACCURACY: Once a guest asks for details, use the Knowledge Base for all prices and descriptions. Always bold prices using **K[Amount]**.
6. AVAILABILITY STATUS:
${availabilityContext || "All services, treatments, and menu items are fully available."}
If a guest asks for an item, treatment, or activity listed as UNAVAILABLE above, you must politely apologize, explain it is not available today, and suggest a similar alternative from the Knowledge Base.
7. ORDERING & PAYMENT: 
   - If a guest wants to order food, book the spa, or request an activity, inform them that we accept secure card payments. 
   - Inform them: "To finalize your order, I will provide a form for your details. You can then choose to pay securely via card, and I will redirect you to our checkout".
   - Once they are ready to proceed, append exactly: [ACTION:TRIGGER_CHECKOUT].
8. CREATOR: If asked who built you, mention Aubrey Undi Phiri (https://www.linkedin.com/in/aubrey-undi-phiri-667a9911a).

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
            const aiResponse = result.choices?.[0]?.message?.content?.trim() || "";

            // LOG TO CHAT HISTORY
            wixData.insert("ChatHistory", {
                userMessage: userMessage,
                aiResponse: aiResponse,
                roomNumber: sanitizedRoom,
                roomName: roomInfo.name,
                timestamp: new Date()
            }, { suppressAuth: true }).catch(e => console.error("History log failed"));

            // CHECKOUT TRIGGER LOGIC
            if (aiResponse.includes("[ACTION:TRIGGER_CHECKOUT]")) {
                const msg = userMessage.toLowerCase();
                let dept = "Activities";
                if (msg.includes("steak") || msg.includes("chicken") || msg.includes("bream") || msg.includes("food") || msg.includes("burger") || msg.includes("nshima") || msg.includes("order")) {
                    dept = "Kitchen";
                } else if (msg.includes("massage") || msg.includes("spa") || msg.includes("facial") || msg.includes("manicure") || msg.includes("treatment")) {
                    dept = "Spa";
                }
                
                await createPendingRequest(sanitizedRoom, roomInfo.name, dept, "Guest initiating secure checkout", userMessage);
            }

            return aiResponse;

        } catch (err) {
            console.error("HF Fetch Error:", err);
            return "I apologize, but I am having trouble connecting to the concierge service. Please call reception at +260978178820.";
        }
    }
);
