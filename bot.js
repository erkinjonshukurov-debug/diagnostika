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

function addPayment(diagnosticId, adminName) {
    const diagnostics = loadDiagnostics();
    const diagnostic = diagnostics.find(d => d.id === diagnosticId);
    if (!diagnostic) return null;
    
    if (isDiagnosticPaid(diagnosticId)) return null;
    
    const payments = loadPayments();
    const payment = {
        id: Date.now() + Math.random() * 1000,
        diagnostic_id: diagnosticId,
        car_number: diagnostic.raqam,
        amount: diagnostic.narxi,
        admin_name: adminName,
        paid_date: new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })
    };
    payments.push(payment);
    savePayments(payments);
    return payment;
}

function addMultiplePayments(diagnosticIds, adminName) {
    const diagnostics = loadDiagnostics();
    let payments = loadPayments();
    let totalAmount = 0;
    const newPayments = [];
    const paidDiagnostics = [];
    
    for (const diagnosticId of diagnosticIds) {
        const diagnostic = diagnostics.find(d => d.id === diagnosticId);
        if (!diagnostic) continue;
        
        if (isDiagnosticPaid(diagnosticId)) continue;
        
        const paidDate = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
        const payment = {
            id: Date.now() + Math.random() * 1000,
            diagnostic_id: diagnosticId,
            car_number: diagnostic.raqam,
            amount: diagnostic.narxi,
            admin_name: adminName,
            paid_date: paidDate
        };
        newPayments.push(payment);
        paidDiagnostics.push(diagnostic);
        totalAmount += diagnostic.narxi;
    }
    
    if (newPayments.length > 0) {
        savePayments([...payments, ...newPayments]);
    }
    
    return { 
        count: newPayments.length, 
        totalAmount, 
        payments: newPayments,
        diagnostics: paidDiagnostics
    };
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

// ============ TO'LOVNI TASDIQLASH (TUZATILGAN) ============
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
    
    // ID ni to'g'ri formatda olish
    const diagnosticId = Number(ctx.match[1]);
    const userData = userSelections.get(ctx.from.id);
    if (!userData) {
        await ctx.answerCbQuery('❌ Jarayon qaytadan boshlang!');
        return;
    }
    
    // Tanlangan diagnostikani tekshirish
    const diagnostics = loadDiagnostics();
    const diagnostic = diagnostics.find(d => d.id === diagnosticId);
    if (!diagnostic) {
        await ctx.answerCbQuery('❌ Diagnostika topilmadi!');
        return;
    }
    
    // To'langanligini tekshirish
    if (isDiagnosticPaid(diagnosticId)) {
        await ctx.answerCbQuery('❌ Bu diagnostika allaqachon to\'langan!');
        // Tanlovdan o'chirish
        userData.selected.delete(diagnosticId);
        userSelections.set(ctx.from.id, userData);
        await showUnpaidDiagnosticsMenu(ctx, userData.currentPage);
        return;
    }
    
    // Tanlash yoki o'chirish
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
    
    // Tanlangan ID larni arrayga o'tkazamiz
    const selectedIds = Array.from(userData.selected);
    
    // Diagnostikalarni yuklaymiz
    const diagnostics = loadDiagnostics();
    
    // ID bo'yicha diagnostikalarni topamiz va to'lanmaganlarini filtrlash
    const selectedDiagnostics = diagnostics.filter(d => {
        return selectedIds.includes(d.id) && !isDiagnosticPaid(d.id);
    });
    
    if (selectedDiagnostics.length === 0) {
        await ctx.reply('❌ Tanlangan diagnostikalar allaqachon to\'langan yoki topilmadi!');
        userSelections.delete(ctx.from.id);
        await ctx.answerCbQuery();
        return;
    }
    
    // To'lovlarni bajarish
    let payments = loadPayments();
    let totalAmount = 0;
    const newPayments = [];
    const adminName = ctx.from.first_name;
    const notPaid = [];
    
    for (const diagnostic of selectedDiagnostics) {
        const paidDate = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
        const payment = {
            id: Date.now() + Math.random() * 1000,
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
    
    // Statistikani hisoblash
    const totalDiagnosed = getTotalDiagnosedSum();
    const newPaidSum = getPaidSum();
    const remainingSum = totalDiagnosed - newPaidSum;
    
    // To'langan diagnostikalar ro'yxati
    let diagnosticsList = '';
    notPaid.forEach((d, idx) => {
        diagnosticsList += `${idx + 1}. 🚗 ${d.raqam} | ${d.turi} | ${d.narxi.toLocaleString()} so‘m\n`;
    });
    
    // Kuzatuvchilarga xabar
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
    
    // Foydalanuvchiga xabar
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

// ============ QOLGAN FUNKSIYALAR ============
// (Qolgan funksiyalar o'zgarmagan holda qoladi)
// ... (diagnostika qo'shish, tahrirlash, qidirish, backup va boshqalar)

// ============ BOTNI ISHGA TUSHIRISH ============
bot.launch();
console.log('🤖 Bot ishga tushdi!');
console.log('✅ To\'lov tizimi to\'liq tuzatildi!');
console.log('🔧 Har bir diagnostika UNIKAL ID bilan');
console.log('✅ To\'lovda faqat to\'lanmaganlar tanlanadi');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
