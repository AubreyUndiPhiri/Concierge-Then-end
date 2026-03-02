import { askAI, createActivityPayment } from 'backend/aibridge.web.js'; 
import wixLocation from 'wix-location';
import wixPay from 'wix-pay';
import wixData from 'wix-data'; 

let chatHistory = [];

$w.onReady(() => {
    const roomNumber = wixLocation.query.room || "General";
    const chatWidget = $w("#html1"); 

    chatWidget.onMessage(async (event) => {
        if (!event.data) return;

        // 1. Initial Setup
        if (event.data.type === "ready") {
            chatWidget.postMessage({ type: "init", room: roomNumber });
            return;
        }

        // 2. DPO CHECKOUT LOGIC GOES HERE
        if (event.data.type === "checkout_complete") {
            const formData = event.data.payload;
            
            // Save record to DB first
            try {
                await wixData.insert("PendingRequests", {
                    "roomNumber": String(formData.room),
                    "details": `ORDER: ${formData.order}`,
                    "fullContext": `Email: ${formData.email} | Mode: ${formData.paymentMode}`,
                    "status": "Pending Verification",
                    "timestamp": new Date(),
                    "isPrinted": false
                });
                console.log("Order form saved to database");

                // If they clicked "Pay with Card", trigger DPO payment
                if (formData.paymentMode === 'card') {
                    // Triggers the createActivityPayment function from your backend
                    // You can adjust '1' to a dynamic price if needed
                    const payment = await createActivityPayment("Concierge Service Order", 1, "Lodge Guest");
                    
                    if (payment) {
                        const result = await wixPay.startPayment(payment.id);
                        if (result.status === "Successful") {
                            chatWidget.postMessage({ 
                                type: "response", 
                                payload: "Thank you! Your card payment was successful and your order is being processed." 
                            });
                        }
                    }
                }
            } catch (err) {
                console.error("Checkout Error:", err);
            }
            return;
        }

        // 3. Standard Chat Logic
        if (event.data.type !== "chat") return;

        const guestMsg = event.data.payload;
        if (!guestMsg) return;

        if (!event.data.hidden) {
            chatWidget.postMessage({ type: "status", value: "typing" });
        }

        try {
            const aiResponse = await askAI(guestMsg, roomNumber, chatHistory);

            if (aiResponse.includes("[ACTION:TRIGGER_CHECKOUT]")) {
                const cleanResponse = aiResponse.replace("[ACTION:TRIGGER_CHECKOUT]", "");
                chatWidget.postMessage({ type: "response", payload: cleanResponse });
                chatWidget.postMessage({ 
                    type: "trigger_checkout", 
                    placeholder: "Please specify your items or special requests..." 
                });
            } else {
                chatWidget.postMessage({ type: "response", payload: aiResponse });
            }

            if (!event.data.hidden) {
                chatHistory.push({ "role": "user", "content": guestMsg });
                chatHistory.push({ "role": "assistant", "content": aiResponse });
                if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
            }

        } catch (err) {
            console.error("AI Error:", err);
            chatWidget.postMessage({ 
                type: "response", 
                payload: "I am having difficulty connecting. Please contact reception." 
            });
        }
    });
});
