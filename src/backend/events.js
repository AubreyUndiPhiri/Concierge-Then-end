import wixData from 'wix-data';

// This function triggers automatically when any Wix Pay transaction succeeds
export async function wixPay_onPaymentUpdate(event) {
    if (event.status === "Successful") {
        const payload = event.transactionId; // Or use custom data if passed
        
        // Find the most recent pending request for this room/amount 
        // to mark it as paid.
        const results = await wixData.query("PendingRequests")
            .eq("status", "Pending Verification")
            .descending("_createdDate")
            .limit(1)
            .find();

        if (results.items.length > 0) {
            const order = results.items[0];
            await wixData.update("PendingRequests", {
                ...order,
                paymentStatus: "PAID",
                status: "Ready" // Automatically move to Ready once paid
            });
        }
    }
}
