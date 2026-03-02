import { Permissions, webMethod } from "wix-web-module";
import wixData from 'wix-data';

/**
 * verifyStaffLogin - Validates staff credentials against the StaffProfiles collection.
 * Standardizes access to the Nkhosi Livingstone Staff Dashboard.
 */
export const verifyStaffLogin = webMethod(
    Permissions.Anyone,
    async (email, password) => {
        try {
            // 1. Query the private collection using suppressAuth to bypass site-level permissions
            const results = await wixData.query("StaffProfiles")
                .eq("email", email)
                .find({ suppressAuth: true });

            // 2. Check if user exists
            if (results.items.length === 0) {
                return { success: false, msg: "Invalid Credentials" };
            }

            const staffMember = results.items[0];

            // 3. Simple Password Comparison
            // Note: In a production environment with sensitive data, consider Wix Auth or hashing.
            // For a lodge internal dashboard, this direct match is efficient.
            if (staffMember.password === password) { 
                
                // 4. Return the session object
                return { 
                    success: true, 
                    user: {
                        _id: staffMember._id,
                        name: staffMember.name,
                        firstName: staffMember.firstName || staffMember.name.split(' ')[0],
                        email: staffMember.email,
                        roles: staffMember.roles // Critical for dashboard filtering
                    } 
                };
            } else {
                return { success: false, msg: "Invalid Credentials" };
            }
        } catch (err) {
            console.error("Login verification error:", err.message);
            return { success: false, msg: "Server error during login" };
        }
    }
);
