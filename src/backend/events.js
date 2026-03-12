import wixData from 'wix-data';
import wixRealtimeBackend from 'wix-realtime-backend';

/**
 * Automatically triggers when a guest completes a payment.
 * This flips the dashboard status from UNPAID to PAID and notifies the guest.
 */
export async function wixPay_onPaymentUpdate(event) {
    // 1. Only proceed if the payment was successful or completed offline
    if (event.status === "Successful" || event.status === "Offline") {
        
        const paidAmount = event.amount; // The amount actually paid
        const userInfo = event.userInfo; // Metadata containing the guest's name/email

        try {
            /**
             * 2. FIND THE MATCHING REQUEST
             * We search for the most recent request matching the paid amount.
             * Note: In a production scale, passing a custom 'orderId' through 
             * the payment object is safer, but this time-based lookup is effective for lodge scale.
             */
            const results = await wixData.query("PendingRequests")
                .eq("status", "Pending Verification")
                .eq("orderTotal", paidAmount) 
                .descending("_createdDate")
                .limit(1)
                .find({ suppressAuth: true });

            if (results.items.length > 0) {
                const order = results.items[0];
                
                // 3. UPDATE THE DATABASE RECORD
                const updatedOrder = {
                    ...order,
                    paymentStatus: "PAID",
                    status: "Ready", // Move to Ready so staff see it immediately
                    paymentDetails: `Transaction ID: ${event.transactionId} | Method: ${event.paymentProtocol}`
                };

                await wixData.update("PendingRequests", updatedOrder, { suppressAuth: true });
                console.log(`✅ Payment synced for Room ${order.roomNumber}: K ${paidAmount}`);

                // 4. NOTIFY THE GUEST IN REAL-TIME
                // This triggers the response on the Home page to tell the guest their payment worked.
                wixRealtimeBackend.publish({ 
                    name: "OrderUpdates", 
                    resourceId: String(order.roomNumber) 
                }, { 
                    status: "Ready", 
                    dept: order.requestType,
                    msg: "Your payment has been verified."
                });
                
            } else {
                console.warn(`⚠️ Payment received (K ${paidAmount}) but no matching PendingRequest found in database.`);
            }
        } catch (err) {
            console.error("❌ Critical: Payment sync failed", err.message);
        }
    }
}
