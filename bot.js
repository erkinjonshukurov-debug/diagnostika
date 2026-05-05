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

// ============ MA'LUMOTLAR BAZASI ============
const DB_FILE = path.join(__dirname, 'cars.json');
const OBSERVER_FILE = path.join(__dirname, 'observer.json');
const RECEIVED_FILE = path.join(__dirname, 'received.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(OBSERVER_FILE)) fs.writeFileSync(OBSERVER_FILE, JSON.stringify({ userId: null }, null, 2));
if (!fs.existsSync(RECEIVED_FILE)) fs.writeFileSync(RECEIVED_FILE, JSON.stringify({ total: 0, payments: [] }, null, 2));

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

// Jami diagnostika summasi (o'zgarmas)
function getTotalDiagnosedSum() {
    const cars = loadData();
    const diagnosedCars = cars.filter(car => car.diagnostika.includes('o‘tkazildi'));
    return diagnosedCars.reduce((sum, car) => sum + car.narxi, 0);
}

// Qoldiq summa (jami - olingan)
function getRemainingAmount() {
    const total = getTotalDiagnosedSum();
    const received = loadReceived().total;
    return total - received;
}

// Olingan summaga qo'shish (qoldiqdan kamayadi)
function addToReceived(amount, note = '') {
    const received = loadReceived();
    received.total += amount;
    received.payments.push({
        amount: amount,
        date: new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }),
        note: note,
        remaining_after: getTotalDiagnosedSum() - received.total
    });
    saveReceived(received);
    return received.total;
}

// Olingan summani to'g'ridan-to'g'ri o'rnatish (emas, qo'shish kerak)
// BU FUNKSIYA ISHLATILMAYDI - faqat qo'shish ishlaydi
function setPaymentAmount(amount) {
    const received = loadReceived();
    received.total = amount;
    saveReceived(received);
    return received.total;
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
    return true;
}

function deleteLastCar() {
    const cars = loadData();
    if (cars.length === 0) return null;
    const removed = cars.pop();
    saveData(cars);
    return removed;
}

function getStats() {
    const cars = loadData();
    const diagnosed = cars.filter(c => c.diagnostika.includes('o‘tkazildi')).length;
    const notDiagnosed = cars.filter(c => c.diagnostika.includes('o‘tkazilmadi')).length;
    const totalSum = getTotalDiagnosedSum();
    const received = loadReceived().total;
    return { total: cars.length, diagnosed, notDiagnosed, totalSum, received, remaining: totalSum - received };
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
            ['💵 Olingan summa', '💾 Backup olish'],
            ['🔄 Backup tiklash', '❌ Asosiy menyuni yopish']
        ]).resize();
    } else if (isAdmin(ctx)) {
        return Markup.keyboard([
            ['🚗 Avtomobil qo\'shish', '⬅️ Oxirgi avtomobilni o\'chirish'],
            ['❌ Asosiy menyuni yopish']
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

// ============ XABAR BOSHQARISH ============
const addSteps = new Map();
const deleteSteps = new Map();

bot.on('text', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const text = ctx.message.text;
    const step = addSteps.get(ctx.from.id);
    const deleteStep = deleteSteps.get(ctx.from.id);
    
    // Avtomobil qo'shish
    if (step?.step === 'number') {
        if (!isAdmin(ctx)) return;
        const platePattern = /^[0-9]{2}[A-Z][0-9]{3}[A-Z]{2}$/i;
        if (!platePattern.test(text)) return ctx.reply('❌ Noto‘g‘ri format! Masalan: 01A777AA');
        step.carNumber = text.toUpperCase();
        step.step = 'type';
        addSteps.set(ctx.from.id, step);
        return ctx.reply(`✅ Raqam: ${step.carNumber}\n\n*2-qadam:* Avtomobil turini kiriting`, { parse_mode: 'Markdown' });
    }
    
    if (step?.step === 'type') {
        if (!isAdmin(ctx)) return;
        step.carType = text;
        addSteps.delete(ctx.from.id);
        return ctx.reply(
            `✅ Ma'lumotlar:\n🚗 ${step.carNumber}\n🏷️ ${step.carType}\n\n*Diagnostika holati?*`,
            Markup.inlineKeyboard([
                [Markup.button.callback(`✅ O‘tkazildi (${DIAGNOSIS_PRICE.toLocaleString()} so‘m)`, `diag_yes_${step.carNumber}_${step.carType}`)],
                [Markup.button.callback('❌ O‘tkazilmadi', `diag_no_${step.carNumber}_${step.carType}`)]
            ])
        );
    }
    
    // Avtomobil o'chirish (Super Admin)
    if (deleteStep?.step === 'delete_car' && isSuperAdmin(ctx)) {
        const deleted = deleteCar(text);
        await ctx.reply(deleted ? `✅ Avtomobil o‘chirildi: ${text.toUpperCase()}` : `❌ ${text} topilmadi.`);
        deleteSteps.delete(ctx.from.id);
        return ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    }
    
    // Olingan summa qo'shish (Super Admin) - HAR GAL QO'SHILADI
    if (deleteStep?.step === 'received_amount' && isSuperAdmin(ctx)) {
        const amount = parseInt(text.replace(/[^0-9]/g, ''));
        if (isNaN(amount) || amount <= 0) {
            deleteSteps.delete(ctx.from.id);
            return ctx.reply('❌ Noto‘g‘ri format! Iltimos, musbat raqam kiriting.');
        }
        
        const total = getTotalDiagnosedSum();
        const currentReceived = loadReceived().total;
        const newReceived = currentReceived + amount;
        
        // Agar olingan summa jami summadan oshib ketsa, xatolik
        if (newReceived > total) {
            return ctx.reply(
                `❌ *Xato!* Olingan summa jami summadan oshib ketadi.\n\n` +
                `💰 Jami summa: ${total.toLocaleString()} so‘m\n` +
                `💵 Hozirgi olingan: ${currentReceived.toLocaleString()} so‘m\n` +
                `📉 Maksimal olish mumkin: ${(total - currentReceived).toLocaleString()} so‘m`,
                { parse_mode: 'Markdown' }
            );
        }
        
        // Yangi to'lovni qo'shish
        const received = loadReceived();
        received.total = newReceived;
        received.payments.push({
            amount: amount,
            date: new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }),
            remaining_after: total - newReceived
        });
        saveReceived(received);
        
        const remaining = total - newReceived;
        deleteSteps.delete(ctx.from.id);
        return ctx.reply(
            `✅ *To‘lov qabul qilindi!*\n\n` +
            `💵 Qo‘shilgan summa: ${amount.toLocaleString()} so‘m\n` +
            `💰 Jami diagnostika summasi: ${total.toLocaleString()} so‘m\n` +
            `💵 Olingan summa: ${newReceived.toLocaleString()} so‘m\n` +
            `📉 Qoldiq summa: ${remaining.toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // ============ MENYU TUGMALARI ============
    
    if (text === '🚗 Avtomobil qo\'shish' && isAdmin(ctx)) {
        addSteps.set(ctx.from.id, { step: 'number' });
        return ctx.reply('📝 *Raqamni kiriting:*\n\nFormat: `01A777AA`', { parse_mode: 'Markdown' });
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
        return ctx.reply(
            `📊 *STATISTIKA*\n\n` +
            `🚗 *Jami avtomobillar:* ${s.total}\n` +
            `✅ *Diagnostika qilingan:* ${s.diagnosed}\n` +
            `❌ *Qilinmagan:* ${s.notDiagnosed}\n` +
            `💰 *Jami diagnostika summasi:* ${s.totalSum.toLocaleString()} so‘m\n` +
            `💵 *Olingan summa:* ${s.received.toLocaleString()} so‘m\n` +
            `📉 *Qoldiq:* ${s.remaining.toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    if (text === '💰 Jami summa') {
        const total = getTotalDiagnosedSum();
        const received = loadReceived().total;
        return ctx.reply(
            `💰 *JAMI DIAGNOSTIKA SUMMASI*\n\n` +
            `• Jami diagnostika summasi: *${total.toLocaleString()}* so‘m\n` +
            `• Olingan summa: *${received.toLocaleString()}* so‘m\n` +
            `• Qoldiq: *${(total - received).toLocaleString()}* so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    if (text === '💵 Olingan summa' && isSuperAdmin(ctx)) {
        const total = getTotalDiagnosedSum();
        const received = loadReceived().total;
        const remaining = total - received;
        deleteSteps.set(ctx.from.id, { step: 'received_amount' });
        return ctx.reply(
            `💵 *TO‘LOV QABUL QILISH*\n\n` +
            `💰 Jami diagnostika summasi: *${total.toLocaleString()}* so‘m\n` +
            `💵 Hozirgi olingan summa: *${received.toLocaleString()}* so‘m\n` +
            `📉 Qoldiq: *${remaining.toLocaleString()}* so‘m\n\n` +
            `➕ Qancha summa qo‘shmoqchisiz?\n` +
            `(Faqat raqam kiriting, masalan: 500000)`,
            { parse_mode: 'Markdown' }
        );
    }
    
    if (text === '💾 Backup olish' && isSuperAdmin(ctx)) {
        const backupData = { cars: getAllCars(), received: loadReceived(), date: new Date().toLocaleString('uz-UZ') };
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
            result += `${idx+1}. *${car.raqam}* | ${car.turi} | ${car.diagnostika} | ${car.narxi.toLocaleString()} so‘m\n`;
            result += `   📅 ${car.sana} | 👤 ${car.admin_name}\n\n`;
        });
        return ctx.reply(result, { parse_mode: 'Markdown' });
    }
    
    if (text === '❌ Asosiy menyuni yopish') {
        return ctx.reply('❌ Menyu yopildi. Qayta ochish /menu', { reply_markup: { remove_keyboard: true } });
    }
});

// ============ DIAGNOSTIKA JAVOBI ============
bot.action(/diag_yes_(.+)_(.+)/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const carNumber = ctx.match[1], carType = ctx.match[2];
    addCar(carNumber, carType, true, ctx.from.id, ctx.from.first_name);
    await ctx.editMessageText(`✅ Avtomobil qo‘shildi!\n🚗 ${carNumber}\n🏷️ ${carType}\n✅ Diagnostika o‘tkazildi\n💰 ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`);
    if (registeredObserverId) {
        await bot.telegram.sendMessage(registeredObserverId, `🔔 Yangi diagnostika!\n🚗 ${carNumber}\n💰 ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`);
    }
    await ctx.answerCbQuery();
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
});

bot.action(/diag_no_(.+)_(.+)/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const carNumber = ctx.match[1], carType = ctx.match[2];
    addCar(carNumber, carType, false, ctx.from.id, ctx.from.first_name);
    await ctx.editMessageText(`✅ Avtomobil qo‘shildi!\n🚗 ${carNumber}\n🏷️ ${carType}\n❌ Diagnostika o‘tkazilmadi\n💰 0 so‘m`);
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
        
        deleteSteps.delete(ctx.from.id);
        await ctx.reply(`✅ Backup tiklandi!\n🚗 Avtomobillar: ${backupData.cars?.length || 0} ta\n💵 Olingan summa: ${(backupData.received?.total || 0).toLocaleString()} so‘m`);
    } catch {
        await ctx.reply('❌ Xato! Noto‘g‘ri backup fayl.');
    }
});

// ============ BOTNI ISHGA TUSHIRISH ============
bot.launch();
console.log('🤖 Bot ishga tushdi!');
console.log(`👑 Super Admin ID: ${SUPER_ADMIN_ID}`);
console.log(`📞 Kuzatuvchi: ${OBSERVER_PHONE}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
