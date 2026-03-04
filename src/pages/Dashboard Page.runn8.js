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
            fetchAvailability(currentDept);
            
            // NEW: If switching to Activities, also load the specific USD pricing list
            if (currentDept === "Activities") {
                const priceData = await wixData.query("LodgeSettings").eq("title", "ActivitiesPrices").find();
                if (priceData.items.length > 0) {
                    dashboard.postMessage({ 
                        type: "loadActivityPrices", 
                        text: priceData.items[0].unavailableText 
                    });
                }
            }
        }

        // AI KNOWLEDGE UPDATE: General Availability
        if (d.type === "saveAvailability") {
            const staffName = loggedInStaff ? (loggedInStaff.firstName || loggedInStaff.name || "Staff") : "Staff";
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            const settingsTitle = currentDept === "Kitchen" ? "DailyAvailability" : `${currentDept}Availability`;
            
            await saveLodgeSettings(settingsTitle, d.text, staffName);
            
            dashboard.postMessage({ 
                type: "saveConfirmed", 
                text: d.text,
                updatedBy: staffName,
                updatedAt: timeStr
            });

            dashboard.postMessage({ 
                type: "alert", 
                msg: `AI ${currentDept} Knowledge Updated Successfully` 
            });
            
            fetchAvailability(currentDept); 
        }

        // NEW: AI PRICE UPDATE (Specifically for Activities in USD)
        if (d.type === "saveActivityPrices") {
            const staffName = loggedInStaff ? (loggedInStaff.name || "Staff") : "Staff";
            await saveLodgeSettings("ActivitiesPrices", d.text, staffName);
            
            dashboard.postMessage({ 
                type: "alert", 
                msg: "AI Activity Prices Updated (USD $)" 
            });
        }

        // ORDER FULFILLMENT: Set order to 'Ready'
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
        
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(() => loadOrders(currentDept), 10000);
        
        fetchAvailability(currentDept);
    }
}

async function loadOrders(department) {
    if (!department) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
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
    } catch (err) {
        console.error("Failed to load orders", err);
    }
}

async function fetchAvailability(department) {
    const settingsTitle = department === "Kitchen" ? "DailyAvailability" : `${department}Availability`;
    
    const results = await wixData.query("LodgeSettings").eq("title", settingsTitle).find();
    if (results.items.length > 0) {
        const item = results.items[0];
        
        if (item._updatedDate && !isToday(new Date(item._updatedDate)) && department === "Kitchen") {
            await saveLodgeSettings(settingsTitle, "", "System Reset");
            dashboard.postMessage({ type: "loadAvailability", text: "", updatedBy: "System", updatedAt: "Midnight" });
        } else {
            const timeStr = new Date(item._updatedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            dashboard.postMessage({ 
                type: "loadAvailability", 
                text: item.unavailableText || "", 
                updatedBy: item.lastUpdatedBy || "Staff", 
                updatedAt: timeStr 
            });
        }
    } else {
        dashboard.postMessage({ type: "loadAvailability", text: "", updatedBy: "None", updatedAt: "N/A" });
    }
}

async function saveLodgeSettings(title, text, staffName) {
    try {
        const results = await wixData.query("LodgeSettings").eq("title", title).find();
        const toSave = { title, unavailableText: text, lastUpdatedBy: staffName };
        if (results.items.length > 0) toSave._id = results.items[0]._id;
        return await wixData.save("LodgeSettings", toSave);
    } catch (err) {
        console.error("Failed to save lodge settings", err);
    }
}

function formatUser(user) { 
    return { ...user, roles: user.roles.map(r => r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()) }; 
}

function isToday(date) { 
    const today = new Date(); 
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear(); 
}
