import { triggeredEmails, contacts } from 'wix-crm-backend';
import wixData from 'wix-data';

/**
 * Notifies a specific department via email when a new request is made.
 */
export async function notifyDepartmentOfNewOrder(orderItem) {
    const { requestType, roomNumber, clientName, details } = orderItem;

    try {
        // 1. Fetch the email address of the staff member(s) assigned to this department
        const staffResults = await wixData.query("StaffProfiles")
            .hasSome("roles", [requestType])
            .find({ suppressAuth: true });

        if (staffResults.items.length === 0) {
            console.log(`No staff members found for department: ${requestType}`);
            return;
        }

        // 2. Loop through staff and send the triggered email
        const emailPromises = staffResults.items.map(async (staff) => {
            // Triggered emails require a Contact ID. 
            // We find or create a contact for the staff member email.
            const contactId = await getOrCreateContactId(staff.email);
            
            return triggeredEmails.emailContact('New_Department_Order', contactId, {
                variables: {
                    department: requestType,
                    roomNumber: String(roomNumber),
                    guestName: clientName || "Guest",
                    orderDetails: details
                }
            });
        });

        await Promise.all(emailPromises);
        console.log(`Notifications sent to ${requestType} department.`);
    } catch (err) {
        console.error("Failed to send triggered email:", err.message);
    }
}

async function getOrCreateContactId(email) {
    const search = await contacts.queryContacts().eq("info.emails.email", email).find();
    if (search.items.length > 0) return search.items[0]._id;
    
    const newContact = await contacts.createContact({
        info: { emails: [{ email }] }
    });
    return newContact._id;
}
