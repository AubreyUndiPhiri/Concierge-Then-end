import { Permissions, webMethod } from "wix-web-module";
import wixData from 'wix-data';

/**
 * enrollStaff - Registers new staff or admins into the system.
 * Handles multi-department roles (Array).
 */
export const enrollStaff = webMethod(Permissions.Anyone, async (staffData) => {
    // staffData: { email, password, firstName, roles }
    try {
        // 1. Check if email already exists to prevent duplicates
        const existing = await wixData.query("StaffProfiles")
            .eq("email", staffData.email)
            .find({ suppressAuth: true });

        if (existing.items.length > 0) {
            throw new Error("This email is already registered to another staff member.");
        }

        // 2. Prepare the Royal Staff Record
        const toSave = {
            "email": staffData.email,
            "password": staffData.password, 
            "firstName": staffData.firstName,
            "roles": staffData.roles, // Receives array: e.g., ["Kitchen", "Spa"]
            "enrolledAt": new Date()
        };
        
        return await wixData.insert("StaffProfiles", toSave, { suppressAuth: true });
    } catch (err) {
        console.error("Enrollment error logic:", err.message);
        throw new Error("Enrollment failed: " + err.message);
    }
});

/**
 * getAdminKPIs - Calculates performance data for the Royal Dashboard.
 * Queries ChatHistory and ConciergeFeedback collections.
 */
export const getAdminKPIs = webMethod(Permissions.Anyone, async () => {
    try {
        // Run queries in parallel for maximum performance
        const [conversationCount, feedbackResults] = await Promise.all([
            wixData.query("ChatHistory").count(),
            wixData.query("ConciergeFeedback").limit(1000).find({ suppressAuth: true })
        ]);
        
        // Calculate average rating from the ConciergeFeedback collection
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
