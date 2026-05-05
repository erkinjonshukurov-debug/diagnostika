require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

// ============ KONFIGURATSIYA ============
const BOT_TOKEN = process.env.BOT_TOKEN;

// SUPER ADMIN va ADMIN (ID bo'yicha)
const SUPER_ADMIN_ID = 1437230485;     // Siz (+998979247888)
const ADMIN2_ID = 987654321;           // 2-ADMIN ID (o'zgartiring!)

// KUZATUVCHI (telefon raqam bilan)
const OBSERVER_PHONE = '+998902247888';
let registeredObserverId = null;

const ADMIN_IDS = [SUPER_ADMIN_ID, ADMIN2_ID];
const DIAGNOSIS_PRICE = 250000;

// ============ MA'LUMOTLAR BAZASI ============
const DB_FILE = path.join(__dirname, 'cars.json');
const OBSERVER_FILE = path.join(__dirname, 'observer.json');
const RECEIVED_AMOUNT_FILE = path.join(__dirname, 'received.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(OBSERVER_FILE)) fs.writeFileSync(OBSERVER_FILE, JSON.stringify({ userId: null }, null, 2));
if (!fs.existsSync(RECEIVED_AMOUNT_FILE)) fs.writeFileSync(RECEIVED_AMOUNT_FILE, JSON.stringify({ total: 0 }, null, 2));

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

function loadReceivedAmount() {
    try {
        const data = JSON.parse(fs.readFileSync(RECEIVED_AMOUNT_FILE, 'utf8'));
        return data.total || 0;
    } catch(e) { return 0; }
}
function saveReceivedAmount(amount) {
    fs.writeFileSync(RECEIVED_AMOUNT_FILE, JSON.stringify({ total: amount }, null, 2));
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

function checkCar(carNumber) {
    return loadData().find(car => car.raqam === carNumber.toUpperCase());
}

function getTotalDiagnosedSum() {
    const diagnosedCars = loadData().filter(car => car.diagnostika.includes('o‘tkazildi'));
    return {
        total: diagnosedCars.reduce((sum, car) => sum + car.narxi, 0),
        count: diagnosedCars.length
    };
}

function getLastRecords(limit = 10) {
    return loadData().slice(-limit).reverse();
}

function getAllCars() {
    return loadData();
}

function clearAll() {
    saveData([]);
}

function getStats() {
    const cars = loadData();
    const diagnosed = cars.filter(c => c.diagnostika.includes('o‘tkazildi')).length;
    const notDiagnosed = cars.filter(c => c.diagnostika.includes('o‘tkazilmadi')).length;
    const totalSum = cars.reduce((s, c) => s + c.narxi, 0);
    return { total: cars.length, diagnosed, notDiagnosed, totalSum };
}

// ============ BOT ============
const bot = new Telegraf(BOT_TOKEN);

function isSuperAdmin(ctx) {
    return ctx.from.id === SUPER_ADMIN_ID;
}
function isAdmin(ctx) {
    return ADMIN_IDS.includes(ctx.from.id);
}
function isObserver(ctx) {
    return registeredObserverId === ctx.from.id;
}
function isAllowed(ctx) {
    return isAdmin(ctx) || isObserver(ctx);
}

// ============ MENYU TUGMALARI ============
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
        
        await ctx.reply(msg + `\n\n✅ Bot ishga tushdi.`, {
            parse_mode: 'Markdown',
            ...getMainMenu(ctx)
        });
        return;
    }
    
    await ctx.reply(
        `❌ Siz hali ro‘yxatdan o‘tmagansiz.\n\n📞 Telefon raqamingizni yuboring:`,
        Markup.keyboard([
            [Markup.button.contactRequest('📞 Telefon raqamni yuborish')]
        ]).resize()
    );
});

bot.on('contact', async (ctx) => {
    const phone = ctx.message.contact.phone_number;
    const userId = ctx.from.id;
    
    if (phone === OBSERVER_PHONE) {
        saveObserverId(userId);
        await ctx.reply(`✅ Kuzatuvchi sifatida tasdiqlandingiz!`, getMainMenu(ctx));
    } else {
        await ctx.reply(`❌ Sizning raqamingiz ro‘yxatda yo‘q.`);
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
    
    // ============ AVTOMOBIL QO'SHISH ============
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
    
    // ============ AVTOMOBIL O'CHIRISH (SUPER ADMIN) ============
    if (deleteStep?.step === 'delete_car') {
        if (!isSuperAdmin(ctx)) return;
        const deleted = deleteCar(text);
        if (deleted) {
            await ctx.reply(`✅ *Avtomobil o‘chirildi!*\n\n🚗 ${text.toUpperCase()}`, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply(`❌ *${text}* raqamli avtomobil topilmadi.`, { parse_mode: 'Markdown' });
        }
        deleteSteps.delete(ctx.from.id);
        return ctx.reply('📋 *Asosiy menyu:*', getMainMenu(ctx));
    }
    
    // ============ MENYU TUGMALARI ============
    
    // Avtomobil qo'shish
    if (text === '🚗 Avtomobil qo\'shish' && isAdmin(ctx)) {
        addSteps.set(ctx.from.id, { step: 'number' });
        return ctx.reply('📝 *Raqamni kiriting:*\n\nFormat: `01A777AA`', { parse_mode: 'Markdown' });
    }
    
    // Avtomobil o'chirish (Super Admin)
    if (text === '🗑️ Avtomobil o\'chirish' && isSuperAdmin(ctx)) {
        deleteSteps.set(ctx.from.id, { step: 'delete_car' });
        return ctx.reply('🗑️ *O‘chiriladigan avtomobil raqamini kiriting:*\n\nMisol: `01A777AA`', { parse_mode: 'Markdown' });
    }
    
    // Oxirgi avtomobilni o'chirish (Admin)
    if (text === '⬅️ Oxirgi avtomobilni o\'chirish' && isAdmin(ctx)) {
        const deleted = deleteLastCar();
        if (deleted) {
            await ctx.reply(
                `✅ *Oxirgi avtomobil o‘chirildi!*\n\n` +
                `🚗 ${deleted.raqam} | ${deleted.turi} | ${deleted.diagnostika}\n` +
                `📅 ${deleted.sana} | 👤 ${deleted.admin_name}`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await ctx.reply(`❌ Hech qanday avtomobil topilmadi.`, { parse_mode: 'Markdown' });
        }
        return;
    }
    
    // Statistika (Super Admin)
    if (text === '📊 Statistika' && isSuperAdmin(ctx)) {
        const s = getStats();
        const received = loadReceivedAmount();
        const totalDiagnosed = getTotalDiagnosedSum();
        return ctx.reply(
            `📊 *STATISTIKA*\n\n` +
            `🚗 *Jami avtomobillar:* ${s.total}\n` +
            `✅ *Diagnostika qilingan:* ${s.diagnosed}\n` +
            `❌ *Qilinmagan:* ${s.notDiagnosed}\n` +
            `💰 *Jami diagnostika summasi:* ${s.totalSum.toLocaleString()} so‘m\n` +
            `💵 *Olingan summa:* ${received.toLocaleString()} so‘m\n` +
            `📉 *Qoldiq:* ${(s.totalSum - received).toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // Jami summa
    if (text === '💰 Jami summa') {
        const { total, count } = getTotalDiagnosedSum();
        return ctx.reply(
            `💰 *JAMI DIAGNOSTIKA SUMMASI*\n\n` +
            `• Diagnostika qilingan: *${count}* ta\n` +
            `• Jami summa: *${total.toLocaleString()}* so‘m\n` +
            `• Bir diagnostika: *${DIAGNOSIS_PRICE.toLocaleString()}* so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // Olingan summa (Super Admin)
    if (text === '💵 Olingan summa' && isSuperAdmin(ctx)) {
        deleteSteps.set(ctx.from.id, { step: 'received_amount' });
        return ctx.reply(
            `💵 *OLINGAN SUMMA*\n\n` +
            `Hozirgi olingan summa: *${loadReceivedAmount().toLocaleString()}* so‘m\n\n` +
            `Yangi summani kiriting (faqat raqam):\n` +
            `Misol: 500000`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // Olingan summani saqlash
    if (deleteStep?.step === 'received_amount' && isSuperAdmin(ctx)) {
        const amount = parseInt(text.replace(/[^0-9]/g, ''));
        if (isNaN(amount)) {
            deleteSteps.delete(ctx.from.id);
            return ctx.reply('❌ Noto‘g‘ri format! Faqat raqam kiriting.');
        }
        saveReceivedAmount(amount);
        deleteSteps.delete(ctx.from.id);
        return ctx.reply(`✅ *Olingan summa yangilandi:* ${amount.toLocaleString()} so‘m`, { parse_mode: 'Markdown' });
    }
    
    // Backup olish (Super Admin)
    if (text === '💾 Backup olish' && isSuperAdmin(ctx)) {
        const cars = getAllCars();
        const received = loadReceivedAmount();
        const backupData = {
            cars: cars,
            received_amount: received,
            backup_date: new Date().toLocaleString('uz-UZ'),
            version: '1.0'
        };
        return ctx.replyWithDocument({
            source: Buffer.from(JSON.stringify(backupData, null, 2), 'utf-8'),
            filename: `backup_${Date.now()}.json`
        });
    }
    
    // Backup tiklash (Super Admin)
    if (text === '🔄 Backup tiklash' && isSuperAdmin(ctx)) {
        deleteSteps.set(ctx.from.id, { step: 'restore_backup' });
        return ctx.reply(
            `🔄 *BACKUP TIKLASH*\n\n` +
            `Iltimos, oldindan yuklab olingan *JSON faylni* yuboring.\n\n` +
            `⚠️ *DIQQAT!* Bu amal joriy ma'lumotlarni to‘liq o‘chiradi!`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // So'nggi yozuvlar (kuzatuvchi)
    if (text === '📋 So\'nggi yozuvlar' && isObserver(ctx)) {
        const cars = loadData();
        const last10 = cars.slice(-10).reverse();
        if (last10.length === 0) return ctx.reply('📋 Hali hech qanday ma\'lumot yo‘q.');
        let result = "📋 *OXIRGI 10 TA YOZUV*\n\n";
        last10.forEach((car, idx) => {
            result += `${idx+1}. *${car.raqam}* | ${car.turi} | ${car.diagnostika} | ${car.narxi.toLocaleString()} so‘m\n`;
            result += `   📅 ${car.sana} | 👤 ${car.admin_name}\n\n`;
        });
        return ctx.reply(result, { parse_mode: 'Markdown' });
    }
    
    // Asosiy menyuni yopish
    if (text === '❌ Asosiy menyuni yopish') {
        return ctx.reply('❌ Menyu yopildi. Qayta ochish /menu', { reply_markup: { remove_keyboard: true } });
    }
});

// ============ DIAGNOSTIKA JAVOBI ============
bot.action(/diag_yes_(.+)_(.+)/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const carNumber = ctx.match[1], carType = ctx.match[2];
    addCar(carNumber, carType, true, ctx.from.id, ctx.from.first_name);
    await ctx.editMessageText(
        `✅ *Avtomobil qo‘shildi!*\n\n🚗 ${carNumber}\n🏷️ ${carType}\n✅ Diagnostika o‘tkazildi\n💰 ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`,
        { parse_mode: 'Markdown' }
    );
    if (registeredObserverId) {
        await bot.telegram.sendMessage(registeredObserverId,
            `🔔 *Yangi diagnostika!*\n\n🚗 ${carNumber}\n💰 ${DIAGNOSIS_PRICE.toLocaleString()} so‘m\n👤 ${ctx.from.first_name}`,
            { parse_mode: 'Markdown' }
        );
    }
    await ctx.answerCbQuery();
    await ctx.reply('📋 *Asosiy menyu:*', getMainMenu(ctx));
});

bot.action(/diag_no_(.+)_(.+)/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const carNumber = ctx.match[1], carType = ctx.match[2];
    addCar(carNumber, carType, false, ctx.from.id, ctx.from.first_name);
    await ctx.editMessageText(
        `✅ *Avtomobil qo‘shildi!*\n\n🚗 ${carNumber}\n🏷️ ${carType}\n❌ Diagnostika o‘tkazilmadi\n💰 0 so‘m`,
        { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
    await ctx.reply('📋 *Asosiy menyu:*', getMainMenu(ctx));
});

// ============ BACKUP TIKLASH (FAYL QABUL QILISH) ============
bot.on('document', async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    
    const step = deleteSteps.get(ctx.from.id);
    if (step?.step !== 'restore_backup') return;
    
    try {
        const fileId = ctx.message.document.file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        const response = await fetch(fileLink.href);
        const text = await response.text();
        const backupData = JSON.parse(text);
        
        if (backupData.cars && Array.isArray(backupData.cars)) {
            saveData(backupData.cars);
            if (backupData.received_amount !== undefined) {
                saveReceivedAmount(backupData.received_amount);
            }
            deleteSteps.delete(ctx.from.id);
            await ctx.reply(
                `✅ *Backup muvaffaqiyatli tiklandi!*\n\n` +
                `📅 Backup sanasi: ${backupData.backup_date || 'noma\'lum'}\n` +
                `🚗 Avtomobillar soni: ${backupData.cars.length} ta\n` +
                `💵 Olingan summa: ${(backupData.received_amount || 0).toLocaleString()} so‘m`,
                { parse_mode: 'Markdown' }
            );
        } else {
            throw new Error('Noto‘g‘ri backup fayl formati');
        }
    } catch (err) {
        await ctx.reply('❌ *Xato!* Noto‘g‘ri backup fayl yoki fayl buzilgan.', { parse_mode: 'Markdown' });
    }
});

// ============ BOTNI ISHGA TUSHIRISH ============
bot.launch();
console.log('🤖 Bot ishga tushdi!');
console.log(`👑 Super Admin ID: ${SUPER_ADMIN_ID}`);
console.log(`📞 Kuzatuvchi telefoni: ${OBSERVER_PHONE}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
