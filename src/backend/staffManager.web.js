import { Permissions, webMethod } from "wix-web-module";
import wixData from 'wix-data';

/**
 * @description Fetches all registered staff members for the Admin Settings management list.
 * @returns {Promise} Resolves to the results of the StaffProfiles query.
 */
export const getAllStaff = webMethod(Permissions.Anyone, async () => {
    try {
        return await wixData.query("StaffProfiles")
            .ascending("firstName")
            .find({ suppressAuth: true });
    } catch (err) {
        console.error("Failed to fetch staff list:", err.message);
        throw new Error("Could not retrieve staff list.");
    }
});

/**
 * @description Updates the departments/roles assigned to a specific staff member.
 * @param {string} id - The unique ID of the staff member.
 * @param {Array} roles - The updated array of roles (e.g., ["Kitchen", "Spa"]).
 */
export const updateStaffRoles = webMethod(Permissions.Anyone, async (id, roles) => {
    try {
        // Fetch current record to ensure we only update the roles field
        const currentRecord = await wixData.get("StaffProfiles", id, { suppressAuth: true });
        if (!currentRecord) throw new Error("Staff member not found.");

        const updatedRecord = { 
            ...currentRecord, 
            "roles": roles 
        };

        return await wixData.update("StaffProfiles", updatedRecord, { suppressAuth: true });
    } catch (err) {
        console.error("Failed to update staff roles:", err.message);
        throw new Error("Update failed: " + err.message);
    }
});

/**
 * @description Registers a new staff member or admin.
 * @param {Object} staffData - Contains email, password, firstName, and roles array.
 */
export const enrollStaff = webMethod(Permissions.Anyone, async (staffData) => {
    try {
        // 1. Prevent duplicate registrations via email
        const existing = await wixData.query("StaffProfiles")
            .eq("email", staffData.email)
            .find({ suppressAuth: true });

        if (existing.items.length > 0) {
            throw new Error("This email is already registered to another staff member.");
        }

        // 2. Format the new Royal Staff record
        const toSave = {
            "email": staffData.email,
            "password": staffData.password, 
            "firstName": staffData.firstName,
            "roles": staffData.roles, // Supports multiple selections: ["Kitchen", "Spa", "Activities"]
            "enrolledAt": new Date()
        };
        
        return await wixData.insert("StaffProfiles", toSave, { suppressAuth: true });
    } catch (err) {
        console.error("Enrollment error:", err.message);
        throw new Error(err.message);
    }
});

/**
 * @description Aggregates Key Performance Indicators for the Admin Dashboard.
 * Includes chat volume, average concierge rating, and feedback counts.
 */
export const getAdminKPIs = webMethod(Permissions.Anyone, async () => {
    try {
        // Run queries in parallel for high-efficiency performance
        const [conversationCount, feedbackResults] = await Promise.all([
            wixData.query("ChatHistory").count(),
            wixData.query("ConciergeFeedback").limit(1000).find({ suppressAuth: true })
        ]);
        
        // Calculate average rating from feedback collection
        const totalRating = feedbackResults.items.reduce((acc, curr) => acc + (curr.rating || 0), 0);
        const feedbackCount = feedbackResults.items.length;
        const avgRating = feedbackCount > 0 ? (totalRating / feedbackCount).toFixed(1) : "0.0";

        return {
            totalConversations: conversationCount,
            averageRating: avgRating,
            totalFeedback: feedbackCount
        };
    } catch (err) {
        console.error("KPI Retrieval failed:", err.message);
        return { 
            totalConversations: 0, 
            averageRating: "0.0", 
            totalFeedback: 0,
            error: err.message 
        };
    }
});
