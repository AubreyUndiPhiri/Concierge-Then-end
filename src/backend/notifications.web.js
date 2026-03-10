import { triggeredEmails, contacts } from 'wix-crm-backend';
import wixData from 'wix-data';

export async function notifyDepartmentOfNewOrder(orderItem) {
    const { requestType, roomNumber, clientName, details } = orderItem;

    try {
        // 1. Find staff members with the matching role (Kitchen, Spa, etc.)
        const staffResults = await wixData.query("StaffProfiles")
            .hasSome("roles", [requestType])
            .find({ suppressAuth: true });

        // 2. Send the email to each staff member found
        const emailPromises = staffResults.items.map(async (staff) => {
            const contactId = await getOrCreateContactId(staff.email);
            
            // PASTE YOUR EMAIL ID HERE:
            return triggeredEmails.emailContact('VDV45yE', contactId, {
                variables: {
                    department: requestType,
                    roomNumber: String(roomNumber),
                    guestName: clientName || "Valued Guest",
                    orderDetails: details
                }
            });
        });

        await Promise.all(emailPromises);
        console.log(`Emails dispatched to ${requestType} team.`);
    } catch (err) {
        console.error("Triggered Email Error:", err.message);
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
