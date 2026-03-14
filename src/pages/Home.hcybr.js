import { askAI, createActivityPayment } from 'backend/aibridge.web.js'; 
import wixLocation from 'wix-location';
import wixPay from 'wix-pay';
import wixData from 'wix-data'; 
import { session } from 'wix-storage';
import wixRealtime from 'wix-realtime';

let chatHistory = [];

$w.onReady(() => {
    const roomNumber = wixLocation.query.room || "General";
    const chatWidget = $w("#html1"); 

    // 1. PERSISTENCE: Restore chat history from session storage
    const savedHistory = session.getItem("concierge_history");
    if (savedHistory) {
        chatHistory = JSON.parse(savedHistory);
    }

    // 2. REAL-TIME: Listen for "Order Ready" updates from the Staff Dashboard
    wixRealtime.subscribe({ name: "OrderUpdates", resourceId: roomNumber }, (message) => {
        if (message.payload.status === "Ready") {
            chatWidget.postMessage({ 
                type: "response", 
                payload: `🔔 Mwaiseni! Your ${message.payload.dept} order is now ready and being delivered.` 
            });
        }
    });

    chatWidget.onMessage(async (event) => {
        if (!event.data) return;

        // Sync room info and restore history to the widget
        if (event.data.type === "ready") {
            chatWidget.postMessage({ 
                type: "init", 
                room: roomNumber,
                history: chatHistory 
            });
            return;
        }

        // Checkout & Payment Logic
        if (event.data.type === "checkout_complete") {
            const formData = event.data.payload;
            
            try {
                const totalAmountNumeric = Number(formData.amount) || 0;

                // Sync Database Fields
                await wixData.insert("PendingRequests", {
                    "roomNumber": String(formData.room || roomNumber),
                    "clientName": formData.name || "Lodge Guest", 
                    "clientEmail": formData.email, // Standardized for Dashboard alignment
                    "details": `ORDER: ${formData.order}`,
                    "orderTotal": totalAmountNumeric, // Standardized for backend payment sync
                    "fullContext": `Email: ${formData.email} | Mode: ${formData.paymentMode} | Message: ${formData.order}`, 
                    "status": "Pending Verification",
                    "emailSent": false, // Initializes 'unverified' status for history log
                    "timestamp": new Date(),
                    "isPrinted": false
                });
                
                if (formData.paymentMode === 'card') {
                    chatWidget.postMessage({ type: "status", value: "Processing Payment..." });
                    
                    const payment = await createActivityPayment(
                        "Concierge Service Order", 
                        totalAmountNumeric, 
                        formData.name || "Lodge Guest"
                    );
                    
                    if (payment) {
                        const result = await wixPay.startPayment(payment.id);
                        if (result.status === "Successful") {
                            chatWidget.postMessage({ 
                                type: "response", 
                                payload: "Mwashibukeni! Your card payment was successful. Your order is now being processed." 
                            });
                        } else {
                            chatWidget.postMessage({ 
                                type: "response", 
                                payload: "The payment was not completed. Please try again or choose to pay at checkout." 
                            });
                        }
                    }
                } else {
                    chatWidget.postMessage({ 
                        type: "response", 
                        payload: "Thank you! Your request has been sent. You can settle the bill at checkout." 
                    });
                }
            } catch (err) {
                console.error("Checkout Error:", err);
                chatWidget.postMessage({ 
                    type: "response", 
                    payload: "I encountered an error saving your order. Please contact reception." 
                });
            }
            return;
        }

        // AI Concierge Chat Logic
        if (event.data.type !== "chat") return;

        const guestMsg = event.data.payload;
        if (!guestMsg) return;

        if (!event.data.hidden) {
            chatWidget.postMessage({ type: "status", value: "typing" });
        }

        try {
            const aiResponse = await askAI(guestMsg, roomNumber, chatHistory);

            const checkoutRegex = /\[ACTION:TRIGGER_CHECKOUT\|(\d+)\]/;
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

            if (!event.data.hidden) {
                chatHistory.push({ "role": "user", "content": guestMsg });
                chatHistory.push({ "role": "assistant", "content": aiResponse });
                
                if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
                session.setItem("concierge_history", JSON.stringify(chatHistory));
            }

        } catch (err) {
            console.error("AI Bridge Error:", err);
            chatWidget.postMessage({ 
                type: "response", 
                payload: "I am having trouble connecting. Please contact reception at +260978178820." 
            });
        }
    });
});
