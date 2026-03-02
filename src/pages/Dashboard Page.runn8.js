import wixData from 'wix-data';
import { local } from 'wix-storage';
import { verifyStaffLogin } from 'backend/auth.web.js'; 

let dashboard; 
let currentDept = "";
let loggedInStaff = null;
let refreshInterval;

$w.onReady(function () {
    dashboard = $w("#html1"); // Ensure your HTML component ID matches this

    // PERSISTENCE: Check if a staff member is already logged in
    const savedStaff = local.getItem("staffSession");
    if (savedStaff) { 
        loggedInStaff = JSON.parse(savedStaff); 
    }

    dashboard.onMessage(async (event) => {
        const d = event.data;

        // INITIALIZATION
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

        // AUTHENTICATION: LOGOUT
        if (d.type === "staffLogout") {
            local.removeItem("staffSession");
            loggedInStaff = null;
            clearInterval(refreshInterval);
            dashboard.postMessage({ type: "showLogin" });
        }

        // FILTERING: Change Department (Kitchen/Spa/Activities)
        if (d.type === "filter") {
            currentDept = d.department;
            loadOrders(currentDept);
            if (currentDept === "Kitchen") fetchAvailability();
        }

        // AI MENU UPDATE: Handshake & Custom Alert
        if (d.type === "saveAvailability") {
            const staffName = loggedInStaff ? (loggedInStaff.firstName || loggedInStaff.name || "Staff") : "Staff";
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            await saveLodgeSettings("DailyAvailability", d.text, staffName);
            
            // Send Confirmation back to UI to reset "Unsaved Changes" state
            dashboard.postMessage({ 
                type: "saveConfirmed", 
                text: d.text,
                updatedBy: staffName,
                updatedAt: timeStr
            });

            // Trigger visual success modal in HTML
            dashboard.postMessage({ 
                type: "alert", 
                msg: "AI Menu Knowledge Updated Successfully" 
            });
            
            fetchAvailability(); 
        }

        // ORDER FULFILLMENT: Set order to 'Ready'
        if (d.type === "notifyReady") {
            try {
                const originalRecord = await wixData.get("PendingRequests", d.id);
                await wixData.update("PendingRequests", { ...originalRecord, status: "Ready", isPrinted: true });
                
                // Optional: Insert into ChatHistory to notify the guest
                await wixData.insert("ChatHistory", {
                    userMessage: "[SYSTEM_ACTION: NOTIFY_READY]",
                    aiResponse: `Mwaiseni! Your ${d.dept} request is now ready.`,
                    roomNumber: String(d.room),
                    timestamp: new Date()
                }, { suppressAuth: true });

                loadOrders(currentDept);
            } catch (err) {
                console.error("Notify Ready failed", err);
            }
        }
    });
});

function setupDashboard(user) {
    const formattedUser = formatUser(user);
    dashboard.postMessage({ type: "setUser", user: formattedUser });
    
    if (formattedUser.roles && formattedUser.roles.length > 0) {
        currentDept = formattedUser.roles[0];
        loadOrders(currentDept);
        
        // REFRESH ENGINE: Updates the board every 10 seconds
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(() => loadOrders(currentDept), 10000);
    }
    fetchAvailability();
}

async function loadOrders(department) {
    if (!department) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const active = await wixData.query("PendingRequests")
        .eq("requestType", department)
        .eq("isPrinted", false)
        .ge("_createdDate", today)
        .descending("_createdDate")
        .find();

    const history = await wixData.query("PendingRequests")
        .eq("requestType", department)
        .eq("isPrinted", true)
        .limit(20)
        .descending("_createdDate")
        .find();

    dashboard.postMessage({ 
        type: "updateOrders", 
        dept: department, 
        orders: active.items, 
        history: history.items 
    });
}

async function fetchAvailability() {
    const results = await wixData.query("LodgeSettings").eq("title", "DailyAvailability").find();
    if (results.items.length > 0) {
        const item = results.items[0];
        
        // Reset availability if it was updated on a previous day
        if (item._updatedDate && !isToday(new Date(item._updatedDate))) {
            await saveLodgeSettings("DailyAvailability", "", "System Reset");
            dashboard.postMessage({ type: "loadAvailability", text: "", updatedBy: "System", updatedAt: "Midnight" });
        } else {
            const timeStr = new Date(item._updatedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            dashboard.postMessage({ 
                type: "loadAvailability", 
                text: item.unavailableText, 
                updatedBy: item.lastUpdatedBy || "Staff", 
                updatedAt: timeStr 
            });
        }
    }
}

async function saveLodgeSettings(title, text, staffName) {
    const results = await wixData.query("LodgeSettings").eq("title", title).find();
    const toSave = { title, unavailableText: text, lastUpdatedBy: staffName };
    if (results.items.length > 0) toSave._id = results.items[0]._id;
    return wixData.save("LodgeSettings", toSave);
}

// FORMATTING HELPERS
function formatUser(user) { 
    return { ...user, roles: user.roles.map(r => r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()) }; 
}

function isToday(date) { 
    const today = new Date(); 
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear(); 
}
