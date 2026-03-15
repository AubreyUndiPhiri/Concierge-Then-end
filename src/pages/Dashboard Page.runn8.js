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
import { 
    sendOrderReadyEmail, 
    publishOrderUpdate 
} from 'backend/notifications.web.js';

let dashboard;
let currentDept = "";
let loggedInStaff = null;
let refreshInterval;
let currentFilterDate = null;

$w.onReady(function () {
    dashboard = $w("#html1");

    // --- 1. SESSION MANAGEMENT ---
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

        // --- 2. DIRECTORY REFRESH HANDLER ---
        if (d.type === "getStaffList") {
            await refreshStaffDirectory();
        }

        // --- 3. AUTH & INITIALIZATION ---
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

        // --- 4. STAFF MANAGEMENT ---
        if (d.type === "enrollStaff") {
            try {
                const result = await enrollStaff(d.staffData);
                if (result) {
                    dashboard.postMessage({ type: "alert", msg: "New member registered." });
                    await refreshStaffDirectory();
                }
            } catch (err) { dashboard.postMessage({ type: "alert", msg: "Error: " + err.message }); }
        }

        if (d.type === "deleteStaff") {
            try {
                await deleteStaff(d.id);
                dashboard.postMessage({ type: "alert", msg: "Staff member removed." });
                await refreshStaffDirectory();
            } catch (err) { dashboard.postMessage({ type: "alert", msg: "Deletion failed." }); }
        }

        // --- 5. ORDER FULFILLMENT & REAL-TIME ---
        if (d.type === "notifyReady") {
            try {
                const originalRecord = await wixData.get("PendingRequests", d.id);
                
                await wixData.update("PendingRequests", {
                    ...originalRecord,
                    status: "Ready",
                    isPrinted: true 
                });

                await publishOrderUpdate(originalRecord.roomNumber, originalRecord.requestType);

                dashboard.postMessage({ type: "alert", msg: "Mission Accomplished. Guest Notified." });
                await loadOrders(currentDept, currentFilterDate);
            } catch (err) { console.error("Fulfillment error:", err); }
        }

        if (d.type === "notifyClientReady") {
            try {
                const originalRecord = await wixData.get("PendingRequests", d.id);
                await sendOrderReadyEmail(originalRecord.clientEmail, originalRecord.details);

                await wixData.update("PendingRequests", {
                    ...originalRecord,
                    emailSent: true,
                    status: "Ready",
                    isPrinted: true
                });

                dashboard.postMessage({ type: "alert", msg: "Email Notification Sent." });
                await loadOrders(currentDept, currentFilterDate);
            } catch (err) { dashboard.postMessage({ type: "alert", msg: "Email failed." }); }
        }

        // --- 6. AI CONTEXT & SETTINGS ---
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
            dashboard.postMessage({ type: "alert", msg: `Nkhosi AI updated with ${currentDept} context.` });
            await fetchAvailability(currentDept);
        }

        if (d.type === "saveActivityPrices") {
            await saveLodgeSettings("ActivitiesPrices", d.text, getStaffName());
            dashboard.postMessage({ type: "alert", msg: "Activity prices synced." });
        }

        if (d.type === "saveDrivers") {
            await saveDriverInfo(d.text);
            dashboard.postMessage({ type: "alert", msg: "Driver contacts synced." });
        }

        if (d.type === "refreshKPIs") {
            const kpis = await getAdminKPIs();
            dashboard.postMessage({ type: "loadKPIs", data: kpis });
        }
    });
});

/** --- LOGIC HELPERS --- **/

async function refreshStaffDirectory() {
    try {
        const list = await getAllStaff();
        dashboard.postMessage({ type: "staffListUpdate", payload: list.items || [] });
    } catch (err) {
        console.error("Directory refresh failed", err);
    }
}

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
    refreshInterval = setInterval(async () => { await loadOrders(currentDept, currentFilterDate); }, 15000);
}

function getStaffName() { return loggedInStaff ? (loggedInStaff.firstName || "Staff") : "Staff"; }

async function loadOrders(department, filterDateStr = null) {
    if (!department) return;

    let baseQuery = wixData.query("PendingRequests").eq("requestType", department);

    if (filterDateStr) {
        const selectedDate = new Date(filterDateStr);
        const dayStart = new Date(selectedDate); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(selectedDate); dayEnd.setHours(23, 59, 59, 999);
        baseQuery = baseQuery.ge("_createdDate", dayStart).le("_createdDate", dayEnd);
    }

    try {
        const activeResults = await baseQuery.eq("isPrinted", false).descending("_createdDate").find();
        const historyResults = await baseQuery.eq("isPrinted", true).descending("_createdDate").limit(10).find();

        const mapItems = (items) => items.map(item => ({
            ...item,
            email: item.clientEmail || item.email 
        }));

        dashboard.postMessage({
            type: "updateOrders",
            orders: mapItems(activeResults.items),
            history: mapItems(historyResults.items)
        });
    } catch (err) { console.error("Order load error:", err); }
}

async function fetchAvailability(department) {
    const settingsTitle = department === "Kitchen" ? "DailyAvailability" : `${department}Availability`;
    const results = await wixData.query("LodgeSettings").eq("title", settingsTitle).find();
    if (results.items.length > 0) {
        dashboard.postMessage({ type: "loadAvailability", text: results.items[0].unavailableText || "" });
    }
}

async function fetchActivityPrices() {
    const priceData = await wixData.query("LodgeSettings").eq("title", "ActivitiesPrices").find();
    if (priceData.items.length > 0) {
        dashboard.postMessage({ type: "loadActivityPrices", text: priceData.items[0].unavailableText });
    }
}

async function fetchDriverRates() {
    const res = await wixData.query("LodgeSettings").eq("title", "DriverInfo").find();
    if (res.items.length > 0) {
        dashboard.postMessage({ type: "loadDrivers", text: res.items[0].unavailableText || "" });
    }
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
