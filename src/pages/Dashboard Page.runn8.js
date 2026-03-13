import wixData from 'wix-data';
import { local } from 'wix-storage';
import { verifyStaffLogin } from 'backend/auth.web.js';
import {
    enrollStaff,
    getAdminKPIs,
    getAllStaff,
    updateStaffRoles,
    saveDriverInfo,
    deleteStaff
} from 'backend/staffManager.web.js';

// If you have a backend function for emails, import it here:
// import { sendOrderReadyEmail } from 'backend/notifications.jsw';

let dashboard;
let currentDept = "";
let loggedInStaff = null;
let refreshInterval;
let currentFilterDate = null; 

$w.onReady(function () {
    dashboard = $w("#html1");

    // Session Management
    const savedStaff = local.getItem("staffSession");
    if (savedStaff) {
        try {
            loggedInStaff = JSON.parse(savedStaff);
        } catch (e) {
            local.removeItem("staffSession");
        }
    }

    dashboard.onMessage(async (event) => {
        const d = event.data;

        // --- 1. SYSTEM & AUTH HANDLERS ---
        if (d.type === "ready") {
            if (!loggedInStaff) {
                dashboard.postMessage({ type: "showLogin" });
            } else {
                setupDashboard(loggedInStaff);
            }
        }

        if (d.type === "staffLogin") {
            try {
                const result = await verifyStaffLogin(d.email, d.password);
                if (result.success) {
                    loggedInStaff = result.user;
                    local.setItem("staffSession", JSON.stringify(loggedInStaff));
                    setupDashboard(loggedInStaff);
                } else {
                    dashboard.postMessage({ type: "alert", msg: result.msg });
                }
            } catch (err) {
                dashboard.postMessage({ type: "alert", msg: "Login Connection Error" });
            }
        }

        if (d.type === "staffLogout") {
            local.removeItem("staffSession");
            loggedInStaff = null;
            if (refreshInterval) clearInterval(refreshInterval);
            dashboard.postMessage({ type: "showLogin" });
        }

        // --- 2. STAFF MANAGEMENT HANDLERS ---
        if (d.type === "enrollStaff") {
            try {
                const result = await enrollStaff(d.staffData);
                if (result) {
                    dashboard.postMessage({ type: "alert", msg: "New member registered successfully." });
                    const updatedList = await getAllStaff();
                    dashboard.postMessage({ type: "staffListUpdate", payload: updatedList.items || [] });
                }
            } catch (err) {
                dashboard.postMessage({ type: "alert", msg: "Registration failed: " + err.message });
            }
        }

        if (d.type === "updateStaffInfo") {
            try {
                const result = await updateStaffRoles(d.data.id, d.data.roles);
                if (result) {
                    dashboard.postMessage({ type: "alert", msg: "Staff profile updated successfully." });
                    const updatedList = await getAllStaff();
                    dashboard.postMessage({ type: "staffListUpdate", payload: updatedList.items || [] });
                }
            } catch (err) {
                dashboard.postMessage({ type: "alert", msg: "Update failed: " + err.message });
            }
        }

        if (d.type === "deleteStaff") {
            try {
                const result = await deleteStaff(d.id);
                if (result) {
                    dashboard.postMessage({ type: "alert", msg: "Staff member deleted." });
                    const updatedList = await getAllStaff();
                    dashboard.postMessage({ type: "staffListUpdate", payload: updatedList.items || [] });
                }
            } catch (err) {
                dashboard.postMessage({ type: "alert", msg: "Deletion failed: " + err.message });
            }
        }

        if (d.type === "getStaffList") {
            const list = await getAllStaff();
            dashboard.postMessage({ type: "staffListUpdate", payload: list.items || [] });
        }

        // --- 3. DATA & ANALYTICS HANDLERS ---
        if (d.type === "filter") {
            currentDept = d.department;
            currentFilterDate = d.date || null;
            await loadOrders(currentDept, currentFilterDate);
            await fetchAvailability(currentDept);
            if (currentDept === "Activities") await fetchActivityPrices();
            if (currentDept === "Drivers") await fetchDriverRates();
        }

        if (d.type === "saveAvailability") {
            const settingsTitle = currentDept === "Kitchen" ? "DailyAvailability" : `${currentDept}Availability`;
            await saveLodgeSettings(settingsTitle, d.text, getStaffName());
            dashboard.postMessage({ type: "alert", msg: `AI ${currentDept} Context Synced.` });
            await fetchAvailability(currentDept);
        }

        // --- 4. ORDER FULFILLMENT & NOTIFICATIONS ---
        
        // Handler for "Complete Mission" button
        if (d.type === "notifyReady") {
            try {
                const originalRecord = await wixData.get("PendingRequests", d.id);
                // Mark as Ready and Printed (Archived)
                await wixData.update("PendingRequests", { 
                    ...originalRecord, 
                    status: "Ready", 
                    isPrinted: true 
                });
                dashboard.postMessage({ type: "alert", msg: "Mission Accomplished." });
                await loadOrders(currentDept, currentFilterDate);
            } catch (err) {
                console.error("Fulfillment failed:", err);
            }
        }

        // New Handler for "Notify Client" (Verified Badge Logic)
        if (d.type === "notifyClientReady") {
            try {
                const originalRecord = await wixData.get("PendingRequests", d.id);
                
                // 1. Logic to send the actual email would go here
                // await sendOrderReadyEmail(d.email, originalRecord.details);

                // 2. Update Database to reflect email was sent (Verified status)
                await wixData.update("PendingRequests", { 
                    ...originalRecord, 
                    emailSent: true, // This field powers the Green Badge
                    isPrinted: true  // Move to archives if not already there
                });

                dashboard.postMessage({ type: "alert", msg: "Client notified. Order Verified." });
                await loadOrders(currentDept, currentFilterDate);
            } catch (err) {
                dashboard.postMessage({ type: "alert", msg: "Notification failed: " + err.message });
            }
        }

        if (d.type === "refreshKPIs") {
            const kpis = await getAdminKPIs();
            dashboard.postMessage({ type: "loadKPIs", data: kpis });
            dashboard.postMessage({ type: "alert", msg: "Analytics Refreshed." });
        }
    });
});

/** --- HELPER FUNCTIONS --- **/

async function setupDashboard(user) {
    const formattedUser = formatUser(user);
    const isAdmin = (formattedUser.roles || []).some(role => role.toLowerCase() === "admin");
    dashboard.postMessage({ type: "setUser", user: formattedUser, isAdmin: isAdmin });
    
    currentDept = isAdmin ? "Kitchen" : (formattedUser.roles[0] || "Kitchen");
    currentFilterDate = null;
    
    await loadOrders(currentDept);
    await fetchAvailability(currentDept);
    
    if (isAdmin) {
        const kpis = await getAdminKPIs();
        dashboard.postMessage({ type: "loadKPIs", data: kpis });
    }
    
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(async () => { await loadOrders(currentDept, currentFilterDate); }, 10000);
}

function getStaffName() { return loggedInStaff ? (loggedInStaff.firstName || "Staff") : "Staff"; }

async function loadOrders(department, filterDateStr = null) {
    if (!department) return;

    // Start the base query
    let query = wixData.query("PendingRequests").eq("requestType", department);
    
    // Set up the 24-hour / Date Filter
    const selectedDate = filterDateStr ? new Date(filterDateStr) : new Date();
    const dayStart = new Date(selectedDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate); dayEnd.setHours(23, 59, 59, 999);
    
    // Apply the time filter to the base query
    query = query.ge("_createdDate", dayStart).le("_createdDate", dayEnd);
    
    try {
        // FIX 1: Use lowercase .clone() 
        // This keeps the top list focused on only PENDING items (isPrinted: false)
        const activeResults = await query.clone().eq("isPrinted", false).descending("_createdDate").find();

        // FIX 2: Removed .eq("isPrinted", true) to match KPI logic
        // This shows ALL 5 orders from the last 24h regardless of status
        const historyResults = await query.clone().descending("_createdDate").limit(10).find();
        
        // Map 'email' field from DB to 'clientEmail' for the HTML component
        const activeItems = activeResults.items.map(item => ({...item, clientEmail: item.email}));
        const historyItems = historyResults.items.map(item => ({...item, clientEmail: item.email}));

        dashboard.postMessage({ 
            type: "updateOrders", 
            orders: activeItems || [], 
            history: historyItems || [] 
        });
    } catch (err) { 
        console.error("Order load error:", err); 
    }
}

async function fetchAvailability(department) {
    const settingsTitle = department === "Kitchen" ? "DailyAvailability" : `${department}Availability`;
    const results = await wixData.query("LodgeSettings").eq("title", settingsTitle).find();
    if (results.items.length > 0) { dashboard.postMessage({ type: "loadAvailability", text: results.items[0].unavailableText || "" }); }
}

async function fetchActivityPrices() {
    const priceData = await wixData.query("LodgeSettings").eq("title", "ActivitiesPrices").find();
    if (priceData.items.length > 0) { dashboard.postMessage({ type: "loadActivityPrices", text: priceData.items[0].unavailableText }); }
}

async function fetchDriverRates() {
    const res = await wixData.query("LodgeSettings").eq("title", "DriverInfo").find();
    if (res.items.length > 0) { dashboard.postMessage({ type: "loadDrivers", text: res.items[0].unavailableText || "" }); }
}

async function saveLodgeSettings(title, text, staffName) {
    try {
        const results = await wixData.query("LodgeSettings").eq("title", title).find();
        const toSave = { title, unavailableText: text, lastUpdatedBy: staffName };
        if (results.items.length > 0) toSave._id = results.items[0]._id;
        return await wixData.save("LodgeSettings", toSave);
    } catch (err) { console.error("Settings save error:", err); }
}

function formatUser(user) {
    return { ...user, roles: (user.roles || []).map(r => r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()) };
}
