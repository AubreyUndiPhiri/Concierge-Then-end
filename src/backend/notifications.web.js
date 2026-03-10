import { triggeredEmails, contacts } from 'wix-crm-backend';
import wixData from 'wix-data';

export async function notifyDepartmentOfNewOrder(orderItem) {
    const { requestType, roomNumber, clientName, details } = orderItem;

    try {
        // 1. Identify staff members for the relevant department (Kitchen, Spa, etc.)
        const staffResults = await wixData.query("StaffProfiles")
            .hasSome("roles", [requestType])
            .find({ suppressAuth: true }); //

        // 2. Loop through each staff member found and send the email
        const emailPromises = staffResults.items.map(async (staff) => {
            const contactId = await getOrCreateContactId(staff.email);
            
            // Note: Replace 'New_Order_ID' with the actual Email ID from your dashboard
            return triggeredEmails.emailContact('New_Order_ID', contactId, {
                variables: {
                    department: requestType,
                    roomNumber: String(roomNumber),
                    guestName: clientName || "Valued Guest",
                    orderDetails: details
                }
            });
        });

        await Promise.all(emailPromises);
    } catch (err) {
        console.error("Email trigger failed:", err.message);
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
