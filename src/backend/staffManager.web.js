import { Permissions, webMethod } from "wix-web-module";
import wixData from 'wix-data';

// Fetches all registered staff
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

// Protected Deletion Logic
export const deleteStaff = webMethod(Permissions.Anyone, async (id) => {
    try {
        if (!id) throw new Error("No ID provided for deletion.");
        const staffToProtect = await wixData.get("StaffProfiles", id, { suppressAuth: true });
        
        // MASTER ADMIN PROTECTION
        const masterEmails = ["stembo38@gmail.com", "phiriaubrey41@gmail.com"]; 

        if (staffToProtect && masterEmails.includes(staffToProtect.email)) {
            throw new Error("Security Violation: This Master Admin profile is protected and cannot be deleted.");
        }

        return await wixData.remove("StaffProfiles", id, { suppressAuth: true });
    } catch (err) {
        console.error("Failed to delete staff member:", err.message);
        throw new Error(err.message); 
    }
});


/**
 * @description Updates the departments/roles assigned to a specific staff member.
 */
export const updateStaffRoles = webMethod(Permissions.Anyone, async (id, roles) => {
    try {
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
 */
export const enrollStaff = webMethod(Permissions.Anyone, async (staffData) => {
    try {
        const existing = await wixData.query("StaffProfiles")
            .eq("email", staffData.email)
            .find({ suppressAuth: true });

        if (existing.items.length > 0) {
            throw new Error("This email is already registered to another staff member.");
        }

        const toSave = {
            "email": staffData.email,
            "password": staffData.password, 
            "firstName": staffData.firstName,
            "roles": staffData.roles, 
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
 */
export const getAdminKPIs = webMethod(Permissions.Anyone, async () => {
    try {
        const [conversationCount, feedbackResults] = await Promise.all([
            wixData.query("ChatHistory").count(),
            wixData.query("ConciergeFeedback").limit(1000).find({ suppressAuth: true })
        ]);
        
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
        return { totalConversations: 0, averageRating: "0.0", totalFeedback: 0 };
    }
});

/**
 * @description Saves/Updates the driver availability text for the AI model context.
 */
export const saveDriverInfo = webMethod(Permissions.Anyone, async (text) => {
    try {
        const results = await wixData.query("LodgeSettings")
            .eq("title", "DriverInfo")
            .find({ suppressAuth: true });

        const toSave = { 
            "title": "DriverInfo", 
            "unavailableText": text 
        };

        if (results.items.length > 0) {
            toSave._id = results.items[0]._id;
            return await wixData.update("LodgeSettings", toSave, { suppressAuth: true });
        } else {
            return await wixData.insert("LodgeSettings", toSave, { suppressAuth: true });
        }
    } catch (err) {
        console.error("Failed to save driver info:", err.message);
        throw new Error("Update failed.");
    }
});
