import { askAI, createActivityPayment } from 'backend/aibridge.web.js'; 
import wixLocation from 'wix-location';
import wixPay from 'wix-pay';
import wixData from 'wix-data'; 

let chatHistory = [];

$w.onReady(() => {
    // Extracts room number from URL (e.g., ?room=1) or defaults to General
    const roomNumber = wixLocation.query.room || "General";
    const chatWidget = $w("#html1"); 

    chatWidget.onMessage(async (event) => {
        if (!event.data) return;

        // 1. Initial Setup: Sync room info with the HTML widget
        if (event.data.type === "ready") {
            chatWidget.postMessage({ type: "init", room: roomNumber });
            return;
        }

        // 2. Checkout & Payment Logic
        if (event.data.type === "checkout_complete") {
            const formData = event.data.payload;
            
            // Save order record to the PendingRequests collection
            try {
                await wixData.insert("PendingRequests", {
                    "roomNumber": String(formData.room || roomNumber),
                    "clientName": formData.name || "Lodge Guest", 
                    "details": `ORDER: ${formData.order}`,
                    "totalAmount": formData.amount || "0", // Store the calculated total
                    "fullContext": `Email: ${formData.email} | Mode: ${formData.paymentMode} | Message: ${formData.order}`, 
                    "status": "Pending Verification",
                    "timestamp": new Date(),
                    "isPrinted": false
                });
                
                console.log("Order details successfully logged to database.");

                // Trigger DPO card payment if selected
                if (formData.paymentMode === 'card') {
                    // UPDATED: Uses the dynamic total amount from the form/AI instead of a static '1'
                    const numericPrice = Number(formData.amount);
                    const payment = await createActivityPayment("Concierge Service Order", numericPrice, formData.name || "Lodge Guest");
                    
                    if (payment) {
                        const result = await wixPay.startPayment(payment.id);
                        if (result.status === "Successful") {
                            chatWidget.postMessage({ 
                                type: "response", 
                                payload: "Mwashibukeni! Your card payment was successful. Your order is now being processed by our team." 
                            });
                        } else if (result.status === "Cancelled") {
                            chatWidget.postMessage({ 
                                type: "response", 
                                payload: "The payment session was cancelled. You can try again or choose to pay at checkout." 
                            });
                        }
                    }
                } else {
                    // For "Pay on Checkout", acknowledge the request
                    chatWidget.postMessage({ 
                        type: "response", 
                        payload: "Thank you! Your request has been sent to our team. You can settle the bill at checkout." 
                    });
                }
            } catch (err) {
                console.error("Checkout Processing Error:", err);
            }
            return;
        }

        // 3. Standard AI Concierge Chat Logic
        if (event.data.type !== "chat") return;

        const guestMsg = event.data.payload;
        if (!guestMsg) return;

        // Show typing indicator in the UI
        if (!event.data.hidden) {
            chatWidget.postMessage({ type: "status", value: "typing" });
        }

        try {
            // Send message to backend AI (aibridge.web.js)
            const aiResponse = await askAI(guestMsg, roomNumber, chatHistory);

            // Handle AI instruction to open the checkout form with parsed amount
            if (aiResponse.includes("[ACTION:TRIGGER_CHECKOUT]")) {
                // UPDATED: Logic to extract total amount from the AI tag [ACTION:TRIGGER_CHECKOUT|1545]
                const parts = aiResponse.split("|");
                const totalAmount = parts.length > 1 ? parts[1].replace("]", "") : "0";
                
                // Clean the text response by removing the entire tag
                const cleanResponse = parts[0].replace("[ACTION:TRIGGER_CHECKOUT]", "");
                
                chatWidget.postMessage({ type: "response", payload: cleanResponse });
                chatWidget.postMessage({ 
                    type: "trigger_checkout", 
                    amount: totalAmount, // Pass the total amount to the widget
                    placeholder: `Confirming order for K${totalAmount}. Specify any additional notes...` 
                });
            } else {
                chatWidget.postMessage({ type: "response", payload: aiResponse });
            }

            // Update chat memory for conversation continuity
            if (!event.data.hidden) {
                chatHistory.push({ "role": "user", "content": guestMsg });
                chatHistory.push({ "role": "assistant", "content": aiResponse });
                if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
            }

        } catch (err) {
            console.error("Concierge AI Error:", err);
            chatWidget.postMessage({ 
                type: "response", 
                payload: "I apologize, but I am having trouble connecting. Please contact reception at +260978178820 for immediate assistance." 
            });
        }
    });
});
