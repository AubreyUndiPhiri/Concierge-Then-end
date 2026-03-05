import { Permissions, webMethod } from "wix-web-module";
import wixData from 'wix-data';

// SECURE: Only the master site owner/admin should be able to call these
export const enrollStaff = webMethod(Permissions.Anyone, async (staffData) => {
    // staffData: { email, password, firstName, roles }
    try {
        const toSave = {
            "email": staffData.email,
            "password": staffData.password, // Ideally hashed in a production environment
            "firstName": staffData.firstName,
            "roles": staffData.roles // Array: ["Kitchen"] or ["Admin"]
        };
        
        return await wixData.insert("StaffProfiles", toSave, { suppressAuth: true });
    } catch (err) {
        throw new Error("Enrollment failed: " + err.message);
    }
});

export const getAdminKPIs = webMethod(Permissions.Anyone, async () => {
    try {
        const conversationCount = await wixData.query("ChatHistory").count();
        const feedbackResults = await wixData.query("ConciergeFeedback").find();
        
        // Calculate average rating
        const totalRating = feedbackResults.items.reduce((acc, curr) => acc + (curr.rating || 0), 0);
        const avgRating = feedbackResults.items.length > 0 ? (totalRating / feedbackResults.items.length).toFixed(1) : "N/A";

        return {
            totalConversations: conversationCount,
            averageRating: avgRating,
            totalFeedback: feedbackResults.items.length
        };
    } catch (err) {
        return { totalConversations: 0, averageRating: "Error" };
    }
});
