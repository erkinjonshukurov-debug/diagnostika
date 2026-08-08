require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

// ============ KONFIGURATSIYA ============
const BOT_TOKEN = process.env.BOT_TOKEN;

// ADMIN TELEFON RAQAMLARI
const SUPER_ADMIN_PHONE = '+998957978509';
const ADMIN_PHONES = ['+998957978509', '+998979247888'];

// KUZATUVCHI TELEFON RAQAMLARI
const OBSERVER_PHONES = ['+998915425700', '+998902247888'];

let registeredAdminIds = new Set();
let registeredObserverIds = new Set();

const BASE_PRICE = 200000;

// AVTOMOBIL TURLARI
const CAR_TYPES = [
    'CNG', 'D-MAX RG', 'D-MAX RT', 'NPR75', 'HD50',
    'HC45', 'CYZ EXR', 'NQR90', 'NMR77', 'NMR85'
];

// QO'SHIMCHA ISH TURLARI
const EXTRA_WORKS = [
    '🔧 Qo\'shimcha diagnostika',
    '🛠️ Remont ishlari',
    '⚙️ Sozlash ishlari',
    '🔩 Ehtiyot qismlar',
    '📊 Kompyuter diagnostikasi',
    '🔄 Filtr almashtirish',
    '💡 Shlangi tizim',
    '🔋 Elektr tizimi'
];

// ============ TELEFON RAQAMINI TEKSHIRISH ============
function cleanPhone(phone) {
    return phone.replace(/^\+/, '').replace(/\s/g, '');
}

function isAdminPhone(phone) {
    return ADMIN_PHONES.some(p => cleanPhone(p) === cleanPhone(phone));
}

function isObserverPhone(phone) {
    return OBSERVER_PHONES.some(p => cleanPhone(p) === cleanPhone(phone));
}

// ============ AVTOMOBIL RAQAMINI TEKSHIRISH ============
function isValidPlate(plate) {
    if (!plate) return false;
    let cleanPlate = String(plate).toUpperCase().trim();
    cleanPlate = cleanPlate.replace(/\s/g, '');
    cleanPlate = cleanPlate.replace(/[^A-Z0-9]/g, '');
    if (cleanPlate.length < 4 || cleanPlate.length > 10) return false;
    const hasLetter = /[A-Z]/.test(cleanPlate);
    const hasNumber = /[0-9]/.test(cleanPlate);
    return hasLetter && hasNumber;
}

function getCarTypeKeyboard() {
    const buttons = CAR_TYPES.map(type => [Markup.button.callback(type, `car_type_${type}`)]);
    buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_edit')]);
    return Markup.inlineKeyboard(buttons);
}

// ============ MA'LUMOTLAR BAZASI ============
const DB_FILE = path.join(__dirname, 'diagnostics.json');
const ADMIN_FILE = path.join(__dirname, 'admin_ids.json');
const OBSERVER_FILE = path.join(__dirname, 'observer_ids.json');
const PAYMENTS_FILE = path.join(__dirname, 'payments.json');

// Fayllarni yaratish
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(ADMIN_FILE)) fs.writeFileSync(ADMIN_FILE, JSON.stringify({ userIds: [] }, null, 2));
if (!fs.existsSync(OBSERVER_FILE)) fs.writeFileSync(OBSERVER_FILE, JSON.stringify({ userIds: [] }, null, 2));
if (!fs.existsSync(PAYMENTS_FILE)) fs.writeFileSync(PAYMENTS_FILE, JSON.stringify([], null, 2));

// ============ MA'LUMOTLAR BILAN ISHLASH FUNKSIYALARI ============

function loadDiagnostics() {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        return data.sort((a, b) => b.id - a.id);
    } catch(e) {
        return [];
    }
}

function saveDiagnostics(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getAllDiagnostics() {
    return loadDiagnostics();
}

function saveAdminIds(userIds) {
    registeredAdminIds = new Set(userIds);
    fs.writeFileSync(ADMIN_FILE, JSON.stringify({ userIds: Array.from(userIds) }, null, 2));
}

function loadAdminIds() {
    try {
        const data = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
        registeredAdminIds = new Set(data.userIds || []);
    } catch(e) { registeredAdminIds = new Set(); }
}

function saveObserverIds(userIds) {
    registeredObserverIds = new Set(userIds);
    fs.writeFileSync(OBSERVER_FILE, JSON.stringify({ userIds: Array.from(userIds) }, null, 2));
}

function loadObserverIds() {
    try {
        const data = JSON.parse(fs.readFileSync(OBSERVER_FILE, 'utf8'));
        registeredObserverIds = new Set(data.userIds || []);
    } catch(e) { registeredObserverIds = new Set(); }
}

loadAdminIds();
loadObserverIds();

function loadPayments() {
    try {
        return JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    } catch(e) {
        return [];
    }
}

function savePayments(payments) {
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(payments, null, 2));
}

function isDiagnosticPaid(diagnosticId) {
    const payments = loadPayments();
    return payments.some(p => p.diagnostic_id === diagnosticId);
}

function getUnpaidDiagnostics() {
    const diagnostics = loadDiagnostics();
    const diagnosed = diagnostics.filter(d => d.diagnostika === '✅ o‘tkazildi');
    const unpaid = diagnosed.filter(d => !isDiagnosticPaid(d.id));
    return unpaid;
}

function getPaidDiagnostics() {
    const payments = loadPayments();
    const diagnostics = loadDiagnostics();
    const result = [];
    const processedIds = new Set();
    
    const sortedPayments = [...payments].sort((a, b) => {
        const dateA = new Date(a.paid_date);
        const dateB = new Date(b.paid_date);
        return dateB - dateA;
    });
    
    for (const payment of sortedPayments) {
        const diagnostic = diagnostics.find(d => d.id === payment.diagnostic_id);
        if (diagnostic && !processedIds.has(diagnostic.id)) {
            processedIds.add(diagnostic.id);
            result.push({
                ...payment,
                diagnostic: diagnostic
            });
        }
    }
    return result;
}

function removePayment(diagnosticId) {
    const payments = loadPayments();
    const newPayments = payments.filter(p => p.diagnostic_id !== diagnosticId);
    savePayments(newPayments);
}

function addDiagnostic(carNumber, carType, isDiagnosed, adminId, adminName, extraWorks = [], extraAmount = 0) {
    const diagnostics = loadDiagnostics();
    const sana = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
    const diagnostika = isDiagnosed ? "✅ o‘tkazildi" : "❌ o‘tkazilmadi";
    let narxi = 0;
    
    if (isDiagnosed) {
        narxi = BASE_PRICE + extraAmount;
    }
    
    const newDiagnostic = {
        id: Math.floor(Date.now() + Math.random() * 1000000),
        sana,
        raqam: carNumber.toUpperCase(),
        turi: carType,
        diagnostika,
        narxi: narxi,
        base_price: BASE_PRICE,
        extra_works: extraWorks,
        extra_amount: extraAmount,
        admin_id: adminId,
        admin_name: adminName
    };
    
    diagnostics.unshift(newDiagnostic);
    saveDiagnostics(diagnostics);
    return newDiagnostic;
}

function deleteDiagnostic(diagnosticId) {
    const diagnostics = loadDiagnostics();
    const index = diagnostics.findIndex(d => d.id === diagnosticId);
    if (index === -1) return false;
    diagnostics.splice(index, 1);
    saveDiagnostics(diagnostics);
    removePayment(diagnosticId);
    return true;
}

function deleteLastDiagnostic() {
    const diagnostics = loadDiagnostics();
    if (diagnostics.length === 0) return null;
    const removed = diagnostics[0];
    const newDiagnostics = diagnostics.slice(1);
    saveDiagnostics(newDiagnostics);
    removePayment(removed.id);
    return removed;
}

function updateDiagnostic(diagnosticId, updates) {
    const diagnostics = loadDiagnostics();
    const index = diagnostics.findIndex(d => d.id === diagnosticId);
    if (index === -1) return false;
    
    const oldDiagnostic = diagnostics[index];
    
    if (updates.diagnostika && updates.diagnostika !== oldDiagnostic.diagnostika) {
        if (isDiagnosticPaid(diagnosticId)) {
            removePayment(diagnosticId);
        }
    }
    
    diagnostics[index] = { ...oldDiagnostic, ...updates };
    saveDiagnostics(diagnostics);
    return true;
}

function findDiagnosticById(diagnosticId) {
    const diagnostics = loadDiagnostics();
    return diagnostics.find(d => d.id === diagnosticId);
}

function getStats() {
    const diagnostics = loadDiagnostics();
    const diagnosed = diagnostics.filter(d => d.diagnostika.includes('o‘tkazildi'));
    const notDiagnosed = diagnostics.filter(d => d.diagnostika.includes('o‘tkazilmadi'));
    const totalSum = diagnosed.reduce((sum, d) => sum + d.narxi, 0);
    
    const paidDiagnostics = getPaidDiagnostics();
    const paidSum = paidDiagnostics.reduce((sum, p) => sum + p.amount, 0);
    const remainingSum = totalSum - paidSum;
    const paidCount = paidDiagnostics.length;
    
    return { 
        total: diagnostics.length, 
        diagnosed: diagnosed.length, 
        notDiagnosed: notDiagnosed.length, 
        totalSum, 
        paidSum, 
        remainingSum, 
        paidCount 
    };
}

function getTotalDiagnosedSum() {
    const diagnostics = loadDiagnostics();
    const diagnosed = diagnostics.filter(d => d.diagnostika.includes('o‘tkazildi'));
    return diagnosed.reduce((sum, d) => sum + d.narxi, 0);
}

function getPaidSum() {
    const paidDiagnostics = getPaidDiagnostics();
    return paidDiagnostics.reduce((sum, p) => sum + p.amount, 0);
}

// ============ XABAR YUBORISH ============
let botInstance = null;

async function sendToAllObservers(message, options = {}) {
    for (const observerId of registeredObserverIds) {
        try {
            await botInstance.telegram.sendMessage(observerId, message, options);
        } catch (err) {
            console.error(`Kuzatuvchi ${observerId} ga xabar yuborilmadi:`, err.message);
        }
    }
}

async function sendToAllAdmins(message, options = {}) {
    for (const adminId of registeredAdminIds) {
        try {
            await botInstance.telegram.sendMessage(adminId, message, options);
        } catch (err) {
            console.error(`Admin ${adminId} ga xabar yuborilmadi:`, err.message);
        }
    }
}

// ============ BOT ============
const bot = new Telegraf(BOT_TOKEN);
botInstance = bot;

function isSuperAdminById(ctx) {
    const userId = ctx.from.id;
    const adminIds = Array.from(registeredAdminIds);
    return adminIds.length > 0 && adminIds[0] === userId;
}

function isAdminById(ctx) {
    return registeredAdminIds.has(ctx.from.id);
}

function isObserverById(ctx) {
    return registeredObserverIds.has(ctx.from.id);
}

function isAllowed(ctx) {
    return isAdminById(ctx) || isObserverById(ctx);
}

function getMainMenu(ctx) {
    if (isSuperAdminById(ctx)) {
        return Markup.keyboard([
            ['🚗 Diagnostika qo\'shish', '✏️ Ma\'lumot tahrirlash'],
            ['🗑️ Diagnostika o\'chirish', '📊 Statistika'],
            ['💰 Jami summa', '📋 Diagnostikalar'],
            ['✅ To\'langanlar', '💵 To\'lovni tasdiqlash'],
            ['➕ Qo\'shimcha summa qo\'shish'],
            ['💾 Backup olish', '🔄 Backup tiklash'],
            ['🔍 Diagnostikani raqam bo\'yicha qidirish']
        ]).resize();
    } else if (isAdminById(ctx)) {
        return Markup.keyboard([
            ['🚗 Diagnostika qo\'shish', '✏️ Ma\'lumot tahrirlash'],
            ['➕ Qo\'shimcha summa qo\'shish', '⬅️ Oxirgi diagnostikani o\'chirish'],
            ['🔍 Diagnostikani raqam bo\'yicha qidirish']
        ]).resize();
    } else if (isObserverById(ctx)) {
        return Markup.keyboard([
            ['💰 Jami summa', '📋 Diagnostikalar', '✅ To\'langanlar']
        ]).resize();
    }
    return null;
}

// ============ BARCHA HANDLERLAR ============

// START
bot.command('start', async (ctx) => {
    if (isAllowed(ctx)) {
        let msg = isSuperAdminById(ctx) ? `👑 Assalomu alaykum SUPER ADMIN ${ctx.from.first_name}!` :
                  isAdminById(ctx) ? `👋 Assalomu alaykum Admin ${ctx.from.first_name}!` :
                  `👋 Assalomu alaykum Kuzatuvchi ${ctx.from.first_name}!`;
        await ctx.reply(msg + `\n\n✅ Bot ishga tushdi.\n💰 *Asosiy diagnostika narxi:* ${BASE_PRICE.toLocaleString()} so‘m\n🔄 *Eng yangi diagnostikalar birinchi ko‘rinadi*\n\n⚠️ *Eslatma:* Har bir kirim yangi diagnostika sifatida qo‘shiladi va unikal ID ga ega.`, { parse_mode: 'Markdown', ...getMainMenu(ctx) });
        return;
    }
    await ctx.reply(`❌ Ro‘yxatdan o‘tmagansiz.\n\n📞 Iltimos, telefon raqamingizni yuboring:`, Markup.keyboard([[Markup.button.contactRequest('📞 Telefon raqamni yuborish')]]).resize());
});

// CONTACT
bot.on('contact', async (ctx) => {
    const phone = ctx.message.contact.phone_number;
    const userId = ctx.from.id;
    const userName = ctx.from.first_name;
    
    if (isAdminPhone(phone)) {
        if (!registeredAdminIds.has(userId)) {
            registeredAdminIds.add(userId);
            saveAdminIds(Array.from(registeredAdminIds));
            await ctx.reply(`✅ Siz ADMIN sifatida tasdiqlandingiz!\n📞 Raqamingiz: ${phone}`, getMainMenu(ctx));
            await sendToAllAdmins(`🆕 Yangi admin qo'shildi!\n👤 ${userName}\n📞 ${phone}`);
        } else {
            await ctx.reply(`✅ Siz allaqachon ADMIN sifatida tasdiqlangansiz!`, getMainMenu(ctx));
        }
        return;
    }
    
    if (isObserverPhone(phone)) {
        if (!registeredObserverIds.has(userId)) {
            registeredObserverIds.add(userId);
            saveObserverIds(Array.from(registeredObserverIds));
            await ctx.reply(`✅ Siz KUZATUVCHI sifatida tasdiqlandingiz!\n📞 Raqamingiz: ${phone}`, getMainMenu(ctx));
            await sendToAllAdmins(`🆕 Yangi kuzatuvchi qo'shildi!\n👤 ${userName}\n📞 ${phone}`);
        } else {
            await ctx.reply(`✅ Siz allaqachon KUZATUVCHI sifatida tasdiqlangansiz!`, getMainMenu(ctx));
        }
        return;
    }
    
    await ctx.reply(`❌ Sizning raqamingiz (${phone}) ro'yxatda yo'q.\n\n📞 Admin raqamlari: ${ADMIN_PHONES.join(', ')}\n📞 Kuzatuvchi raqamlari: ${OBSERVER_PHONES.join(', ')}`);
});

// ============ DIAGNOSTIKALAR RO'YXATI ============
async function showAllDiagnostics(ctx, page = 0) {
    const diagnostics = getAllDiagnostics();
    
    if (!diagnostics || diagnostics.length === 0) {
        await ctx.reply('📋 Hali hech qanday diagnostika qo‘shilmagan.');
        return;
    }
    
    const itemsPerPage = 5;
    const totalPages = Math.ceil(diagnostics.length / itemsPerPage);
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageDiagnostics = diagnostics.slice(start, end);
    
    let message = '🚗 *DIAGNOSTIKALAR RO\'YXATI*\n';
    message += `📊 *Jami:* ${diagnostics.length} ta | 📄 *Sahifa ${page + 1}/${totalPages}*\n`;
    message += `🔄 *Eng yangisi birinchi ko‘rinadi*\n\n`;
    
    for (let idx = 0; idx < pageDiagnostics.length; idx++) {
        const d = pageDiagnostics[idx];
        const num = start + idx + 1;
        
        const isPaid = isDiagnosticPaid(d.id);
        const paidIcon = isPaid ? '✅' : '⏳';
        const paidText = isPaid ? 'To‘langan' : 'To‘lov kutilmoqda';
        
        message += `${num}. *${d.raqam}* | ${d.turi}\n`;
        message += `   🆔 ID: \`${d.id}\`\n`;
        message += `   💰 ${d.narxi.toLocaleString()} so‘m | ${paidIcon} ${paidText}\n`;
        
        if (d.diagnostika === '✅ o‘tkazildi') {
            message += `   🔧 Holat: ✅ Diagnostika o‘tkazildi\n`;
        } else {
            message += `   🔧 Holat: ❌ Diagnostika o‘tkazilmadi\n`;
        }
        
        if (d.extra_works && d.extra_works.length > 0) {
            message += `   📋 Qo‘shimcha: ${d.extra_works.join(', ')}\n`;
            message += `   ➕ Qo‘shimcha summa: +${(d.extra_amount || 0).toLocaleString()} so‘m\n`;
        }
        message += `   📅 Sana: ${d.sana}\n`;
        message += `   👤 Admin: ${d.admin_name}\n\n`;
    }
    
    const diagnosedSum = getTotalDiagnosedSum();
    const paidSum = getPaidSum();
    
    message += `💰 *Jami diagnostika summasi:* ${diagnosedSum.toLocaleString()} so‘m\n`;
    message += `💵 *To‘langan summa:* ${paidSum.toLocaleString()} so‘m\n`;
    message += `📉 *Qolgan qoldiq:* ${(diagnosedSum - paidSum).toLocaleString()} so‘m`;
    
    const navButtons = [];
    if (page > 0) navButtons.push(Markup.button.callback('◀️ Oldingi', `diagnostics_page_${page - 1}`));
    if (end < diagnostics.length) navButtons.push(Markup.button.callback('Keyingi ▶️', `diagnostics_page_${page + 1}`));
    navButtons.push(Markup.button.callback('❌ Yopish', 'close_diagnostics'));
    
    await ctx.reply(message, { 
        parse_mode: 'Markdown', 
        ...Markup.inlineKeyboard([navButtons]) 
    });
}

bot.action(/diagnostics_page_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    await showAllDiagnostics(ctx, page);
    await ctx.answerCbQuery();
});

bot.action('close_diagnostics', async (ctx) => {
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
});

// ============ TO'LANGAN DIAGNOSTIKALAR ============
async function showPaidDiagnostics(ctx, page = 0) {
    const paidDiagnostics = getPaidDiagnostics();
    if (paidDiagnostics.length === 0) {
        await ctx.reply('📋 Hali hech qanday to‘lov tasdiqlanmagan.');
        return;
    }
    
    const itemsPerPage = 5;
    const totalPages = Math.ceil(paidDiagnostics.length / itemsPerPage);
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageItems = paidDiagnostics.slice(start, end);
    
    let message = '✅ *TO‘LANGAN DIAGNOSTIKALAR*\n';
    message += `📊 *Jami:* ${paidDiagnostics.length} ta | 📄 *Sahifa ${page + 1}/${totalPages}*\n`;
    message += `🔄 *Eng yangi to‘langanlar birinchi ko‘rinadi*\n\n`;
    
    pageItems.forEach((item, idx) => {
        const num = start + idx + 1;
        const d = item.diagnostic;
        message += `${num}. *${d.raqam}* | ${d.turi}\n`;
        message += `   🆔 ID: \`${d.id}\`\n`;
        message += `   💰 ${item.amount.toLocaleString()} so‘m\n`;
        message += `   📅 To‘langan vaqt: ${item.paid_date}\n`;
        message += `   👤 Admin: ${item.admin_name}\n\n`;
    });
    
    const totalPaidSum = paidDiagnostics.reduce((sum, p) => sum + p.amount, 0);
    message += `💰 *Jami to‘langan summa:* ${totalPaidSum.toLocaleString()} so‘m`;
    
    const navButtons = [];
    if (page > 0) navButtons.push(Markup.button.callback('◀️ Oldingi', `paid_page_${page - 1}`));
    if (end < paidDiagnostics.length) navButtons.push(Markup.button.callback('Keyingi ▶️', `paid_page_${page + 1}`));
    navButtons.push(Markup.button.callback('❌ Yopish', 'close_paid'));
    
    await ctx.reply(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([navButtons]) });
}

bot.action(/paid_page_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    await showPaidDiagnostics(ctx, page);
    await ctx.answerCbQuery();
});

bot.action('close_paid', async (ctx) => {
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
});

// ============ TO'LOVNI TASDIQLASH ============
let userSelections = new Map();

async function showUnpaidDiagnosticsMenu(ctx, page = 0) {
    const unpaidDiagnostics = getUnpaidDiagnostics();
    if (unpaidDiagnostics.length === 0) {
        await ctx.reply('✅ Barcha diagnostikalar uchun to‘lov qilingan!');
        return;
    }
    
    const itemsPerPage = 5;
    const totalPages = Math.ceil(unpaidDiagnostics.length / itemsPerPage);
    let currentPage = page;
    if (currentPage < 0) currentPage = 0;
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    
    const start = currentPage * itemsPerPage;
    const end = Math.min(start + itemsPerPage, unpaidDiagnostics.length);
    const pageItems = unpaidDiagnostics.slice(start, end);
    
    if (!userSelections.has(ctx.from.id)) {
        userSelections.set(ctx.from.id, { selected: new Set(), currentPage: currentPage, messageId: null });
    }
    const userData = userSelections.get(ctx.from.id);
    userData.currentPage = currentPage;
    
    let message = '💰 *TO‘LOV QILINMAGAN DIAGNOSTIKALAR*\n\n';
    message += `📄 *Sahifa ${currentPage + 1}/${totalPages}* | Jami: ${unpaidDiagnostics.length} ta\n\n`;
    
    const selectButtons = [];
    for (let i = 0; i < pageItems.length; i++) {
        const d = pageItems[i];
        const globalNum = start + i + 1;
        const isSelected = userData.selected.has(d.id);
        const checkbox = isSelected ? '☑️' : '⬜';
        message += `${checkbox} *${globalNum}.* 🚗 ${d.raqam} | ${d.turi}\n`;
        message += `   💰 ${d.narxi.toLocaleString()} so‘m`;
        if (d.extra_works && d.extra_works.length > 0) {
            message += ` (+${(d.extra_amount || 0).toLocaleString()} so‘m)`;
        }
        message += `\n   📅 Sana: ${d.sana}\n\n`;
        
        selectButtons.push([
            Markup.button.callback(
                `${isSelected ? '❌' : '✅'} ${d.raqam}`,
                `select_diagnostic_${d.id}`
            )
        ]);
    }
    
    const remainingSum = unpaidDiagnostics.reduce((s, d) => s + d.narxi, 0);
    message += `📊 *Jami to‘lov qilinmagan:* ${remainingSum.toLocaleString()} so‘m`;
    message += `\n✅ *Tanlanganlar:* ${userData.selected.size} ta`;
    
    const navButtons = [];
    if (currentPage > 0) navButtons.push(Markup.button.callback('◀️ Oldingi', 'unpaid_prev'));
    if (currentPage + 1 < totalPages) navButtons.push(Markup.button.callback('Keyingi ▶️', 'unpaid_next'));
    
    const paidCount = getPaidDiagnostics().length;
    if (paidCount > 0) navButtons.push(Markup.button.callback(`✅ To‘langanlar (${paidCount} ta)`, 'unpaid_view_paid'));
    
    const confirmButtons = [];
    if (userData.selected.size > 0) confirmButtons.push([Markup.button.callback(`✅ Tasdiqlash (${userData.selected.size} ta)`, 'unpaid_confirm')]);
    confirmButtons.push([Markup.button.callback('❌ Bekor qilish', 'unpaid_cancel')]);
    
    const allButtons = [...selectButtons];
    if (navButtons.length > 0) allButtons.push(navButtons);
    allButtons.push(...confirmButtons);
    
    if (userData.messageId) {
        try { await ctx.deleteMessage(userData.messageId); } catch(e) {}
    }
    const sentMsg = await ctx.reply(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(allButtons) });
    userData.messageId = sentMsg.message_id;
    userSelections.set(ctx.from.id, userData);
}

bot.action(/select_diagnostic_(\d+)/, async (ctx) => {
    if (!isSuperAdminById(ctx)) {
        await ctx.answerCbQuery('❌ Sizda bu amalni bajarish huquqi yo\'q!');
        return;
    }
    
    const diagnosticId = Number(ctx.match[1]);
    const userData = userSelections.get(ctx.from.id);
    if (!userData) {
        await ctx.answerCbQuery('❌ Jarayon qaytadan boshlang!');
        return;
    }
    
    const diagnostics = loadDiagnostics();
    const diagnostic = diagnostics.find(d => d.id === diagnosticId);
    if (!diagnostic) {
        await ctx.answerCbQuery('❌ Diagnostika topilmadi!');
        return;
    }
    
    if (isDiagnosticPaid(diagnosticId)) {
        await ctx.answerCbQuery('❌ Bu diagnostika allaqachon to\'langan!');
        userData.selected.delete(diagnosticId);
        userSelections.set(ctx.from.id, userData);
        await showUnpaidDiagnosticsMenu(ctx, userData.currentPage);
        return;
    }
    
    if (userData.selected.has(diagnosticId)) {
        userData.selected.delete(diagnosticId);
    } else {
        userData.selected.add(diagnosticId);
    }
    userSelections.set(ctx.from.id, userData);
    await showUnpaidDiagnosticsMenu(ctx, userData.currentPage);
    await ctx.answerCbQuery();
});

bot.action('unpaid_prev', async (ctx) => {
    if (!isSuperAdminById(ctx)) {
        await ctx.answerCbQuery('❌ Sizda bu amalni bajarish huquqi yo\'q!');
        return;
    }
    const userData = userSelections.get(ctx.from.id);
    const currentPage = userData ? userData.currentPage : 0;
    await showUnpaidDiagnosticsMenu(ctx, currentPage - 1);
    await ctx.answerCbQuery();
});

bot.action('unpaid_next', async (ctx) => {
    if (!isSuperAdminById(ctx)) {
        await ctx.answerCbQuery('❌ Sizda bu amalni bajarish huquqi yo\'q!');
        return;
    }
    const userData = userSelections.get(ctx.from.id);
    const currentPage = userData ? userData.currentPage : 0;
    await showUnpaidDiagnosticsMenu(ctx, currentPage + 1);
    await ctx.answerCbQuery();
});

bot.action('unpaid_confirm', async (ctx) => {
    if (!isSuperAdminById(ctx)) {
        await ctx.answerCbQuery('❌ Sizda bu amalni bajarish huquqi yo\'q!');
        return;
    }
    
    const userData = userSelections.get(ctx.from.id);
    if (!userData || userData.selected.size === 0) {
        await ctx.answerCbQuery('Hech qanday diagnostika tanlanmagan!');
        await ctx.reply('❌ Iltimos, kamida bitta diagnostika tanlang!');
        return;
    }
    
    const selectedIds = Array.from(userData.selected);
    const diagnostics = loadDiagnostics();
    const selectedDiagnostics = diagnostics.filter(d => selectedIds.includes(d.id) && !isDiagnosticPaid(d.id));
    
    if (selectedDiagnostics.length === 0) {
        await ctx.reply('❌ Tanlangan diagnostikalar allaqachon to\'langan yoki topilmadi!');
        userSelections.delete(ctx.from.id);
        await ctx.answerCbQuery();
        return;
    }
    
    let payments = loadPayments();
    let totalAmount = 0;
    const newPayments = [];
    const adminName = ctx.from.first_name;
    const notPaid = [];
    
    for (const diagnostic of selectedDiagnostics) {
        const paidDate = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
        const payment = {
            id: Math.floor(Date.now() + Math.random() * 1000),
            diagnostic_id: diagnostic.id,
            car_number: diagnostic.raqam,
            amount: diagnostic.narxi,
            admin_name: adminName,
            paid_date: paidDate
        };
        newPayments.push(payment);
        notPaid.push(diagnostic);
        totalAmount += diagnostic.narxi;
    }
    
    if (newPayments.length > 0) {
        savePayments([...payments, ...newPayments]);
    }
    
    const totalDiagnosed = getTotalDiagnosedSum();
    const newPaidSum = getPaidSum();
    const remainingSum = totalDiagnosed - newPaidSum;
    
    let diagnosticsList = '';
    notPaid.forEach((d, idx) => {
        diagnosticsList += `${idx + 1}. 🚗 ${d.raqam} | ${d.turi} | ${d.narxi.toLocaleString()} so‘m\n`;
    });
    
    await sendToAllObservers(
        `✅ *TO‘LOV TASDIQLANDI!*\n\n` +
        `🚗 *To‘lov qilingan diagnostikalar:*\n${diagnosticsList}\n` +
        `💰 *Jami summa:* ${totalAmount.toLocaleString()} so‘m\n` +
        `👤 *Admin:* ${ctx.from.first_name}\n\n` +
        `📊 *Jami diagnostika summasi:* ${totalDiagnosed.toLocaleString()} so‘m\n` +
        `💵 *To‘lov qilingan umumiy summa:* ${newPaidSum.toLocaleString()} so‘m\n` +
        `📉 *Qolgan qoldiq:* ${remainingSum.toLocaleString()} so‘m`,
        { parse_mode: 'Markdown' }
    );
    
    if (userData.messageId) { 
        try { await ctx.deleteMessage(userData.messageId); } catch(e) {} 
    }
    userSelections.delete(ctx.from.id);
    
    let successMsg = `✅ *TO‘LOV TASDIQLANDI!*\n\n`;
    successMsg += `🚗 *To‘lov qilingan diagnostikalar:*\n${diagnosticsList}\n`;
    successMsg += `💰 *Jami summa:* ${totalAmount.toLocaleString()} so‘m\n\n`;
    successMsg += `📊 *Yangi statistika:*\n`;
    successMsg += `💵 Jami to'langan: ${newPaidSum.toLocaleString()} so‘m\n`;
    successMsg += `📉 Qolgan qoldiq: ${remainingSum.toLocaleString()} so‘m`;
    
    await ctx.reply(successMsg, { parse_mode: 'Markdown' });
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    await ctx.answerCbQuery();
});

bot.action('unpaid_cancel', async (ctx) => {
    const userData = userSelections.get(ctx.from.id);
    if (userData && userData.messageId) { 
        try { await ctx.deleteMessage(userData.messageId); } catch(e) {} 
    }
    userSelections.delete(ctx.from.id);
    await ctx.reply('❌ Bekor qilindi');
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    await ctx.answerCbQuery();
});

bot.action('unpaid_view_paid', async (ctx) => {
    await showPaidDiagnostics(ctx, 0);
    await ctx.answerCbQuery();
});

// ============ TAHRIRLASH FUNKSIYALARI ============
let editSteps = new Map();

async function showEditMenu(ctx, diagnosticId) {
    const diagnostic = findDiagnosticById(diagnosticId);
    if (!diagnostic) {
        await ctx.reply(`❌ Diagnostika topilmadi.`);
        return;
    }
    
    editSteps.set(ctx.from.id, { diagnosticId: diagnostic.id, step: 'main' });
    
    const isPaid = isDiagnosticPaid(diagnostic.id);
    const paidStatus = isPaid ? '✅ To‘langan' : '⏳ To‘lanmagan';
    
    let message = `✏️ *DIAGNOSTIKA MA'LUMOTLARINI TAHRIRLASH*\n\n`;
    message += `🆔 *ID:* ${diagnostic.id}\n`;
    message += `🚗 *Raqam:* ${diagnostic.raqam}\n`;
    message += `🏷️ *Turi:* ${diagnostic.turi}\n`;
    message += `🔧 *Diagnostika:* ${diagnostic.diagnostika}\n`;
    message += `💵 *To‘lov holati:* ${paidStatus}\n`;
    message += `💰 *Asosiy narx:* ${diagnostic.base_price?.toLocaleString() || BASE_PRICE.toLocaleString()} so‘m\n`;
    
    if (diagnostic.extra_works && diagnostic.extra_works.length > 0) {
        message += `📋 *Qo‘shimcha ishlar:* ${diagnostic.extra_works.join(', ')}\n`;
        message += `➕ *Qo‘shimcha summa:* ${(diagnostic.extra_amount || 0).toLocaleString()} so‘m\n`;
    } else {
        message += `📋 *Qo‘shimcha ishlar:* Yo‘q\n`;
    }
    
    message += `💎 *Jami summa:* ${diagnostic.narxi.toLocaleString()} so‘m\n`;
    message += `📅 *Sana:* ${diagnostic.sana}\n\n`;
    message += `*Qaysi ma'lumotni tahrirlamoqchisiz?*`;
    
    await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🚗 Avtomobil raqami', 'edit_number')],
            [Markup.button.callback('🏷️ Avtomobil turi', 'edit_type')],
            [Markup.button.callback('🔧 Diagnostika holati', 'edit_diagnosis')],
            [Markup.button.callback('📋 Qo‘shimcha ishlar', 'edit_extra_works')],
            [Markup.button.callback('❌ Bekor qilish', 'cancel_edit')]
        ])
    });
}

bot.action('edit_number', async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData) return;
    editData.step = 'edit_number';
    editSteps.set(ctx.from.id, editData);
    await ctx.editMessageText(
        `✏️ *Yangi avtomobil raqamini kiriting:*\n\nHozirgi raqam: ${findDiagnosticById(editData.diagnosticId)?.raqam}\n\n✅ *Misol:* 01A777AA`,
        { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
});

bot.action('edit_type', async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData) return;
    editData.step = 'edit_type';
    editSteps.set(ctx.from.id, editData);
    await ctx.editMessageText(
        `✏️ *Yangi avtomobil turini tanlang:*\n\nHozirgi turi: ${findDiagnosticById(editData.diagnosticId)?.turi}`,
        { parse_mode: 'Markdown', ...getCarTypeKeyboard() }
    );
    await ctx.answerCbQuery();
});

bot.action('edit_diagnosis', async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData) return;
    await ctx.editMessageText(
        `✏️ *Diagnostika holatini tanlang:*\n\nHozirgi holat: ${findDiagnosticById(editData.diagnosticId)?.diagnostika}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ O‘tkazildi', 'set_diag_yes')],
                [Markup.button.callback('❌ O‘tkazilmadi', 'set_diag_no')],
                [Markup.button.callback('🔙 Orqaga', 'back_to_edit_menu')]
            ])
        }
    );
    await ctx.answerCbQuery();
});

bot.action('edit_extra_works', async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData) return;
    const diagnostic = findDiagnosticById(editData.diagnosticId);
    const currentWorks = diagnostic.extra_works || [];
    editData.step = 'edit_extra';
    editData.currentExtra = [...currentWorks];
    editSteps.set(ctx.from.id, editData);
    
    let message = `✏️ *QO‘SHIMCHA ISHLARNI TAHRIRLASH*\n\n`;
    message += `🚗 Avtomobil: ${diagnostic.raqam}\n`;
    message += `💰 Asosiy narx: ${BASE_PRICE.toLocaleString()} so‘m\n\n`;
    message += `*Tanlangan qo‘shimcha ishlar:*\n`;
    if (currentWorks.length === 0) message += `❌ Hali hech narsa tanlanmagan\n\n`;
    else currentWorks.forEach(w => message += `✅ ${w}\n`);
    message += `\n*Qo‘shimcha ishlarni tanlang yoki tugatish tugmasini bosing:*`;
    
    const buttons = EXTRA_WORKS.map(work => {
        const isSelected = currentWorks.includes(work);
        return [Markup.button.callback(`${isSelected ? '☑️' : '⬜'} ${work}`, `edit_extra_${work.replace(/\s/g, '_')}`)];
    });
    buttons.push([Markup.button.callback('✅ Tugatish', 'finish_edit_extra')]);
    buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_edit')]);
    await ctx.editMessageText(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    await ctx.answerCbQuery();
});

bot.action(/edit_extra_(.+)/, async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData || editData.step !== 'edit_extra') return;
    const work = ctx.match[1].replace(/_/g, ' ');
    const currentWorks = editData.currentExtra || [];
    if (currentWorks.includes(work)) {
        const index = currentWorks.indexOf(work);
        currentWorks.splice(index, 1);
    } else {
        currentWorks.push(work);
    }
    editData.currentExtra = currentWorks;
    editSteps.set(ctx.from.id, editData);
    
    const diagnostic = findDiagnosticById(editData.diagnosticId);
    let message = `✏️ *QO‘SHIMCHA ISHLARNI TAHRIRLASH*\n\n`;
    message += `🚗 Avtomobil: ${diagnostic.raqam}\n`;
    message += `💰 Asosiy narx: ${BASE_PRICE.toLocaleString()} so‘m\n\n`;
    message += `*Tanlangan qo‘shimcha ishlar:*\n`;
    if (currentWorks.length === 0) message += `❌ Hali hech narsa tanlanmagan\n\n`;
    else currentWorks.forEach(w => message += `✅ ${w}\n`);
    message += `\n*Qo‘shimcha ishlarni tanlang yoki tugatish tugmasini bosing:*`;
    
    const buttons = EXTRA_WORKS.map(work => {
        const isSelected = currentWorks.includes(work);
        return [Markup.button.callback(`${isSelected ? '☑️' : '⬜'} ${work}`, `edit_extra_${work.replace(/\s/g, '_')}`)];
    });
    buttons.push([Markup.button.callback('✅ Tugatish', 'finish_edit_extra')]);
    buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_edit')]);
    await ctx.editMessageText(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    await ctx.answerCbQuery();
});

bot.action('finish_edit_extra', async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData || editData.step !== 'edit_extra') return;
    editData.step = 'waiting_extra_amount';
    editSteps.set(ctx.from.id, editData);
    await ctx.editMessageText(
        `✏️ *QO'SHIMCHA ISH SUMMASINI KIRITING*\n\nTanlangan ishlar: ${editData.currentExtra.join(', ') || 'Yo‘q'}\n💰 Asosiy narx: ${BASE_PRICE.toLocaleString()} so‘m\n➕ Qo‘shimcha summa (faqat raqam):\nMisol: 50000\n⚠️ Agar qo‘shimcha summa bo‘lmasa, 0 yoki "yo‘q" deb yozing`,
        { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
});

bot.action('set_diag_yes', async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData) return;
    const diagnostic = findDiagnosticById(editData.diagnosticId);
    if (!diagnostic) {
        await ctx.answerCbQuery('❌ Diagnostika topilmadi!');
        return;
    }
    
    let newNarxi = diagnostic.narxi;
    if (diagnostic.diagnostika === '❌ o‘tkazilmadi') {
        newNarxi = BASE_PRICE + (diagnostic.extra_amount || 0);
    }
    
    updateDiagnostic(editData.diagnosticId, { 
        diagnostika: "✅ o‘tkazildi",
        narxi: newNarxi
    });
    await ctx.editMessageText(`✅ Diagnostika holati "O‘tkazildi" ga o‘zgartirildi!\n💰 Yangi narx: ${newNarxi.toLocaleString()} so‘m`);
    await showEditMenu(ctx, editData.diagnosticId);
    await ctx.answerCbQuery();
});

bot.action('set_diag_no', async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData) return;
    const diagnostic = findDiagnosticById(editData.diagnosticId);
    if (!diagnostic) {
        await ctx.answerCbQuery('❌ Diagnostika topilmadi!');
        return;
    }
    
    updateDiagnostic(editData.diagnosticId, { 
        diagnostika: "❌ o‘tkazilmadi", 
        narxi: 0 
    });
    removePayment(editData.diagnosticId);
    await ctx.editMessageText(`❌ Diagnostika holati "O‘tkazilmadi" ga o‘zgartirildi!\n💰 Narx: 0 so‘m`);
    await showEditMenu(ctx, editData.diagnosticId);
    await ctx.answerCbQuery();
});

bot.action('back_to_edit_menu', async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData) return;
    await showEditMenu(ctx, editData.diagnosticId);
    await ctx.answerCbQuery();
});

bot.action('cancel_edit', async (ctx) => {
    editSteps.delete(ctx.from.id);
    await ctx.editMessageText('❌ Tahrirlash bekor qilindi');
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    await ctx.answerCbQuery();
});

// ============ MENYU TUGMALARI ============
const addSteps = new Map();
const deleteSteps = new Map();
const extraAmountSteps = new Map();
const searchSteps = new Map();
let selectedExtraWorks = new Map();

bot.hears('💵 To\'lovni tasdiqlash', async (ctx) => {
    if (!isSuperAdminById(ctx)) {
        await ctx.reply('❌ Bu amal faqat SUPER ADMIN uchun!');
        return;
    }
    await showUnpaidDiagnosticsMenu(ctx, 0);
});

bot.hears('📋 Diagnostikalar', async (ctx) => {
    if (!isAllowed(ctx)) return;
    await showAllDiagnostics(ctx, 0);
});

bot.hears('✅ To\'langanlar', async (ctx) => {
    if (!isAllowed(ctx)) return;
    await showPaidDiagnostics(ctx, 0);
});

bot.hears('💰 Jami summa', async (ctx) => {
    if (!isAllowed(ctx)) return;
    const total = getTotalDiagnosedSum();
    const paidSum = getPaidSum();
    const remaining = total - paidSum;
    await ctx.reply(`💰 *SUMMA HISOBOTI*\n\n💰 *Asosiy narx:* ${BASE_PRICE.toLocaleString()} so‘m\n📊 *Jami diagnostika summasi:* ${total.toLocaleString()} so‘m\n💵 *To‘lov qilingan:* ${paidSum.toLocaleString()} so‘m\n📉 *Qoldiq:* ${remaining.toLocaleString()} so‘m`, { parse_mode: 'Markdown' });
});

bot.hears('📊 Statistika', async (ctx) => {
    if (!isSuperAdminById(ctx)) return;
    const s = getStats();
    await ctx.reply(`📊 *STATISTIKA*\n\n🚗 *Jami diagnostikalar:* ${s.total}\n✅ *Diagnostika qilingan:* ${s.diagnosed}\n❌ *Qilinmagan:* ${s.notDiagnosed}\n💵 *To‘langan diagnostikalar:* ${s.paidCount} ta\n\n💰 *Jami diagnostika summasi:* ${s.totalSum.toLocaleString()} so‘m\n💵 *To‘lov qilingan summa:* ${s.paidSum.toLocaleString()} so‘m\n📉 *Qolgan qoldiq:* ${s.remainingSum.toLocaleString()} so‘m`, { parse_mode: 'Markdown' });
});

bot.hears('⬅️ Oxirgi diagnostikani o\'chirish', async (ctx) => {
    if (!isAdminById(ctx)) return;
    const deleted = deleteLastDiagnostic();
    await ctx.reply(deleted ? `✅ Oxirgi diagnostika o‘chirildi:\n🚗 ${deleted.raqam} | ${deleted.turi} | ID: ${deleted.id}` : `❌ Hech qanday diagnostika yo‘q.`);
});

bot.hears('🚗 Diagnostika qo\'shish', async (ctx) => {
    if (!isAdminById(ctx)) return;
    addSteps.set(ctx.from.id, { step: 'number' });
    await ctx.reply(`📝 *1-qadam:* Avtomobil raqamini kiriting\n\n💰 *Asosiy diagnostika narxi:* ${BASE_PRICE.toLocaleString()} so‘m\n\n✅ *Misol:* 01A777AA yoki A777AA\n\n⚠️ *Eslatma:* Har bir kirim yangi diagnostika sifatida qo‘shiladi`, { parse_mode: 'Markdown' });
});

bot.hears('✏️ Ma\'lumot tahrirlash', async (ctx) => {
    if (!isAdminById(ctx)) return;
    deleteSteps.set(ctx.from.id, { step: 'edit_diagnostic_id' });
    await ctx.reply(`✏️ *TAHRIRLANADIGAN DIAGNOSTIKA ID SINI KIRITING*\n\n✅ *Misol:* 123456789\n⚠️ Faqat bazada mavjud diagnostikalarni tahrirlash mumkin.`, { parse_mode: 'Markdown' });
});

bot.hears('🗑️ Diagnostika o\'chirish', async (ctx) => {
    if (!isSuperAdminById(ctx)) return;
    deleteSteps.set(ctx.from.id, { step: 'delete_diagnostic' });
    await ctx.reply('🗑️ *O‘chiriladigan diagnostika ID sini kiriting:*\n\n✅ *Misol:* 123456789', { parse_mode: 'Markdown' });
});

bot.hears('🔍 Diagnostikani raqam bo\'yicha qidirish', async (ctx) => {
    if (!isAllowed(ctx)) return;
    searchSteps.set(ctx.from.id, { step: 'search_plate' });
    await ctx.reply(
        '🔍 *DIAGNOSTIKANI RAQAM BO\'YICHA QIDIRISH*\n\n' +
        'Iltimos, avtomobil raqamini kiriting:\n\n' +
        '✅ *Misol:* 01A777AA yoki A777AA\n' +
        '❌ *Bekor qilish:* /cancel',
        { parse_mode: 'Markdown' }
    );
});

bot.hears('➕ Qo\'shimcha summa qo\'shish', async (ctx) => {
    if (!isAdminById(ctx)) return;
    
    const diagnostics = loadDiagnostics();
    const recent = diagnostics.slice(0, 10);
    
    let msg = `➕ *QO'SHIMCHA SUMMA QO'SHISH*\n\n`;
    msg += `Qo'shimcha summa qo'shiladigan diagnostika ID sini kiriting:\n\n`;
    msg += `📋 *Oxirgi 10 ta diagnostika:*\n`;
    recent.forEach((d, idx) => {
        const isPaid = isDiagnosticPaid(d.id);
        msg += `${idx + 1}. 🚗 ${d.raqam} | ID: \`${d.id}\` | ${d.narxi.toLocaleString()} so‘m ${isPaid ? '✅' : '⏳'}\n`;
    });
    msg += `\n✅ *Misol:* 123456789\n`;
    msg += `❌ *Bekor qilish:* /cancel`;
    
    extraAmountSteps.set(ctx.from.id, { step: 'waiting_diagnostic_id' });
    await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ============ BACKUP FUNKSIYALARI ============
async function createBackup(ctx) {
    const diagnostics = getAllDiagnostics();
    const payments = loadPayments();
    
    if (diagnostics.length === 0) {
        await ctx.reply('⚠️ *Hech qanday diagnostika mavjud emas!*\n\n' +
            'Avval diagnostika qo\'shing, keyin backup yarating.', 
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const backupData = { 
        version: 2,
        diagnostics: diagnostics,
        payments: payments,
        base_price: BASE_PRICE,
        date: new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }),
        timestamp: Date.now(),
        stats: {
            total_diagnostics: diagnostics.length,
            total_payments: payments.length,
            total_sum: getTotalDiagnosedSum(),
            paid_sum: getPaidSum()
        }
    };
    
    const backupJson = JSON.stringify(backupData, null, 2);
    const fileName = `backup_v2_${Date.now()}.json`;
    
    try {
        await ctx.replyWithDocument({ 
            source: Buffer.from(backupJson, 'utf-8'), 
            filename: fileName 
        });
        await ctx.reply(
            `✅ *Backup yaratildi!*\n\n` +
            `📁 ${fileName}\n` +
            `📊 Diagnostikalar: ${diagnostics.length} ta\n` +
            `💰 To'lovlar: ${payments.length} ta\n` +
            `💵 Jami summa: ${backupData.stats.total_sum.toLocaleString()} so‘m\n` +
            `📅 Sana: ${backupData.date}`,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        await ctx.reply(`❌ Backup yaratishda xato: ${err.message}`);
    }
}

bot.hears('💾 Backup olish', async (ctx) => {
    if (!isSuperAdminById(ctx)) return;
    await createBackup(ctx);
});

bot.hears('🔄 Backup tiklash', async (ctx) => {
    if (!isSuperAdminById(ctx)) return;
    deleteSteps.set(ctx.from.id, { step: 'restore_backup' });
    await ctx.reply(
        `🔄 *BACKUP TIKLASH*\n\n` +
        `Iltimos, backup faylni yuboring (JSON format).\n\n` +
        `⚠️ *DIQQAT!* Tiklanganda joriy ma'lumotlar O'CHIRILADI!\n` +
        `✅ Backup faylni yuboring.\n` +
        `❌ Bekor qilish uchun /cancel buyrug'ini yuboring.`,
        { parse_mode: 'Markdown' }
    );
});

// ============ BACKUP TIKLASH ============
bot.on('document', async (ctx) => {
    if (!isSuperAdminById(ctx)) {
        await ctx.reply('❌ Bu amal faqat SUPER ADMIN uchun!');
        return;
    }
    
    const step = deleteSteps.get(ctx.from.id);
    if (!step || step.step !== 'restore_backup') {
        await ctx.reply('❌ Iltimos, avval "🔄 Backup tiklash" tugmasini bosing!');
        return;
    }
    
    const loadingMsg = await ctx.reply('⏳ Backup fayl tekshirilmoqda...');
    
    try {
        const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
        const response = await fetch(fileLink.href);
        const backupData = await response.json();
        
        console.log('Backup ma\'lumotlari:', JSON.stringify(backupData, null, 2).slice(0, 500));
        
        let diagnostics = [];
        let payments = [];
        
        // Backup versiyasini tekshirish
        if (backupData.version === 2) {
            // Yangi versiya - to'g'ri format
            diagnostics = backupData.diagnostics || [];
            payments = backupData.payments || [];
            console.log(`✅ Version 2 backup: ${diagnostics.length} ta diagnostika, ${payments.length} ta to'lov`);
        } else if (backupData.cars) {
            // Eski versiya - cars format
            diagnostics = backupData.cars.map(car => ({
                id: car.id || Math.floor(Date.now() + Math.random() * 1000000),
                sana: car.sana || new Date().toLocaleString('uz-UZ'),
                raqam: car.raqam || car.car_number || 'N/A',
                turi: car.turi || car.car_type || 'N/A',
                diagnostika: car.diagnostika || (car.is_diagnosed ? '✅ o‘tkazildi' : '❌ o‘tkazilmadi'),
                narxi: car.narxi || car.total_amount || car.amount || 0,
                base_price: car.base_price || BASE_PRICE,
                extra_works: car.extra_works || [],
                extra_amount: car.extra_amount || 0,
                admin_id: car.admin_id || 0,
                admin_name: car.admin_name || 'Unknown'
            }));
            
            if (backupData.paid_cars) {
                payments = backupData.paid_cars.map(pc => ({
                    id: pc.id || Math.floor(Date.now() + Math.random() * 1000000),
                    diagnostic_id: pc.diagnostic_id || pc.id,
                    car_number: pc.car_number || pc.raqam || 'N/A',
                    amount: pc.amount || pc.total_amount || 0,
                    admin_name: pc.admin_name || 'Unknown',
                    paid_date: pc.paid_date || new Date().toLocaleString('uz-UZ')
                }));
            }
            console.log(`✅ Eski versiya backup: ${diagnostics.length} ta diagnostika, ${payments.length} ta to'lov`);
        } else if (Array.isArray(backupData)) {
            // Faqat diagnostikalar arrayi
            diagnostics = backupData.map(d => ({
                ...d,
                id: d.id || Math.floor(Date.now() + Math.random() * 1000000),
                sana: d.sana || new Date().toLocaleString('uz-UZ'),
                diagnostika: d.diagnostika || (d.is_diagnosed ? '✅ o‘tkazildi' : '❌ o‘tkazilmadi'),
                narxi: d.narxi || d.total_amount || d.amount || 0,
                base_price: d.base_price || BASE_PRICE,
                extra_works: d.extra_works || [],
                extra_amount: d.extra_amount || 0
            }));
            console.log(`✅ Array backup: ${diagnostics.length} ta diagnostika`);
        } else {
            throw new Error('Noto‘g‘ri backup fayl formati!');
        }
        
        // Har bir diagnostikada ID borligini tekshirish
        diagnostics = diagnostics.map(d => {
            if (!d.id) {
                d.id = Math.floor(Date.now() + Math.random() * 1000000);
            }
            return d;
        });
        
        // Agar diagnostikalar bo'sh bo'lsa
        if (diagnostics.length === 0) {
            await ctx.editMessageText(loadingMsg.message_id,
                `⚠️ *Backup faylda hech qanday diagnostika topilmadi!*\n\n` +
                `📄 Fayl tarkibi: ${JSON.stringify(backupData).slice(0, 200)}...\n\n` +
                `❌ Iltimos, to'g'ri backup fayl yuboring.`,
                { parse_mode: 'Markdown' }
            );
            deleteSteps.delete(ctx.from.id);
            return;
        }
        
        // Avtomatik backup saqlash
        const autoBackup = {
            version: 2,
            diagnostics: getAllDiagnostics(),
            payments: loadPayments(),
            date: new Date().toLocaleString('uz-UZ'),
            timestamp: Date.now(),
            type: 'auto_backup_before_restore'
        };
        fs.writeFileSync(
            path.join(__dirname, `auto_backup_${Date.now()}.json`), 
            JSON.stringify(autoBackup, null, 2)
        );
        
        // Ma'lumotlarni saqlash
        saveDiagnostics(diagnostics);
        savePayments(payments);
        
        deleteSteps.delete(ctx.from.id);
        
        // Yangi ma'lumotlarni tekshirish
        const savedDiagnostics = loadDiagnostics();
        console.log(`✅ Saqlangan diagnostikalar: ${savedDiagnostics.length} ta`);
        
        await ctx.editMessageText(loadingMsg.message_id,
            `✅ *BACKUP MUVAFFAQIYATLI TIKLANDI!*\n\n` +
            `📊 Diagnostikalar: ${diagnostics.length} ta\n` +
            `💰 To'lovlar: ${payments.length} ta\n` +
            `📅 Sana: ${backupData.date || new Date().toLocaleString('uz-UZ')}\n\n` +
            `⚠️ Eski ma'lumotlar avtomatik backup sifatida saqlandi.\n\n` +
            `📋 Diagnostikalarni ko'rish uchun "📋 Diagnostikalar" tugmasini bosing.`,
            { parse_mode: 'Markdown' }
        );
        
        await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
        
    } catch (err) {
        console.error('Backup tiklashda xato:', err);
        await ctx.editMessageText(loadingMsg.message_id,
            `❌ *Backup tiklashda xato!*\n\n` +
            `${err.message}\n\n` +
            `📄 Iltimos, to'g'ri backup fayl yuboring.\n` +
            `💾 Yangi backup yaratish uchun "💾 Backup olish" tugmasini bosing.`,
            { parse_mode: 'Markdown' }
        );
        deleteSteps.delete(ctx.from.id);
    }
});

// ============ MATNLI XABARLARNI QAYTA ISHLASH ============
bot.on('text', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const text = ctx.message.text;
    const step = addSteps.get(ctx.from.id);
    const deleteStep = deleteSteps.get(ctx.from.id);
    const extraStep = extraAmountSteps.get(ctx.from.id);
    const editData = editSteps.get(ctx.from.id);
    const searchStep = searchSteps.get(ctx.from.id);
    
    // BEKOR QILISH
    if (text === '/cancel') {
        deleteSteps.delete(ctx.from.id);
        addSteps.delete(ctx.from.id);
        extraAmountSteps.delete(ctx.from.id);
        editSteps.delete(ctx.from.id);
        searchSteps.delete(ctx.from.id);
        await ctx.reply('❌ Barcha jarayonlar bekor qilindi', getMainMenu(ctx));
        return;
    }
    
    // QIDIRUV
    if (searchStep && searchStep.step === 'search_plate') {
        const plate = text.trim();
        if (plate.length >= 3) {
            searchSteps.delete(ctx.from.id);
            await showSearchResults(ctx, plate);
        } else {
            await ctx.reply('❌ *Noto‘g‘ri format!*\n\nIltimos, haqiqiy avtomobil raqamini kiriting.', { parse_mode: 'Markdown' });
        }
        return;
    }
    
    // Tahrirlash uchun diagnostika ID
    if (deleteStep?.step === 'edit_diagnostic_id') {
        if (!isAdminById(ctx)) return;
        
        const diagnosticId = Number(text);
        if (isNaN(diagnosticId)) {
            return ctx.reply(`❌ *Noto‘g‘ri format!*\n\nIltimos, diagnostika ID sini kiriting.`, { parse_mode: 'Markdown' });
        }
        
        const diagnostic = findDiagnosticById(diagnosticId);
        if (!diagnostic) {
            return ctx.reply(`❌ *Diagnostika topilmadi!*\n\nID: ${diagnosticId} bo'yicha diagnostika bazada mavjud emas.`, { parse_mode: 'Markdown' });
        }
        
        deleteSteps.delete(ctx.from.id);
        await showEditMenu(ctx, diagnosticId);
        return;
    }
    
    // Diagnostika o'chirish
    if (deleteStep?.step === 'delete_diagnostic' && isSuperAdminById(ctx)) {
        const diagnosticId = Number(text);
        if (isNaN(diagnosticId)) {
            return ctx.reply(`❌ *Noto‘g‘ri format!*\n\nIltimos, diagnostika ID sini kiriting.`, { parse_mode: 'Markdown' });
        }
        
        const deleted = deleteDiagnostic(diagnosticId);
        await ctx.reply(deleted ? `✅ Diagnostika o‘chirildi: ID ${diagnosticId}` : `❌ ID ${diagnosticId} topilmadi.`);
        deleteSteps.delete(ctx.from.id);
        return ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    }
    
    // Avtomobil raqami kiritish
    if (step?.step === 'number') {
        if (!isAdminById(ctx)) return;
        
        let carNumber = String(text).toUpperCase().trim();
        carNumber = carNumber.replace(/\s/g, '');
        carNumber = carNumber.replace(/[^A-Z0-9]/g, '');
        
        if (carNumber.length < 4) {
            return ctx.reply(`❌ *Noto‘g‘ri format!*\n\nSiz kiritgan: *${text}*\n\n✅ *Misol:* 01A777AA yoki A777AA`, { parse_mode: 'Markdown' });
        }
        
        step.carNumber = carNumber;
        step.step = 'waiting_for_type';
        addSteps.set(ctx.from.id, step);
        return ctx.reply(`✅ *Raqam:* ${step.carNumber}\n\n*Avtomobil turini tanlang:*`, { parse_mode: 'Markdown', ...getCarTypeKeyboard() });
    }
    
    // Qo'shimcha summa qo'shish
    if (extraStep && extraStep.step === 'waiting_diagnostic_id') {
        if (!isAdminById(ctx)) return;
        
        const diagnosticId = Number(text);
        if (isNaN(diagnosticId)) {
            return ctx.reply(`❌ *Noto‘g‘ri format!*\n\nIltimos, diagnostika ID sini kiriting.`, { parse_mode: 'Markdown' });
        }
        
        const diagnostic = findDiagnosticById(diagnosticId);
        if (!diagnostic) {
            return ctx.reply(`❌ *Diagnostika topilmadi!*\n\nID: ${diagnosticId} bo'yicha diagnostika bazada mavjud emas.`, { parse_mode: 'Markdown' });
        }
        
        extraAmountSteps.delete(ctx.from.id);
        await showAddExtraAmountMenu(ctx, diagnosticId);
        return;
    }
    
    // Avtomobil raqamini tahrirlash
    if (editData && editData.step === 'edit_number') {
        if (!isAdminById(ctx)) return;
        
        let carNumber = String(text).toUpperCase().trim();
        carNumber = carNumber.replace(/\s/g, '');
        carNumber = carNumber.replace(/[^A-Z0-9]/g, '');
        
        if (carNumber.length < 4) {
            await ctx.reply(`❌ *Noto‘g‘ri format!*\n\n✅ *Misol:* 01A777AA yoki A777AA`, { parse_mode: 'Markdown' });
            return;
        }
        
        updateDiagnostic(editData.diagnosticId, { raqam: carNumber });
        editSteps.delete(ctx.from.id);
        await ctx.reply(`✅ Avtomobil raqami "${carNumber}" ga o‘zgartirildi!`);
        await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
        return;
    }
    
    // Qo'shimcha summa kiritish (diagnostika qo'shishda)
    if (extraStep && extraStep.step === 'waiting_for_amount') {
        if (!isAdminById(ctx)) return;
        let extraAmount = 0;
        const input = text.toLowerCase();
        if (input !== '0' && input !== 'yo\'q' && input !== 'нет') {
            const parsed = parseInt(text.replace(/[^0-9]/g, ''));
            if (isNaN(parsed)) {
                return ctx.reply('❌ Noto‘g‘ri format! Iltimos, faqat raqam kiriting. Misol: 50000');
            }
            extraAmount = parsed;
        }
        
        const totalPrice = BASE_PRICE + extraAmount;
        await addDiagnostic(extraStep.carNumber, extraStep.carType, true, ctx.from.id, ctx.from.first_name, extraStep.extraWorks, extraAmount);
        extraAmountSteps.delete(ctx.from.id);
        await ctx.reply(`✅ *Diagnostika qo‘shildi!*\n\n🚗 *Raqam:* ${extraStep.carNumber}\n🏷️ *Turi:* ${extraStep.carType}\n💰 *Jami summa:* ${totalPrice.toLocaleString()} so‘m`, { parse_mode: 'Markdown' });
        
        const total = getTotalDiagnosedSum();
        const paidSum = getPaidSum();
        const remaining = total - paidSum;
        await sendToAllObservers(
            `🔔 *Yangi diagnostika!*\n\n🚗 *Raqam:* ${extraStep.carNumber}\n🏷️ *Turi:* ${extraStep.carType}\n💰 *Summa:* ${totalPrice.toLocaleString()} so‘m\n👤 *Admin:* ${ctx.from.first_name}\n\n📊 *JAMI SUM:* ${total.toLocaleString()} so‘m\n💵 *TO‘LOV QILINGAN:* ${paidSum.toLocaleString()} so‘m\n📉 *QOLDIQ:* ${remaining.toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
        await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
        return;
    }
    
    // Tahrirlashda qo'shimcha summa kiritish
    if (editData && editData.step === 'waiting_extra_amount') {
        if (!isAdminById(ctx)) return;
        let extraAmount = 0;
        const input = text.toLowerCase();
        if (input !== '0' && input !== 'yo\'q' && input !== 'нет') {
            const parsed = parseInt(text.replace(/[^0-9]/g, ''));
            if (isNaN(parsed)) return ctx.reply('❌ Noto‘g‘ri format! Faqat raqam kiriting.');
            extraAmount = parsed;
        }
        
        const diagnostic = findDiagnosticById(editData.diagnosticId);
        if (!diagnostic) {
            editSteps.delete(ctx.from.id);
            return ctx.reply('❌ Diagnostika topilmadi!');
        }
        
        const newNarxi = diagnostic.narxi + extraAmount;
        updateDiagnostic(editData.diagnosticId, { 
            extra_works: editData.currentExtra || [], 
            extra_amount: (diagnostic.extra_amount || 0) + extraAmount, 
            narxi: newNarxi 
        });
        
        removePayment(editData.diagnosticId);
        editSteps.delete(ctx.from.id);
        await ctx.reply(`✅ *Ma'lumotlar yangilandi!*\n\n🚗 *Raqam:* ${diagnostic.raqam}\n📋 *Qo‘shimcha ishlar:* ${(editData.currentExtra || []).join(', ') || 'Yo‘q'}\n➕ *Qo‘shimcha summa:* +${extraAmount.toLocaleString()} so‘m\n💎 *Yangi jami summa:* ${newNarxi.toLocaleString()} so‘m\n\n⚠️ To'lov holati o'chirildi, qayta tasdiqlash kerak!`, { parse_mode: 'Markdown' });
        await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
        return;
    }
    
    // Qo'shimcha summa qo'shishda summa kiritish
    if (extraStep && extraStep.step === 'waiting_amount') {
        if (!isAdminById(ctx)) return;
        let extraAmount = 0;
        const parsed = parseInt(text.replace(/[^0-9]/g, ''));
        if (isNaN(parsed)) {
            return ctx.reply('❌ Noto‘g‘ri format! Iltimos, faqat raqam kiriting. Misol: 50000');
        }
        extraAmount = parsed;
        
        const diagnostic = findDiagnosticById(extraStep.diagnosticId);
        if (!diagnostic) {
            extraAmountSteps.delete(ctx.from.id);
            return ctx.reply('❌ Diagnostika topilmadi!');
        }
        
        const allExtraWorks = [...(diagnostic.extra_works || []), ...extraStep.selectedWorks];
        const uniqueWorks = [...new Set(allExtraWorks)];
        const newExtraAmount = (diagnostic.extra_amount || 0) + extraAmount;
        const newTotalPrice = diagnostic.narxi + extraAmount;
        
        updateDiagnostic(extraStep.diagnosticId, {
            extra_works: uniqueWorks,
            extra_amount: newExtraAmount,
            narxi: newTotalPrice
        });
        
        removePayment(extraStep.diagnosticId);
        extraAmountSteps.delete(ctx.from.id);
        
        await ctx.reply(
            `✅ *Qo‘shimcha summa qo‘shildi!*\n\n🚗 *Avtomobil:* ${diagnostic.raqam}\n🆔 *ID:* ${diagnostic.id}\n📋 *Qo‘shimcha ishlar:* ${uniqueWorks.join(', ') || 'Yo‘q'}\n💰 *Qo‘shilgan summa:* +${extraAmount.toLocaleString()} so‘m\n💎 *Yangi jami summa:* ${newTotalPrice.toLocaleString()} so‘m\n\n⚠️ To'lov holati o'chirildi, qayta tasdiqlash kerak!`,
            { parse_mode: 'Markdown' }
        );
        
        await sendToAllObservers(
            `➕ *DIAGNOSTIKAGA QO'SHIMCHA SUMMA QO'SHILDI!*\n\n🚗 *Avtomobil:* ${diagnostic.raqam}\n🆔 *ID:* ${diagnostic.id}\n📋 *Yangi qo‘shimcha ishlar:* ${extraStep.selectedWorks.join(', ') || 'Yo‘q'}\n💰 *Qo‘shilgan summa:* +${extraAmount.toLocaleString()} so‘m\n💎 *Yangi jami summa:* ${newTotalPrice.toLocaleString()} so‘m\n👤 *Admin:* ${ctx.from.first_name}\n\n⚠️ To'lov holati o'chirildi, qayta tasdiqlash kerak!`,
            { parse_mode: 'Markdown' }
        );
        
        await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
        return;
    }
});

// ============ QO'SHIMCHA FUNKSIYALAR ============
async function showSearchResults(ctx, searchPlate) {
    const diagnostics = loadDiagnostics();
    const searchTerm = searchPlate.toUpperCase().trim().replace(/\s/g, '');
    
    const results = diagnostics.filter(d => 
        d.raqam.toUpperCase().includes(searchTerm)
    );
    
    if (results.length === 0) {
        await ctx.reply(`❌ *Raqam "${searchPlate}" bo'yicha hech qanday diagnostika topilmadi.*`, { parse_mode: 'Markdown' });
        return;
    }
    
    let message = `🔍 *QIDIRUV NATIJALARI*\n`;
    message += `🚗 *Raqam:* ${searchPlate}\n`;
    message += `📊 *Topildi:* ${results.length} ta diagnostika\n\n`;
    
    const sortedResults = results.sort((a, b) => b.id - a.id);
    
    for (let i = 0; i < sortedResults.length; i++) {
        const d = sortedResults[i];
        const num = i + 1;
        
        const isPaid = isDiagnosticPaid(d.id);
        const paidIcon = isPaid ? '✅' : '⏳';
        const paidText = isPaid ? 'To‘langan' : 'To‘lanmagan';
        
        message += `${num}. *${d.raqam}* | ${d.turi}\n`;
        message += `   🆔 ID: \`${d.id}\`\n`;
        message += `   💰 ${d.narxi.toLocaleString()} so‘m | ${paidIcon} ${paidText}\n`;
        message += `   🔧 Holat: ${d.diagnostika}\n`;
        if (d.extra_works && d.extra_works.length > 0) {
            message += `   📋 Qo‘shimcha: ${d.extra_works.join(', ')}\n`;
        }
        message += `   📅 Sana: ${d.sana}\n`;
        message += `   👤 Admin: ${d.admin_name}\n\n`;
    }
    
    message += `📝 *Eslatma:* Tahrirlash yoki o'chirish uchun ID dan foydalaning.`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
}

async function showAddExtraAmountMenu(ctx, diagnosticId) {
    const diagnostic = findDiagnosticById(diagnosticId);
    if (!diagnostic) {
        await ctx.reply(`❌ Diagnostika topilmadi.`);
        return;
    }
    
    extraAmountSteps.set(ctx.from.id, {
        diagnosticId: diagnostic.id,
        step: 'select_works',
        selectedWorks: [],
        originalDiagnostic: diagnostic
    });
    
    let message = `➕ *QO'SHIMCHA SUMMA QO'SHISH*\n\n`;
    message += `🚗 *Avtomobil:* ${diagnostic.raqam}\n`;
    message += `🆔 *ID:* ${diagnostic.id}\n`;
    message += `🏷️ *Turi:* ${diagnostic.turi}\n`;
    message += `💰 *Hozirgi summa:* ${diagnostic.narxi.toLocaleString()} so‘m\n`;
    message += `📋 *Hozirgi qo‘shimcha ishlar:* ${diagnostic.extra_works && diagnostic.extra_works.length > 0 ? diagnostic.extra_works.join(', ') : 'Yo‘q'}\n\n`;
    message += `*Yangi qo‘shimcha ishlarni tanlang:*\n`;
    
    const buttons = EXTRA_WORKS.map(work => {
        return [Markup.button.callback(`⬜ ${work}`, `extra_add_${work.replace(/\s/g, '_')}`)];
    });
    buttons.push([Markup.button.callback('✅ Tugatish va summa kiritish', 'finish_add_extra')]);
    buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_add_extra')]);
    
    await ctx.reply(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
}

bot.action(/extra_add_(.+)/, async (ctx) => {
    if (!isAdminById(ctx)) return;
    const work = ctx.match[1].replace(/_/g, ' ');
    const stepData = extraAmountSteps.get(ctx.from.id);
    if (!stepData || stepData.step !== 'select_works') {
        await ctx.answerCbQuery('❌ Jarayon qaytadan boshlang!');
        return;
    }
    
    const selectedWorks = stepData.selectedWorks || [];
    if (selectedWorks.includes(work)) {
        const index = selectedWorks.indexOf(work);
        selectedWorks.splice(index, 1);
    } else {
        selectedWorks.push(work);
    }
    stepData.selectedWorks = selectedWorks;
    extraAmountSteps.set(ctx.from.id, stepData);
    
    const diagnostic = findDiagnosticById(stepData.diagnosticId);
    let message = `➕ *QO'SHIMCHA SUMMA QO'SHISH*\n\n`;
    message += `🚗 *Avtomobil:* ${diagnostic.raqam}\n`;
    message += `🆔 *ID:* ${diagnostic.id}\n`;
    message += `🏷️ *Turi:* ${diagnostic.turi}\n`;
    message += `💰 *Hozirgi summa:* ${diagnostic.narxi.toLocaleString()} so‘m\n\n`;
    message += `*Tanlangan yangi qo‘shimcha ishlar:*\n`;
    if (selectedWorks.length === 0) message += `❌ Hali hech narsa tanlanmagan\n`;
    else selectedWorks.forEach(w => message += `✅ ${w}\n`);
    message += `\n*Yangi qo‘shimcha ishlarni tanlang:*`;
    
    const buttons = EXTRA_WORKS.map(work => {
        const isSelected = selectedWorks.includes(work);
        return [Markup.button.callback(`${isSelected ? '☑️' : '⬜'} ${work}`, `extra_add_${work.replace(/\s/g, '_')}`)];
    });
    buttons.push([Markup.button.callback('✅ Tugatish va summa kiritish', 'finish_add_extra')]);
    buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_add_extra')]);
    
    await ctx.editMessageText(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    await ctx.answerCbQuery();
});

bot.action('finish_add_extra', async (ctx) => {
    if (!isAdminById(ctx)) return;
    const stepData = extraAmountSteps.get(ctx.from.id);
    if (!stepData || stepData.step !== 'select_works') return;
    
    stepData.step = 'waiting_amount';
    extraAmountSteps.set(ctx.from.id, stepData);
    
    await ctx.editMessageText(
        `➕ *QO'SHIMCHA SUMMA KIRITING*\n\n` +
        `🚗 Avtomobil: ${stepData.originalDiagnostic.raqam}\n` +
        `🆔 ID: ${stepData.diagnosticId}\n` +
        `📋 Tanlangan yangi ishlar: ${stepData.selectedWorks.join(', ') || 'Yo‘q'}\n\n` +
        `*Yangi qo‘shimcha summani kiriting (faqat raqam):*\n` +
        `Misol: 50000\n` +
        `⚠️ Bu summa mavjud summaga QO'SHILADI`,
        { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
});

bot.action('cancel_add_extra', async (ctx) => {
    extraAmountSteps.delete(ctx.from.id);
    await ctx.editMessageText('❌ Qo‘shimcha summa qo‘shish bekor qilindi');
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    await ctx.answerCbQuery();
});

// ============ AVTOMOBIL TURINI TANLASH ============
bot.action(/car_type_(.+)/, async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (editData && editData.step === 'edit_type') {
        const selectedType = ctx.match[1];
        updateDiagnostic(editData.diagnosticId, { turi: selectedType });
        await ctx.editMessageText(`✅ Avtomobil turi "${selectedType}" ga o‘zgartirildi!`);
        await showEditMenu(ctx, editData.diagnosticId);
        await ctx.answerCbQuery();
        return;
    }
    
    if (!isAdminById(ctx)) return;
    const selectedType = ctx.match[1];
    const step = addSteps.get(ctx.from.id);
    if (!step || step.step !== 'waiting_for_type') {
        await ctx.answerCbQuery('❌ Jarayon qaytadan boshlang');
        return;
    }
    
    step.carType = selectedType;
    step.step = 'waiting_for_extra';
    addSteps.set(ctx.from.id, step);
    
    const buttons = EXTRA_WORKS.map(work => [Markup.button.callback(work, `extra_${work.replace(/\s/g, '_')}`)]);
    buttons.push([Markup.button.callback('✅ Faqat asosiy diagnostika', 'skip_extra')]);
    buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_add')]);
    
    await ctx.editMessageText(`✅ *Ma'lumotlar:*\n🚗 *Raqam:* ${step.carNumber}\n🏷️ *Turi:* ${selectedType}\n💰 *Asosiy narx:* ${BASE_PRICE.toLocaleString()} so‘m\n\n*Qo‘shimcha ishlar bormi?*`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    await ctx.answerCbQuery();
});

bot.action(/extra_(.+)/, async (ctx) => {
    if (!isAdminById(ctx)) return;
    const work = ctx.match[1].replace(/_/g, ' ');
    const step = addSteps.get(ctx.from.id);
    if (!step || step.step !== 'waiting_for_extra') {
        await ctx.answerCbQuery('❌ Jarayon qaytadan boshlang');
        return;
    }
    
    if (!selectedExtraWorks.has(ctx.from.id)) selectedExtraWorks.set(ctx.from.id, []);
    const works = selectedExtraWorks.get(ctx.from.id);
    if (works.includes(work)) {
        const index = works.indexOf(work);
        works.splice(index, 1);
    } else {
        works.push(work);
    }
    selectedExtraWorks.set(ctx.from.id, works);
    
    const buttons = EXTRA_WORKS.map(w => {
        const isSelected = works.includes(w);
        return [Markup.button.callback(`${isSelected ? '☑️' : '⬜'} ${w}`, `extra_${w.replace(/\s/g, '_')}`)];
    });
    buttons.push([Markup.button.callback('✅ Tugatish va summa kiritish', 'finish_extra')]);
    buttons.push([Markup.button.callback('❌ Qo‘shimcha ishlarsiz', 'skip_extra')]);
    buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_add')]);
    
    let message = `✅ *Ma'lumotlar:*\n🚗 *Raqam:* ${step.carNumber}\n🏷️ *Turi:* ${step.carType}\n💰 *Asosiy narx:* ${BASE_PRICE.toLocaleString()} so‘m\n\n*Tanlangan qo‘shimcha ishlar:*\n`;
    if (works.length === 0) message += `❌ Hali hech narsa tanlanmagan\n\n`;
    else works.forEach(w => message += `✅ ${w}\n`);
    message += `\n*Qo‘shimcha ishlarni tanlang yoki tugatish tugmasini bosing:*`;
    
    await ctx.editMessageText(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    await ctx.answerCbQuery();
});

bot.action('finish_extra', async (ctx) => {
    if (!isAdminById(ctx)) return;
    const step = addSteps.get(ctx.from.id);
    if (!step || step.step !== 'waiting_for_extra') {
        await ctx.answerCbQuery('❌ Jarayon qaytadan boshlang');
        return;
    }
    const works = selectedExtraWorks.get(ctx.from.id) || [];
    addSteps.delete(ctx.from.id);
    selectedExtraWorks.delete(ctx.from.id);
    
    extraAmountSteps.set(ctx.from.id, {
        carNumber: step.carNumber,
        carType: step.carType,
        extraWorks: works,
        step: 'waiting_for_amount'
    });
    await ctx.editMessageText(
        `📝 *Qo‘shimcha ishlar uchun summa kiriting:*\n\nTanlangan ishlar: ${works.join(', ')}\n💰 Asosiy narx: ${BASE_PRICE.toLocaleString()} so‘m\n➕ Qo‘shimcha summa (faqat raqam):\nMisol: 50000\n⚠️ Agar qo‘shimcha summa bo‘lmasa, 0 yoki "yo‘q" deb yozing`,
        { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
});

bot.action('skip_extra', async (ctx) => {
    if (!isAdminById(ctx)) return;
    const step = addSteps.get(ctx.from.id);
    if (!step || step.step !== 'waiting_for_extra') {
        await ctx.answerCbQuery('❌ Jarayon qaytadan boshlang');
        return;
    }
    addSteps.delete(ctx.from.id);
    selectedExtraWorks.delete(ctx.from.id);
    await addDiagnostic(step.carNumber, step.carType, true, ctx.from.id, ctx.from.first_name, [], 0);
    await ctx.editMessageText(`✅ *Diagnostika qo‘shildi!*\n\n🚗 *Raqam:* ${step.carNumber}\n🏷️ *Turi:* ${step.carType}\n✅ *Diagnostika:* O‘tkazildi\n💰 *Jami summa:* ${BASE_PRICE.toLocaleString()} so‘m\n👤 *Admin:* ${ctx.from.first_name}`, { parse_mode: 'Markdown' });
    
    const total = getTotalDiagnosedSum();
    const paidSum = getPaidSum();
    const remaining = total - paidSum;
    await sendToAllObservers(`🔔 *Yangi diagnostika!*\n\n🚗 *Raqam:* ${step.carNumber}\n🏷️ *Turi:* ${step.carType}\n💰 *Summa:* ${BASE_PRICE.toLocaleString()} so‘m\n👤 *Admin:* ${ctx.from.first_name}\n\n📊 *JAMI SUM:* ${total.toLocaleString()} so‘m\n💵 *TO‘LOV QILINGAN:* ${paidSum.toLocaleString()} so‘m\n📉 *QOLDIQ:* ${remaining.toLocaleString()} so‘m`, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery();
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
});

bot.action('cancel_add', async (ctx) => {
    addSteps.delete(ctx.from.id);
    selectedExtraWorks.delete(ctx.from.id);
    extraAmountSteps.delete(ctx.from.id);
    await ctx.editMessageText('❌ Bekor qilindi');
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    await ctx.answerCbQuery();
});

// ============ DEBUG BUYRUG'LARI ============
bot.command('checkdb', async (ctx) => {
    if (!isSuperAdminById(ctx)) return;
    
    const diagnostics = loadDiagnostics();
    const payments = loadPayments();
    
    let message = '🔍 *BAZA HOLATI*\n\n';
    message += `📊 Diagnostikalar: ${diagnostics.length} ta\n`;
    message += `💰 To'lovlar: ${payments.length} ta\n\n`;
    
    if (diagnostics.length > 0) {
        message += '*📋 Oxirgi 5 ta diagnostika:*\n';
        diagnostics.slice(0, 5).forEach((d, idx) => {
            const isPaid = isDiagnosticPaid(d.id);
            message += `${idx + 1}. 🚗 ${d.raqam} | ID: ${d.id} | ${d.narxi.toLocaleString()} so‘m ${isPaid ? '✅' : '⏳'}\n`;
        });
    } else {
        message += '❌ Hech qanday diagnostika yo\'q!\n';
    }
    
    if (payments.length > 0) {
        message += '\n*💵 Oxirgi 5 ta to\'lov:*\n';
        payments.slice(0, 5).forEach((p, idx) => {
            message += `${idx + 1}. ${p.car_number} | ${p.amount.toLocaleString()} so‘m | ${p.paid_date}\n`;
        });
    }
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('forcedb', async (ctx) => {
    if (!isSuperAdminById(ctx)) return;
    
    try {
        const dbPath = path.join(__dirname, 'diagnostics.json');
        const rawData = fs.readFileSync(dbPath, 'utf8');
        const data = JSON.parse(rawData);
        
        let message = '🔧 *DIAGNOSTIKALARNI QAYTA TIKLASH*\n\n';
        message += `📊 Diagnostikalar soni: ${data.length || 0} ta\n`;
        message += `📄 Fayl: diagnostics.json\n\n`;
        
        if (data.length === 0) {
            message += '❌ Faylda hech qanday ma\'lumot yo\'q!';
        } else {
            message += '*Oxirgi 5 ta diagnostika:*\n';
            data.slice(0, 5).forEach((d, idx) => {
                message += `${idx + 1}. 🚗 ${d.raqam || 'N/A'} | ID: ${d.id || 'N/A'} | ${(d.narxi || 0).toLocaleString()} so‘m\n`;
            });
            
            saveDiagnostics(data);
            message += '\n✅ Ma\'lumotlar qayta yuklandi!';
        }
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (err) {
        await ctx.reply(`❌ Xatolik: ${err.message}`);
    }
});

bot.command('showall', async (ctx) => {
    if (!isSuperAdminById(ctx)) return;
    
    const diagnostics = loadDiagnostics();
    
    if (diagnostics.length === 0) {
        await ctx.reply('❌ Hech qanday diagnostika topilmadi!');
        return;
    }
    
    let message = '📋 *BARCHA DIAGNOSTIKALAR*\n\n';
    diagnostics.forEach((d, idx) => {
        const isPaid = isDiagnosticPaid(d.id);
        message += `${idx + 1}. 🚗 ${d.raqam} | ${d.turi}\n`;
        message += `   ID: ${d.id} | ${d.narxi.toLocaleString()} so‘m ${isPaid ? '✅' : '⏳'}\n`;
        message += `   Sana: ${d.sana}\n\n`;
    });
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ============ BOTNI ISHGA TUSHIRISH ============
bot.launch();
console.log('🤖 Bot ishga tushdi!');
console.log(`👑 Admin telefonlari: ${ADMIN_PHONES.join(', ')}`);
console.log(`📞 Kuzatuvchi telefonlari: ${OBSERVER_PHONES.join(', ')}`);
console.log(`💰 Asosiy diagnostika narxi: ${BASE_PRICE.toLocaleString()} so‘m`);
console.log('✅ Barcha funksiyalar to\'liq ishlaydi!');
console.log('🔧 Debug buyruqlari: /checkdb, /forcedb, /showall');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
