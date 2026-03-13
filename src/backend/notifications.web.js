import { triggeredEmails, contacts } from 'wix-crm-backend';
import wixData from 'wix-data';

/**
 * Sends a notification to the guest when their order is ready.
 * This is triggered by the "Notify Client" button on the Staff Dashboard.
 */
export async function sendOrderReadyEmail(email, details) {
    try {
        // 1. Get or create the contact ID for the guest
        const contactId = await getOrCreateContactId(email, "GUEST");

        // 2. Dispatch the Triggered Email
        // Note: You should create a separate template in Wix CRM for Guests.
        // If you don't have one yet, you can use 'VDV45yE' temporarily, 
        // but ensure the variable names match your template.
        return triggeredEmails.emailContact('VDV45yE', contactId, {
            variables: {
                orderDetails: details,
                statusUpdate: "Your order is ready and on its way!"
            }
        });
    } catch (err) {
        console.error("Guest Notification Error:", err.message);
        throw new Error("Failed to send guest notification.");
    }
}

/**
 * Dispatches triggered emails to all staff members assigned to a specific department
 * when a new order is received.
 */
export async function notifyDepartmentOfNewOrder(orderItem) {
    const { requestType, roomNumber, roomName, clientName, details, orderTotal } = orderItem;

    try {
        // 1. Find staff members with the matching role (Kitchen, Spa, Drivers, or Activities)
        const staffResults = await wixData.query("StaffProfiles")
            .hasSome("roles", [requestType])
            .find({ suppressAuth: true });

        if (staffResults.items.length === 0) {
            console.warn(`No staff members found for department: ${requestType}`);
            return;
        }

        // 2. Send the triggered email to each staff member found
        const emailPromises = staffResults.items.map(async (staff) => {
            const contactId = await getOrCreateContactId(staff.email, "STAFF");
            
            return triggeredEmails.emailContact('VDV45yE', contactId, {
                variables: {
                    department: requestType,
                    roomNumber: String(roomNumber),
                    roomName: roomName || "Guest Room",
                    guestName: clientName || "Valued Guest",
                    orderDetails: details || "New order placed via AI Concierge",
                    totalAmount: `K ${String(orderTotal || 0)}`
                }
            });
        });

        await Promise.all(emailPromises);
        console.log(` Success: Notification emails dispatched to the ${requestType} team.`);
    } catch (err) {
        console.error(" Staff Notification Error:", err.message);
    }
}

/**
 * Helper: Retrieves an existing contact ID or creates a new one.
 * Added 'tag' parameter to distinguish between Staff and Guests in your CRM.
 */
async function getOrCreateContactId(email, tag = "GUEST") {
    try {
        const search = await contacts.queryContacts()
            .eq("info.emails.email", email)
            .find();
            
        if (search.items.length > 0) return search.items[0]._id;
        
        const newContact = await contacts.createContact({
            info: { 
                emails: [{ email, tag: tag }] 
            }
        });
        return newContact._id;
    } catch (err) {
        console.error("Contact Management Error:", err.message);
        throw err;
    }
}
