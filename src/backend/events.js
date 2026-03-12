import wixData from 'wix-data';

/**
 * Automatically triggers when a guest completes a payment.
 * This flips the dashboard status from UNPAID to PAID.
 */
export async function wixPay_onPaymentUpdate(event) {
    // 1. Only proceed if the payment was successful
    if (event.status === "Successful" || event.status === "Offline") {
        
        const paidAmount = event.amount; // The amount the guest actually paid

        try {
            // 2. Find the most recent 'Pending' request that matches this exact amount
            const results = await wixData.query("PendingRequests")
                .eq("status", "Pending Verification")
                .eq("orderTotal", paidAmount) // Match the price to be sure
                .descending("_createdDate")
                .limit(1)
                .find({ suppressAuth: true });

            if (results.items.length > 0) {
                const order = results.items[0];
                
                // 3. Update the record
                const updatedOrder = {
                    ...order,
                    paymentStatus: "PAID",
                    status: "Ready" // Move to Ready status for staff to see
                };

                await wixData.update("PendingRequests", updatedOrder, { suppressAuth: true });
                console.log(`Payment synced for Room ${order.roomNumber}: K ${paidAmount}`);
                
            } else {
                console.warn(`Payment received (K ${paidAmount}) but no matching PendingRequest found.`);
            }
        } catch (err) {
            console.error("Critical: Payment sync failed", err.message);
        }
    }
}
