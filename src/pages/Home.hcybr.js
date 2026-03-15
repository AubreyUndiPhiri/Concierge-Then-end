import { askAI, createActivityPayment } from 'backend/aibridge.web.js'; 
import wixLocation from 'wix-location';
import wixPay from 'wix-pay';
import wixData from 'wix-data'; 
import { session } from 'wix-storage';
import wixRealtime from 'wix-realtime';

let chatHistory = [];
const SESSION_KEY = "concierge_session";
const ONE_HOURS = 1 * 60 * 60 * 1000;

$w.onReady(() => {
    const roomNumber = wixLocation.query.room || "General";
    const chatWidget = $w("#html1"); 

    // --- 1. PERSISTENCE HELPERS ---

    const saveChatSession = (history) => {
        const sessionData = {
            timestamp: new Date().getTime(),
            history: history
        };
        session.setItem(SESSION_KEY, JSON.stringify(sessionData));
    };

    const resetSession = () => {
        chatHistory = [];
        session.removeItem(SESSION_KEY);
    };

    // Restore chat history from session storage on load
    const savedData = session.getItem(SESSION_KEY);
    if (savedData) {
        const parsed = JSON.parse(savedData);
        const now = new Date().getTime();
        
        // Check if the session is still valid (less than 3 hours old)
        if (now - parsed.timestamp < THREE_HOURS) {
            chatHistory = parsed.history || [];
        } else {
            resetSession(); // Expired
        }
    }

    // --- 2. REAL-TIME UPDATES ---

    wixRealtime.subscribe({ name: "OrderUpdates", resourceId: roomNumber }, (message) => {
        if (message.payload.status === "Ready") {
            chatWidget.postMessage({ 
                type: "response", 
                payload: `Mwaiseni! Your ${message.payload.dept} order is now ready and being delivered.` 
            });
        }
    });

    // --- 3. WIDGET COMMUNICATION ---

    chatWidget.onMessage(async (event) => {
        if (!event.data) return;

        // Initialize Widget
        if (event.data.type === "ready") {
            chatWidget.postMessage({ 
                type: "init", 
                room: roomNumber,
                history: chatHistory 
            });
            return;
        }

        // Handle Checkout Completion (Database + Payment)
        if (event.data.type === "checkout_complete") {
            const formData = event.data.payload;
            
            try {
                const totalAmountNumeric = Number(formData.amount) || 0;

                await wixData.insert("PendingRequests", {
                    "roomNumber": String(formData.room || roomNumber),
                    "clientName": formData.name || "Lodge Guest", 
                    "clientEmail": formData.email, 
                    "details": `ORDER: ${formData.order}`,
                    "orderTotal": totalAmountNumeric, 
                    "fullContext": `Email: ${formData.email} | Mode: ${formData.paymentMode} | Message: ${formData.order}`, 
                    "status": "Pending Verification",
                    "emailSent": false,
                    "timestamp": new Date(),
                    "isPrinted": false
                });
                
                resetSession(); // Clear history after a successful order submission

                if (formData.paymentMode === 'card') {
                    chatWidget.postMessage({ type: "status", value: "Processing Payment..." });
                    const payment = await createActivityPayment("Concierge Order", totalAmountNumeric, formData.name || "Lodge Guest");
                    
                    if (payment) {
                        const result = await wixPay.startPayment(payment.id);
                        if (result.status === "Successful") {
                            chatWidget.postMessage({ type: "response", payload: "Mwashibukeni! Payment successful. Order processing." });
                        } else {
                            chatWidget.postMessage({ type: "response", payload: "Payment not completed. Please try again or pay at checkout." });
                        }
                    }
                } else {
                    chatWidget.postMessage({ type: "response", payload: "Thank you! Your request has been sent. You can settle the bill at checkout." });
                }
            } catch (err) {
                console.error("Checkout Error:", err);
                chatWidget.postMessage({ type: "response", payload: "Error saving your order. Please contact reception." });
            }
            return;
        }

        // Handle AI Chat
        if (event.data.type === "chat") {
            const guestMsg = event.data.payload;
            if (!guestMsg) return;

            if (!event.data.hidden) chatWidget.postMessage({ type: "status", value: "typing" });

            try {
                const aiResponse = await askAI(guestMsg, roomNumber, chatHistory);

                const checkoutRegex = /\[ACTION:TRIGGER_CHECKOUT\|(\d+\.?\d*)\]/;
                const match = aiResponse.match(checkoutRegex);

                if (match) {
                    const totalAmount = match[1];
                    const cleanResponse = aiResponse.replace(checkoutRegex, "").trim();
                    
                    chatWidget.postMessage({ type: "response", payload: cleanResponse });
                    chatWidget.postMessage({ 
                        type: "trigger_checkout", 
                        amount: totalAmount,
                        placeholder: `Confirming order for K${totalAmount}. Any special requests?` 
                    });
                } else {
                    chatWidget.postMessage({ type: "response", payload: aiResponse });
                }

                // Update Local History and Sync to Session Storage
                if (!event.data.hidden) {
                    chatHistory.push({ "role": "user", "content": guestMsg });
                    chatHistory.push({ "role": "assistant", "content": aiResponse });
                    
                    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
                    saveChatSession(chatHistory); // This keeps the 3-hour timer fresh
                }

            } catch (err) {
                console.error("AI Bridge Error:", err);
                chatWidget.postMessage({ 
                    type: "response", 
                    payload: "I am having trouble connecting. Please contact reception at +260978178820." 
                });
            }
        }
    });
});
