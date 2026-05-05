require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

// ============ KONFIGURATSIYA ============
const BOT_TOKEN = process.env.BOT_TOKEN;

const SUPER_ADMIN_ID = 1437230485;
const ADMIN2_ID = 987654321;
const OBSERVER_PHONE = '+998902247888';
let registeredObserverId = null;

const ADMIN_IDS = [SUPER_ADMIN_ID, ADMIN2_ID];
const DIAGNOSIS_PRICE = 250000;

// AVTOMOBIL TURLARI (VARIANTLAR)
const CAR_TYPES = [
    'CNG', 'D-MAX RG', 'D-MAX RT', 'NPR75', 'HD50',
    'HC45', 'CYZ EXR', 'NQR90', 'NMR77', 'NMR85'
];

function getCarTypeKeyboard() {
    const buttons = CAR_TYPES.map(type => [Markup.button.callback(type, `car_type_${type}`)]);
    buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_add')]);
    return Markup.inlineKeyboard(buttons);
}

// ============ MA'LUMOTLAR BAZASI ============
const DB_FILE = path.join(__dirname, 'cars.json');
const OBSERVER_FILE = path.join(__dirname, 'observer.json');
const RECEIVED_FILE = path.join(__dirname, 'received.json');
const PAID_CARS_FILE = path.join(__dirname, 'paid_cars.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(OBSERVER_FILE)) fs.writeFileSync(OBSERVER_FILE, JSON.stringify({ userId: null }, null, 2));
if (!fs.existsSync(RECEIVED_FILE)) fs.writeFileSync(RECEIVED_FILE, JSON.stringify({ total: 0, payments: [] }, null, 2));
if (!fs.existsSync(PAID_CARS_FILE)) fs.writeFileSync(PAID_CARS_FILE, JSON.stringify([], null, 2));

function saveObserverId(userId) {
    registeredObserverId = userId;
    fs.writeFileSync(OBSERVER_FILE, JSON.stringify({ userId }, null, 2));
}

function loadObserverId() {
    try {
        const data = JSON.parse(fs.readFileSync(OBSERVER_FILE, 'utf8'));
        registeredObserverId = data.userId;
    } catch(e) { registeredObserverId = null; }
}
loadObserverId();

function loadData() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveData(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function loadReceived() {
    try {
        return JSON.parse(fs.readFileSync(RECEIVED_FILE, 'utf8'));
    } catch(e) {
        return { total: 0, payments: [] };
    }
}

function saveReceived(received) {
    fs.writeFileSync(RECEIVED_FILE, JSON.stringify(received, null, 2));
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

function addPaidCar(carNumber, carType, amount, adminName) {
    const paidCars = loadPaidCars();
    const existingIndex = paidCars.findIndex(c => c.raqam === carNumber.toUpperCase());
    const paidCar = {
        id: existingIndex !== -1 ? paidCars[existingIndex].id : Date.now(),
        raqam: carNumber.toUpperCase(),
        turi: carType,
        amount: amount,
        admin_name: adminName,
        paid_date: new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })
    };
    
    if (existingIndex !== -1) {
        paidCars[existingIndex] = paidCar;
    } else {
        paidCars.push(paidCar);
    }
    savePaidCars(paidCars);
    return paidCar;
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
    const diagnosedCars = cars.filter(car => car.diagnostika.includes('o‘tkazildi'));
    const paidCars = loadPaidCars();
    const paidNumbers = paidCars.map(c => c.raqam);
    return diagnosedCars.filter(car => !paidNumbers.includes(car.raqam));
}

function getTotalDiagnosedSum() {
    const cars = loadData();
    const diagnosedCars = cars.filter(car => car.diagnostika.includes('o‘tkazildi'));
    return diagnosedCars.reduce((sum, car) => sum + car.narxi, 0);
}

function getPaidSum() {
    const paidCars = loadPaidCars();
    return paidCars.reduce((sum, car) => sum + car.amount, 0);
}

function addCar(carNumber, carType, isDiagnosed, adminId, adminName) {
    const cars = loadData();
    const sana = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
    const diagnostika = isDiagnosed ? "✅ o‘tkazildi" : "❌ o‘tkazilmadi";
    const narxi = isDiagnosed ? DIAGNOSIS_PRICE : 0;
    
    const newCar = {
        id: Date.now(),
        sana,
        raqam: carNumber.toUpperCase(),
        turi: carType,
        diagnostika,
        narxi,
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
    const received = loadReceived().total;
    return { total: cars.length, diagnosed, notDiagnosed, totalSum, paidSum, received, remaining: totalSum - received };
}

function getAllCars() {
    return loadData();
}

// ============ BOT ============
const bot = new Telegraf(BOT_TOKEN);

function isSuperAdmin(ctx) { return ctx.from.id === SUPER_ADMIN_ID; }
function isAdmin(ctx) { return ADMIN_IDS.includes(ctx.from.id); }
function isObserver(ctx) { return registeredObserverId === ctx.from.id; }
function isAllowed(ctx) { return isAdmin(ctx) || isObserver(ctx); }

function getMainMenu(ctx) {
    if (isSuperAdmin(ctx)) {
        return Markup.keyboard([
            ['🚗 Avtomobil qo\'shish', '🗑️ Avtomobil o\'chirish'],
            ['📊 Statistika', '💰 Jami summa'],
            ['💵 Olingan summa', '✅ To\'lovni tasdiqlash'],
            ['💾 Backup olish', '🔄 Backup tiklash']
        ]).resize();
    } else if (isAdmin(ctx)) {
        return Markup.keyboard([
            ['🚗 Avtomobil qo\'shish', '⬅️ Oxirgi avtomobilni o\'chirish']
        ]).resize();
    } else if (isObserver(ctx)) {
        return Markup.keyboard([
            ['💰 Jami summa', '📋 So\'nggi yozuvlar']
        ]).resize();
    }
    return null;
}

// ============ REGISTRATSIYA ============
bot.command('start', async (ctx) => {
    if (isAllowed(ctx)) {
        let msg = isSuperAdmin(ctx) ? `👑 Assalomu alaykum SUPER ADMIN ${ctx.from.first_name}!` :
                  isAdmin(ctx) ? `👋 Assalomu alaykum Admin ${ctx.from.first_name}!` :
                  `👋 Assalomu alaykum Kuzatuvchi ${ctx.from.first_name}!`;
        await ctx.reply(msg + `\n\n✅ Bot ishga tushdi.`, { parse_mode: 'Markdown', ...getMainMenu(ctx) });
        return;
    }
    await ctx.reply(`❌ Ro‘yxatdan o‘tmagansiz.\n\n📞 Telefon raqamingizni yuboring:`, Markup.keyboard([[Markup.button.contactRequest('📞 Telefon raqamni yuborish')]]).resize());
});

bot.on('contact', async (ctx) => {
    const phone = ctx.message.contact.phone_number;
    if (phone === OBSERVER_PHONE) {
        saveObserverId(ctx.from.id);
        await ctx.reply(`✅ Kuzatuvchi sifatida tasdiqlandingiz!`, getMainMenu(ctx));
    } else {
        await ctx.reply(`❌ Raqamingiz ro‘yxatda yo‘q.`);
    }
});

bot.command('menu', async (ctx) => {
    if (!isAllowed(ctx)) return;
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
});

// ============ TO'LOVNI TASDIQLASH UCHUN TUGMA ============
async function showUnpaidCars(ctx) {
    const unpaidCars = getUnpaidCars();
    if (unpaidCars.length === 0) {
        await ctx.reply('✅ Barcha avtomobillar uchun to‘lov qilingan!');
        return;
    }
    
    let message = '💰 *TO‘LOV QILINMAGAN AVTOMOBILLAR*\n\n';
    const buttons = [];
    
    unpaidCars.forEach((car, idx) => {
        message += `${idx+1}. *${car.raqam}* | ${car.turi} | ${car.narxi.toLocaleString()} so‘m\n`;
        buttons.push([Markup.button.callback(`✅ ${car.raqam} (${car.narxi.toLocaleString()} so‘m)`, `pay_car_${car.raqam}_${car.turi}_${car.narxi}`)]);
    });
    
    message += `\n📊 *Jami to‘lov qilinmagan summa:* ${unpaidCars.reduce((s, c) => s + c.narxi, 0).toLocaleString()} so‘m`;
    buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_payment')]);
    
    await ctx.reply(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
}

// ============ XABAR BOSHQARISH ============
const addSteps = new Map();
const deleteSteps = new Map();

bot.on('text', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const text = ctx.message.text;
    const step = addSteps.get(ctx.from.id);
    const deleteStep = deleteSteps.get(ctx.from.id);
    
    // Avtomobil qo'shish - raqam kiritish
    if (step?.step === 'number') {
        if (!isAdmin(ctx)) return;
        const platePattern = /^[0-9]{2}[A-Z][0-9]{3}[A-Z]{2}$/i;
        if (!platePattern.test(text)) return ctx.reply('❌ Noto‘g‘ri format! Masalan: 01A777AA');
        step.carNumber = text.toUpperCase();
        step.step = 'waiting_for_type';
        addSteps.set(ctx.from.id, step);
        
        return ctx.reply(
            `✅ Raqam: ${step.carNumber}\n\n*Avtomobil turini tanlang:*`,
            { parse_mode: 'Markdown', ...getCarTypeKeyboard() }
        );
    }
    
    // Avtomobil o'chirish (Super Admin)
    if (deleteStep?.step === 'delete_car' && isSuperAdmin(ctx)) {
        const deleted = deleteCar(text);
        await ctx.reply(deleted ? `✅ Avtomobil o‘chirildi: ${text.toUpperCase()}` : `❌ ${text} topilmadi.`);
        deleteSteps.delete(ctx.from.id);
        return ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    }
    
    // Olingan summa qo'shish (Super Admin)
    if (deleteStep?.step === 'received_amount' && isSuperAdmin(ctx)) {
        const amount = parseInt(text.replace(/[^0-9]/g, ''));
        if (isNaN(amount) || amount <= 0) {
            deleteSteps.delete(ctx.from.id);
            return ctx.reply('❌ Noto‘g‘ri format! Iltimos, musbat raqam kiriting.');
        }
        
        const total = getTotalDiagnosedSum();
        const currentReceived = loadReceived().total;
        const newReceived = currentReceived + amount;
        
        if (newReceived > total) {
            return ctx.reply(
                `❌ *Xato!* Olingan summa jami summadan oshib ketadi.\n\n` +
                `💰 Jami summa: ${total.toLocaleString()} so‘m\n` +
                `💵 Hozirgi olingan: ${currentReceived.toLocaleString()} so‘m\n` +
                `📉 Maksimal: ${(total - currentReceived).toLocaleString()} so‘m`,
                { parse_mode: 'Markdown' }
            );
        }
        
        const remaining = total - newReceived;
        const received = loadReceived();
        received.total = newReceived;
        received.payments.push({
            amount: amount,
            date: new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }),
            remaining_after: remaining
        });
        saveReceived(received);
        
        deleteSteps.delete(ctx.from.id);
        
        await ctx.reply(
            `✅ *To‘lov qabul qilindi!*\n\n` +
            `💵 Qo‘shilgan: ${amount.toLocaleString()} so‘m\n` +
            `💰 Jami diagnostika summasi: ${total.toLocaleString()} so‘m\n` +
            `💵 Olingan summa: ${newReceived.toLocaleString()} so‘m\n` +
            `📉 Qoldiq summa: ${remaining.toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
        
        if (registeredObserverId) {
            await bot.telegram.sendMessage(registeredObserverId,
                `💰 *TO‘LOV MA’LUMOTI*\n\n` +
                `💵 *To‘lov miqdori:* ${amount.toLocaleString()} so‘m\n` +
                `💵 *Olingan umumiy summa:* ${newReceived.toLocaleString()} so‘m\n` +
                `📉 *Qoldiq summa:* ${remaining.toLocaleString()} so‘m\n` +
                `👤 *Admin:* ${ctx.from.first_name}`,
                { parse_mode: 'Markdown' }
            );
        }
        return;
    }
    
    // ============ MENYU TUGMALARI ============
    
    if (text === '🚗 Avtomobil qo\'shish' && isAdmin(ctx)) {
        addSteps.set(ctx.from.id, { step: 'number' });
        return ctx.reply('📝 *1-qadam:* Avtomobil raqamini kiriting\n\nFormat: `01A777AA`', { parse_mode: 'Markdown' });
    }
    
    if (text === '🗑️ Avtomobil o\'chirish' && isSuperAdmin(ctx)) {
        deleteSteps.set(ctx.from.id, { step: 'delete_car' });
        return ctx.reply('🗑️ *O‘chiriladigan raqamni kiriting:*', { parse_mode: 'Markdown' });
    }
    
    if (text === '⬅️ Oxirgi avtomobilni o\'chirish' && isAdmin(ctx)) {
        const deleted = deleteLastCar();
        await ctx.reply(deleted ? `✅ Oxirgi avtomobil o‘chirildi:\n🚗 ${deleted.raqam} | ${deleted.turi}` : `❌ Hech qanday avtomobil yo‘q.`);
        return;
    }
    
    if (text === '📊 Statistika' && isSuperAdmin(ctx)) {
        const s = getStats();
        const unpaidCars = getUnpaidCars();
        const unpaidTotal = unpaidCars.reduce((sum, c) => sum + c.narxi, 0);
        return ctx.reply(
            `📊 *STATISTIKA*\n\n` +
            `🚗 *Jami avtomobillar:* ${s.total}\n` +
            `✅ *Diagnostika qilingan:* ${s.diagnosed}\n` +
            `❌ *Qilinmagan:* ${s.notDiagnosed}\n\n` +
            `💰 *Jami diagnostika summasi:* ${s.totalSum.toLocaleString()} so‘m\n` +
            `💵 *To‘lov qilingan summa:* ${s.paidSum.toLocaleString()} so‘m\n` +
            `💵 *Olingan summa (kassa):* ${s.received.toLocaleString()} so‘m\n` +
            `📉 *To‘lov qilinmagan summa:* ${unpaidTotal.toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    if (text === '💰 Jami summa') {
        const total = getTotalDiagnosedSum();
        const received = loadReceived().total;
        const paidSum = getPaidSum();
        const remaining = total - received;
        return ctx.reply(
            `💰 *SUMMA HISOBOTI*\n\n` +
            `📊 *Jami diagnostika summasi:* ${total.toLocaleString()} so‘m\n` +
            `💵 *To‘lov qilingan:* ${paidSum.toLocaleString()} so‘m\n` +
            `💵 *Olingan (kassa):* ${received.toLocaleString()} so‘m\n` +
            `📉 *Qoldiq:* ${remaining.toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    if (text === '💵 Olingan summa' && isSuperAdmin(ctx)) {
        const total = getTotalDiagnosedSum();
        const received = loadReceived().total;
        deleteSteps.set(ctx.from.id, { step: 'received_amount' });
        return ctx.reply(
            `💵 *TO‘LOV QABUL QILISH*\n\n` +
            `💰 Jami: *${total.toLocaleString()}* so‘m\n` +
            `💵 Olingan: *${received.toLocaleString()}* so‘m\n` +
            `📉 Qoldiq: *${(total - received).toLocaleString()}* so‘m\n\n` +
            `➕ Qancha summa qo‘shmoqchisiz?`,
            { parse_mode: 'Markdown' }
        );
    }
    
    if (text === '✅ To\'lovni tasdiqlash' && isSuperAdmin(ctx)) {
        await showUnpaidCars(ctx);
        return;
    }
    
    if (text === '💾 Backup olish' && isSuperAdmin(ctx)) {
        const backupData = { 
            cars: getAllCars(), 
            received: loadReceived(), 
            paid_cars: loadPaidCars(),
            date: new Date().toLocaleString('uz-UZ') 
        };
        return ctx.replyWithDocument({ source: Buffer.from(JSON.stringify(backupData, null, 2), 'utf-8'), filename: `backup_${Date.now()}.json` });
    }
    
    if (text === '🔄 Backup tiklash' && isSuperAdmin(ctx)) {
        deleteSteps.set(ctx.from.id, { step: 'restore_backup' });
        return ctx.reply('🔄 *Backup faylni yuboring* (JSON format)', { parse_mode: 'Markdown' });
    }
    
    if (text === '📋 So\'nggi yozuvlar' && isObserver(ctx)) {
        const cars = loadData();
        const last10 = cars.slice(-10).reverse();
        if (!last10.length) return ctx.reply('📋 Hech qanday ma\'lumot yo‘q.');
        let result = "📋 *OXIRGI 10 TA YOZUV*\n\n";
        last10.forEach((car, idx) => {
            const paid = isCarPaid(car.raqam) ? "✅ To‘lov qilingan" : "⏳ To‘lov kutilmoqda";
            result += `${idx+1}. *${car.raqam}* | ${car.turi} | ${car.diagnostika} | ${car.narxi.toLocaleString()} so‘m\n`;
            result += `   📅 ${car.sana} | 👤 ${car.admin_name} | ${paid}\n\n`;
        });
        return ctx.reply(result, { parse_mode: 'Markdown' });
    }
});

// ============ AVTOMOBIL TURINI TANLASH (VARIANTLAR) ============
bot.action(/car_type_(.+)/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    const selectedType = ctx.match[1];
    const step = addSteps.get(ctx.from.id);
    
    if (!step || step.step !== 'waiting_for_type') {
        await ctx.answerCbQuery('❌ Jarayon qaytadan boshlang /add');
        return;
    }
    
    step.carType = selectedType;
    step.step = null;
    addSteps.delete(ctx.from.id);
    
    await ctx.editMessageText(
        `✅ *Ma'lumotlar:*\n` +
        `🚗 Raqam: ${step.carNumber}\n` +
        `🏷️ Turi: ${selectedType}\n\n` +
        `*Diagnostika holati?*`,
        Markup.inlineKeyboard([
            [Markup.button.callback(`✅ O‘tkazildi (${DIAGNOSIS_PRICE.toLocaleString()} so‘m)`, `diag_yes_${step.carNumber}_${selectedType}`)],
            [Markup.button.callback('❌ O‘tkazilmadi', `diag_no_${step.carNumber}_${selectedType}`)],
            [Markup.button.callback('🔙 Orqaga', 'cancel_add')]
        ])
    );
    await ctx.answerCbQuery();
});

// Bekor qilish
bot.action('cancel_add', async (ctx) => {
    addSteps.delete(ctx.from.id);
    await ctx.editMessageText('❌ Bekor qilindi');
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    await ctx.answerCbQuery();
});

bot.action('cancel_payment', async (ctx) => {
    await ctx.editMessageText('❌ Bekor qilindi');
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    await ctx.answerCbQuery();
});

// ============ TO'LOVNI TASDIQLASH (AVTOMOBIL BAZASIGA QO'SHISH) ============
bot.action(/pay_car_(.+)_(.+)_(.+)/, async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    
    const carNumber = ctx.match[1];
    const carType = ctx.match[2];
    const amount = parseInt(ctx.match[3]);
    
    // Avtomobilni to'lov qilinganlarga qo'shish
    addPaidCar(carNumber, carType, amount, ctx.from.first_name);
    
    // Jami olingan summaga qo'shish
    const currentReceived = loadReceived().total;
    const newReceived = currentReceived + amount;
    const total = getTotalDiagnosedSum();
    const remaining = total - newReceived;
    
    const received = loadReceived();
    received.total = newReceived;
    received.payments.push({
        amount: amount,
        car_number: carNumber,
        car_type: carType,
        date: new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }),
        admin_name: ctx.from.first_name,
        remaining_after: remaining
    });
    saveReceived(received);
    
    await ctx.editMessageText(
        `✅ *To‘lov tasdiqlandi!*\n\n` +
        `🚗 *Avtomobil:* ${carNumber} | ${carType}\n` +
        `💰 *Summa:* ${amount.toLocaleString()} so‘m\n` +
        `👤 *Admin:* ${ctx.from.first_name}\n` +
        `📅 *Sana:* ${new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}`
    );
    
    // KUZATUVCHIGA XABAR
    if (registeredObserverId) {
        const unpaidCars = getUnpaidCars();
        const unpaidTotal = unpaidCars.reduce((sum, c) => sum + c.narxi, 0);
        
        await bot.telegram.sendMessage(registeredObserverId,
            `✅ *TO‘LOV TASDIQLANDI!*\n\n` +
            `🚗 *Avtomobil:* ${carNumber} | ${carType}\n` +
            `💰 *Summa:* ${amount.toLocaleString()} so‘m\n` +
            `👤 *Admin:* ${ctx.from.first_name}\n\n` +
            `📊 *Jami diagnostika summasi:* ${total.toLocaleString()} so‘m\n` +
            `💵 *Olingan umumiy summa:* ${newReceived.toLocaleString()} so‘m\n` +
            `📉 *Qolgan to‘lov:* ${unpaidTotal.toLocaleString()} so‘m\n` +
            `🚗 *To‘lov qilinmagan avtomobillar soni:* ${unpaidCars.length} ta`,
            { parse_mode: 'Markdown' }
        );
    }
    
    await ctx.answerCbQuery();
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
});

// ============ DIAGNOSTIKA JAVOBI ============
bot.action(/diag_yes_(.+)_(.+)/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const carNumber = ctx.match[1], carType = ctx.match[2];
    addCar(carNumber, carType, true, ctx.from.id, ctx.from.first_name);
    await ctx.editMessageText(
        `✅ *Avtomobil qo‘shildi!*\n\n` +
        `🚗 ${carNumber}\n🏷️ ${carType}\n✅ Diagnostika o‘tkazildi\n💰 ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`,
        { parse_mode: 'Markdown' }
    );
    
    const total = getTotalDiagnosedSum();
    const received = loadReceived().total;
    const remaining = total - received;
    
    if (registeredObserverId) {
        await bot.telegram.sendMessage(registeredObserverId,
            `🔔 *Yangi diagnostika!*\n\n` +
            `🚗 *Raqam:* ${carNumber}\n` +
            `🏷️ *Turi:* ${carType}\n` +
            `💰 *Summa:* ${DIAGNOSIS_PRICE.toLocaleString()} so‘m\n` +
            `👤 *Admin:* ${ctx.from.first_name}\n\n` +
            `📊 *JAMI SUM:* ${total.toLocaleString()} so‘m\n` +
            `💵 *OLINGAN:* ${received.toLocaleString()} so‘m\n` +
            `📉 *QOLDIQ:* ${remaining.toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    await ctx.answerCbQuery();
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
});

bot.action(/diag_no_(.+)_(.+)/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const carNumber = ctx.match[1], carType = ctx.match[2];
    addCar(carNumber, carType, false, ctx.from.id, ctx.from.first_name);
    await ctx.editMessageText(
        `✅ *Avtomobil qo‘shildi!*\n\n` +
        `🚗 ${carNumber}\n🏷️ ${carType}\n❌ Diagnostika o‘tkazilmadi\n💰 0 so‘m`,
        { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
});

// ============ BACKUP TIKLASH ============
bot.on('document', async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    const step = deleteSteps.get(ctx.from.id);
    if (step?.step !== 'restore_backup') return;
    
    try {
        const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
        const response = await fetch(fileLink.href);
        const backupData = await response.json();
        
        if (backupData.cars) saveData(backupData.cars);
        if (backupData.received) saveReceived(backupData.received);
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
console.log(`👑 Super Admin ID: ${SUPER_ADMIN_ID}`);
console.log(`🚗 Avtomobil turlari: ${CAR_TYPES.join(', ')}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
