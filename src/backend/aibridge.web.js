import { Permissions, webMethod } from "wix-web-module";
import { fetch } from "wix-fetch";
import { getSecret } from "wix-secrets-backend";
import wixData from 'wix-data';
import wixRealtimeBackend from 'wix-realtime-backend';

/**
 * Helper: Centralized Lodge Menu & Pricing
 */
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
* Manicure with Gel Polish: K850
* Pedicure with Gel Polish: K850
* Manicure with Normal Polish: K750
* Pedicure with Normal Polish: K750
* Gel Overlay (Finger Nails): K700
* Gel Overlay (Toe Nails): K700
* Repaint Fingers and Nails with Normal Polish: K700
    `.trim();
}

/**
 * Helper: Activity Menu & Pricing (USD)
 */
function getActivitiesMenu() {
    return `
- ACTIVITIES PRICE LIST 
Victoria Falls & Livingstone Island
Livingstone Island & Devil's Pool (Seasonal):
  • Morning (07:30/09:30/10:30): International $170 High / $160 Low | SADC $90 | Local $70
  • Lunch (12:30): International $220 High / $210 Low | SADC $120 | Local $100
  • High Tea (15:30): International $210 High / $200 Low | SADC $105 | Local $85
• Livingstone Island Walk: $110
• Guided Falls Tours: Zambian Side: $80
  • Zimbabwean Side: $120 International | $95 SADC
• Swimming Under the Falls (Sept-Jan): $80
Aerial Safaris & Steam Train
• Helicopter Flights: Short 15-Min ($215) | Medium 20-Min ($301) | Long 30-Min ($315)
  • Local: K4530 short, K6330 Medium, K8530 long flight
• Microlight Flights: 15-Min ($200) | 30-Min ($390)
• Victoria Falls Steam Train: Nostalgic Dinner Journey — $230
Wildlife & Signature Dining
• The Elephant Café (Interaction + Dining):
  • Road Transfer: Lunch ($220) | High Tea ($170) | Dinner ($215)
  • Jetboat Transfer: Breakfast ($240) | Lunch ($270) | High Tea ($230) | Dinner ($270)
  • Interaction Only: $105 (or $190 with Jetboat)

Lion & Tiger Experiences:

  • Lion Walk: $150 International | $100 SADC | K 750 Local
  • Tiger Walk: $160 International | $110 SADC | K 800 Local
  • Cub Interaction: $70 International | Lion Viewing: $15
• Game Drive: Mosi-oa-Tunya National Park — $85
• Chobe Day Trip (Botswana): Full Day Land & Water Safari — $185
River Soul & Fishing
• Sunset Cruises: Lion King: $80 International | $70 SADC | K 900 Local
  • African Queen: $85
  • River Safaris: $120
• Specialty Cruises: Full Moon Cruise ($100) | Captain's Cabin ($110)
• Canoeing: Half Day ($115) | Full Day ($135) | Overnight ($260) | Raft Float ($105)
• Fishing: Half Day ($200) | Full Day ($305)
Adrenaline & Gorge Adventures
• White Water Rafting: Full Day ($160) | Half Day ($140)
• Bungee & Swing: Bungee ($194) | Bridge Swing Single ($131) | Tandem Bridge Swing ($201)
• Gorge Swing: Single ($95 / K 1200) | Tandem ($150 / K 2200)
• High Wire: Zipline / Abseiling / Flying Fox ($55 / K 700) | Bridge Tour ($80)

Land, Culture & Fashion
• Horse Trails: 2-Hour ($95) | Half Day with Lunch ($125) | Pony Ride ($30)
• Quad Bikes: $85 International | $75 SADC | K 750 Local
• Tours: Livingstone Town ($50) | Mukuni Village ($35) | Cycling Livingstone Cultural Tour ($40) 3 hour | Victoria Falls bike tour ($50) 4 hours | Bicycle Rental ($10)
• Boma Drum Dinner (Zimbabwe): $110 (Excluding Visas)


    `.trim();
}

/**
 * Helper: Kitchen Menu & Pricing (ZMW)
 */
function getKitchenMenu() {
    return `
- KITCHEN: 
1. Nshima Specialities (Traditional)
* Nshima with T-Bone Steak | K285: Grilled to preference.
* Nshima with Zambezi Bream | K285: Whole Bream, deep-fried or char-grilled.
* Nshima with Beef Rump Steak | K260: Served with local sides.
* Nshima with Village Chicken | K260: Traditional free-range chicken simmered until tender.
* Nshima with Grilled Chicken | K235: Succulent grilled chicken portion.

2. Starters
* Zambian-Glazed Chicken Lollipops | K200: Glazed in zesty Sindambi (hibiscus) and ginger reduction.
* Beetroot Carpaccio with Feta & Wild Honey | K216: Thinly sliced beetroot with creamy feta, toasted seeds, and wild Zambezi honey.
* Carrot and Zesty Ginger Soup | K216: Farm-fresh carrot soup with a warm ginger finish.
* Creamy Mushroom Soup with Bondwe Dust | K216: Forest mushroom soup finished with wild amaranth greens.
* Butternut & Mongongo Nut Soup | K216: Roasted garden butternut velouté with toasted Mongongo nuts.

3. Main Meals (Dinner Collection)
* Served with a choice of Traditional Nshima, Mashed Potatoes, or Herbed Rice and Seasonal Vegetables.
* Village Chicken Stew | K270: Free-range ‘Road Runner’ chicken simmered in paprika and tomato sauce.
* African Chicken Ifisashi Stew | K275: Tender chicken cooked with local vegetables and peanut sauce.
* Signature Whole Zambezi Bream | K245: Grilled or fried, served with tomato-onion relish.
* African Beef Ifisashi Stew | K345: Prime beef cuts with local vegetables and peanut sauce.
* Goat Meat Stew | K225: Slow-braised in a traditional herb-infused gravy.

4. Continental & Fusion Collection
* Classic Pepper Steak | K350: Prime beef fillet or rump, flamed in brandy and cream sauce.
* Beef Rump with Wild Berry Herb Butter | K340: Flame-grilled steak with seasonal forest berry butter.
* Zambezi Fish & Coconut Stew | K250: Fish simmered in a creamy coconut and chili base.
* Lemon and Wild Herb Chicken Breast | K265: Pan-seared with fresh garden lemons and light garlic-butter sauce.
* Beef Stroganoff with Sindambi Cream | K295: Beef strips in wild mushroom and hibiscus cream sauce with Zambian Rice.
* Grilled Pork Chops with Forest Mushrooms | K255: Topped with sautéed mushrooms and roasted potatoes.

5. Vegetarian Mains
* Zambian Garden Pesto Pasta | K245: Tagliatelle with wild Bondwe pesto, Mongongo nuts, and parmesan.
* Forest Mushroom & Tente Risotto | K255: White wine risotto with wild Zambian forest mushrooms and truffle oil.
* Roasted Butternut & Mongongo Nut Roast | K240: Half-moon butternut stuffed with mushroom and spinach.
* Eggplant & Sindambi Stack | K220: Grilled eggplant and tomato with hibiscus and herbed rice.

6. Light Bites & Classics
* Salads: Chicken Caesar (K210), Veggie Caesar (K195), Smoked Chicken (K210), Tuna (K195).
* Wraps & Sandwiches: Mediterranean Veggie Wrap (K210), Chicken Wraps (K225), Toasted Sandwich (K195).
* Grill/Seafood: Beef Burger (K260), Chicken/Veggie Burger (K235), Beef Lasagna (K235), Chicken Wings (K210), Crumbed Fish (K225), Fish or Chicken Goujons (K215).

7. Desserts
* Lacto (Sour Milk) Cheesecake | K225: With Musika (Tamarind) jelly reduction.
* Zambian Orchard Fruit Cake | K185: Infused with Baobab/Masuku fruit pulp and wild honey.
* Vitumbuwa Bread Pudding | K175: Made from local fritters with butterscotch sauce.
* Dark Chocolate & Mongongo Nut Ganache | K210: Torte with toasted Mongongo nuts.

8. Beverage Highlights
* Hot Drinks: Tea/Coffee (K45–K50), Hot Chocolate/Milo (K60).
* Milkshakes: Vanilla, Strawberry, Banana, Coffee (K125).
* Bar: Wide selection of Beers (K55–K85), Whiskey, Gin, Vodka, and Liqueurs.
* Wine: Large selection of House Wines (K90–K205 per glass) and Premium Bottles (K600–K750).
* Cocktails | K170: Mojito, Bloody Mary, Pina Colada, Margarita, Tequila Sunrise.
  
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

### ORDER FLOW & ETIQUETTE
1. **The Inquiry:** When a guest asks about food, spa, or activities, provide the options clearly with prices.
2. **The Refinement:** Ask for necessary details. 
   - *Kitchen:* Ask for "doneness" of steaks, choice of sides (Nshima, Mash, or Rice), or dietary preferences.
   - *Spa:* Ask for the preferred time/session.
   - *Activities:* Ask for the date and number of people.
3. **The Summary:** Before finalizing, provide a clear list: 
   - Item Name x Quantity
   - Specific Instructions (e.g., "Medium Rare")
   - Subtotal
4. **The Confirmation:** Specifically ask: "Would you like me to place this order for you?"

### TRANSACTIONAL RULES
1. **NEVER** trigger the [ACTION:TRIGGER_CHECKOUT] tag until the guest has explicitly said "Yes," "Confirm," or "Go ahead."
2. **CALCULATION:** Ensure the total is mathematically correct. 
3. **TAG FORMAT:** Once confirmed, append: [ACTION:TRIGGER_CHECKOUT|TOTAL_NUMERIC] at the very end of your response.




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
            return "I apologize, but I am having trouble connecting. Please call +260978178820 or Email: Inkhosi@aol.com.";
        }
    }
);
