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

// Ruxsatlangan ID lar
const ADMIN_IDS = [SUPER_ADMIN_ID, ADMIN2_ID];

const DIAGNOSIS_PRICE = 250000;

// ============ MA'LUMOTLAR BAZASI (JSON) ============
const DB_FILE = path.join(__dirname, 'cars.json');
const OBSERVER_FILE = path.join(__dirname, 'observer.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(OBSERVER_FILE)) fs.writeFileSync(OBSERVER_FILE, JSON.stringify({ userId: null }, null, 2));

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

function addCar(carNumber, carType, isDiagnosed, adminId, adminName) {
    const cars = loadData();
    const sana = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
    const diagnostika = isDiagnosed ? "✅ o‘tkazildi" : "❌ o‘tkazilmadi";
    const narxi = isDiagnosed ? DIAGNOSIS_PRICE : 0;
    
    const existingIndex = cars.findIndex(c => c.raqam === carNumber.toUpperCase());
    const newCar = {
        id: existingIndex !== -1 ? cars[existingIndex].id : Date.now(),
        sana,
        raqam: carNumber.toUpperCase(),
        turi: carType,
        diagnostika,
        narxi,
        admin_id: adminId,
        admin_name: adminName
    };
    
    if (existingIndex !== -1) cars[existingIndex] = newCar;
    else cars.push(newCar);
    
    saveData(cars);
    return newCar.id;
}

function checkCar(carNumber) {
    return loadData().find(car => car.raqam === carNumber.toUpperCase());
}

function getTotalSum() {
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

// ============ KUZATUVCHI UCHUN FORMAT (ADMIN BILAN BIR XIL) ============
function getObserverLastRecords() {
    const cars = loadData();
    const last10 = cars.slice(-10).reverse();
    
    if (last10.length === 0) return "📋 Hali hech qanday ma'lumot yo‘q.";
    
    let result = "📋 *OXIRGI 10 TA YOZUV*\n\n";
    last10.forEach((car, idx) => {
        result += `${idx+1}. *${car.raqam}* | ${car.turi} | ${car.diagnostika} | ${car.narxi.toLocaleString()} so‘m\n`;
        result += `   📅 ${car.sana} | 👤 ${car.admin_name}\n\n`;
    });
    
    return result;
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
            ['🚗 Avtomobil qo\'shish', '💰 Jami summa'],
            ['📋 So\'nggi yozuvlar', '🔍 Avtomobil tekshirish'],
            ['📊 Statistika', '📁 Bazani eksport'],
            ['🗑️ Bazani tozalash', '🚘 Barcha avtomobillar'],
            ['❌ Asosiy menyuni yopish']
        ]).resize();
    } else if (isAdmin(ctx)) {
        return Markup.keyboard([
            ['🚗 Avtomobil qo\'shish', '💰 Jami summa'],
            ['📋 So\'nggi yozuvlar', '🔍 Avtomobil tekshirish'],
            ['❌ Asosiy menyuni yopish']
        ]).resize();
    } else if (isObserver(ctx)) {
        return Markup.keyboard([
            ['💰 Jami summa', '📋 So\'nggi yozuvlar']
        ]).resize();
    }
    return null;
}

// ============ REGISTRATSIYA (kuzatuvchi uchun) ============
bot.command('start', async (ctx) => {
    if (isAllowed(ctx)) {
        let msg = isSuperAdmin(ctx) ? `👑 Assalomu alaykum SUPER ADMIN ${ctx.from.first_name}!` :
                  isAdmin(ctx) ? `👋 Assalomu alaykum Admin ${ctx.from.first_name}!` :
                  `👋 Assalomu alaykum Kuzatuvchi ${ctx.from.first_name}!`;
        
        await ctx.reply(msg + `\n\n✅ Bot ishga tushdi. Quyidagi tugmalardan foydalaning.`, {
            parse_mode: 'Markdown',
            ...getMainMenu(ctx)
        });
        return;
    }
    
    await ctx.reply(
        `❌ Siz hali ro‘yxatdan o‘tmagansiz.\n\n📞 Iltimos, telefon raqamingizni yuboring:`,
        Markup.keyboard([
            [Markup.button.contactRequest('📞 Telefon raqamni yuborish')]
        ]).resize()
    );
});

// Telefon raqam orqali kuzatuvchini aniqlash
bot.on('contact', async (ctx) => {
    const phone = ctx.message.contact.phone_number;
    const userId = ctx.from.id;
    
    if (phone === OBSERVER_PHONE) {
        saveObserverId(userId);
        await ctx.reply(
            `✅ Siz kuzatuvchi sifatida tasdiqlandingiz!\n\n👋 Assalomu alaykum ${ctx.from.first_name}`,
            getMainMenu(ctx)
        );
    } else {
        await ctx.reply(`❌ Kechirasiz, sizning raqamingiz kuzatuvchilar ro‘yxatida yo‘q.`);
    }
});

// ============ ASOSIY BUYRUQLAR ============
bot.command('menu', async (ctx) => {
    if (!isAllowed(ctx)) return;
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
});

// ============ XABAR (TUGMA) BOSHQARISH ============
const addSteps = new Map();

bot.on('text', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const text = ctx.message.text;
    const step = addSteps.get(ctx.from.id);
    
    // Avtomobil qo'shish (faqat adminlar)
    if (step?.step === 'number') {
        if (!isAdmin(ctx)) return;
        const platePattern = /^[0-9]{2}[A-Z][0-9]{3}[A-Z]{2}$/i;
        if (!platePattern.test(text)) return ctx.reply('❌ Noto‘g‘ri format! Masalan: 01A777AA');
        step.carNumber = text.toUpperCase();
        step.step = 'type';
        addSteps.set(ctx.from.id, step);
        return ctx.reply(`✅ Raqam: ${step.carNumber}\n\n*2-qadam:* Avtomobil turini kiriting (Malibu, Cobalt...)`, { parse_mode: 'Markdown' });
    }
    
    if (step?.step === 'type') {
        if (!isAdmin(ctx)) return;
        step.carType = text;
        addSteps.delete(ctx.from.id);
        return ctx.reply(
            `✅ Ma'lumotlar:\n🚗 ${step.carNumber}\n🏷️ ${step.carType}\n\n*Diagnostika holati?*`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback(`✅ O‘tkazildi (${DIAGNOSIS_PRICE.toLocaleString()} so‘m)`, `diag_yes_${step.carNumber}_${step.carType}`)],
                    [Markup.button.callback('❌ O‘tkazilmadi', `diag_no_${step.carNumber}_${step.carType}`)]
                ])
            }
        );
    }
    
    // Avtomobil tekshirish (faqat adminlar uchun)
    if (step?.step === 'check_number') {
        if (!isAdmin(ctx)) {
            addSteps.delete(ctx.from.id);
            return ctx.reply('❌ Bu funksiya faqat adminlar uchun.');
        }
        const car = checkCar(text);
        if (car) {
            await ctx.reply(
                `🚗 *Avtomobil ma'lumotlari:*\n\n` +
                `📌 *Raqam:* ${car.raqam}\n` +
                `🏷️ *Turi:* ${car.turi}\n` +
                `🔧 *Diagnostika:* ${car.diagnostika}\n` +
                `💰 *Narxi:* ${car.narxi.toLocaleString()} so‘m\n` +
                `📅 *Sana:* ${car.sana}\n` +
                `👤 *Admin:* ${car.admin_name}`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await ctx.reply(`❌ *${text}* raqamli avtomobil topilmadi.`, { parse_mode: 'Markdown' });
        }
        addSteps.delete(ctx.from.id);
        return ctx.reply('📋 *Asosiy menyu:*', { parse_mode: 'Markdown', ...getMainMenu(ctx) });
    }
    
    // ============ MENYU TUGMALARI ============
    
    if (text === '🚗 Avtomobil qo\'shish' && isAdmin(ctx)) {
        addSteps.set(ctx.from.id, { step: 'number' });
        return ctx.reply('📝 *1-qadam:* Avtomobil raqamini kiriting\n\nFormat: `01A777AA`', { parse_mode: 'Markdown' });
    }
    
    if (text === '💰 Jami summa') {
        const { total, count } = getTotalSum();
        return ctx.reply(
            `💰 *DIAGNOSTIKA HISOBOTI*\n\n` +
            `• Diagnostika qilingan avtomobillar: *${count}* ta\n` +
            `• Jami summa: *${total.toLocaleString()}* so‘m\n` +
            `• Bir diagnostika narxi: *${DIAGNOSIS_PRICE.toLocaleString()}* so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    if (text === '📋 So\'nggi yozuvlar') {
        // Admin va kuzatuvchi bir xil formatda ko'radi
        const records = getObserverLastRecords();
        return ctx.reply(records, { parse_mode: 'Markdown' });
    }
    
    if (text === '🔍 Avtomobil tekshirish' && isAdmin(ctx)) {
        addSteps.set(ctx.from.id, { step: 'check_number' });
        return ctx.reply('🔍 *Avtomobil raqamini kiriting:*\n\nMisol: `01A777AA`', { parse_mode: 'Markdown' });
    }
    
    if (text === '📊 Statistika' && isSuperAdmin(ctx)) {
        const s = getStats();
        return ctx.reply(
            `📊 *STATISTIKA*\n\n🚗 *Jami:* ${s.total}\n✅ *Diagnostika qilingan:* ${s.diagnosed}\n❌ *Qilinmagan:* ${s.notDiagnosed}\n💰 *Jami summa:* ${s.totalSum.toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    if (text === '📁 Bazani eksport' && isSuperAdmin(ctx)) {
        const cars = getAllCars();
        return ctx.replyWithDocument({
            source: Buffer.from(JSON.stringify(cars, null, 2), 'utf-8'),
            filename: `diagnostika_${Date.now()}.json`
        });
    }
    
    if (text === '🗑️ Bazani tozalash' && isSuperAdmin(ctx)) {
        clearAll();
        return ctx.reply('🗑️ *Baza tozalandi!*', { parse_mode: 'Markdown' });
    }
    
    if (text === '🚘 Barcha avtomobillar' && isSuperAdmin(ctx)) {
        const cars = getAllCars();
        if (!cars.length) return ctx.reply('📋 Hali hech qanday ma\'lumot yo‘q.');
        let msg = '📋 *BARCHA AVTOMOBILLAR*\n\n';
        cars.forEach((car, idx) => {
            msg += `${idx+1}. ${car.raqam} | ${car.turi} | ${car.diagnostika} | ${car.narxi.toLocaleString()} so‘m\n`;
        });
        if (msg.length > 4000) return ctx.reply('📋 Ma\'lumotlar juda ko‘p. Eksport qiling.');
        return ctx.reply(msg, { parse_mode: 'Markdown' });
    }
    
    if (text === '❌ Asosiy menyuni yopish' && !isObserver(ctx)) {
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
            `🔔 *Yangi diagnostika!*\n\n🚗 ${carNumber} avtomobiliga diagnostika o‘tkazildi.\n💰 ${DIAGNOSIS_PRICE.toLocaleString()} so‘m\n👤 Admin: ${ctx.from.first_name}`,
            { parse_mode: 'Markdown' }
        );
    }
    await ctx.answerCbQuery();
    await ctx.reply('📋 *Asosiy menyu:*', { parse_mode: 'Markdown', ...getMainMenu(ctx) });
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
    await ctx.reply('📋 *Asosiy menyu:*', { parse_mode: 'Markdown', ...getMainMenu(ctx) });
});

// ============ BOTNI ISHGA TUSHIRISH ============
bot.launch();
console.log('🤖 Bot ishga tushdi!');
console.log(`👑 Super Admin ID: ${SUPER_ADMIN_ID}`);
console.log(`📞 Kuzatuvchi telefoni: ${OBSERVER_PHONE}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
