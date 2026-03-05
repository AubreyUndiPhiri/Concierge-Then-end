import wixData from 'wix-data';
import { local } from 'wix-storage';
import { verifyStaffLogin } from 'backend/auth.web.js'; 
import { enrollStaff, getAdminKPIs } from 'backend/staffManager.web.js'; // Ensure this backend file is created

let dashboard; 
let currentDept = "";
let loggedInStaff = null;
let refreshInterval;

$w.onReady(function () {
    dashboard = $w("#html1"); 

    // PERSISTENCE: Auto-resume session
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

        // INITIALIZATION Handshake
        if (d.type === "ready") {
            if (!loggedInStaff) { 
                dashboard.postMessage({ type: "showLogin" }); 
            } else { 
                setupDashboard(loggedInStaff); 
            }
        }

        // AUTHENTICATION: LOGIN
        if (d.type === "staffLogin") {
            try {
                const result = await verifyStaffLogin(d.email, d.password);
                if (result.success) {
                    loggedInStaff = result.user;
                    local.setItem("staffSession", JSON.stringify(loggedInStaff));
                    setupDashboard(loggedInStaff);
                } else { 
                    dashboard.postMessage({ type: "loginError", msg: result.msg }); 
                }
            } catch (err) {
                dashboard.postMessage({ type: "loginError", msg: "Connection Error" });
            }
        }

        // --- NEW ADMIN FUNCTIONALITY: STAFF ENROLLMENT ---
        if (d.type === "enrollStaff") {
            try {
                // d.staffData: { email, password, firstName, roles }
                const result = await enrollStaff(d.staffData);
                dashboard.postMessage({ type: "alert", msg: "New Staff Enrolled Successfully" });
            } catch (err) {
                dashboard.postMessage({ type: "alert", msg: "Enrollment Error: " + err.message });
            }
        }

        // --- NEW ADMIN FUNCTIONALITY: KPI REFRESH ---
        if (d.type === "refreshKPIs") {
            const kpis = await getAdminKPIs();
            dashboard.postMessage({ type: "loadKPIs", data: kpis });
        }

        // AUTHENTICATION: LOGOUT
        if (d.type === "staffLogout") {
            local.removeItem("staffSession");
            loggedInStaff = null;
            if (refreshInterval) clearInterval(refreshInterval);
            dashboard.postMessage({ type: "showLogin" });
        }

        // FILTERING: Department Switch
        if (d.type === "filter") {
            currentDept = d.department;
            await loadOrders(currentDept);
            await fetchAvailability(currentDept);
            
            if (currentDept === "Activities") {
                await fetchActivityPrices();
            }
        }

        // AI KNOWLEDGE UPDATE
        if (d.type === "saveAvailability") {
            const staffName = getStaffName();
            const settingsTitle = currentDept === "Kitchen" ? "DailyAvailability" : `${currentDept}Availability`;
            await saveLodgeSettings(settingsTitle, d.text, staffName);
            
            dashboard.postMessage({ 
                type: "saveConfirmed", 
                text: d.text,
                updatedBy: staffName,
                updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            dashboard.postMessage({ type: "alert", msg: `AI ${currentDept} Availability Synced` });
            await fetchAvailability(currentDept); 
        }

        if (d.type === "saveActivityPrices") {
            const staffName = getStaffName();
            await saveLodgeSettings("ActivitiesPrices", d.text, staffName);
            dashboard.postMessage({ type: "alert", msg: "AI Activity Prices Updated (USD $)" });
        }

        // ORDER FULFILLMENT
        if (d.type === "notifyReady") {
            try {
                const originalRecord = await wixData.get("PendingRequests", d.id);
                await wixData.update("PendingRequests", { ...originalRecord, status: "Ready", isPrinted: true });
                
                await wixData.insert("ChatHistory", {
                    userMessage: "[SYSTEM_ACTION: NOTIFY_READY]",
                    aiResponse: `Mwaiseni! Your ${d.dept} request is now ready.`,
                    roomNumber: String(d.room),
                    timestamp: new Date()
                }, { suppressAuth: true });

                await loadOrders(currentDept);
            } catch (err) {
                console.error("Fulfillment failed:", err);
            }
        }
    });
});

/** * HELPER FUNCTIONS 
 */

async function setupDashboard(user) {
    const formattedUser = formatUser(user);
    const isAdmin = formattedUser.roles.includes("Admin");

    // Pass user data and admin status to the HTML UI
    dashboard.postMessage({ 
        type: "setUser", 
        user: formattedUser, 
        isAdmin: isAdmin 
    });
    
    // Initial data load
    currentDept = isAdmin ? "Kitchen" : (formattedUser.roles[0] || "Kitchen");
    await loadOrders(currentDept);
    await fetchAvailability(currentDept);
    
    // If Admin, load the KPIs immediately
    if (isAdmin) {
        const kpis = await getAdminKPIs();
        dashboard.postMessage({ type: "loadKPIs", data: kpis });
    }

    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(async () => {
        await loadOrders(currentDept);
        if (isAdmin) {
            const kpis = await getAdminKPIs();
            dashboard.postMessage({ type: "loadKPIs", data: kpis });
        }
    }, 10000);
}

function getStaffName() {
    return loggedInStaff ? (loggedInStaff.firstName || loggedInStaff.name || "Staff") : "Staff";
}

async function loadOrders(department) {
    if (!department) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        const query = wixData.query("PendingRequests").eq("requestType", department).ge("_createdDate", today);
        const [active, history] = await Promise.all([
            query.eq("isPrinted", false).descending("_createdDate").find(),
            query.eq("isPrinted", true).limit(20).descending("_createdDate").find()
        ]);

        dashboard.postMessage({ 
            type: "updateOrders", 
            dept: department, 
            orders: active.items, 
            history: history.items 
        });
    } catch (err) {
        console.error("Order load error:", err);
    }
}

async function fetchAvailability(department) {
    const settingsTitle = department === "Kitchen" ? "DailyAvailability" : `${department}Availability`;
    const results = await wixData.query("LodgeSettings").eq("title", settingsTitle).find();
    
    if (results.items.length > 0) {
        const item = results.items[0];
        dashboard.postMessage({ 
            type: "loadAvailability", 
            text: item.unavailableText || "", 
            updatedBy: item.lastUpdatedBy || "Staff", 
            updatedAt: new Date(item._updatedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }
}

async function fetchActivityPrices() {
    const priceData = await wixData.query("LodgeSettings").eq("title", "ActivitiesPrices").find();
    if (priceData.items.length > 0) {
        dashboard.postMessage({ 
            type: "loadActivityPrices", 
            text: priceData.items[0].unavailableText 
        });
    }
}

async function saveLodgeSettings(title, text, staffName) {
    try {
        const results = await wixData.query("LodgeSettings").eq("title", title).find();
        const toSave = { title, unavailableText: text, lastUpdatedBy: staffName };
        if (results.items.length > 0) toSave._id = results.items[0]._id;
        return await wixData.save("LodgeSettings", toSave);
    } catch (err) {
        console.error("Settings save error:", err);
    }
}

function formatUser(user) { 
    return { ...user, roles: (user.roles || []).map(r => r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()) }; 
}

function isToday(date) { 
    const today = new Date(); 
    return date.toDateString() === today.toDateString();
}
