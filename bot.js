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
    const patterns = [
        /^[0-9]{2}[A-Z][0-9]{3}[A-Z]{2}$/i,
        /^[0-9]{2}[A-Z][0-9]{6}$/i,
        /^[0-9]{5}[A-Z]{3}$/i,
        /^[A-Z][0-9]{3}[A-Z]{2}$/i,
        /^[0-9]{3}[A-Z]{3}$/i,
        /^[0-9]{2}[A-Z]{2}[0-9]{3}$/i,
        /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/i
    ];
    return patterns.some(pattern => pattern.test(plate));
}

function getCarTypeKeyboard() {
    const buttons = CAR_TYPES.map(type => [Markup.button.callback(type, `car_type_${type}`)]);
    buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_edit')]);
    return Markup.inlineKeyboard(buttons);
}

// ============ MA'LUMOTLAR BAZASI ============
const DB_FILE = path.join(__dirname, 'cars.json');
const ADMIN_FILE = path.join(__dirname, 'admin_ids.json');
const OBSERVER_FILE = path.join(__dirname, 'observer_ids.json');
const PAID_CARS_FILE = path.join(__dirname, 'paid_cars.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(ADMIN_FILE)) fs.writeFileSync(ADMIN_FILE, JSON.stringify({ userIds: [] }, null, 2));
if (!fs.existsSync(OBSERVER_FILE)) fs.writeFileSync(OBSERVER_FILE, JSON.stringify({ userIds: [] }, null, 2));
if (!fs.existsSync(PAID_CARS_FILE)) fs.writeFileSync(PAID_CARS_FILE, JSON.stringify([], null, 2));

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

function loadData() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveData(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function loadPaidCars() {
    try {
        return JSON.parse(fs.readFileSync(PAID_CARS_FILE, 'utf8'));
    } catch(e) {
        return [];
    }
}

function savePaidCars(paidCars) {
    fs.writeFileSync(PAID_CARS_FILE, JSON.stringify(paidCars, null, 2));
}

function addMultiplePaidCars(carsToPay, adminName) {
    const paidCars = loadPaidCars();
    let totalAmount = 0;
    
    for (const car of carsToPay) {
        const existingIndex = paidCars.findIndex(c => c.raqam === car.raqam.toUpperCase());
        if (existingIndex === -1) {
            const paidCar = {
                id: Date.now(),
                raqam: car.raqam.toUpperCase(),
                turi: car.turi,
                amount: car.narxi,
                extra_works: car.extra_works || [],
                total_amount: car.narxi,
                admin_name: adminName,
                paid_date: new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })
            };
            paidCars.push(paidCar);
            totalAmount += car.narxi;
        }
    }
    savePaidCars(paidCars);
    return totalAmount;
}

function removePaidCar(carNumber) {
    const paidCars = loadPaidCars();
    const newPaidCars = paidCars.filter(c => c.raqam !== carNumber.toUpperCase());
    savePaidCars(newPaidCars);
}

function isCarPaid(carNumber) {
    const paidCars = loadPaidCars();
    return paidCars.some(c => c.raqam === carNumber.toUpperCase());
}

function getUnpaidCars() {
    const cars = loadData();
    const diagnosedCars = cars.filter(car => car.diagnostika === '✅ o‘tkazildi');
    const paidCars = loadPaidCars();
    const paidNumbers = paidCars.map(c => c.raqam);
    return diagnosedCars.filter(car => !paidNumbers.includes(car.raqam));
}

function getPaidCarsList() {
    return loadPaidCars();
}

function getTotalDiagnosedSum() {
    const cars = loadData();
    const diagnosedCars = cars.filter(car => car.diagnostika.includes('o‘tkazildi'));
    return diagnosedCars.reduce((sum, car) => sum + car.narxi, 0);
}

function getPaidSum() {
    const paidCars = loadPaidCars();
    return paidCars.reduce((sum, car) => sum + car.total_amount, 0);
}

function findCarByNumber(carNumber) {
    const cars = loadData();
    return cars.find(car => car.raqam === carNumber.toUpperCase());
}

function updateCar(carNumber, updates) {
    const cars = loadData();
    const index = cars.findIndex(c => c.raqam === carNumber.toUpperCase());
    if (index === -1) return false;
    
    cars[index] = { ...cars[index], ...updates };
    saveData(cars);
    
    if (isCarPaid(carNumber)) {
        const paidCars = loadPaidCars();
        const paidIndex = paidCars.findIndex(c => c.raqam === carNumber.toUpperCase());
        if (paidIndex !== -1) {
            paidCars[paidIndex] = { ...paidCars[paidIndex], ...updates };
            savePaidCars(paidCars);
        }
    }
    
    return true;
}

function addCarWithExtras(carNumber, carType, isDiagnosed, adminId, adminName, extraWorks = [], extraAmount = 0) {
    const cars = loadData();
    const sana = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
    const diagnostika = isDiagnosed ? "✅ o‘tkazildi" : "❌ o‘tkazilmadi";
    let narxi = 0;
    
    if (isDiagnosed) {
        narxi = BASE_PRICE + extraAmount;
    }
    
    const newCar = {
        id: Date.now(),
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
    
    cars.push(newCar);
    saveData(cars);
    return newCar.id;
}

function deleteCar(carNumber) {
    const cars = loadData();
    const index = cars.findIndex(c => c.raqam === carNumber.toUpperCase());
    if (index === -1) return false;
    cars.splice(index, 1);
    saveData(cars);
    removePaidCar(carNumber);
    return true;
}

function deleteLastCar() {
    const cars = loadData();
    if (cars.length === 0) return null;
    const removed = cars.pop();
    saveData(cars);
    removePaidCar(removed.raqam);
    return removed;
}

function getStats() {
    const cars = loadData();
    const diagnosed = cars.filter(c => c.diagnostika.includes('o‘tkazildi')).length;
    const notDiagnosed = cars.filter(c => c.diagnostika.includes('o‘tkazilmadi')).length;
    const totalSum = getTotalDiagnosedSum();
    const paidSum = getPaidSum();
    const remainingSum = totalSum - paidSum;
    const paidCars = getPaidCarsList();
    const paidCarsCount = paidCars.length;
    return { total: cars.length, diagnosed, notDiagnosed, totalSum, paidSum, remainingSum, paidCarsCount };
}

function getAllCars() {
    return loadData();
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
            ['🚗 Avtomobil qo\'shish', '✏️ Ma\'lumot tahrirlash'],
            ['🗑️ Avtomobil o\'chirish', '📊 Statistika'],
            ['💰 Jami summa', '📋 Avtomobillar'],
            ['✅ Tasdiqlanganlar', '💵 To\'lovni tasdiqlash'],
            ['💾 Backup olish', '🔄 Backup tiklash']
        ]).resize();
    } else if (isAdminById(ctx)) {
        return Markup.keyboard([
            ['🚗 Avtomobil qo\'shish', '✏️ Ma\'lumot tahrirlash'],
            ['⬅️ Oxirgi avtomobilni o\'chirish']
        ]).resize();
    } else if (isObserverById(ctx)) {
        return Markup.keyboard([
            ['💰 Jami summa', '📋 Avtomobillar', '✅ Tasdiqlanganlar']
        ]).resize();
    }
    return null;
}

// ============ TAHRIRLASH FUNKSIYALARI ============
let editSteps = new Map();

async function showEditMenu(ctx, carNumber) {
    const car = findCarByNumber(carNumber);
    if (!car) {
        await ctx.reply(`❌ ${carNumber} raqamli avtomobil topilmadi.`);
        return;
    }
    
    editSteps.set(ctx.from.id, { carNumber: car.raqam, step: 'main' });
    
    let message = `✏️ *MA'LUMOTLARNI TAHRIRLASH*\n\n`;
    message += `🚗 *Raqam:* ${car.raqam}\n`;
    message += `🏷️ *Turi:* ${car.turi}\n`;
    message += `🔧 *Diagnostika:* ${car.diagnostika}\n`;
    message += `💰 *Asosiy narx:* ${car.base_price?.toLocaleString() || BASE_PRICE.toLocaleString()} so‘m\n`;
    
    if (car.extra_works && car.extra_works.length > 0) {
        message += `📋 *Qo‘shimcha ishlar:* ${car.extra_works.join(', ')}\n`;
        message += `➕ *Qo‘shimcha summa:* ${(car.extra_amount || 0).toLocaleString()} so‘m\n`;
    } else {
        message += `📋 *Qo‘shimcha ishlar:* Yo‘q\n`;
    }
    
    message += `💎 *Jami summa:* ${car.narxi.toLocaleString()} so‘m\n\n`;
    message += `*Qaysi ma'lumotni tahrirlamoqchisiz?*`;
    
    await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🏷️ Avtomobil turi', 'edit_type')],
            [Markup.button.callback('🔧 Diagnostika holati', 'edit_diagnosis')],
            [Markup.button.callback('📋 Qo‘shimcha ishlar', 'edit_extra_works')],
            [Markup.button.callback('❌ Bekor qilish', 'cancel_edit')]
        ])
    });
}

bot.action('edit_type', async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData) return;
    editData.step = 'edit_type';
    editSteps.set(ctx.from.id, editData);
    await ctx.editMessageText(
        `✏️ *Yangi avtomobil turini tanlang:*\n\nHozirgi turi: ${findCarByNumber(editData.carNumber)?.turi}`,
        { parse_mode: 'Markdown', ...getCarTypeKeyboard() }
    );
    await ctx.answerCbQuery();
});

bot.action('edit_diagnosis', async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData) return;
    await ctx.editMessageText(
        `✏️ *Diagnostika holatini tanlang:*\n\nHozirgi holat: ${findCarByNumber(editData.carNumber)?.diagnostika}`,
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
    const car = findCarByNumber(editData.carNumber);
    const currentWorks = car.extra_works || [];
    editData.step = 'edit_extra';
    editData.currentExtra = [...currentWorks];
    editSteps.set(ctx.from.id, editData);
    
    let message = `✏️ *QO‘SHIMCHA ISHLARNI TAHRIRLASH*\n\n`;
    message += `🚗 Avtomobil: ${car.raqam}\n`;
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
    
    const car = findCarByNumber(editData.carNumber);
    let message = `✏️ *QO‘SHIMCHA ISHLARNI TAHRIRLASH*\n\n`;
    message += `🚗 Avtomobil: ${car.raqam}\n`;
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
        `✏️ *QO‘SHIMCHA ISH SUMMASINI KIRITING*\n\nTanlangan ishlar: ${editData.currentExtra.join(', ') || 'Yo‘q'}\n💰 Asosiy narx: ${BASE_PRICE.toLocaleString()} so‘m\n➕ Qo‘shimcha summa (faqat raqam):\nMisol: 50000\n⚠️ Agar qo‘shimcha summa bo‘lmasa, 0 yoki "yo‘q" deb yozing`,
        { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
});

bot.action('set_diag_yes', async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData) return;
    const car = findCarByNumber(editData.carNumber);
    const newNarxi = BASE_PRICE + (car.extra_amount || 0);
    updateCar(editData.carNumber, { diagnostika: "✅ o‘tkazildi", narxi: newNarxi });
    await ctx.editMessageText(`✅ Diagnostika holati "O‘tkazildi" ga o‘zgartirildi!`);
    await showEditMenu(ctx, editData.carNumber);
    await ctx.answerCbQuery();
});

bot.action('set_diag_no', async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData) return;
    updateCar(editData.carNumber, { diagnostika: "❌ o‘tkazilmadi", narxi: 0 });
    await ctx.editMessageText(`❌ Diagnostika holati "O‘tkazilmadi" ga o‘zgartirildi!`);
    await showEditMenu(ctx, editData.carNumber);
    await ctx.answerCbQuery();
});

bot.action('back_to_edit_menu', async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (!editData) return;
    await showEditMenu(ctx, editData.carNumber);
    await ctx.answerCbQuery();
});

bot.action('cancel_edit', async (ctx) => {
    editSteps.delete(ctx.from.id);
    await ctx.editMessageText('❌ Tahrirlash bekor qilindi');
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    await ctx.answerCbQuery();
});

// ============ AVTOMOBILLAR RO'YXATI ============
async function showAllCars(ctx, page = 0) {
    const cars = getAllCars();
    if (cars.length === 0) {
        await ctx.reply('📋 Hali hech qanday avtomobil qo‘shilmagan.');
        return;
    }
    
    const itemsPerPage = 5;
    const totalPages = Math.ceil(cars.length / itemsPerPage);
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageCars = cars.slice(start, end);
    
    let message = '🚗 *AVTOMOBILLAR RO\'YXATI*\n\n';
    pageCars.forEach((car, idx) => {
        const num = start + idx + 1;
        const paidStatus = isCarPaid(car.raqam) ? '✅ To‘langan' : '⏳ To‘lov kutilmoqda';
        message += `${num}. *${car.raqam}* | ${car.turi} | ${car.diagnostika}\n`;
        message += `   💰 ${car.narxi.toLocaleString()} so‘m | ${paidStatus}`;
        if (car.extra_works && car.extra_works.length > 0) {
            message += `\n   📋 Qo‘shimcha: ${car.extra_works.join(', ')} (+${(car.extra_amount || 0).toLocaleString()} so‘m)`;
        }
        message += `\n   📅 ${car.sana} | 👤 ${car.admin_name}\n\n`;
    });
    message += `📊 *Jami:* ${cars.length} ta\n💰 *Jami summa:* ${getTotalDiagnosedSum().toLocaleString()} so‘m\n📄 *Sahifa:* ${page + 1}/${totalPages}`;
    
    const navButtons = [];
    if (page > 0) navButtons.push(Markup.button.callback('◀️ Oldingi', `cars_page_${page - 1}`));
    if (end < cars.length) navButtons.push(Markup.button.callback('Keyingi ▶️', `cars_page_${page + 1}`));
    navButtons.push(Markup.button.callback('❌ Yopish', 'close_cars'));
    
    await ctx.reply(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([navButtons]) });
}

bot.action(/cars_page_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    await showAllCars(ctx, page);
    await ctx.answerCbQuery();
});

bot.action('close_cars', async (ctx) => {
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
});

// ============ TASDIQLANGAN AVTOMOBILLAR ============
async function showPaidCars(ctx, page = 0) {
    const paidCars = getPaidCarsList();
    if (paidCars.length === 0) {
        await ctx.reply('📋 Hali hech qanday to‘lov tasdiqlanmagan.');
        return;
    }
    
    const itemsPerPage = 3;
    const totalPages = Math.ceil(paidCars.length / itemsPerPage);
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageCars = paidCars.slice(start, end);
    
    let message = '✅ *TASDIQLANGAN AVTOMOBILLAR*\n\n';
    pageCars.forEach((car, idx) => {
        const num = start + idx + 1;
        const sana = car.paid_date.split(',')[0];
        message += `${num}. *${car.raqam}* | ${car.turi} | ${car.total_amount.toLocaleString()} so‘m\n`;
        message += `   📅 ${sana} | 👤 ${car.admin_name}\n\n`;
    });
    message += `📊 *Jami tasdiqlangan:* ${paidCars.length} ta\n💰 *Jami summa:* ${getPaidSum().toLocaleString()} so‘m\n📄 *Sahifa:* ${page + 1}/${totalPages}`;
    
    const navButtons = [];
    if (page > 0) navButtons.push(Markup.button.callback('◀️ Oldingi', `paid_page_${page - 1}`));
    if (end < paidCars.length) navButtons.push(Markup.button.callback('Keyingi ▶️', `paid_page_${page + 1}`));
    navButtons.push(Markup.button.callback('❌ Yopish', 'close_paid'));
    
    await ctx.reply(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([navButtons]) });
}

bot.action(/paid_page_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    await showPaidCars(ctx, page);
    await ctx.answerCbQuery();
});

bot.action('close_paid', async (ctx) => {
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
});

// ============ TO'LOVNI TASDIQLASH (TO'LIQ ISHLAYDI) ============
let userSelections = new Map(); // userId -> { selected: Set, currentPage: number, messageId: number }

async function showUnpaidCarsMenu(ctx, page = 0) {
    const unpaidCars = getUnpaidCars();
    if (unpaidCars.length === 0) {
        await ctx.reply('✅ Barcha avtomobillar uchun to‘lov qilingan!');
        return;
    }
    
    const itemsPerPage = 5;
    const totalPages = Math.ceil(unpaidCars.length / itemsPerPage);
    let currentPage = page;
    if (currentPage < 0) currentPage = 0;
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    
    const start = currentPage * itemsPerPage;
    const end = Math.min(start + itemsPerPage, unpaidCars.length);
    const pageCars = unpaidCars.slice(start, end);
    
    if (!userSelections.has(ctx.from.id)) {
        userSelections.set(ctx.from.id, { selected: new Set(), currentPage: currentPage, messageId: null });
    }
    const userData = userSelections.get(ctx.from.id);
    userData.currentPage = currentPage;
    
    let message = '💰 *TO‘LOV QILINMAGAN AVTOMOBILLAR*\n\n';
    message += `📄 *Sahifa ${currentPage + 1}/${totalPages}* | Jami: ${unpaidCars.length} ta\n\n`;
    
    // Har bir avtomobil uchun tanlash tugmasi
    const selectButtons = [];
    for (let i = 0; i < pageCars.length; i++) {
        const car = pageCars[i];
        const globalNum = start + i + 1;
        const isSelected = userData.selected.has(car.raqam);
        const checkbox = isSelected ? '☑️' : '⬜';
        message += `${checkbox} *${globalNum}.* ${car.raqam} | ${car.turi} | ${car.narxi.toLocaleString()} so‘m`;
        if (car.extra_works && car.extra_works.length > 0) {
            message += ` (+${(car.extra_amount || 0).toLocaleString()} so‘m)`;
        }
        message += `\n`;
        
        // Tanlash tugmalari
        selectButtons.push([
            Markup.button.callback(
                `${isSelected ? '❌' : '✅'} ${car.raqam}`,
                `select_car_${car.raqam}`
            )
        ]);
    }
    
    const remainingSum = unpaidCars.reduce((s, c) => s + c.narxi, 0);
    message += `\n📊 *Jami to‘lov qilinmagan:* ${remainingSum.toLocaleString()} so‘m`;
    message += `\n✅ *Tanlanganlar:* ${userData.selected.size} ta`;
    
    // Navigatsiya tugmalari
    const navButtons = [];
    if (currentPage > 0) {
        navButtons.push(Markup.button.callback('◀️ Oldingi', 'unpaid_prev'));
    }
    if (currentPage + 1 < totalPages) {
        navButtons.push(Markup.button.callback('Keyingi ▶️', 'unpaid_next'));
    }
    
    // To'langanlarni ko'rish tugmasi
    const paidCount = getPaidCarsList().length;
    if (paidCount > 0) {
        navButtons.push(Markup.button.callback(`✅ To‘langanlar (${paidCount} ta)`, 'unpaid_view_paid'));
    }
    
    // Tasdiqlash tugmasi
    const confirmButtons = [];
    if (userData.selected.size > 0) {
        confirmButtons.push([Markup.button.callback(`✅ Tasdiqlash (${userData.selected.size} ta)`, 'unpaid_confirm')]);
    }
    confirmButtons.push([Markup.button.callback('❌ Bekor qilish', 'unpaid_cancel')]);
    
    const allButtons = [...selectButtons];
    if (navButtons.length > 0) allButtons.push(navButtons);
    allButtons.push(...confirmButtons);
    
    // Xabarni yuborish
    if (userData.messageId) {
        try {
            await ctx.deleteMessage(userData.messageId);
        } catch(e) {}
    }
    const sentMsg = await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(allButtons)
    });
    userData.messageId = sentMsg.message_id;
    userSelections.set(ctx.from.id, userData);
}

// Avtomobil tanlash
bot.action(/select_car_(.+)/, async (ctx) => {
    if (!isSuperAdminById(ctx)) return;
    const carNumber = ctx.match[1];
    const userData = userSelections.get(ctx.from.id);
    if (!userData) return;
    
    if (userData.selected.has(carNumber)) {
        userData.selected.delete(carNumber);
    } else {
        userData.selected.add(carNumber);
    }
    userSelections.set(ctx.from.id, userData);
    
    // Sahifani qayta ko'rsatish
    await showUnpaidCarsMenu(ctx, userData.currentPage);
    await ctx.answerCbQuery();
});

// Oldingi sahifa
bot.action('unpaid_prev', async (ctx) => {
    if (!isSuperAdminById(ctx)) return;
    const userData = userSelections.get(ctx.from.id);
    const currentPage = userData ? userData.currentPage : 0;
    await showUnpaidCarsMenu(ctx, currentPage - 1);
    await ctx.answerCbQuery();
});

// Keyingi sahifa
bot.action('unpaid_next', async (ctx) => {
    if (!isSuperAdminById(ctx)) return;
    const userData = userSelections.get(ctx.from.id);
    const currentPage = userData ? userData.currentPage : 0;
    await showUnpaidCarsMenu(ctx, currentPage + 1);
    await ctx.answerCbQuery();
});

// To'lovni tasdiqlash
bot.action('unpaid_confirm', async (ctx) => {
    if (!isSuperAdminById(ctx)) return;
    const userData = userSelections.get(ctx.from.id);
    if (!userData || userData.selected.size === 0) {
        await ctx.answerCbQuery('Hech qanday avtomobil tanlanmagan!');
        return;
    }
    
    const unpaidCars = getUnpaidCars();
    const carsToPay = unpaidCars.filter(car => userData.selected.has(car.raqam));
    const totalAmount = carsToPay.reduce((sum, car) => sum + car.narxi, 0);
    
    addMultiplePaidCars(carsToPay, ctx.from.first_name);
    
    const totalDiagnosed = getTotalDiagnosedSum();
    const newPaidSum = getPaidSum();
    const remainingSum = totalDiagnosed - newPaidSum;
    
    let carsList = '';
    carsToPay.forEach((car, idx) => {
        carsList += `${idx + 1}. ${car.raqam} | ${car.turi} | ${car.narxi.toLocaleString()} so‘m`;
        if (car.extra_works && car.extra_works.length > 0) {
            carsList += ` (+${(car.extra_amount || 0).toLocaleString()} so‘m)`;
        }
        carsList += `\n`;
    });
    
    await sendToAllObservers(
        `✅ *TO‘LOV TASDIQLANDI!*\n\n` +
        `🚗 *To‘lov qilingan avtomobillar:*\n${carsList}\n` +
        `💰 *Jami summa:* ${totalAmount.toLocaleString()} so‘m\n` +
        `👤 *Admin:* ${ctx.from.first_name}\n\n` +
        `📊 *Jami diagnostika summasi:* ${totalDiagnosed.toLocaleString()} so‘m\n` +
        `💵 *To‘lov qilingan umumiy summa:* ${newPaidSum.toLocaleString()} so‘m\n` +
        `📉 *Qolgan qoldiq:* ${remainingSum.toLocaleString()} so‘m`,
        { parse_mode: 'Markdown' }
    );
    
    if (userData.messageId) {
        try {
            await ctx.deleteMessage(userData.messageId);
        } catch(e) {}
    }
    userSelections.delete(ctx.from.id);
    await ctx.reply(`✅ *TO‘LOV TASDIQLANDI!*\n\n🚗 ${carsToPay.length} ta avtomobil to‘lovi tasdiqlandi.\n💰 Jami summa: ${totalAmount.toLocaleString()} so‘m`, { parse_mode: 'Markdown' });
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    await ctx.answerCbQuery();
});

// Bekor qilish
bot.action('unpaid_cancel', async (ctx) => {
    const userData = userSelections.get(ctx.from.id);
    if (userData && userData.messageId) {
        try {
            await ctx.deleteMessage(userData.messageId);
        } catch(e) {}
    }
    userSelections.delete(ctx.from.id);
    await ctx.reply('❌ Bekor qilindi');
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    await ctx.answerCbQuery();
});

// To'langanlarni ko'rish (inline)
bot.action('unpaid_view_paid', async (ctx) => {
    const paidCars = getPaidCarsList();
    if (paidCars.length === 0) {
        await ctx.answerCbQuery('📋 Hali hech qanday to‘lov tasdiqlanmagan');
        return;
    }
    
    let message = '✅ *TO‘LOV QILINGAN AVTOMOBILLAR*\n\n';
    paidCars.forEach((car, idx) => {
        const sana = car.paid_date.split(',')[0];
        message += `${idx+1}. *${car.raqam}* | ${car.turi} | ${car.total_amount.toLocaleString()} so‘m\n`;
        message += `   📅 ${sana} | 👤 ${car.admin_name}\n\n`;
    });
    message += `💰 *Jami to‘lov summa:* ${getPaidSum().toLocaleString()} so‘m`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery();
});

// ============ REGISTRATSIYA ============
bot.command('start', async (ctx) => {
    if (isAllowed(ctx)) {
        let msg = isSuperAdminById(ctx) ? `👑 Assalomu alaykum SUPER ADMIN ${ctx.from.first_name}!` :
                  isAdminById(ctx) ? `👋 Assalomu alaykum Admin ${ctx.from.first_name}!` :
                  `👋 Assalomu alaykum Kuzatuvchi ${ctx.from.first_name}!`;
        await ctx.reply(msg + `\n\n✅ Bot ishga tushdi.\n💰 *Asosiy diagnostika narxi:* ${BASE_PRICE.toLocaleString()} so‘m`, { parse_mode: 'Markdown', ...getMainMenu(ctx) });
        return;
    }
    await ctx.reply(`❌ Ro‘yxatdan o‘tmagansiz.\n\n📞 Iltimos, telefon raqamingizni yuboring:`, Markup.keyboard([[Markup.button.contactRequest('📞 Telefon raqamni yuborish')]]).resize());
});

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

bot.command('menu', async (ctx) => {
    if (!isAllowed(ctx)) return;
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
});

// ============ QO'SHIMCHA ISH SUMMASINI KIRITISH ============
let extraAmountStep = new Map();

async function askExtraAmount(ctx, carNumber, carType, extraWorks) {
    extraAmountStep.set(ctx.from.id, {
        carNumber: carNumber,
        carType: carType,
        extraWorks: extraWorks,
        step: 'waiting_for_amount'
    });
    await ctx.reply(
        `📝 *Qo‘shimcha ishlar uchun summa kiriting:*\n\nTanlangan ishlar: ${extraWorks.join(', ')}\n💰 Asosiy narx: ${BASE_PRICE.toLocaleString()} so‘m\n➕ Qo‘shimcha summa (faqat raqam):\nMisol: 50000\n⚠️ Agar qo‘shimcha summa bo‘lmasa, 0 yoki "yo‘q" deb yozing`,
        { parse_mode: 'Markdown' }
    );
}

// ============ XABAR BOSHQARISH ============
const addSteps = new Map();
const deleteSteps = new Map();

bot.on('text', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const text = ctx.message.text;
    const step = addSteps.get(ctx.from.id);
    const deleteStep = deleteSteps.get(ctx.from.id);
    const extraStep = extraAmountStep.get(ctx.from.id);
    const editData = editSteps.get(ctx.from.id);
    
    // Qo'shimcha summa kiritish
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
        await addCarWithExtras(extraStep.carNumber, extraStep.carType, true, ctx.from.id, ctx.from.first_name, extraStep.extraWorks, extraAmount);
        extraAmountStep.delete(ctx.from.id);
        await ctx.reply(`✅ *Avtomobil qo‘shildi!*\n\n🚗 *Raqam:* ${extraStep.carNumber}\n🏷️ *Turi:* ${extraStep.carType}\n💰 *Jami summa:* ${totalPrice.toLocaleString()} so‘m`, { parse_mode: 'Markdown' });
        
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
    
    // Tahrirlashda qo'shimcha summa
    if (editData && editData.step === 'waiting_extra_amount') {
        if (!isAdminById(ctx)) return;
        let extraAmount = 0;
        const input = text.toLowerCase();
        if (input !== '0' && input !== 'yo\'q' && input !== 'нет') {
            const parsed = parseInt(text.replace(/[^0-9]/g, ''));
            if (isNaN(parsed)) return ctx.reply('❌ Noto‘g‘ri format! Faqat raqam kiriting.');
            extraAmount = parsed;
        }
        const newNarxi = BASE_PRICE + extraAmount;
        updateCar(editData.carNumber, { extra_works: editData.currentExtra || [], extra_amount: extraAmount, narxi: newNarxi });
        editSteps.delete(ctx.from.id);
        await ctx.reply(`✅ *Ma'lumotlar yangilandi!*\n\n🚗 *Raqam:* ${editData.carNumber}\n📋 *Qo‘shimcha ishlar:* ${(editData.currentExtra || []).join(', ') || 'Yo‘q'}\n➕ *Qo‘shimcha summa:* ${extraAmount.toLocaleString()} so‘m\n💎 *Yangi jami summa:* ${newNarxi.toLocaleString()} so‘m`, { parse_mode: 'Markdown' });
        await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
        return;
    }
    
    // Avtomobil raqami kiritish
    if (step?.step === 'number') {
        if (!isAdminById(ctx)) return;
        if (!isValidPlate(text)) {
            return ctx.reply(`❌ *Noto‘g‘ri format!*\n\nQabul qilinadigan formatlar:\n• 01A777AA | 01A111111 | 01111AAA\n• A777AA | 123ABC | 01AA777 | AA777AA`, { parse_mode: 'Markdown' });
        }
        step.carNumber = text.toUpperCase();
        step.step = 'waiting_for_type';
        addSteps.set(ctx.from.id, step);
        return ctx.reply(`✅ *Raqam:* ${step.carNumber}\n\n*Avtomobil turini tanlang:*`, { parse_mode: 'Markdown', ...getCarTypeKeyboard() });
    }
    
    // Avtomobil o'chirish
    if (deleteStep?.step === 'delete_car' && isSuperAdminById(ctx)) {
        const deleted = deleteCar(text);
        await ctx.reply(deleted ? `✅ Avtomobil o‘chirildi: ${text.toUpperCase()}` : `❌ ${text} topilmadi.`);
        deleteSteps.delete(ctx.from.id);
        return ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    }
    
    // Tahrirlash uchun raqam
    if (deleteStep?.step === 'edit_car_number') {
        if (!isAdminById(ctx)) return;
        deleteSteps.delete(ctx.from.id);
        await showEditMenu(ctx, text.toUpperCase());
        return;
    }
    
    // ============ MENYU TUGMALARI ============
    if (text === '🚗 Avtomobil qo\'shish' && isAdminById(ctx)) {
        addSteps.set(ctx.from.id, { step: 'number' });
        return ctx.reply(`📝 *1-qadam:* Avtomobil raqamini kiriting\n\n💰 *Asosiy diagnostika narxi:* ${BASE_PRICE.toLocaleString()} so‘m\n\nQabul qilinadigan formatlar: 01A777AA | 01A111111 | 01111AAA | A777AA | 123ABC`, { parse_mode: 'Markdown' });
    }
    
    if (text === '✏️ Ma\'lumot tahrirlash' && isAdminById(ctx)) {
        deleteSteps.set(ctx.from.id, { step: 'edit_car_number' });
        return ctx.reply(`✏️ *TAHRIRLANADIGAN AVTOMOBIL RAQAMINI KIRITING*\n\nMisol: 01A777AA\n⚠️ Faqat bazada mavjud avtomobillarni tahrirlash mumkin.`, { parse_mode: 'Markdown' });
    }
    
    if (text === '🗑️ Avtomobil o\'chirish' && isSuperAdminById(ctx)) {
        deleteSteps.set(ctx.from.id, { step: 'delete_car' });
        return ctx.reply('🗑️ *O‘chiriladigan raqamni kiriting:*', { parse_mode: 'Markdown' });
    }
    
    if (text === '⬅️ Oxirgi avtomobilni o\'chirish' && isAdminById(ctx)) {
        const deleted = deleteLastCar();
        await ctx.reply(deleted ? `✅ Oxirgi avtomobil o‘chirildi:\n🚗 ${deleted.raqam} | ${deleted.turi}` : `❌ Hech qanday avtomobil yo‘q.`);
        return;
    }
    
    if (text === '📊 Statistika' && isSuperAdminById(ctx)) {
        const s = getStats();
        return ctx.reply(`📊 *STATISTIKA*\n\n🚗 *Jami:* ${s.total}\n✅ *Diagnostika qilingan:* ${s.diagnosed}\n❌ *Qilinmagan:* ${s.notDiagnosed}\n💵 *Tasdiqlangan avtomobillar:* ${s.paidCarsCount} ta\n\n💰 *Jami diagnostika summasi:* ${s.totalSum.toLocaleString()} so‘m\n💵 *To‘lov qilingan summa:* ${s.paidSum.toLocaleString()} so‘m\n📉 *Qolgan qoldiq:* ${s.remainingSum.toLocaleString()} so‘m`, { parse_mode: 'Markdown' });
    }
    
    if (text === '💰 Jami summa') {
        const total = getTotalDiagnosedSum();
        const paidSum = getPaidSum();
        const remaining = total - paidSum;
        return ctx.reply(`💰 *SUMMA HISOBOTI*\n\n💰 *Asosiy narx:* ${BASE_PRICE.toLocaleString()} so‘m\n📊 *Jami diagnostika summasi:* ${total.toLocaleString()} so‘m\n💵 *To‘lov qilingan:* ${paidSum.toLocaleString()} so‘m\n📉 *Qoldiq:* ${remaining.toLocaleString()} so‘m`, { parse_mode: 'Markdown' });
    }
    
    if (text === '📋 Avtomobillar') {
        await showAllCars(ctx);
        return;
    }
    
    if (text === '✅ Tasdiqlanganlar') {
        await showPaidCars(ctx);
        return;
    }
    
    if (text === '💵 To\'lovni tasdiqlash' && isSuperAdminById(ctx)) {
        await showUnpaidCarsMenu(ctx, 0);
        return;
    }
    
    if (text === '💾 Backup olish' && isSuperAdminById(ctx)) {
        const backupData = { cars: getAllCars(), paid_cars: loadPaidCars(), base_price: BASE_PRICE, date: new Date().toLocaleString('uz-UZ') };
        return ctx.replyWithDocument({ source: Buffer.from(JSON.stringify(backupData, null, 2), 'utf-8'), filename: `backup_${Date.now()}.json` });
    }
    
    if (text === '🔄 Backup tiklash' && isSuperAdminById(ctx)) {
        deleteSteps.set(ctx.from.id, { step: 'restore_backup' });
        return ctx.reply('🔄 *Backup faylni yuboring* (JSON format)', { parse_mode: 'Markdown' });
    }
});

// ============ AVTOMOBIL TURINI TANLASH ============
bot.action(/car_type_(.+)/, async (ctx) => {
    const editData = editSteps.get(ctx.from.id);
    if (editData && editData.step === 'edit_type') {
        const selectedType = ctx.match[1];
        updateCar(editData.carNumber, { turi: selectedType });
        await ctx.editMessageText(`✅ Avtomobil turi "${selectedType}" ga o‘zgartirildi!`);
        await showEditMenu(ctx, editData.carNumber);
        await ctx.answerCbQuery();
        return;
    }
    
    if (!isAdminById(ctx)) return;
    const selectedType = ctx.match[1];
    const step = addSteps.get(ctx.from.id);
    if (!step || step.step !== 'waiting_for_type') {
        await ctx.answerCbQuery('❌ Jarayon qaytadan boshlang /add');
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

// ============ QO'SHIMCHA ISHLARNI TANLASH ============
let selectedExtraWorks = new Map();

bot.action(/extra_(.+)/, async (ctx) => {
    if (!isAdminById(ctx)) return;
    const work = ctx.match[1].replace(/_/g, ' ');
    const step = addSteps.get(ctx.from.id);
    if (!step || step.step !== 'waiting_for_extra') {
        await ctx.answerCbQuery('❌ Jarayon qaytadan boshlang /add');
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
        await ctx.answerCbQuery('❌ Jarayon qaytadan boshlang /add');
        return;
    }
    const works = selectedExtraWorks.get(ctx.from.id) || [];
    addSteps.delete(ctx.from.id);
    selectedExtraWorks.delete(ctx.from.id);
    await askExtraAmount(ctx, step.carNumber, step.carType, works);
    await ctx.answerCbQuery();
});

bot.action('skip_extra', async (ctx) => {
    if (!isAdminById(ctx)) return;
    const step = addSteps.get(ctx.from.id);
    if (!step || step.step !== 'waiting_for_extra') {
        await ctx.answerCbQuery('❌ Jarayon qaytadan boshlang /add');
        return;
    }
    addSteps.delete(ctx.from.id);
    selectedExtraWorks.delete(ctx.from.id);
    await addCarWithExtras(step.carNumber, step.carType, true, ctx.from.id, ctx.from.first_name, [], 0);
    await ctx.editMessageText(`✅ *Avtomobil qo‘shildi!*\n\n🚗 *Raqam:* ${step.carNumber}\n🏷️ *Turi:* ${step.carType}\n✅ *Diagnostika:* O‘tkazildi\n💰 *Jami summa:* ${BASE_PRICE.toLocaleString()} so‘m\n👤 *Admin:* ${ctx.from.first_name}`, { parse_mode: 'Markdown' });
    
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
    extraAmountStep.delete(ctx.from.id);
    await ctx.editMessageText('❌ Bekor qilindi');
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    await ctx.answerCbQuery();
});

// ============ BACKUP TIKLASH ============
bot.on('document', async (ctx) => {
    if (!isSuperAdminById(ctx)) return;
    const step = deleteSteps.get(ctx.from.id);
    if (step?.step !== 'restore_backup') return;
    
    try {
        const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
        const response = await fetch(fileLink.href);
        const backupData = await response.json();
        if (backupData.cars) saveData(backupData.cars);
        if (backupData.paid_cars) savePaidCars(backupData.paid_cars);
        deleteSteps.delete(ctx.from.id);
        await ctx.reply(`✅ Backup tiklandi!\n🚗 Avtomobillar: ${backupData.cars?.length || 0} ta`);
    } catch {
        await ctx.reply('❌ Xato! Noto‘g‘ri backup fayl.');
    }
});

// ============ BOTNI ISHGA TUSHIRISH ============
bot.launch();
console.log('🤖 Bot ishga tushdi!');
console.log(`👑 Admin telefonlari: ${ADMIN_PHONES.join(', ')}`);
console.log(`📞 Kuzatuvchi telefonlari: ${OBSERVER_PHONES.join(', ')}`);
console.log(`💰 Asosiy diagnostika narxi: ${BASE_PRICE.toLocaleString()} so‘m`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
