const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

// -------------------- VERSIYA MA'LUMOTLARI --------------------
const BOT_VERSION = "2.1.0";
const NEW_BOT_LINK = "https://t.me/Isuzu_doctor_bot";
const INSTAGRAM_LINK = "https://www.instagram.com/isuzu.samarkand";
const TELEGRAM_GROUP_LINK = "https://t.me/+piY0W4XrGqFkN2Iy";

// -------------------- VAQT ZONASI FUNKSIYALARI (TOSHKENT UTC+5) --------------------
function formatTashkentDateTime(date) {
    const d = new Date(date);
    return d.toLocaleString('uz-UZ', { 
        timeZone: 'Asia/Tashkent',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatTashkentDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('uz-UZ', { 
        timeZone: 'Asia/Tashkent',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatTashkentTime(date) {
    const d = new Date(date);
    return d.toLocaleTimeString('uz-UZ', { 
        timeZone: 'Asia/Tashkent',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function getCurrentTashkentTime() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tashkent' }));
}

// -------------------- OYLIK DAROMAD TAHLILI FUNKSIYALARI --------------------
function getMonthlyIncome(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const monthlyDiagnostics = diagnostics.filter(d => {
        const diagDate = new Date(d.date);
        return diagDate >= startDate && diagDate <= endDate && !d.isFree;
    });
    
    const totalIncome = monthlyDiagnostics.reduce((sum, d) => sum + d.price, 0);
    const diagnosticCount = monthlyDiagnostics.length;
    const averageCheck = diagnosticCount > 0 ? totalIncome / diagnosticCount : 0;
    
    return {
        year: year,
        month: month,
        totalIncome: totalIncome,
        diagnosticCount: diagnosticCount,
        averageCheck: averageCheck,
        diagnostics: monthlyDiagnostics
    };
}

function getAllMonthsIncome() {
    const monthsData = [];
    const currentDate = getCurrentTashkentTime();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    for (let i = 0; i < 12; i++) {
        let year = currentYear;
        let month = currentMonth - i;
        if (month <= 0) {
            month += 12;
            year--;
        }
        if (year >= 2024) {
            const monthData = getMonthlyIncome(year, month);
            monthsData.push(monthData);
        }
    }
    return monthsData;
}

function formatMonthName(year, month) {
    const monthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
    return `${monthNames[month - 1]} ${year}`;
}

function getYearlyIncome(year) {
    let totalYearlyIncome = 0;
    let totalDiagnostics = 0;
    
    for (let month = 1; month <= 12; month++) {
        const monthData = getMonthlyIncome(year, month);
        totalYearlyIncome += monthData.totalIncome;
        totalDiagnostics += monthData.diagnosticCount;
    }
    
    return {
        year: year,
        totalIncome: totalYearlyIncome,
        totalDiagnostics: totalDiagnostics,
        averageMonthlyIncome: totalYearlyIncome / 12
    };
}

function getAvailableYears() {
    const years = new Set();
    diagnostics.forEach(d => {
        if (!d.isFree) {
            const year = new Date(d.date).getFullYear();
            years.add(year);
        }
    });
    return Array.from(years).sort((a, b) => b - a);
}

// -------------------- VERSIYA BOSHQARISH FUNKSIYALARI --------------------
let versionHistory = [];

function loadVersionHistory() {
    try {
        const historyFile = path.join(VOLUME_PATH, 'version_history.json');
        if (fs.existsSync(historyFile)) {
            versionHistory = JSON.parse(fs.readFileSync(historyFile, "utf8"));
        } else {
            versionHistory = [];
            saveVersionHistory();
        }
        console.log("✅ Versiya tarixi yuklandi: " + versionHistory.length + " ta yozuv");
    } catch (err) {
        console.error("Versiya tarixini yuklashda xatolik:", err);
        versionHistory = [];
    }
}

function saveVersionHistory() {
    const historyFile = path.join(VOLUME_PATH, 'version_history.json');
    fs.writeFileSync(historyFile, JSON.stringify(versionHistory, null, 2));
}

function addVersionRecord(version, changes, adminId) {
    const record = {
        id: Date.now(),
        version: version,
        changes: changes,
        adminId: adminId,
        date: new Date().toISOString()
    };
    versionHistory.unshift(record);
    if (versionHistory.length > 50) {
        versionHistory = versionHistory.slice(0, 50);
    }
    saveVersionHistory();
    addSecurityLog("VERSION_UPDATE", adminId, `Yangi versiya: ${version}`);
    return record;
}

function getVersionInfo() {
    return {
        currentVersion: BOT_VERSION,
        newBotLink: NEW_BOT_LINK,
        lastVersion: versionHistory.length > 0 ? versionHistory[0].version : BOT_VERSION,
        totalUpdates: versionHistory.length
    };
}

// -------------------- TO'LOV MA'LUMOTLARI --------------------
const CARD_NUMBER = "9860040115220143";
const CARD_OWNER = "Erkinjon Shukurov";
const BANK_NAME = "Xalq Bank";

function getCardInfoMessage() {
    return `
🏦 *KARTA MA'LUMOTLARI*

💳 *Karta raqami:* \`${CARD_NUMBER}\`
👤 *Karta egasi:* ${CARD_OWNER}
🏛 *Bank:* ${BANK_NAME}

📌 *To'lov qilish uchun:*
1. Karta raqamini nusxalang
2. O'z bankingiz ilovasida to'lov qiling
3. To'lov chekini saqlang

✅ To'lov amalga oshirilgandan so'ng, administrator bilan bog'lanishingiz mumkin.
    `;
}

function getUserPaymentKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🏦 Karta raqamini ko'rish", callback_data: "show_card_number" }],
                [{ text: "🔙 Ortga", callback_data: "back_to_main" }]
            ]
        }
    };
}

// -------------------- XAVFSIZLIK VA ADMIN --------------------
const BOT_TOKEN = process.env.BOT_TOKEN || '8779251766:AAH12INusgBCawsk5awqIjcyHnNLiq5A33A';

const ADMIN_PHONE = "+998979247888";
const ADMIN_IDS = [1437230485];
const SUPER_ADMIN_ID = 1437230485;

let adminSettings = {
    allowedEditors: [],
    lastChanges: [],
    securityLog: []
};

const DIAGNOSTIC_PRICE = 250000;
const MAX_CARS_PER_USER = 20;

// -------------------- RAILWAY VOLUME YO'LLARI --------------------
const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const BACKUP_DIR = path.join(VOLUME_PATH, 'backups');
const REPORTS_DIR = path.join(VOLUME_PATH, 'reports');
const VIDEOS_DIR = path.join(VOLUME_PATH, 'videos');

const USERS_FILE = path.join(VOLUME_PATH, 'users.json');
const DIAGNOSTICS_FILE = path.join(VOLUME_PATH, 'diagnostics.json');
const ERRORS_FILE = path.join(VOLUME_PATH, 'errors.json');
const VERSION_FILE = path.join(VOLUME_PATH, 'version.json');
const ADMIN_SETTINGS_FILE = path.join(VOLUME_PATH, 'admin_settings.json');
const VIDEOS_FILE = path.join(VOLUME_PATH, 'videos.json');

// -------------------- VIDEO GALEREYA --------------------
let videoList = [];

function ensureVolumeDir() {
    if (!fs.existsSync(VOLUME_PATH)) {
        fs.mkdirSync(VOLUME_PATH, { recursive: true });
        console.log("✅ Volume yaratildi: " + VOLUME_PATH);
    }
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log("✅ Backup papkasi yaratildi: " + BACKUP_DIR);
    }
    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
        console.log("✅ Hisobot papkasi yaratildi: " + REPORTS_DIR);
    }
    if (!fs.existsSync(VIDEOS_DIR)) {
        fs.mkdirSync(VIDEOS_DIR, { recursive: true });
        console.log("✅ Video papkasi yaratildi: " + VIDEOS_DIR);
    }
}

ensureVolumeDir();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.deleteWebHook().catch(e => console.log("Webhook xatolik:", e.message));

// -------------------- VIDEO FUNKSIYALARI --------------------
function loadVideos() {
    try {
        if (fs.existsSync(VIDEOS_FILE)) {
            videoList = JSON.parse(fs.readFileSync(VIDEOS_FILE, "utf8"));
        } else {
            videoList = [];
            saveVideos();
        }
        console.log("✅ Videolar yuklandi: " + videoList.length + " ta video");
    } catch (err) {
        console.error("Videolarni yuklashda xatolik:", err);
        videoList = [];
    }
}

function saveVideos() {
    fs.writeFileSync(VIDEOS_FILE, JSON.stringify(videoList, null, 2));
}

function addVideo(videoFileId, title, description, adminId) {
    const newVideo = {
        id: Date.now(),
        fileId: videoFileId,
        title: title,
        description: description || "",
        views: 0,
        likes: 0,
        likedBy: [],
        uploadedBy: adminId,
        uploadDate: new Date().toISOString(),
        isActive: true
    };
    videoList.unshift(newVideo);
    saveVideos();
    addSecurityLog("VIDEO_UPLOADED", adminId, "Video yuklandi: " + title);
    return newVideo;
}

function updateVideoViews(videoId) {
    const video = videoList.find(v => v.id === videoId);
    if (video) {
        video.views = (video.views || 0) + 1;
        saveVideos();
    }
}

function updateVideoLikes(videoId, userId) {
    const video = videoList.find(v => v.id === videoId);
    if (video) {
        if (!video.likedBy) video.likedBy = [];
        if (!video.likedBy.includes(userId)) {
            video.likedBy.push(userId);
            video.likes = (video.likes || 0) + 1;
            saveVideos();
            return true;
        }
    }
    return false;
}

function getActiveVideos() {
    return videoList.filter(v => v.isActive);
}

// -------------------- FOYDALANUVCHILARGA XABAR YUBORISH FUNKSIYASI --------------------
async function sendNotificationToAllUsers(message, keyboard = null) {
    const activeUsers = users.filter(u => !u.isAdmin && !u.isBlocked);
    let successCount = 0;
    let failCount = 0;
    
    for (const user of activeUsers) {
        try {
            await bot.sendMessage(user.userId, message, {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
            failCount++;
            console.error(`Xabar yuborilmadi (${user.userId}):`, error.message);
        }
    }
    
    return { success: successCount, fail: failCount };
}

// -------------------- ESLATMA MATNI --------------------
const REMINDER_MESSAGE = `
🚗 **Hurmatli mijoz!**

Agar avtomobilingiz doimo soz, ishonchli va yo'llarda sizni yarim yo'lda qoldirmasligini istasangiz — unda unga faqat professional va malakali mutaxassislar xizmat ko'rsatishi muhim.

🛠️ **Sifatli xizmat** — bu nafaqat qulaylik, balki sizning xavfsizligingiz kafolatidir.

✅ Shuning uchun avtomobilingizni haqiqiy professionallarga ishonib topshiring!
`;

// -------------------- QURILMA TURINI ANIQLASH --------------------
let userDevices = new Map();

function getDeviceType(userAgent) {
    if (!userAgent) return "web";
    const ua = userAgent.toLowerCase();
    if (ua.includes("android")) return "android";
    if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "ios";
    return "web";
}

function getUserDevice(userId) {
    return userDevices.get(userId) || "web";
}

function setUserDevice(userId, deviceType) {
    userDevices.set(userId, deviceType);
}

// -------------------- HISOBOT YARATISH --------------------
async function generateDiagnosticsReport(diagnosticsList) {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
        const filename = "diagnostics_report_" + timestamp + ".txt";
        const filepath = path.join(REPORTS_DIR, filename);
        
        let content = "";
        content += "=".repeat(80) + "\n";
        content += "                    DIAGNOSTIKA HISOBOTI\n";
        content += "=".repeat(80) + "\n\n";
        content += "Yaratilgan sana: " + formatTashkentDateTime(new Date()) + "\n";
        content += "Jami diagnostikalar: " + diagnosticsList.length + " ta\n\n";
        
        const paidCount = diagnosticsList.filter(d => !d.isFree).length;
        const freeCount = diagnosticsList.filter(d => d.isFree).length;
        const totalIncome = diagnosticsList.filter(d => !d.isFree).reduce((sum, d) => sum + d.price, 0);
        
        content += "-------------------------- STATISTIKA --------------------------\n";
        content += "To'lovli diagnostikalar: " + paidCount + " ta\n";
        content += "Bepul diagnostikalar: " + freeCount + " ta\n";
        content += "Umumiy daromad: " + totalIncome.toLocaleString() + " som\n\n";
        
        content += "----------------------- DIAGNOSTIKALAR RO'YXATI -----------------------\n";
        content += "=".repeat(80) + "\n\n";
        
        let i = 1;
        for (const diag of diagnosticsList.slice(0, 200)) {
            content += "📅 " + i + "-DIAGNOSTIKA\n";
            content += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
            content += "📆 Sana: " + formatTashkentDateTime(diag.date) + "\n";
            content += "🚗 Avtomobil raqami: " + diag.carNumber + "\n";
            content += "📝 Bajarilgan ishlar:\n" + diag.workDescription + "\n";
            
            if (diag.additionalNotes && diag.additionalNotes !== "") {
                content += "\n➕ Qo'shimcha eslatmalar:\n" + diag.additionalNotes + "\n";
            }
            
            content += "\n💰 Narx: " + (diag.isFree ? "BEPUL" : diag.price.toLocaleString() + " so'm") + "\n";
            content += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
            i++;
        }
        
        content += "\nJami: " + diagnosticsList.length + " ta diagnostika\n";
        content += "Hisobot yaratildi: " + formatTashkentDateTime(new Date()) + "\n";
        content += "=".repeat(80) + "\n";
        
        try {
            fs.writeFileSync(filepath, content, "utf8");
            resolve(filepath);
        } catch (err) {
            reject(err);
        }
    });
}

// -------------------- XAVFSIZLIK FUNKSIYALARI --------------------
function loadAdminSettings() {
    try {
        if (fs.existsSync(ADMIN_SETTINGS_FILE)) {
            adminSettings = JSON.parse(fs.readFileSync(ADMIN_SETTINGS_FILE, "utf8"));
        } else {
            saveAdminSettings();
        }
    } catch (err) {
        console.error("Admin sozlamalarini yuklashda xatolik:", err);
        adminSettings = { allowedEditors: [], lastChanges: [], securityLog: [] };
    }
}

function saveAdminSettings() {
    fs.writeFileSync(ADMIN_SETTINGS_FILE, JSON.stringify(adminSettings, null, 2));
}

function isSuperAdmin(userId) {
    return userId === SUPER_ADMIN_ID;
}

function canEditCode(userId) {
    return isSuperAdmin(userId) || adminSettings.allowedEditors.includes(userId);
}

function addSecurityLog(action, userId, details) {
    const log = {
        id: Date.now(),
        action: action,
        userId: userId,
        details: details,
        date: new Date().toISOString()
    };
    adminSettings.securityLog.unshift(log);
    if (adminSettings.securityLog.length > 100) {
        adminSettings.securityLog = adminSettings.securityLog.slice(0, 100);
    }
    saveAdminSettings();
}

function grantEditPermission(adminId, targetUserId) {
    if (!isSuperAdmin(adminId)) {
        return { success: false, message: "Faqat Super Admin ruxsat bera oladi!" };
    }
    
    if (adminSettings.allowedEditors.includes(targetUserId)) {
        return { success: false, message: "Bu admin allaqachon ruxsatga ega!" };
    }
    
    adminSettings.allowedEditors.push(targetUserId);
    saveAdminSettings();
    addSecurityLog("GRANT_EDIT_PERMISSION", adminId, "Admin " + targetUserId + " ga ruxsat berildi");
    
    return { success: true, message: "Ruxsat muvaffaqiyatli berildi!" };
}

function revokeEditPermission(adminId, targetUserId) {
    if (!isSuperAdmin(adminId)) {
        return { success: false, message: "Faqat Super Admin ruxsatni olib qo'yishi mumkin!" };
    }
    
    const index = adminSettings.allowedEditors.indexOf(targetUserId);
    if (index === -1) {
        return { success: false, message: "Bu admin ruxsatga ega emas!" };
    }
    
    adminSettings.allowedEditors.splice(index, 1);
    saveAdminSettings();
    addSecurityLog("REVOKE_EDIT_PERMISSION", adminId, "Admin " + targetUserId + " dan ruxsat olindi");
    
    return { success: true, message: "Ruxsat muvaffaqiyatli olib qo'yildi!" };
}

// -------------------- VERSIYA BOSHQARISH --------------------
let currentVersion = BOT_VERSION;
let isUpdateMode = false;

function loadVersion() {
    try {
        if (fs.existsSync(VERSION_FILE)) {
            const versionData = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));
            currentVersion = versionData.version;
            isUpdateMode = versionData.updateMode || false;
            console.log("📌 Joriy versiya: " + currentVersion + ", Yangilanish rejimi: " + isUpdateMode);
        } else {
            saveVersion();
        }
    } catch (err) {
        console.error("Versiya yuklashda xatolik:", err);
        saveVersion();
    }
}

function saveVersion() {
    const versionData = {
        version: currentVersion,
        updateMode: isUpdateMode,
        lastUpdate: new Date().toISOString(),
        newBotLink: NEW_BOT_LINK
    };
    fs.writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2));
}

function updateBotVersion(newVersion, changes, adminId) {
    currentVersion = newVersion;
    saveVersion();
    addVersionRecord(newVersion, changes, adminId);
    console.log(`✅ Bot versiyasi yangilandi: ${newVersion}`);
    return true;
}

// -------------------- ESLATMA YUBORISH FUNKSIYASI --------------------
async function sendReminder(chatId) {
    try {
        await bot.sendMessage(chatId, REMINDER_MESSAGE, { parse_mode: "Markdown" });
    } catch (error) {
        console.error("Eslatma yuborishda xatolik:", error);
    }
}

// -------------------- BACKUP FUNKSIYALARI --------------------
function createBackup() {
    ensureVolumeDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    
    if (fs.existsSync(USERS_FILE)) {
        fs.copyFileSync(USERS_FILE, path.join(BACKUP_DIR, "users_backup_" + timestamp + ".json"));
    }
    if (fs.existsSync(DIAGNOSTICS_FILE)) {
        fs.copyFileSync(DIAGNOSTICS_FILE, path.join(BACKUP_DIR, "diagnostics_backup_" + timestamp + ".json"));
    }
    if (fs.existsSync(ERRORS_FILE)) {
        fs.copyFileSync(ERRORS_FILE, path.join(BACKUP_DIR, "errors_backup_" + timestamp + ".json"));
    }
    if (fs.existsSync(VIDEOS_FILE)) {
        fs.copyFileSync(VIDEOS_FILE, path.join(BACKUP_DIR, "videos_backup_" + timestamp + ".json"));
    }
    
    const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".json"));
    while (backups.length > 30) {
        const oldest = backups.sort()[0];
        fs.unlinkSync(path.join(BACKUP_DIR, oldest));
        backups.shift();
    }
    console.log("✅ Backup yaratildi: " + timestamp);
    return true;
}

function listBackups() {
    ensureVolumeDir();
    const backups = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith("users_backup_") && f.endsWith(".json"))
        .map(f => ({
            name: f,
            date: fs.statSync(path.join(BACKUP_DIR, f)).mtime
        }))
        .sort((a, b) => b.date - a.date);
    return backups;
}

function restoreBackup(backupName) {
    const backupPath = path.join(BACKUP_DIR, backupName);
    if (!fs.existsSync(backupPath)) return false;
    
    const backupData = JSON.parse(fs.readFileSync(backupPath, "utf8"));
    fs.writeFileSync(USERS_FILE, JSON.stringify(backupData, null, 2));
    
    const diagBackupName = backupName.replace("users_backup_", "diagnostics_backup_");
    const diagBackupPath = path.join(BACKUP_DIR, diagBackupName);
    if (fs.existsSync(diagBackupPath)) {
        const diagData = JSON.parse(fs.readFileSync(diagBackupPath, "utf8"));
        fs.writeFileSync(DIAGNOSTICS_FILE, JSON.stringify(diagData, null, 2));
    }
    
    const videoBackupName = backupName.replace("users_backup_", "videos_backup_");
    const videoBackupPath = path.join(BACKUP_DIR, videoBackupName);
    if (fs.existsSync(videoBackupPath)) {
        const videoData = JSON.parse(fs.readFileSync(videoBackupPath, "utf8"));
        fs.writeFileSync(VIDEOS_FILE, JSON.stringify(videoData, null, 2));
        videoList = videoData;
    }
    
    console.log("✅ Database tiklandi: " + backupName);
    return true;
}

// -------------------- DATABASE FUNKSIYALARI --------------------
let users = [];
let diagnostics = [];
let errors = [];

function loadData() {
    try {
        ensureVolumeDir();
        
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
            users.forEach(u => {
                if (u.isBlocked === undefined) u.isBlocked = false;
                if (!u.cars) u.cars = [];
                if (u.totalDiagnosticsAll === undefined) u.totalDiagnosticsAll = 0;
                if (u.totalBonusCount === undefined) u.totalBonusCount = 0;
                if (u.totalFreeDiagnostics === undefined) u.totalFreeDiagnostics = 0;
            });
            saveUsers();
        } else {
            users = [];
            saveUsers();
        }
        
        if (fs.existsSync(DIAGNOSTICS_FILE)) {
            diagnostics = JSON.parse(fs.readFileSync(DIAGNOSTICS_FILE, "utf8"));
        } else {
            diagnostics = [];
            saveDiagnostics();
        }
        
        if (fs.existsSync(ERRORS_FILE)) {
            errors = JSON.parse(fs.readFileSync(ERRORS_FILE, "utf8"));
        } else {
            errors = [];
            saveErrors();
        }
        
        console.log("✅ Yuklandi: " + users.length + " foydalanuvchi, " + diagnostics.length + " diagnostika");
        console.log("✅ Volume manzili: " + VOLUME_PATH);
    } catch (err) {
        console.error("Ma'lumot yuklashda xatolik:", err);
        users = [];
        diagnostics = [];
        errors = [];
    }
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function saveDiagnostics() {
    fs.writeFileSync(DIAGNOSTICS_FILE, JSON.stringify(diagnostics, null, 2));
}

function saveErrors() {
    fs.writeFileSync(ERRORS_FILE, JSON.stringify(errors, null, 2));
}

function getUserByPhone(phone) {
    return users.find(u => u.phone === phone);
}

function getUserByUserId(userId) {
    return users.find(u => u.userId === userId);
}

function isAdmin(userId) {
    if (ADMIN_IDS.includes(userId)) return true;
    const user = getUserByUserId(userId);
    return user ? user.isAdmin === true : false;
}

function blockUser(userId) {
    const user = getUserByUserId(userId);
    if (!user) return { success: false, message: "Foydalanuvchi topilmadi" };
    if (user.isAdmin) return { success: false, message: "Adminni bloklab bo'lmaydi!" };
    
    user.isBlocked = true;
    saveUsers();
    return { success: true, message: "✅ Foydalanuvchi bloklandi: " + (user.fullName || user.phone) };
}

function unblockUser(userId) {
    const user = getUserByUserId(userId);
    if (!user) return { success: false, message: "Foydalanuvchi topilmadi" };
    
    user.isBlocked = false;
    saveUsers();
    return { success: true, message: "✅ Foydalanuvchi blokdan ochildi: " + (user.fullName || user.phone) };
}

function deleteUser(userId) {
    const userIndex = users.findIndex(u => u.userId === userId);
    if (userIndex === -1) return { success: false, message: "Foydalanuvchi topilmadi" };
    
    const user = users[userIndex];
    if (user.isAdmin) return { success: false, message: "Adminni o'chirib bo'lmaydi!" };
    
    const userDiagnostics = diagnostics.filter(d => d.userId === userId);
    diagnostics = diagnostics.filter(d => d.userId !== userId);
    saveDiagnostics();
    
    users.splice(userIndex, 1);
    saveUsers();
    
    return { 
        success: true, 
        message: "🗑️ Foydalanuvchi o'chirildi: " + (user.fullName || user.phone),
        deletedDiagnostics: userDiagnostics.length
    };
}

function getBlockedUsers() {
    return users.filter(u => !u.isAdmin && u.isBlocked === true);
}

function getActiveUsers() {
    return users.filter(u => !u.isAdmin && u.isBlocked !== true);
}

function addNewUser(userId, phoneNumber, carNumber, firstName, lastName, username) {
    const now = getCurrentTashkentTime();
    const newUser = {
        userId: userId,
        phone: phoneNumber,
        firstName: firstName || "",
        lastName: lastName || "",
        username: username || "",
        fullName: (firstName || "") + " " + (lastName || ""),
        isAdmin: false,
        isActive: true,
        isBlocked: false,
        registeredDate: now.toISOString(),
        cars: [{
            carId: Date.now(),
            carNumber: carNumber,
            bonusCount: 0,
            freeDiagnostics: 0,
            totalDiagnostics: 0,
            addedDate: now.toISOString(),
            isActive: true
        }],
        totalBonusCount: 0,
        totalFreeDiagnostics: 0,
        totalDiagnosticsAll: 0
    };
    users.push(newUser);
    saveUsers();
    return newUser;
}

function addCarToUser(phoneNumber, carNumber, userInfo = {}) {
    const user = getUserByPhone(phoneNumber);
    if (!user) return { success: false, message: "Foydalanuvchi topilmadi" };
    
    if (user.cars.length >= MAX_CARS_PER_USER) {
        return { success: false, message: "Siz maksimum " + MAX_CARS_PER_USER + " ta avtomobil qo'sha olasiz!" };
    }
    
    const existingCar = user.cars.find(c => c.carNumber === carNumber);
    if (existingCar) {
        return { success: false, message: "Bu avtomobil raqami allaqachon qo'shilgan!" };
    }
    
    if (userInfo.firstName && !user.firstName) {
        user.firstName = userInfo.firstName;
        user.lastName = userInfo.lastName || "";
        user.username = userInfo.username || "";
        user.fullName = (userInfo.firstName || "") + " " + (userInfo.lastName || "");
        saveUsers();
    }
    
    user.cars.push({
        carId: Date.now(),
        carNumber: carNumber,
        bonusCount: 0,
        freeDiagnostics: 0,
        totalDiagnostics: 0,
        addedDate: getCurrentTashkentTime().toISOString(),
        isActive: true
    });
    
    saveUsers();
    return { success: true, message: "Yangi avtomobil qo'shildi!", carsCount: user.cars.length };
}

function addDiagnosticToCar(phoneNumber, carNumber, workDescription, additionalNotes) {
    const user = getUserByPhone(phoneNumber);
    if (!user) return { success: false, message: "Foydalanuvchi topilmadi" };
    
    const car = user.cars.find(c => c.carNumber === carNumber);
    if (!car) return { success: false, message: "Avtomobil topilmadi" };
    
    let isFree = false;
    let bonusMessage = "";
    let newBonusCount = car.bonusCount;
    let newFreeDiagnostics = car.freeDiagnostics;
    
    if (car.freeDiagnostics > 0) {
        isFree = true;
        newFreeDiagnostics--;
        bonusMessage = "🎉 BEPUL diagnostikadan foydalandingiz!";
    } else {
        newBonusCount++;
        if (newBonusCount >= 5) {
            const bonusCount = Math.floor(newBonusCount / 5);
            newFreeDiagnostics += bonusCount;
            newBonusCount = newBonusCount % 5;
            bonusMessage = "🎉🎉🎉 TABRIKLAYMIZ! 5-diagnostikani tugatdingiz va 1 ta BEPUL diagnostika qozondingiz!";
        }
    }
    
    const now = getCurrentTashkentTime();
    const diagnostic = {
        id: Date.now(),
        userId: user.userId,
        phoneNumber: phoneNumber,
        carNumber: carNumber,
        date: now.toISOString(),
        workDescription: workDescription,
        additionalNotes: additionalNotes || "",
        price: isFree ? 0 : DIAGNOSTIC_PRICE,
        isFree: isFree
    };
    diagnostics.push(diagnostic);
    saveDiagnostics();
    
    car.bonusCount = newBonusCount;
    car.freeDiagnostics = newFreeDiagnostics;
    car.totalDiagnostics = (car.totalDiagnostics || 0) + 1;
    
    user.totalDiagnosticsAll = (user.totalDiagnosticsAll || 0) + 1;
    if (isFree) {
        user.totalFreeDiagnostics = (user.totalFreeDiagnostics || 0) + 1;
    } else {
        user.totalBonusCount = (user.totalBonusCount || 0) + 1;
    }
    
    saveUsers();
    
    return {
        success: true,
        isFree: isFree,
        price: isFree ? 0 : DIAGNOSTIC_PRICE,
        newBonusCount: newBonusCount,
        newFreeDiagnostics: newFreeDiagnostics,
        bonusMessage: bonusMessage,
        carNumber: carNumber
    };
}

function getUserDiagnostics(phoneNumber, limit = 10) {
    return diagnostics.filter(d => d.phoneNumber === phoneNumber).slice(-limit).reverse();
}

function getNearBonusCars() {
    const nearBonus = [];
    for (const user of users) {
        if (user.isAdmin) continue;
        for (const car of user.cars) {
            if (car.bonusCount >= 3 && car.bonusCount < 5) {
                nearBonus.push({
                    phone: user.phone,
                    carNumber: car.carNumber,
                    bonusCount: car.bonusCount,
                    remaining: 5 - car.bonusCount,
                    fullName: user.fullName || "Ism kiritilmagan"
                });
            }
        }
    }
    return nearBonus;
}

function getTodayDiagnostics() {
    const today = getCurrentTashkentTime().toISOString().split("T")[0];
    return diagnostics.filter(d => {
        const diagDate = new Date(d.date);
        const diagDateStr = diagDate.toISOString().split("T")[0];
        return diagDateStr === today;
    });
}

function getAllDiagnostics(limit = 500) {
    return diagnostics.slice(-limit).reverse();
}

function getStatistics() {
    const regularUsers = users.filter(u => !u.isAdmin);
    const blockedUsers = users.filter(u => !u.isAdmin && u.isBlocked === true);
    const activeUsers = regularUsers.filter(u => u.isBlocked !== true);
    
    let totalCars = 0;
    for (const user of activeUsers) {
        totalCars += user.cars.length;
    }
    
    const paidDiagnostics = diagnostics.filter(d => !d.isFree);
    const totalIncome = paidDiagnostics.reduce((sum, d) => sum + d.price, 0);
    
    return {
        totalUsers: activeUsers.length,
        blockedUsers: blockedUsers.length,
        totalCars: totalCars,
        totalDiagnostics: diagnostics.length,
        paidDiagnostics: paidDiagnostics.length,
        freeDiagnostics: diagnostics.filter(d => d.isFree).length,
        totalIncome: totalIncome,
        totalErrors: errors.length,
        currentVersion: currentVersion,
        isUpdateMode: isUpdateMode,
        totalVideos: videoList.length,
        totalVideoViews: videoList.reduce((sum, v) => sum + (v.views || 0), 0),
        versionHistoryCount: versionHistory.length
    };
}

function getErrors() {
    return errors.slice(-50).reverse();
}

function getAllUsersWithDetails() {
    return users.filter(u => !u.isAdmin).map(u => ({
        userId: u.userId,
        fullName: u.fullName || "Ism kiritilmagan",
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        username: u.username || "",
        phone: u.phone,
        cars: u.cars,
        totalDiagnostics: u.totalDiagnosticsAll || 0,
        registeredDate: u.registeredDate,
        isBlocked: u.isBlocked || false
    }));
}

// ======================== VIDEO GALEREYA FUNKSIYALARI ========================
async function showVideoGallery(chatId, page = 0) {
    const activeVideos = getActiveVideos();
    const itemsPerPage = 5;
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageVideos = activeVideos.slice(start, end);
    
    if (activeVideos.length === 0) {
        await bot.sendMessage(chatId, "📹 *VIDEO GALEREYA*\n\nHozircha videolar mavjud emas.\nTez orada yangi videolar qo'shiladi!", {
            parse_mode: "Markdown"
        });
        return;
    }
    
    let msg = "📹 *VIDEO GALEREYA*\n━━━━━━━━━━━━━━━━━━\n\n";
    msg += "📊 Jami videolar: " + activeVideos.length + " ta\n";
    msg += "👁️ Umumiy ko'rishlar: " + activeVideos.reduce((sum, v) => sum + (v.views || 0), 0) + " ta\n";
    msg += "━━━━━━━━━━━━━━━━━━\n\n";
    
    const keyboard = [];
    
    for (let i = 0; i < pageVideos.length; i++) {
        const video = pageVideos[i];
        const num = start + i + 1;
        msg += num + ". *" + video.title + "*\n";
        msg += "   👁️ " + (video.views || 0) + " | 👍 " + (video.likes || 0) + "\n";
        if (video.description) {
            msg += "   📝 " + video.description.substring(0, 50) + (video.description.length > 50 ? "..." : "") + "\n";
        }
        msg += "   📅 " + formatTashkentDate(video.uploadDate) + "\n";
        msg += "━━━━━━━━━━━━━━━━━━\n";
        keyboard.push([{ text: "▶️ " + num + ". " + video.title.substring(0, 25), callback_data: "watch_video_" + video.id }]);
    }
    
    const navButtons = [];
    if (page > 0) navButtons.push({ text: "◀️", callback_data: "video_page_" + (page - 1) });
    if (end < activeVideos.length) navButtons.push({ text: "▶️", callback_data: "video_page_" + (page + 1) });
    if (navButtons.length > 0) keyboard.push(navButtons);
    
    await bot.sendMessage(chatId, msg, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard }
    });
}

// ======================== INLINE KEYBOARD (FOYDALANUVCHI UCHUN) ========================
function getCompactInlineKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 Profil", callback_data: "user_profile" }, { text: "🚗 Avtomobillar", callback_data: "user_my_cars" }],
                [{ text: "🎁 Bonuslar", callback_data: "user_my_bonus" }, { text: "➕ Avto qo'shish", callback_data: "user_add_car" }],
                [{ text: "📋 Tarix", callback_data: "user_history" }, { text: "📹 Video", callback_data: "user_video_gallery" }],
                [{ text: "💳 To'lov", callback_data: "user_payment" }, { text: "📸 Instagram", callback_data: "user_instagram" }],
                [{ text: "👥 Guruh", callback_data: "user_telegram_group" }, { text: "ℹ️ Ma'lumot", callback_data: "user_info" }],
                [{ text: "📌 Versiya", callback_data: "user_version_info" }]
            ],
            resize_keyboard: true
        }
    };
}

// ADMIN UCHUN REPLY KEYBOARD
function getAdminReplyKeyboard() {
    const keyboard = [
        ["📊 Statistika", "👥 Foydalanuvchilar"],
        ["🔧 Diagnostika qo'shish", "🎁 Bonusga yaqinlar"],
        ["⚠️ Xatoliklar", "📋 Diagnostika tarixi"],
        ["📅 Bugungi", "📄 Hisobot"],
        ["📹 Video galereya", "📤 Video yuklash"],
        ["💾 Backup", "🔄 Tiklash"],
        ["🚫 Foyd. boshqarish", "🔐 Xavfsizlik"],
        ["📌 Versiya", "📢 Xabar yuborish"]
    ];
    
    keyboard.push(["❌ Asosiy menyu"]);
    
    return {
        reply_markup: {
            keyboard: keyboard,
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
}

function getPhoneKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: "📱 Telefon raqamini yuborish", request_contact: true }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
}

function removeKeyboard() {
    return {
        reply_markup: {
            remove_keyboard: true
        }
    };
}

// Asosiy menyuni yuborish
async function sendMainMenu(chatId, isAdminUser = false, deviceType = "web") {
    try {
        if (isAdminUser) {
            await bot.sendMessage(chatId, "👑 *Admin paneli*\n📌 Versiya: `" + currentVersion + "`", {
                parse_mode: "Markdown",
                ...getAdminReplyKeyboard()
            });
        } else {
            await bot.sendMessage(chatId, "🏠 *Asosiy menyu*\n\n📌 Sizning versiyangiz: `" + currentVersion + "`", {
                parse_mode: "Markdown",
                ...getCompactInlineKeyboard()
            });
        }
    } catch (error) {
        console.error("Menu yuborishda xatolik:", error);
    }
}

// -------------------- SESSIONS --------------------
const userSessions = new Map();

function getUserSession(userId) {
    if (!userSessions.has(userId)) {
        userSessions.set(userId, { step: null, data: {} });
    }
    return userSessions.get(userId);
}

function clearUserSession(userId) {
    userSessions.delete(userId);
}

// -------------------- FOYDALANUVCHILARNI BOSHQARISH (SAHIFALASH) --------------------
let userManagePage = 0;
const USERS_PER_PAGE = 10;

// -------------------- /start KOMANDASI --------------------
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name || "";
    const lastName = msg.from.last_name || "";
    const username = msg.from.username || "";
    
    const userAgent = msg.from?.userAgent || "";
    const deviceType = getDeviceType(userAgent);
    setUserDevice(userId, deviceType);
    
    clearUserSession(userId);
    const existingUser = getUserByUserId(userId);
    
    if (existingUser && existingUser.isBlocked) {
        await bot.sendMessage(chatId, "🚫 *Siz botdan bloklangansiz!*\n\nIltimos, administrator bilan bog'laning.\n📞 Aloqa: " + ADMIN_PHONE, { 
            parse_mode: "Markdown",
            ...removeKeyboard()
        });
        return;
    }
    
    try {
        await sendReminder(chatId);
        
        if (existingUser) {
            if (!existingUser.firstName && firstName) {
                existingUser.firstName = firstName;
                existingUser.lastName = lastName;
                existingUser.username = username;
                existingUser.fullName = firstName + " " + lastName;
                saveUsers();
            }
            
            const carsCount = existingUser.cars.length;
            const welcomeText = "👋 *Xush kelibsiz, " + (existingUser.fullName || firstName || "hurmatli mijoz") + "!*\n\n📞 Telefon: " + existingUser.phone + "\n🚗 Avtomobillar: " + carsCount + " ta\n🎁 Bonus: " + (existingUser.totalBonusCount || 0) + "\n🎉 Bepul: " + (existingUser.totalFreeDiagnostics || 0) + " ta\n📊 Diagnostika: " + (existingUser.totalDiagnosticsAll || 0) + " ta\n📌 Bot versiyasi: `" + currentVersion + "`";
            await bot.sendMessage(chatId, welcomeText, { parse_mode: "Markdown" });
            await sendMainMenu(chatId, existingUser.isAdmin, deviceType);
        } else {
            const session = getUserSession(userId);
            session.data.firstName = firstName;
            session.data.lastName = lastName;
            session.data.username = username;
            
            await bot.sendMessage(chatId, "🚗 *ISUZU DOCTOR* tizimiga xush kelibsiz! (Versiya " + currentVersion + ")\n\n📱 Iltimos, telefon raqamingizni yuboring:", {
                parse_mode: "Markdown",
                ...getPhoneKeyboard()
            });
        }
    } catch (error) {
        console.error("/start xatolik:", error);
        await bot.sendMessage(chatId, "❌ *Xatolik yuz berdi!* Iltimos, qaytadan /start bosing.", { parse_mode: "Markdown" });
    }
});

// -------------------- KONTAKT QABUL QILISH --------------------
bot.on("contact", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const contact = msg.contact;
    const firstName = msg.from.first_name || "";
    const lastName = msg.from.last_name || "";
    const username = msg.from.username || "";
    
    if (!contact) return;
    
    let phoneNumber = contact.phone_number;
    if (!phoneNumber.startsWith("+")) {
        phoneNumber = "+" + phoneNumber;
    }
    
    const session = getUserSession(userId);
    session.data.phone = phoneNumber;
    
    if (!session.data.firstName) {
        session.data.firstName = firstName;
        session.data.lastName = lastName;
        session.data.username = username;
    }
    
    if (phoneNumber === ADMIN_PHONE) {
        const newUser = {
            userId: userId,
            phone: phoneNumber,
            firstName: firstName,
            lastName: lastName,
            username: username,
            fullName: firstName + " " + lastName,
            isAdmin: true,
            isActive: true,
            isBlocked: false,
            registeredDate: getCurrentTashkentTime().toISOString(),
            cars: [{
                carId: Date.now(),
                carNumber: "ADMIN",
                bonusCount: 0,
                freeDiagnostics: 0,
                totalDiagnostics: 0,
                addedDate: getCurrentTashkentTime().toISOString(),
                isActive: true
            }],
            totalBonusCount: 0,
            totalFreeDiagnostics: 0,
            totalDiagnosticsAll: 0
        };
        users.push(newUser);
        saveUsers();
        
        try {
            await sendReminder(chatId);
            await bot.sendMessage(chatId, "👑 *Siz ADMIN sifatida tizimga kirdingiz!*\n\n📞 Telefon: " + phoneNumber + "\n📌 Versiya: " + currentVersion, { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, getUserDevice(userId));
        } catch (error) {
            console.error("Admin xabar xatolik:", error);
        }
        clearUserSession(userId);
        return;
    }
    
    const existingUser = getUserByPhone(phoneNumber);
    
    if (existingUser && existingUser.userId !== userId) {
        await bot.sendMessage(chatId, "❌ *Bu telefon raqam allaqachon ro'yxatdan o'tgan!*", { parse_mode: "Markdown" });
        clearUserSession(userId);
        return;
    }
    
    if (existingUser && existingUser.userId === userId) {
        session.step = "add_new_car";
        session.data.isExistingUser = true;
        await bot.sendMessage(chatId, "✅ Telefon raqam tasdiqlandi: " + phoneNumber + "\n\n🚗 *Yangi avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA\n\n⚠️ Siz maksimum " + MAX_CARS_PER_USER + " tagacha avtomobil qo'sha olasiz.", {
            parse_mode: "Markdown",
            ...removeKeyboard()
        });
    } else {
        session.step = "first_car_number";
        session.data.isExistingUser = false;
        await bot.sendMessage(chatId, "✅ Telefon raqam qabul qilindi: " + phoneNumber + "\n\n🚗 *Birinchi avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA", {
            parse_mode: "Markdown",
            ...removeKeyboard()
        });
    }
});

// -------------------- MATNLI BUYRUQLAR --------------------
bot.onText(/\/profile/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = getUserByUserId(userId);
    
    if (!user) {
        await bot.sendMessage(chatId, "❌ Ro'yxatdan o'tmagan! /start bosing.");
        return;
    }
    
    const carsList = user.cars.map(c => "🚗 " + c.carNumber + " (" + c.totalDiagnostics + " ta diagnostika)").join("\n");
    await sendReminder(chatId);
    await bot.sendMessage(chatId, "📊 *MENGING SAHIFAM*\n\n👤 *Ism:* " + (user.fullName || "Kiritilmagan") + "\n📞 *Telefon:* " + user.phone + "\n🚗 *Avtomobillar:* " + user.cars.length + "/" + MAX_CARS_PER_USER + "\n\n" + carsList + "\n\n🎁 *Umumiy bonuslar:* " + (user.totalBonusCount || 0) + "\n🎉 *Bepul diagnostika:* " + (user.totalFreeDiagnostics || 0) + " ta\n📊 *Jami diagnostika:* " + (user.totalDiagnosticsAll || 0) + " ta\n📌 *Versiya:* `" + currentVersion + "`", { parse_mode: "Markdown" });
});

bot.onText(/\/my_cars/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = getUserByUserId(userId);
    
    if (!user) {
        await bot.sendMessage(chatId, "❌ Ro'yxatdan o'tmagan! /start bosing.");
        return;
    }
    
    if (user.cars.length === 0) {
        await bot.sendMessage(chatId, "📭 Sizda hali avtomobillar mavjud emas!\n\n➕ '➕ Yangi avtomobil qo'shish' tugmasini bosing.");
        return;
    }
    
    let carsText = "🚗 *MENGING AVTOMOBILLARIM*\n\n📌 *Bonus qoidasi:* 5 diagnostika = 1 BEPUL\n━━━━━━━━━━━━━━━━━━\n\n";
    for (const car of user.cars) {
        const nextFree = 5 - car.bonusCount;
        carsText += "🚗 *" + car.carNumber + "*\n";
        carsText += "🎁 Bonus: " + car.bonusCount + "/5\n";
        carsText += "🎉 Bepul: " + car.freeDiagnostics + " ta\n";
        carsText += "📊 Diagnostika: " + car.totalDiagnostics + " ta\n";
        carsText += "📅 Qo'shilgan: " + formatTashkentDate(car.addedDate) + "\n";
        
        if (car.freeDiagnostics > 0) {
            carsText += "✅ *Bepul diagnostika mavjud!*\n";
        } else if (nextFree > 0) {
            carsText += "📌 Keyingi BEPUL: " + nextFree + " ta diagnostikadan keyin\n";
        }
        
        carsText += "━━━━━━━━━━━━━━━━━━\n";
    }
    await sendReminder(chatId);
    await bot.sendMessage(chatId, carsText, { parse_mode: "Markdown" });
});

bot.onText(/\/my_bonus/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = getUserByUserId(userId);
    
    if (!user) {
        await bot.sendMessage(chatId, "❌ Ro'yxatdan o'tmagan! /start bosing.");
        return;
    }
    
    let bonusText = "🎁 *MENGING BONUSLARIM*\n\n📌 *Qoida:* Har 5 diagnostikada 1 ta BEPUL!\n━━━━━━━━━━━━━━━━━━\n\n";
    for (const car of user.cars) {
        const nextFree = 5 - car.bonusCount;
        bonusText += "🚗 *" + car.carNumber + "*\n";
        bonusText += "📊 To'plangan: " + car.bonusCount + "/5\n";
        bonusText += "🎉 Bepul diagnostika: " + car.freeDiagnostics + " ta\n";
        
        if (car.freeDiagnostics > 0) {
            bonusText += "✅ *Sizda " + car.freeDiagnostics + " ta BEPUL diagnostika bor!*\n";
            bonusText += "💡 Keyingi diagnostikangiz BEPUL bo'ladi!\n";
        } else if (nextFree > 0) {
            bonusText += "📌 *Keyingi BEPUL diagnostika:* " + nextFree + " ta diagnostikadan keyin\n";
            bonusText += "   (" + nextFree + " ta to'lovli diagnostika qilsangiz, 1 ta BEPUL olasiz)\n";
        } else if (nextFree === 0 && car.bonusCount === 5) {
            bonusText += "🎉 *DARHOL BEPUL diagnostika qozondingiz!*\n";
            bonusText += "✅ Keyingi diagnostikangiz BEPUL bo'ladi!\n";
        }
        
        bonusText += "━━━━━━━━━━━━━━━━━━\n";
    }
    bonusText += "\n🎯 *QANDAY ISHLAYDI?*\n";
    bonusText += "• Har 5 ta to'lovli diagnostika = 1 ta BEPUL\n";
    bonusText += "• Har bir avtomobil uchun bonus alohida hisoblanadi\n";
    bonusText += "• Bepul diagnostika cheksiz muddatga amal qiladi\n";
    bonusText += "• Admin diagnostika qo'shganda avtomatik hisoblanadi";
    
    await sendReminder(chatId);
    await bot.sendMessage(chatId, bonusText, { parse_mode: "Markdown" });
});

bot.onText(/\/history/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = getUserByUserId(userId);
    
    if (!user) {
        await bot.sendMessage(chatId, "❌ Ro'yxatdan o'tmagan! /start bosing.");
        return;
    }
    
    const diags = getUserDiagnostics(user.phone, 15);
    if (diags.length === 0) {
        await bot.sendMessage(chatId, "📭 *Sizda hali diagnostikalar mavjud emas!*", { parse_mode: "Markdown" });
        return;
    }
    
    await sendReminder(chatId);
    for (const d of diags) {
        let diagText = "📅 *" + formatTashkentDate(d.date) + "*\n";
        diagText += "🕐 " + formatTashkentTime(d.date) + "\n";
        diagText += "🚗 *" + d.carNumber + "*\n\n";
        diagText += "📝 *Bajarilgan ishlar:*\n" + d.workDescription + "\n\n";
        
        if (d.additionalNotes && d.additionalNotes !== "") {
            diagText += "📌 *Eslatma:*\n" + d.additionalNotes + "\n\n";
        }
        
        diagText += "💰 *Narx:* " + (d.price > 0 ? d.price.toLocaleString() + " so'm" : "🎉 BEPUL") + "\n";
        diagText += "━━━━━━━━━━━━━━━━━━\n";
        
        await bot.sendMessage(chatId, diagText, { parse_mode: "Markdown" });
    }
});

bot.onText(/\/info/, async (msg) => {
    const chatId = msg.chat.id;
    await sendReminder(chatId);
    await bot.sendMessage(chatId, "ℹ️ *ISUZU DOCTOR BOT*\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📱 Bitta telefon bilan " + MAX_CARS_PER_USER + " tagacha avtomobil\n📞 Aloqa: " + ADMIN_PHONE + "\n📌 Bot versiyasi: `" + currentVersion + "`\n🔗 Bot linki: " + NEW_BOT_LINK + "\n📸 Instagram: " + INSTAGRAM_LINK + "\n👥 Telegram guruhimiz: " + TELEGRAM_GROUP_LINK, { parse_mode: "Markdown" });
});

bot.onText(/\/close/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    clearUserSession(userId);
    await sendMainMenu(chatId, isAdmin(userId), getUserDevice(userId));
});

// -------------------- ADMIN MATNLI BUYRUQLAR --------------------
bot.onText(/\/statistika/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAdmin(userId)) return;
    
    const stats = getStatistics();
    await bot.sendMessage(chatId, "📊 *STATISTIKA*\n\n👥 Faol foydalanuvchilar: " + stats.totalUsers + "\n🚫 Bloklanganlar: " + stats.blockedUsers + "\n🚗 Avtomobillar: " + stats.totalCars + "\n🔧 Jami: " + stats.totalDiagnostics + "\n💰 To'lovli: " + stats.paidDiagnostics + "\n🎉 Bepul: " + stats.freeDiagnostics + "\n💵 Daromad: " + stats.totalIncome.toLocaleString() + " so'm\n⚠️ Xatoliklar: " + stats.totalErrors + "\n📹 Videolar: " + stats.totalVideos + " ta\n👁️ Video ko'rishlar: " + stats.totalVideoViews + " ta\n📌 Joriy versiya: `" + stats.currentVersion + "`\n📊 Yangilanishlar soni: " + stats.versionHistoryCount + " ta\n🔄 Yangilanish rejimi: " + (stats.isUpdateMode ? "Faol" : "O'chirilgan"), { parse_mode: "Markdown" });
});

bot.onText(/\/users/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAdmin(userId)) return;
    
    const usersList = getAllUsersWithDetails();
    if (usersList.length === 0) { 
        await bot.sendMessage(chatId, "📭 Hech qanday foydalanuvchi yo'q"); 
        return; 
    }
    
    let msgText = "👥 *FOYDALANUVCHILAR*\n━━━━━━━━━━━━━━━━━━\n\n";
    usersList.slice(0, 15).forEach((u, index) => { 
        const status = u.isBlocked ? "🔴" : "🟢";
        msgText += status + " *" + (index + 1) + ". " + (u.fullName || "Ism kiritilmagan") + "*\n";
        msgText += "📞 " + u.phone + "\n";
        msgText += "🚗 " + u.cars.map(c => c.carNumber).join(", ") + "\n";
        msgText += "📊 " + u.totalDiagnostics + " ta diagnostika\n";
        msgText += "━━━━━━━━━━━━━━━━━━\n";
    });
    await bot.sendMessage(chatId, msgText, { parse_mode: "Markdown" });
});

bot.onText(/\/add_diagnostic/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAdmin(userId)) return;
    
    const session = getUserSession(userId);
    session.step = "admin_add_diagnostic";
    await bot.sendMessage(chatId, "🔧 *Diagnostika qo'shish*\n\n🚗 Avtomobil raqamini kiriting:", { parse_mode: "Markdown", ...removeKeyboard() });
});

// -------------------- XABARLARNI QAYTA ISHLASH --------------------
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const video = msg.video;
    const photo = msg.photo;
    
    const session = getUserSession(userId);
    
    // Admin video yuklash
    if (session.step === "admin_waiting_video") {
        if (!isAdmin(userId)) {
            clearUserSession(userId);
            await sendMainMenu(chatId, false, getUserDevice(userId));
            return;
        }
        
        if (video) {
            session.data.videoFileId = video.file_id;
            session.step = "admin_waiting_video_title";
            await bot.sendMessage(chatId, "✅ *Video qabul qilindi!*\n\n📝 Endi video nomini kiriting:", { parse_mode: "Markdown" });
        } else {
            await bot.sendMessage(chatId, "❌ *Iltimos, video fayl yuboring!*", { parse_mode: "Markdown" });
        }
        return;
    }
    
    if (session.step === "admin_waiting_video_title") {
        if (!isAdmin(userId)) {
            clearUserSession(userId);
            await sendMainMenu(chatId, false, getUserDevice(userId));
            return;
        }
        
        if (!text) {
            await bot.sendMessage(chatId, "❌ *Iltimos, video nomini kiriting!*", { parse_mode: "Markdown" });
            return;
        }
        
        session.data.title = text;
        session.step = "admin_waiting_video_description";
        await bot.sendMessage(chatId, "✅ *Nom qabul qilindi!*\n\n📝 Endi video tavsifini kiriting (ixtiyoriy):", { parse_mode: "Markdown" });
        return;
    }
    
    if (session.step === "admin_waiting_video_description") {
        if (!isAdmin(userId)) {
            clearUserSession(userId);
            await sendMainMenu(chatId, false, getUserDevice(userId));
            return;
        }
        
        session.data.description = text || "";
        addVideo(session.data.videoFileId, session.data.title, session.data.description, userId);
        
        await bot.sendMessage(chatId, "✅ *Video muvaffaqiyatli yuklandi!*\n\n📹 *Nomi:* " + session.data.title, { parse_mode: "Markdown" });
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true, getUserDevice(userId));
        return;
    }
    
    // Admin xabar yuborish
    if (session.step === "admin_send_message") {
        if (!isAdmin(userId)) {
            clearUserSession(userId);
            await sendMainMenu(chatId, false, getUserDevice(userId));
            return;
        }
        
        const messageText = text;
        if (messageText === "/cancel") {
            clearUserSession(userId);
            await bot.sendMessage(chatId, "❌ *Xabar yuborish bekor qilindi.*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, getUserDevice(userId));
            return;
        }
        
        await bot.sendMessage(chatId, "📢 *Xabar yuborilmoqda...*", { parse_mode: "Markdown" });
        
        const keyboard = {
            inline_keyboard: [
                [{ text: "🚀 Yangi botga o'tish", url: NEW_BOT_LINK }],
                [{ text: "🏠 Asosiy menyu", callback_data: "back_to_main" }]
            ]
        };
        
        const result = await sendNotificationToAllUsers(messageText, keyboard);
        
        await bot.sendMessage(chatId, `✅ *Xabar yuborildi!*\n\n✅ Yuborildi: ${result.success} ta foydalanuvchiga\n❌ Yuborilmadi: ${result.fail} ta`, { parse_mode: "Markdown" });
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true, getUserDevice(userId));
        return;
    }
    
    // Admin versiya yangilash
    if (session.step === "admin_update_version") {
        if (!isAdmin(userId)) {
            clearUserSession(userId);
            await sendMainMenu(chatId, false, getUserDevice(userId));
            return;
        }
        
        const newVersion = text.trim();
        if (newVersion === "/cancel") {
            clearUserSession(userId);
            await bot.sendMessage(chatId, "❌ *Versiya yangilash bekor qilindi.*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, getUserDevice(userId));
            return;
        }
        
        session.data.newVersion = newVersion;
        session.step = "admin_version_changes";
        await bot.sendMessage(chatId, "✅ *Yangi versiya:* " + newVersion + "\n\n📝 Endi o'zgarishlar tavsifini kiriting:", { parse_mode: "Markdown" });
        return;
    }
    
    if (session.step === "admin_version_changes") {
        if (!isAdmin(userId)) {
            clearUserSession(userId);
            await sendMainMenu(chatId, false, getUserDevice(userId));
            return;
        }
        
        const changes = text;
        if (changes === "/cancel") {
            clearUserSession(userId);
            await bot.sendMessage(chatId, "❌ *Versiya yangilash bekor qilindi.*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, getUserDevice(userId));
            return;
        }
        
        updateBotVersion(session.data.newVersion, changes, userId);
        
        await bot.sendMessage(chatId, `✅ *Versiya yangilandi!*\n\n📌 Yangi versiya: \`${session.data.newVersion}\`\n📝 O'zgarishlar: ${changes}`, { parse_mode: "Markdown" });
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true, getUserDevice(userId));
        return;
    }
    
    if (photo) return;
    if (!text) return;
    if (text === "/start") return;
    if (text.startsWith("/")) return;
    
    const user = getUserByUserId(userId);
    const deviceType = getUserDevice(userId);
    
    // Yangi avtomobil qo'shish
    if (session.step === "first_car_number") {
        const carNumber = text.toUpperCase().trim();
        
        if (carNumber.length < 2 || carNumber.length > 10) {
            await bot.sendMessage(chatId, "❌ *Noto'g'ri avtomobil raqami!*\n\n2-10 belgi kiriting:", { parse_mode: "Markdown" });
            return;
        }
        
        const userFullName = (session.data.firstName || "") + " " + (session.data.lastName || "");
        
        addNewUser(
            userId, 
            session.data.phone, 
            carNumber,
            session.data.firstName || "",
            session.data.lastName || "",
            session.data.username || ""
        );
        
        try {
            await sendReminder(chatId);
            await bot.sendMessage(chatId, "✅ *Ro'yxatdan o'tdingiz!*\n\n👤 " + (userFullName.trim() || "Mijoz") + "\n🚗 " + carNumber + "\n📞 " + session.data.phone + "\n📌 Versiya: `" + currentVersion + "`\n\n🎁 Har 5 diagnostikada 1 BEPUL!", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, false, deviceType);
            
            for (const adminId of ADMIN_IDS) {
                bot.sendMessage(adminId, "🆕 *YANGI FOYDALANUVCHI!*\n\n👤 " + (userFullName.trim() || "Mijoz") + "\n📞 " + session.data.phone + "\n🚗 " + carNumber, { parse_mode: "Markdown" }).catch(() => {});
            }
        } catch (error) {
            console.error("Ro'yxatdan o'tkazish xatolik:", error);
        }
        clearUserSession(userId);
        return;
    }
    
    if (session.step === "add_new_car") {
        const carNumber = text.toUpperCase().trim();
        
        if (carNumber.length < 2 || carNumber.length > 10) {
            await bot.sendMessage(chatId, "❌ *Noto'g'ri raqam!*", { parse_mode: "Markdown" });
            return;
        }
        
        const result = addCarToUser(session.data.phone, carNumber, {
            firstName: session.data.firstName,
            lastName: session.data.lastName,
            username: session.data.username
        });
        
        if (result.success) {
            await bot.sendMessage(chatId, "✅ *Yangi avtomobil qo'shildi!*\n\n🚗 " + carNumber, { parse_mode: "Markdown" });
        } else {
            await bot.sendMessage(chatId, "❌ " + result.message, { parse_mode: "Markdown" });
        }
        
        clearUserSession(userId);
        await sendMainMenu(chatId, false, deviceType);
        return;
    }
    
    // Admin diagnostika qo'shish
    if (session.step === "admin_add_diagnostic") {
        if (!isAdmin(userId)) {
            clearUserSession(userId);
            await sendMainMenu(chatId, false, deviceType);
            return;
        }
        
        const carNumber = text.toUpperCase().trim();
        
        let foundUser = null;
        let foundCar = null;
        
        for (const userObj of users) {
            const car = userObj.cars.find(c => c.carNumber === carNumber);
            if (car) {
                foundUser = userObj;
                foundCar = car;
                break;
            }
        }
        
        if (!foundUser) {
            await bot.sendMessage(chatId, "❌ *Bunday avtomobil topilmadi!*", { parse_mode: "Markdown" });
            return;
        }
        
        session.data.targetUser = foundUser;
        session.data.targetCar = foundCar;
        session.step = "admin_work_description";
        
        await bot.sendMessage(chatId, "✅ Foydalanuvchi topildi:\n\n👤 " + (foundUser.fullName || "Ismsiz") + "\n🚗 " + foundCar.carNumber + "\n🎁 Bonus: " + foundCar.bonusCount + "/5\n🎉 Bepul: " + foundCar.freeDiagnostics + "\n\n🔧 *Bajarilgan ishlarni kiriting:*", { parse_mode: "Markdown" });
        return;
    }
    
    if (session.step === "admin_work_description") {
        if (!isAdmin(userId)) {
            clearUserSession(userId);
            await sendMainMenu(chatId, false, deviceType);
            return;
        }
        session.data.workDescription = text;
        session.step = "admin_additional_notes";
        await bot.sendMessage(chatId, "✅ Bajarilgan ishlar qabul qilindi!\n\n➕ *Qo'shimcha eslatmalar kiriting* (ixtiyoriy):", { parse_mode: "Markdown" });
        return;
    }
    
    if (session.step === "admin_additional_notes") {
        if (!isAdmin(userId)) {
            clearUserSession(userId);
            await sendMainMenu(chatId, false, deviceType);
            return;
        }
        session.data.additionalNotes = text || "";
        
        const result = addDiagnosticToCar(
            session.data.targetUser.phone,
            session.data.targetCar.carNumber,
            session.data.workDescription,
            session.data.additionalNotes
        );
        
        let adminResponse = "🔧 *DIAGNOSTIKA QO'SHILDI*\n\n👤 " + (session.data.targetUser.fullName || "Ismsiz") + "\n🚗 " + result.carNumber + "\n💰 " + result.price.toLocaleString() + " so'm\n\n" + result.bonusMessage;
        
        await bot.sendMessage(chatId, adminResponse, { parse_mode: "Markdown" });
        
        let userMsg = "🔧 *DIAGNOSTIKA NATIJALARI*\n\n";
        userMsg += "🚗 *" + result.carNumber + "*\n";
        userMsg += "📅 " + formatTashkentDate(new Date()) + "\n";
        userMsg += "🕐 " + formatTashkentTime(new Date()) + "\n\n";
        userMsg += "📝 *Bajarilgan ishlar:*\n" + session.data.workDescription + "\n\n";
        
        if (session.data.additionalNotes && session.data.additionalNotes !== "") {
            userMsg += "📌 *Eslatma:*\n" + session.data.additionalNotes + "\n\n";
        }
        
        userMsg += "💰 *Narx:* " + (result.isFree ? "🎉 BEPUL" : result.price.toLocaleString() + " so'm") + "\n\n";
        userMsg += result.bonusMessage;
        
        bot.sendMessage(session.data.targetUser.userId, userMsg, { parse_mode: "Markdown" }).catch(() => {});
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true, deviceType);
        return;
    }
    
    // Admin qo'shish session
    if (session.step === "add_admin_permission") {
        if (text === "/cancel") {
            clearUserSession(userId);
            await bot.sendMessage(chatId, "❌ *Amal bekor qilindi.*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
            return;
        }
        
        const targetAdminId = parseInt(text);
        if (isNaN(targetAdminId)) {
            await bot.sendMessage(chatId, "❌ *Noto'g'ri ID!*", { parse_mode: "Markdown" });
            return;
        }
        
        const result = grantEditPermission(userId, targetAdminId);
        await bot.sendMessage(chatId, result.message, { parse_mode: "Markdown" });
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true, deviceType);
        return;
    }
    
    // AGAR SESSION YO'Q BO'LSA
    if (!user) {
        await bot.sendMessage(chatId, "❌ Ro'yxatdan o'tmagansiz! Iltimos, /start bosing.", { parse_mode: "Markdown" });
        return;
    }
    
    if (user.isBlocked) {
        await bot.sendMessage(chatId, "🚫 *Siz botdan bloklangansiz!*", { parse_mode: "Markdown" });
        return;
    }
    
    // ======================== ADMIN MATNLI BUYRUQLAR ========================
    if (isAdmin(userId)) {
        // STATISTIKA
        if (text === "📊 Statistika") {
            const stats = getStatistics();
            await bot.sendMessage(chatId, `📊 *STATISTIKA*\n\n👥 Faol: ${stats.totalUsers}\n🚫 Bloklangan: ${stats.blockedUsers}\n🚗 Avtomobillar: ${stats.totalCars}\n🔧 Jami: ${stats.totalDiagnostics}\n💰 Daromad: ${stats.totalIncome.toLocaleString()} so'm\n📹 Videolar: ${stats.totalVideos} ta\n📌 Versiya: \`${stats.currentVersion}\`\n📊 Yangilanishlar: ${stats.versionHistoryCount} ta`, { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
        }
        // FOYDALANUVCHILAR
        else if (text === "👥 Foydalanuvchilar") {
            const usersList = getAllUsersWithDetails();
            if (usersList.length === 0) { 
                await bot.sendMessage(chatId, "📭 Hech qanday foydalanuvchi yo'q", { parse_mode: "Markdown" }); 
                await sendMainMenu(chatId, true, deviceType);
                return; 
            }
            
            let msgText = "👥 *FOYDALANUVCHILAR*\n━━━━━━━━━━━━━━━━━━\n\n";
            usersList.slice(0, 15).forEach((u, index) => { 
                const status = u.isBlocked ? "🔴" : "🟢";
                msgText += `${status} *${index + 1}. ${(u.fullName || "Ismsiz").substring(0, 20)}*\n`;
                msgText += `📞 ${u.phone}\n`;
                const carsStr = u.cars.map(c => c.carNumber).join(", ");
                msgText += `🚗 ${carsStr.substring(0, 30)}${carsStr.length > 30 ? "..." : ""}\n`;
                msgText += "━━━━━━━━━━━━━━━━━━\n";
            });
            await bot.sendMessage(chatId, msgText, { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
        }
        // DIAGNOSTIKA QO'SHISH (TO'G'IRLANGAN)
        else if (text === "🔧 Diagnostika qo'shish") {
            const adminSession = getUserSession(userId);
            adminSession.step = "admin_add_diagnostic";
            await bot.sendMessage(chatId, "🔧 *Diagnostika qo'shish*\n\n🚗 Avtomobil raqamini kiriting:", { parse_mode: "Markdown", ...removeKeyboard() });
        }
        // BONUSGA YAQINLAR
        else if (text === "🎁 Bonusga yaqinlar") {
            const nearBonus = getNearBonusCars();
            if (nearBonus.length === 0) {
                await bot.sendMessage(chatId, "📭 Bonusga yaqin avtomobillar yo'q", { parse_mode: "Markdown" });
            } else {
                let msg = "🎁 *BONUSGA YAQINLAR*\n━━━━━━━━━━━━━━━━━━\n\n";
                nearBonus.forEach(c => {
                    msg += `👤 ${c.fullName}\n🚗 ${c.carNumber}\n🎁 ${c.bonusCount}/5\n📌 ${c.remaining} diagnostikadan keyin BEPUL\n━━━━━━━━━━━━━━━━━━\n`;
                });
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
            }
            await sendMainMenu(chatId, true, deviceType);
        }
        // XATOLIKLAR
        else if (text === "⚠️ Xatoliklar") {
            const errorsList = getErrors();
            if (errorsList.length === 0) {
                await bot.sendMessage(chatId, "✅ Xatoliklar yo'q", { parse_mode: "Markdown" });
            } else {
                let msg = "⚠️ *XATOLIKLAR*\n\n";
                errorsList.slice(0, 10).forEach(e => {
                    msg += `🚗 ${e.carNumber}\n📝 ${(e.errorDescription || "Xatolik").substring(0, 40)}\n📅 ${formatTashkentDate(e.date)}\n━━━━━━━━━━━━━━━━━━\n`;
                });
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
            }
            await sendMainMenu(chatId, true, deviceType);
        }
        // DIAGNOSTIKA TARIXI
        else if (text === "📋 Diagnostika tarixi") {
            const diags = getAllDiagnostics(20);
            if (diags.length === 0) {
                await bot.sendMessage(chatId, "📭 Diagnostikalar yo'q", { parse_mode: "Markdown" });
            } else {
                for (const d of diags.slice(0, 10)) {
                    await bot.sendMessage(chatId, `📅 ${formatTashkentDate(d.date)}\n🚗 ${d.carNumber}\n💰 ${d.price > 0 ? d.price.toLocaleString() + " so'm" : "BEPUL"}`, { parse_mode: "Markdown" });
                }
            }
            await sendMainMenu(chatId, true, deviceType);
        }
        // BUGUNGI DIAGNOSTIKALAR VA OYLIK TAHLIL
        else if (text === "📅 Bugungi") {
            const diags = getTodayDiagnostics();
            const keyboard = {
                inline_keyboard: [
                    [{ text: "📊 Bugungi diagnostikalar", callback_data: "today_diagnostics" }],
                    [{ text: "📈 Oylik daromad tahlili", callback_data: "monthly_income_analysis" }],
                    [{ text: "📅 Yillik daromad tahlili", callback_data: "yearly_income_analysis" }],
                    [{ text: "🔙 Ortga", callback_data: "back_to_main" }]
                ]
            };
            
            let msg = "📅 *DIAGNOSTIKA BO'LIMI*\n\n";
            if (diags.length === 0) {
                msg += "📭 Bugun diagnostika yo'q";
            } else {
                msg += `📊 Bugungi diagnostikalar: ${diags.length} ta\n`;
                const todayIncome = diags.filter(d => !d.isFree).reduce((sum, d) => sum + d.price, 0);
                msg += `💰 Bugungi daromad: ${todayIncome.toLocaleString()} so'm\n`;
                msg += `🎉 Bepul diagnostikalar: ${diags.filter(d => d.isFree).length} ta\n`;
            }
            
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: keyboard });
        }
        // HISOBOT OLISH
        else if (text === "📄 Hisobot") {
            await bot.sendMessage(chatId, "📄 *Hisobot tayyorlanmoqda...*", { parse_mode: "Markdown" });
            try {
                const allDiagnostics = getAllDiagnostics(500);
                const filepath = await generateDiagnosticsReport(allDiagnostics);
                await bot.sendDocument(chatId, filepath, { caption: "📊 Diagnostika hisoboti\n📅 " + formatTashkentDateTime(new Date()) });
                setTimeout(() => fs.unlinkSync(filepath), 60000);
            } catch (error) {
                await bot.sendMessage(chatId, "❌ *Xatolik!*", { parse_mode: "Markdown" });
            }
            await sendMainMenu(chatId, true, deviceType);
        }
        // VIDEO GALEREYA
        else if (text === "📹 Video galereya") {
            await showVideoGallery(chatId);
            await sendMainMenu(chatId, true, deviceType);
        }
        // VIDEO YUKLASH
        else if (text === "📤 Video yuklash") {
            const adminSession = getUserSession(userId);
            adminSession.step = "admin_waiting_video";
            adminSession.data = {};
            await bot.sendMessage(chatId, "📤 *VIDEO YUKLASH*\n\nIltimos, video faylni yuboring:", { parse_mode: "Markdown" });
        }
        // BACKUP YARATISH
        else if (text === "💾 Backup") {
            await bot.sendMessage(chatId, "💾 *Backup yaratilmoqda...*", { parse_mode: "Markdown" });
            createBackup();
            await bot.sendMessage(chatId, "✅ *Backup yaratildi!*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
        }
        // DATABASE TIKLASH
        else if (text === "🔄 Tiklash") {
            const backups = listBackups();
            if (backups.length === 0) {
                await bot.sendMessage(chatId, "❌ *Backup topilmadi!*", { parse_mode: "Markdown" });
                await sendMainMenu(chatId, true, deviceType);
            } else {
                let msg = "🔄 *DATABASE TIKLASH*\n\nBackup tanlang:\n\n";
                const keyboard = backups.slice(0, 10).map(b => [{ text: "📁 " + b.name.substring(0, 30), callback_data: "restore_" + b.name }]);
                keyboard.push([{ text: "❌ Bekor qilish", callback_data: "restore_cancel" }]);
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
            }
        }
        // FOYDALANUVCHILARNI BOSHQARISH (FAQAT AVTOMOBIL RAQAMI BILAN)
        else if (text === "🚫 Foyd. boshqarish") {
            const activeUsers = getActiveUsers();
            const blockedUsers = getBlockedUsers();
            const allUsers = [...activeUsers, ...blockedUsers];
            
            if (allUsers.length === 0) {
                await bot.sendMessage(chatId, "📭 Hech qanday foydalanuvchi yo'q", { parse_mode: "Markdown" });
                await sendMainMenu(chatId, true, deviceType);
                return;
            }
            
            const totalPages = Math.ceil(allUsers.length / USERS_PER_PAGE);
            const start = userManagePage * USERS_PER_PAGE;
            const end = start + USERS_PER_PAGE;
            const pageUsers = allUsers.slice(start, end);
            
            let msg = `👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\n🟢 Faol: ${activeUsers.length}\n🔴 Bloklangan: ${blockedUsers.length}\n📄 Sahifa ${userManagePage + 1}/${totalPages}\n━━━━━━━━━━━━━━━━━━\n\n`;
            
            const keyboard = [];
            let row = [];
            
            for (let i = 0; i < pageUsers.length; i++) {
                const userObj = pageUsers[i];
                const num = start + i + 1;
                const status = userObj.isBlocked ? "🔴" : "🟢";
                const carNumber = userObj.cars.length > 0 ? userObj.cars[0].carNumber : "🚫 Avto yo'q";
                const displayText = `${status} ${num}. ${carNumber}`;
                
                row.push({ text: displayText.substring(0, 20), callback_data: `manage_user_${userObj.userId}` });
                
                if (row.length === 2) {
                    keyboard.push([...row]);
                    row = [];
                }
            }
            if (row.length > 0) {
                keyboard.push([...row]);
            }
            
            const navButtons = [];
            if (userManagePage > 0) {
                navButtons.push({ text: "◀️ Oldingi", callback_data: "user_page_prev" });
            }
            if (end < allUsers.length) {
                navButtons.push({ text: "Keyingi ▶️", callback_data: "user_page_next" });
            }
            if (navButtons.length > 0) {
                keyboard.push(navButtons);
            }
            
            keyboard.push([{ text: "🔙 Ortga", callback_data: "admin_manage_users_back" }]);
            
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
        }
        // XAVFSIZLIK
        else if (text === "🔐 Xavfsizlik") {
            if (!isSuperAdmin(userId) && !canEditCode(userId)) {
                await bot.sendMessage(chatId, "❌ *Ruxsat yo'q!*", { parse_mode: "Markdown" });
                await sendMainMenu(chatId, true, deviceType);
                return;
            }
            const keyboard = [
                [{ text: "👥 Ruxsat berilgan adminlar", callback_data: "security_allowed_admins" }],
                [{ text: "➕ Admin qo'shish", callback_data: "security_add_admin" }],
                [{ text: "➖ Admin o'chirish", callback_data: "security_remove_admin" }],
                [{ text: "📜 Xavfsizlik jurnali", callback_data: "security_log" }],
                [{ text: "🔙 Orqaga", callback_data: "security_back" }]
            ];
            await bot.sendMessage(chatId, "🔐 *XAVFSIZLIK SOZLAMALARI*", { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
        }
        // VERSIYA
        else if (text === "📌 Versiya") {
            const versionInfo = getVersionInfo();
            let msg = "📌 *VERSIYA MA'LUMOTLARI*\n\n";
            msg += `🔹 Joriy versiya: \`${versionInfo.currentVersion}\`\n`;
            msg += `🔹 Yangi bot linki: ${NEW_BOT_LINK}\n`;
            msg += `🔹 Oxirgi yangilanish: ${versionInfo.lastVersion}\n`;
            msg += `🔹 Jami yangilanishlar: ${versionInfo.totalUpdates} ta\n\n`;
            
            if (versionHistory.length > 0) {
                msg += "📜 *YANGILANISHLAR TARIXI*\n━━━━━━━━━━━━━━━━━━\n\n";
                versionHistory.slice(0, 5).forEach(v => {
                    msg += `📌 Versiya: \`${v.version}\`\n`;
                    msg += `📅 Sana: ${formatTashkentDate(v.date)}\n`;
                    msg += `📝 O'zgarishlar: ${v.changes.substring(0, 50)}${v.changes.length > 50 ? "..." : ""}\n`;
                    msg += "━━━━━━━━━━━━━━━━━━\n";
                });
            }
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: "🔄 Versiyani yangilash", callback_data: "admin_update_version" }],
                    [{ text: "🔙 Ortga", callback_data: "back_to_main" }]
                ]
            };
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: keyboard });
        }
        // XABAR YUBORISH
        else if (text === "📢 Xabar yuborish") {
            const adminSession = getUserSession(userId);
            adminSession.step = "admin_send_message";
            await bot.sendMessage(chatId, "📢 *XABAR YUBORISH*\n\nBarcha foydalanuvchilarga yuboriladigan xabarni kiriting:\n\n❌ Bekor qilish uchun /cancel yozing.", { parse_mode: "Markdown" });
        }
        // ASOSIY MENYU
        else if (text === "❌ Asosiy menyu") {
            clearUserSession(userId);
            userManagePage = 0;
            await sendMainMenu(chatId, true, deviceType);
        }
        else if (!session.step) {
            await bot.sendMessage(chatId, "❌ *Tushunarsiz buyruq!*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
        }
        return;
    }
    
    // Foydalanuvchi matn yuborsa
    if (!session.step) {
        await bot.sendMessage(chatId, "❌ *Iltimos, tugmalardan foydalaning!*", { parse_mode: "Markdown" });
        await sendMainMenu(chatId, false, deviceType);
    }
});

// -------------------- CALLBACK QUERY HANDLER --------------------
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userId = query.from.id;
    const messageId = query.message.message_id;
    
    await bot.answerCallbackQuery(query.id);
    
    const user = getUserByUserId(userId);
    if (!user) {
        await bot.sendMessage(chatId, "❌ Ro'yxatdan o'tmagan! /start bosing.");
        return;
    }
    
    const deviceType = getUserDevice(userId);
    
    // Foydalanuvchi callback'lari
    if (data === "user_profile") {
        const carsList = user.cars.map(c => "🚗 " + c.carNumber + " (" + c.totalDiagnostics + " ta)").join("\n");
        await bot.sendMessage(chatId, "📊 *MENGING SAHIFAM*\n\n👤 *Ism:* " + (user.fullName || "Kiritilmagan") + "\n📞 *Telefon:* " + user.phone + "\n🚗 *Avtomobillar:* " + user.cars.length + "/" + MAX_CARS_PER_USER + "\n\n" + carsList + "\n\n🎁 *Bonus:* " + (user.totalBonusCount || 0) + "\n🎉 *Bepul:* " + (user.totalFreeDiagnostics || 0) + " ta\n📊 *Jami:* " + (user.totalDiagnosticsAll || 0) + " ta\n📌 *Versiya:* `" + currentVersion + "`", { parse_mode: "Markdown" });
        await sendMainMenu(chatId, false, deviceType);
    }
    else if (data === "user_my_cars") {
        if (user.cars.length === 0) {
            await bot.sendMessage(chatId, "📭 Sizda hali avtomobillar mavjud emas!", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, false, deviceType);
            return;
        }
        
        let carsText = "🚗 *MENGING AVTOMOBILLARIM*\n📌 5 diagnostika = 1 BEPUL\n━━━━━━━━━━━━━━━━━━\n\n";
        for (const car of user.cars) {
            const nextFree = 5 - car.bonusCount;
            carsText += "🚗 *" + car.carNumber + "*\n";
            carsText += "🎁 Bonus: " + car.bonusCount + "/5\n";
            carsText += "🎉 Bepul: " + car.freeDiagnostics + " ta\n";
            carsText += "📊 Diagnostika: " + car.totalDiagnostics + " ta\n";
            if (car.freeDiagnostics > 0) {
                carsText += "✅ *Bepul mavjud!*\n";
            } else if (nextFree > 0) {
                carsText += "📌 BEPUL: " + nextFree + " dan keyin\n";
            }
            carsText += "━━━━━━━━━━━━━━━━━━\n";
        }
        await bot.sendMessage(chatId, carsText, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, false, deviceType);
    }
    else if (data === "user_my_bonus") {
        let bonusText = "🎁 *MENGING BONUSLARIM*\n📌 Har 5 diagnostikada 1 BEPUL\n━━━━━━━━━━━━━━━━━━\n\n";
        for (const car of user.cars) {
            const nextFree = 5 - car.bonusCount;
            bonusText += "🚗 *" + car.carNumber + "*\n";
            bonusText += "📊 To'plangan: " + car.bonusCount + "/5\n";
            bonusText += "🎉 Bepul: " + car.freeDiagnostics + " ta\n";
            if (car.freeDiagnostics > 0) {
                bonusText += "✅ Sizda BEPUL diagnostika bor!\n";
            } else if (nextFree > 0) {
                bonusText += "📌 BEPUL: " + nextFree + " diagnostikadan keyin\n";
            }
            bonusText += "━━━━━━━━━━━━━━━━━━\n";
        }
        await bot.sendMessage(chatId, bonusText, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, false, deviceType);
    }
    else if (data === "user_add_car") {
        if (user.cars.length >= MAX_CARS_PER_USER) {
            await bot.sendMessage(chatId, "❌ Maksimum " + MAX_CARS_PER_USER + " ta avtomobil!", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, false, deviceType);
            return;
        }
        
        const session = getUserSession(userId);
        session.step = "add_new_car";
        session.data.phone = user.phone;
        session.data.firstName = user.firstName;
        session.data.lastName = user.lastName;
        session.data.username = user.username;
        
        await bot.sendMessage(chatId, "🚗 *Yangi avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA", {
            parse_mode: "Markdown",
            reply_markup: { remove_keyboard: true }
        });
    }
    else if (data === "user_history") {
        const diags = getUserDiagnostics(user.phone, 10);
        if (diags.length === 0) {
            await bot.sendMessage(chatId, "📭 *Sizda hali diagnostikalar mavjud emas!*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, false, deviceType);
            return;
        }
        
        for (const d of diags) {
            let diagText = "📅 *" + formatTashkentDate(d.date) + "*\n";
            diagText += "🕐 " + formatTashkentTime(d.date) + "\n";
            diagText += "🚗 *" + d.carNumber + "*\n\n";
            diagText += "📝 *Bajarilgan ishlar:*\n" + d.workDescription + "\n\n";
            
            if (d.additionalNotes && d.additionalNotes !== "") {
                diagText += "📌 *Eslatma:*\n" + d.additionalNotes + "\n\n";
            }
            
            diagText += "💰 *Narx:* " + (d.price > 0 ? d.price.toLocaleString() + " so'm" : "🎉 BEPUL") + "\n";
            diagText += "━━━━━━━━━━━━━━━━━━\n";
            
            await bot.sendMessage(chatId, diagText, { parse_mode: "Markdown" });
        }
        await sendMainMenu(chatId, false, deviceType);
    }
    else if (data === "user_video_gallery") {
        await showVideoGallery(chatId);
        await sendMainMenu(chatId, false, deviceType);
    }
    else if (data === "user_payment") {
        await bot.sendMessage(chatId, getCardInfoMessage(), {
            parse_mode: "Markdown",
            ...getUserPaymentKeyboard()
        });
    }
    else if (data === "show_card_number") {
        await bot.sendMessage(chatId, getCardInfoMessage(), {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📋 Karta raqamini nusxalash", callback_data: "copy_card_number" }],
                    [{ text: "🔙 Ortga", callback_data: "user_payment" }]
                ]
            }
        });
    }
    else if (data === "copy_card_number") {
        await bot.sendMessage(chatId, `💳 *Karta raqami:* \`${CARD_NUMBER}\`\n\n👤 *Karta egasi:* ${CARD_OWNER}\n\nRaqamni nusxalash uchun bosing va ushlab turing.`, {
            parse_mode: "Markdown"
        });
    }
    else if (data === "user_instagram") {
        await bot.sendMessage(chatId, "📸 *BIZNING INSTAGRAM*\n\n🔗 " + INSTAGRAM_LINK, {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "📸 Instagramga o'tish", url: INSTAGRAM_LINK }]] }
        });
        await sendMainMenu(chatId, false, deviceType);
    }
    else if (data === "user_telegram_group") {
        await bot.sendMessage(chatId, "👥 *TELEGRAM GURUHIMIZ*\n\n🔗 " + TELEGRAM_GROUP_LINK, {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "👥 Guruhga o'tish", url: TELEGRAM_GROUP_LINK }]] }
        });
        await sendMainMenu(chatId, false, deviceType);
    }
    else if (data === "user_info") {
        await bot.sendMessage(chatId, "ℹ️ *ISUZU DOCTOR BOT*\n\n🚗 Avtomobil diagnostikasi\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📱 " + MAX_CARS_PER_USER + " tagacha avtomobil\n📞 Aloqa: " + ADMIN_PHONE + "\n📌 Versiya: `" + currentVersion + "`", { parse_mode: "Markdown" });
        await sendMainMenu(chatId, false, deviceType);
    }
    else if (data === "user_version_info") {
        const versionInfo = getVersionInfo();
        let msg = "📌 *VERSIYA MA'LUMOTLARI*\n\n";
        msg += `🔹 Sizning versiyangiz: \`${currentVersion}\`\n`;
        msg += `🔹 Yangi bot linki: ${NEW_BOT_LINK}\n\n`;
        
        if (versionHistory.length > 0) {
            msg += "📜 *SO'NGI YANGILANISHLAR*\n━━━━━━━━━━━━━━━━━━\n\n";
            versionHistory.slice(0, 3).forEach(v => {
                msg += `📌 Versiya: \`${v.version}\`\n`;
                msg += `📅 Sana: ${formatTashkentDate(v.date)}\n`;
                msg += `📝 ${v.changes.substring(0, 50)}${v.changes.length > 50 ? "..." : ""}\n`;
                msg += "━━━━━━━━━━━━━━━━━━\n";
            });
        }
        
        const keyboard = {
            inline_keyboard: [
                [{ text: "🚀 Yangi botga o'tish", url: NEW_BOT_LINK }],
                [{ text: "🔙 Ortga", callback_data: "back_to_main" }]
            ]
        };
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: keyboard });
    }
    
    // Admin callback'lari
    else if (data === "admin_update_version") {
        if (!isAdmin(userId)) {
            await bot.sendMessage(chatId, "❌ Bu amal uchun ruxsat yo'q!", { parse_mode: "Markdown" });
            return;
        }
        const session = getUserSession(userId);
        session.step = "admin_update_version";
        await bot.sendMessage(chatId, "🔄 *VERSIYANI YANGILASH*\n\nYangi versiya raqamini kiriting (masalan: 2.1.0):\n\n❌ Bekor qilish uchun /cancel yozing.", { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } });
    }
    
    // OYLIK DAROMAD TAHLILI CALLBACK'LARI
    else if (data === "today_diagnostics") {
        const diags = getTodayDiagnostics();
        if (diags.length === 0) {
            await bot.sendMessage(chatId, "📭 *Bugun diagnostika yo'q*", { parse_mode: "Markdown" });
        } else {
            let msg = "📅 *BUGUNGI DIAGNOSTIKALAR*\n━━━━━━━━━━━━━━━━━━\n\n";
            let totalIncome = 0;
            let freeCount = 0;
            
            diags.forEach(d => {
                msg += `🚗 ${d.carNumber}\n`;
                msg += `📝 ${d.workDescription.substring(0, 40)}${d.workDescription.length > 40 ? "..." : ""}\n`;
                if (d.isFree) {
                    msg += `💰 BEPUL\n`;
                    freeCount++;
                } else {
                    msg += `💰 ${d.price.toLocaleString()} so'm\n`;
                    totalIncome += d.price;
                }
                msg += "━━━━━━━━━━━━━━━━━━\n";
            });
            
            msg += `\n📊 *JAMI:*\n`;
            msg += `💰 Daromad: ${totalIncome.toLocaleString()} so'm\n`;
            msg += `🔧 Diagnostika: ${diags.length} ta (${freeCount} ta bepul)\n`;
            
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
        }
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data === "monthly_income_analysis") {
        const monthsData = getAllMonthsIncome();
        
        if (monthsData.length === 0 || monthsData.every(m => m.diagnosticCount === 0)) {
            await bot.sendMessage(chatId, "📭 *Hozircha daromad ma'lumotlari mavjud emas!*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
            return;
        }
        
        let msg = "📈 *OYLIK DAROMAD TAHLILI*\n━━━━━━━━━━━━━━━━━━\n\n";
        let totalAllIncome = 0;
        let totalAllDiagnostics = 0;
        
        for (const month of monthsData) {
            if (month.diagnosticCount > 0) {
                const monthName = formatMonthName(month.year, month.month);
                msg += `📅 *${monthName}*\n`;
                msg += `💰 Daromad: ${month.totalIncome.toLocaleString()} so'm\n`;
                msg += `🔧 Diagnostika: ${month.diagnosticCount} ta\n`;
                msg += `📊 O'rtacha chek: ${Math.round(month.averageCheck).toLocaleString()} so'm\n`;
                msg += "━━━━━━━━━━━━━━━━━━\n";
                totalAllIncome += month.totalIncome;
                totalAllDiagnostics += month.diagnosticCount;
            }
        }
        
        if (totalAllDiagnostics > 0) {
            msg += `\n📊 *JAMI (12 oy)*\n`;
            msg += `💰 Umumiy daromad: ${totalAllIncome.toLocaleString()} so'm\n`;
            msg += `🔧 Jami diagnostika: ${totalAllDiagnostics} ta\n`;
            msg += `📊 O'rtacha oylik: ${Math.round(totalAllIncome / 12).toLocaleString()} so'm\n`;
        }
        
        const keyboard = {
            inline_keyboard: [
                [{ text: "📊 Batafsil statistika", callback_data: "detailed_monthly_stats" }],
                [{ text: "🔙 Ortga", callback_data: "back_to_main" }]
            ]
        };
        
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: keyboard });
    }
    else if (data === "yearly_income_analysis") {
        const years = getAvailableYears();
        
        if (years.length === 0) {
            await bot.sendMessage(chatId, "📭 *Hozircha daromad ma'lumotlari mavjud emas!*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
            return;
        }
        
        let msg = "📅 *YILLIK DAROMAD TAHLILI*\n━━━━━━━━━━━━━━━━━━\n\n";
        
        for (const year of years) {
            const yearData = getYearlyIncome(year);
            if (yearData.totalDiagnostics > 0) {
                msg += `📌 *${year}-YIL*\n`;
                msg += `💰 Umumiy daromad: ${yearData.totalIncome.toLocaleString()} so'm\n`;
                msg += `🔧 Jami diagnostika: ${yearData.totalDiagnostics} ta\n`;
                msg += `📊 O'rtacha oylik: ${Math.round(yearData.averageMonthlyIncome).toLocaleString()} so'm\n`;
                msg += "━━━━━━━━━━━━━━━━━━\n";
            }
        }
        
        const keyboard = {
            inline_keyboard: [
                [{ text: "📊 Oy bo'yicha batafsil", callback_data: "monthly_income_analysis" }],
                [{ text: "🔙 Ortga", callback_data: "back_to_main" }]
            ]
        };
        
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: keyboard });
    }
    else if (data === "detailed_monthly_stats") {
        const monthsData = getAllMonthsIncome();
        
        let msg = "📊 *BATAFSIL OYLIK STATISTIKA*\n━━━━━━━━━━━━━━━━━━\n\n";
        
        for (const month of monthsData) {
            if (month.diagnosticCount > 0) {
                const monthName = formatMonthName(month.year, month.month);
                const barLength = Math.min(30, Math.floor(month.totalIncome / 1000000));
                const bar = "█".repeat(Math.max(0, barLength)) + "░".repeat(Math.max(0, 30 - barLength));
                msg += `📅 *${monthName}*\n`;
                msg += `💰 ${month.totalIncome.toLocaleString()} so'm\n`;
                msg += `${bar}\n`;
                msg += "━━━━━━━━━━━━━━━━━━\n";
            }
        }
        
        const keyboard = {
            inline_keyboard: [
                [{ text: "🔙 Ortga", callback_data: "monthly_income_analysis" }]
            ]
        };
        
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: keyboard });
    }
    
    // FOYDALANUVCHILARNI BOSHQARISH NAVIGATSIYASI
    else if (data === "user_page_prev") {
        if (userManagePage > 0) {
            userManagePage--;
            const activeUsers = getActiveUsers();
            const blockedUsers = getBlockedUsers();
            const allUsers = [...activeUsers, ...blockedUsers];
            
            if (allUsers.length === 0) {
                await bot.sendMessage(chatId, "📭 Hech qanday foydalanuvchi yo'q", { parse_mode: "Markdown" });
                await sendMainMenu(chatId, true, deviceType);
                return;
            }
            
            const totalPages = Math.ceil(allUsers.length / USERS_PER_PAGE);
            const start = userManagePage * USERS_PER_PAGE;
            const end = start + USERS_PER_PAGE;
            const pageUsers = allUsers.slice(start, end);
            
            let msg = `👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\n🟢 Faol: ${activeUsers.length}\n🔴 Bloklangan: ${blockedUsers.length}\n📄 Sahifa ${userManagePage + 1}/${totalPages}\n━━━━━━━━━━━━━━━━━━\n\n`;
            
            const keyboard = [];
            let row = [];
            
            for (let i = 0; i < pageUsers.length; i++) {
                const userObj = pageUsers[i];
                const num = start + i + 1;
                const status = userObj.isBlocked ? "🔴" : "🟢";
                const carNumber = userObj.cars.length > 0 ? userObj.cars[0].carNumber : "🚫 Avto yo'q";
                const displayText = `${status} ${num}. ${carNumber}`;
                
                row.push({ text: displayText.substring(0, 20), callback_data: `manage_user_${userObj.userId}` });
                
                if (row.length === 2) {
                    keyboard.push([...row]);
                    row = [];
                }
            }
            if (row.length > 0) {
                keyboard.push([...row]);
            }
            
            const navButtons = [];
            if (userManagePage > 0) {
                navButtons.push({ text: "◀️ Oldingi", callback_data: "user_page_prev" });
            }
            if (end < allUsers.length) {
                navButtons.push({ text: "Keyingi ▶️", callback_data: "user_page_next" });
            }
            if (navButtons.length > 0) {
                keyboard.push(navButtons);
            }
            
            keyboard.push([{ text: "🔙 Ortga", callback_data: "admin_manage_users_back" }]);
            
            await bot.editMessageText(msg, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    }
    else if (data === "user_page_next") {
        userManagePage++;
        const activeUsers = getActiveUsers();
        const blockedUsers = getBlockedUsers();
        const allUsers = [...activeUsers, ...blockedUsers];
        
        if (allUsers.length === 0) {
            await bot.sendMessage(chatId, "📭 Hech qanday foydalanuvchi yo'q", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
            return;
        }
        
        const totalPages = Math.ceil(allUsers.length / USERS_PER_PAGE);
        const start = userManagePage * USERS_PER_PAGE;
        const end = start + USERS_PER_PAGE;
        const pageUsers = allUsers.slice(start, end);
        
        let msg = `👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\n🟢 Faol: ${activeUsers.length}\n🔴 Bloklangan: ${blockedUsers.length}\n📄 Sahifa ${userManagePage + 1}/${totalPages}\n━━━━━━━━━━━━━━━━━━\n\n`;
        
        const keyboard = [];
        let row = [];
        
        for (let i = 0; i < pageUsers.length; i++) {
            const userObj = pageUsers[i];
            const num = start + i + 1;
            const status = userObj.isBlocked ? "🔴" : "🟢";
            const carNumber = userObj.cars.length > 0 ? userObj.cars[0].carNumber : "🚫 Avto yo'q";
            const displayText = `${status} ${num}. ${carNumber}`;
            
            row.push({ text: displayText.substring(0, 20), callback_data: `manage_user_${userObj.userId}` });
            
            if (row.length === 2) {
                keyboard.push([...row]);
                row = [];
            }
        }
        if (row.length > 0) {
            keyboard.push([...row]);
        }
        
        const navButtons = [];
        if (userManagePage > 0) {
            navButtons.push({ text: "◀️ Oldingi", callback_data: "user_page_prev" });
        }
        if (end < allUsers.length) {
            navButtons.push({ text: "Keyingi ▶️", callback_data: "user_page_next" });
        }
        if (navButtons.length > 0) {
            keyboard.push(navButtons);
        }
        
        keyboard.push([{ text: "🔙 Ortga", callback_data: "admin_manage_users_back" }]);
        
        await bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: keyboard }
        });
    }
    else if (data === "admin_manage_users_back") {
        userManagePage = 0;
        await sendMainMenu(chatId, true, deviceType);
    }
    
    // Security callback'lari
    else if (data === "security_allowed_admins") {
        let msg = "👥 *RUXSAT BERILGAN ADMINLAR*\n━━━━━━━━━━━━━━━━━━\n\n";
        if (adminSettings.allowedEditors.length === 0) {
            msg += "Hech qanday admin ruxsatga ega emas.";
        } else {
            adminSettings.allowedEditors.forEach((adminId, index) => {
                const adminUser = getUserByUserId(adminId);
                msg += (index + 1) + ". ID: " + adminId + "\n";
                if (adminUser) msg += "👤 " + (adminUser.fullName || adminUser.phone) + "\n";
                msg += "━━━━━━━━━━━━━━━━━━\n";
            });
        }
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
    }
    else if (data === "security_add_admin") {
        if (!isSuperAdmin(userId)) {
            await bot.sendMessage(chatId, "❌ Faqat Super Admin!", { parse_mode: "Markdown" });
            return;
        }
        await bot.sendMessage(chatId, "➕ *ADMIN QO'SHISH*\n\nTelegram ID sini yuboring:\n❌ Bekor qilish: /cancel", { parse_mode: "Markdown" });
        const session = getUserSession(userId);
        session.step = "add_admin_permission";
    }
    else if (data === "security_remove_admin") {
        if (!isSuperAdmin(userId)) {
            await bot.sendMessage(chatId, "❌ Faqat Super Admin!", { parse_mode: "Markdown" });
            return;
        }
        if (adminSettings.allowedEditors.length === 0) {
            await bot.sendMessage(chatId, "❌ *Hech qanday admin yo'q!*", { parse_mode: "Markdown" });
            return;
        }
        let msg = "➖ *ADMIN O'CHIRISH*\n\nTanlang:\n\n";
        const keyboard = [];
        adminSettings.allowedEditors.forEach(adminId => {
            const adminUser = getUserByUserId(adminId);
            const name = adminUser ? (adminUser.fullName || adminUser.phone) : ("ID: " + adminId);
            keyboard.push([{ text: "❌ " + name.substring(0, 30), callback_data: "remove_admin_" + adminId }]);
        });
        keyboard.push([{ text: "🔙 Orqaga", callback_data: "security_back" }]);
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
    }
    else if (data === "security_log") {
        let msg = "📜 *XAVFSIZLIK JURNALI*\n━━━━━━━━━━━━━━━━━━\n\n";
        if (adminSettings.securityLog.length === 0) {
            msg += "Hech qanday hodisa yo'q.";
        } else {
            adminSettings.securityLog.slice(0, 15).forEach(log => {
                msg += "📅 " + formatTashkentDateTime(log.date) + "\n";
                msg += "🔹 " + log.action + "\n";
                msg += "📝 " + log.details + "\n";
                msg += "━━━━━━━━━━━━━━━━━━\n";
            });
        }
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
    }
    else if (data === "security_back") {
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data.startsWith("remove_admin_")) {
        if (!isSuperAdmin(userId)) {
            await bot.sendMessage(chatId, "❌ Faqat Super Admin!", { parse_mode: "Markdown" });
            return;
        }
        const targetAdminId = parseInt(data.split("_")[2]);
        const result = revokeEditPermission(userId, targetAdminId);
        await bot.sendMessage(chatId, result.message, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data.startsWith("restore_")) {
        const backupName = data.replace("restore_", "");
        await bot.sendMessage(chatId, "🔄 *Database tiklanmoqda...*", { parse_mode: "Markdown" });
        if (restoreBackup(backupName)) {
            loadData();
            loadVideos();
            loadVersionHistory();
            await bot.sendMessage(chatId, "✅ *Database tiklandi!*", { parse_mode: "Markdown" });
        } else {
            await bot.sendMessage(chatId, "❌ *Xatolik!*", { parse_mode: "Markdown" });
        }
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data === "restore_cancel") {
        await bot.sendMessage(chatId, "❌ *Bekor qilindi.*", { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data === "user_manage_cancel") {
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data.startsWith("manage_user_")) {
        const targetUserId = parseInt(data.split("_")[2]);
        const targetUser = getUserByUserId(targetUserId);
        if (!targetUser) {
            await bot.sendMessage(chatId, "❌ Foydalanuvchi topilmadi!", { parse_mode: "Markdown" });
            return;
        }
        
        const carsList = targetUser.cars.map(c => c.carNumber).join(", ");
        const userInfo = `👤 *${targetUser.fullName || "Ismsiz"}*\n📞 ${targetUser.phone}\n🚗 ${carsList}\n📊 ${targetUser.totalDiagnosticsAll || 0} ta diagnostika\n🚦 ${targetUser.isBlocked ? "🔴 BLOKLANGAN" : "🟢 FAOL"}`;
        
        const keyboard = [];
        if (targetUser.isBlocked) {
            keyboard.push([{ text: "✅ Blokdan ochish", callback_data: "unblock_user_" + targetUserId }]);
        } else {
            keyboard.push([{ text: "🚫 Bloklash", callback_data: "block_user_" + targetUserId }]);
        }
        keyboard.push([{ text: "🗑️ O'chirish", callback_data: "delete_user_" + targetUserId }]);
        keyboard.push([{ text: "🔙 Orqaga", callback_data: "admin_manage_users_back" }]);
        
        await bot.editMessageText(userInfo, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: keyboard }
        });
    }
    else if (data.startsWith("block_user_")) {
        const targetUserId = parseInt(data.split("_")[2]);
        const result = blockUser(targetUserId);
        await bot.sendMessage(chatId, result.message, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data.startsWith("unblock_user_")) {
        const targetUserId = parseInt(data.split("_")[2]);
        const result = unblockUser(targetUserId);
        await bot.sendMessage(chatId, result.message, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data.startsWith("delete_user_")) {
        const targetUserId = parseInt(data.split("_")[2]);
        const confirmKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ Ha", callback_data: "confirm_delete_" + targetUserId }],
                    [{ text: "❌ Yo'q", callback_data: "admin_manage_users_back" }]
                ]
            }
        };
        await bot.sendMessage(chatId, "⚠️ *DIQQAT!*\n\nFoydalanuvchini o'chirmoqchisiz?\nBu amal ortga qaytmaydi!", {
            parse_mode: "Markdown",
            ...confirmKeyboard
        });
    }
    else if (data.startsWith("confirm_delete_")) {
        const targetUserId = parseInt(data.split("_")[2]);
        const result = deleteUser(targetUserId);
        await bot.sendMessage(chatId, result.message, { parse_mode: "Markdown" });
        userManagePage = 0;
        await sendMainMenu(chatId, true, deviceType);
    }
    
    // Video callback'lari
    else if (data.startsWith("watch_video_")) {
        const videoId = parseInt(data.split("_")[2]);
        const video = videoList.find(v => v.id === videoId);
        
        if (!video || !video.isActive) {
            await bot.sendMessage(chatId, "❌ *Video topilmadi!*", { parse_mode: "Markdown" });
            return;
        }
        
        updateVideoViews(videoId);
        
        const videoText = "📹 *" + video.title + "*\n\n📝 " + (video.description || "Tavsif mavjud emas") + "\n\n👁️ " + (video.views || 0) + " | 👍 " + (video.likes || 0);
        
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "👍 Like", callback_data: "like_video_" + videoId }],
                    [{ text: "📹 Boshqa videolar", callback_data: "user_video_gallery" }],
                    [{ text: "🔙 Asosiy menyu", callback_data: "back_to_main" }]
                ]
            }
        };
        
        try {
            await bot.sendVideo(chatId, video.fileId, { caption: videoText, parse_mode: "Markdown", ...keyboard });
        } catch (err) {
            await bot.sendMessage(chatId, "❌ *Xatolik!*", { parse_mode: "Markdown" });
        }
    }
    else if (data.startsWith("like_video_")) {
        const videoId = parseInt(data.split("_")[2]);
        const result = updateVideoLikes(videoId, userId);
        
        if (result) {
            await bot.answerCallbackQuery(query.id, { text: "👍 Layklandi!", show_alert: false });
        } else {
            await bot.answerCallbackQuery(query.id, { text: "❌ Siz allaqachon layk bosgansiz!", show_alert: true });
        }
    }
    else if (data.startsWith("video_page_")) {
        const page = parseInt(data.split("_")[2]);
        await showVideoGallery(chatId, page);
    }
    else if (data === "back_to_main") {
        userManagePage = 0;
        await sendMainMenu(chatId, isAdmin(userId), deviceType);
    }
});

// -------------------- XATOLIKLARNI QAYTA ISHLASH --------------------
bot.on("polling_error", (error) => console.error("Polling xatolik:", error));
process.on("uncaughtException", (error) => console.error("Uncaught exception:", error));

// -------------------- BOTNI ISHGA TUSHIRISH --------------------
console.log("=".repeat(60));
console.log("🚗 ISUZU DOCTOR BOT ISHGA TUSHMOQDA");
console.log("=".repeat(60));

loadVersion();
loadData();
loadAdminSettings();
loadVideos();
loadVersionHistory();

console.log("=".repeat(60));
console.log("🚗 ISUZU DOCTOR BOT ISHGA TUSHDI");
console.log("=".repeat(60));
console.log("📌 Versiya: " + BOT_VERSION);
console.log("👑 Adminlar: " + ADMIN_IDS.join(", "));
console.log("👥 Foydalanuvchilar: " + users.filter(u => !u.isAdmin).length);
console.log("🔧 Diagnostikalar: " + diagnostics.length);
console.log("📹 Videolar: " + videoList.length + " ta");
console.log("💳 Karta: " + CARD_NUMBER);
console.log("📊 Yangilanishlar soni: " + versionHistory.length);
console.log("💾 Volume manzili: " + VOLUME_PATH);
console.log("=".repeat(60));
console.log("✅ Bot ishlashga tayyor!");
