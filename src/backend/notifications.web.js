import { triggeredEmails, contacts } from 'wix-crm-backend';
import wixData from 'wix-data';

/**
 * Dispatches triggered emails to all staff members assigned to a specific department
 * when a new order is received.
 */
export async function notifyDepartmentOfNewOrder(orderItem) {
    const { requestType, roomNumber, roomName, clientName, details, orderTotal } = orderItem;

    try {
        // 1. Find staff members with the matching role (Kitchen, Spa, Drivers, or Activities)
        // Standardized to match the 'Drivers' naming convention
        const staffResults = await wixData.query("StaffProfiles")
            .hasSome("roles", [requestType])
            .find({ suppressAuth: true });

        if (staffResults.items.length === 0) {
            console.warn(`⚠️ No staff members found for department: ${requestType}`);
            return;
        }

        // 2. Send the triggered email to each staff member found
        const emailPromises = staffResults.items.map(async (staff) => {
            const contactId = await getOrCreateContactId(staff.email);
            
            // 'VDV45yE' template must have these 6 variables defined in Wix CRM
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
        console.log(`✅ Success: Notification emails dispatched to the ${requestType} team.`);
    } catch (err) {
        console.error("❌ Notification Error:", err.message);
    }
}

/**
 * Helper: Retrieves an existing contact ID or creates a new one for a staff email address.
 */
async function getOrCreateContactId(email) {
    try {
        // Search by email in Wix Contacts
        const search = await contacts.queryContacts()
            .eq("info.emails.email", email)
            .find();
            
        if (search.items.length > 0) return search.items[0]._id;
        
        // If not found, create a new contact so we can email them
        const newContact = await contacts.createContact({
            info: { 
                emails: [{ email, tag: "STAFF" }] 
            }
        });
        return newContact._id;
    } catch (err) {
        console.error("Contact Management Error:", err.message);
        throw err;
    }
}
