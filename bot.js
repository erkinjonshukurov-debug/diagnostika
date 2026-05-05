require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

// ============ KONFIGURATSIYA ============
const BOT_TOKEN = process.env.BOT_TOKEN;

// FOYDALANUVCHI ID'LARI
const SUPER_ADMIN_ID = 1437230485;     // Siz
const ADMIN2_ID = 123456789;           // 2-ADMIN (O'ZGARTIRING!)
const OBSERVER_ID = 987654321;         // KUZATUVCHI (O'ZGARTIRING!)

const ADMIN_IDS = [SUPER_ADMIN_ID, ADMIN2_ID];
const ALLOWED_IDS = [SUPER_ADMIN_ID, ADMIN2_ID, OBSERVER_ID];

const DIAGNOSIS_PRICE = 250000;

// ============ MA'LUMOTLAR BAZASI (JSON) ============
const DB_FILE = path.join(__dirname, 'cars.json');

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}

function loadData() {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
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
    
    if (existingIndex !== -1) {
        cars[existingIndex] = newCar;
    } else {
        cars.push(newCar);
    }
    
    saveData(cars);
    return newCar.id;
}

function checkCar(carNumber) {
    const cars = loadData();
    return cars.find(car => car.raqam === carNumber.toUpperCase());
}

function getTotalSum() {
    const cars = loadData();
    const diagnosedCars = cars.filter(car => car.diagnostika.includes('o‘tkazildi'));
    const total = diagnosedCars.reduce((sum, car) => sum + car.narxi, 0);
    return { total, count: diagnosedCars.length };
}

function getLastRecords(limit = 10) {
    const cars = loadData();
    return cars.slice(-limit).reverse();
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

function isAllowed(ctx) {
    return ALLOWED_IDS.includes(ctx.from.id);
}

// ============ ASOSIY MENYU TUGMALARI ============
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
    } else {
        return Markup.keyboard([
            ['💰 Jami summa', '📋 So\'nggi yozuvlar'],
            ['🔍 Avtomobil tekshirish', '❌ Asosiy menyuni yopish']
        ]).resize();
    }
}

// ============ TEKSHIRISH UCHUN TUGMALAR ============
function getCheckMenu() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('✅ Diagnostika o‘tkazildi', 'check_diag_yes')],
        [Markup.button.callback('❌ Diagnostika o‘tkazilmadi', 'check_diag_no')],
        [Markup.button.callback('🔙 Orqaga', 'back_to_menu')]
    ]);
}

// ============ BUYRUQLAR ============

// /start - asosiy menyu
bot.start(async (ctx) => {
    if (!isAllowed(ctx)) {
        return ctx.reply('❌ Sizga ruxsat yo‘q!');
    }
    
    let msg = '';
    if (isSuperAdmin(ctx)) {
        msg = `👑 *Assalomu alaykum, SUPER ADMIN ${ctx.from.first_name}!*\n\n✅ Quyidagi tugmalar orqali boshqaring:`;
    } else if (isAdmin(ctx)) {
        msg = `👋 *Assalomu alaykum, Admin ${ctx.from.first_name}!*\n\n✅ Quyidagi tugmalar orqali boshqaring:`;
    } else {
        msg = `👋 *Assalomu alaykum, ${ctx.from.first_name}!*\n\n👁️ *Kuzatuvchi*\n\n✅ Quyidagi tugmalar orqali boshqaring:`;
    }
    
    await ctx.reply(msg, {
        parse_mode: 'Markdown',
        ...getMainMenu(ctx)
    });
});

// /menu - menyuni qayta ochish
bot.command('menu', async (ctx) => {
    if (!isAllowed(ctx)) return;
    await ctx.reply('📋 *Asosiy menyu:*', {
        parse_mode: 'Markdown',
        ...getMainMenu(ctx)
    });
});

// ============ MATNLI XABARLARNI QAYTA ISHLASH ============
bot.on('text', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const text = ctx.message.text;
    const step = addSteps.get(ctx.from.id);
    
    // Avtomobil qo'shish jarayoni
    if (step && step.step === 'number') {
        const platePattern = /^[0-9]{2}[A-Z][0-9]{3}[A-Z]{2}$/i;
        if (!platePattern.test(text)) {
            return ctx.reply('❌ *Noto‘g‘ri format!* Masalan: `01A777AA`', { parse_mode: 'Markdown' });
        }
        
        step.carNumber = text.toUpperCase();
        step.step = 'type';
        addSteps.set(ctx.from.id, step);
        await ctx.reply(`✅ *Raqam:* ${step.carNumber}\n\n*2-qadam:* Avtomobil turini kiriting\nMasalan: Malibu, Cobalt, Spark...`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (step && step.step === 'type') {
        step.carType = text;
        addSteps.delete(ctx.from.id);
        
        await ctx.reply(
            `✅ *Ma'lumotlar:*\n🚗 Raqam: ${step.carNumber}\n🏷️ Turi: ${step.carType}\n\n*Diagnostika holati?*`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback(`✅ O‘tkazildi (${DIAGNOSIS_PRICE.toLocaleString()} so‘m)`, `diag_yes_${step.carNumber}_${step.carType}`)],
                    [Markup.button.callback('❌ O‘tkazilmadi', `diag_no_${step.carNumber}_${step.carType}`)],
                    [Markup.button.callback('🔙 Orqaga', 'back_to_menu')]
                ])
            }
        );
        return;
    }
    
    // Avtomobil tekshirish jarayoni (agar /check dan keyin raqam kiritilsa)
    if (step && step.step === 'check_number') {
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
        await ctx.reply('📋 *Asosiy menyu:*', { parse_mode: 'Markdown', ...getMainMenu(ctx) });
        return;
    }
    
    // ============ MENYU TUGMALARI ============
    
    // Avtomobil qo'shish
    if (text === '🚗 Avtomobil qo\'shish') {
        if (!isAdmin(ctx)) return;
        addSteps.set(ctx.from.id, { step: 'number' });
        await ctx.reply(
            '📝 *1-qadam:* Avtomobil raqamini kiriting\n\nFormat: `01A777AA` (2 raqam, 1 harf, 3 raqam, 2 harf)',
            { parse_mode: 'Markdown' }
        );
    }
    
    // Jami summa
    else if (text === '💰 Jami summa') {
        const { total, count } = getTotalSum();
        await ctx.reply(
            `💰 *Diagnostika hisoboti*\n\n` +
            `• Diagnostika qilingan avtomobillar: *${count}* ta\n` +
            `• Jami summa: *${total.toLocaleString()}* so‘m\n` +
            `• Bir diagnostika narxi: *${DIAGNOSIS_PRICE.toLocaleString()}* so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // So'nggi yozuvlar
    else if (text === '📋 So\'nggi yozuvlar') {
        const records = getLastRecords(10);
        if (records.length === 0) {
            await ctx.reply('📋 Hali hech qanday ma\'lumot yo‘q.');
        } else {
            let msg = '📋 *So‘nggi 10 ta yozuv:*\n\n';
            records.forEach((car, idx) => {
                msg += `${idx+1}. ${car.raqam} | ${car.turi} | ${car.diagnostika} | ${car.narxi.toLocaleString()} so‘m\n`;
            });
            await ctx.reply(msg, { parse_mode: 'Markdown' });
        }
    }
    
    // Avtomobil tekshirish
    else if (text === '🔍 Avtomobil tekshirish') {
        addSteps.set(ctx.from.id, { step: 'check_number' });
        await ctx.reply(
            '🔍 *Avtomobil raqamini kiriting:*\n\nMisol: `01A777AA`',
            { parse_mode: 'Markdown' }
        );
    }
    
    // Statistika (faqat Super Admin)
    else if (text === '📊 Statistika') {
        if (!isSuperAdmin(ctx)) return;
        const stats = getStats();
        await ctx.reply(
            `📊 *STATISTIKA*\n\n` +
            `🚗 *Jami avtomobillar:* ${stats.total}\n` +
            `✅ *Diagnostika qilingan:* ${stats.diagnosed}\n` +
            `❌ *Qilinmagan:* ${stats.notDiagnosed}\n` +
            `💰 *Jami summa:* ${stats.totalSum.toLocaleString()} so‘m\n` +
            `🏷️ *Bir diagnostika narxi:* ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // Bazani eksport (faqat Super Admin)
    else if (text === '📁 Bazani eksport') {
        if (!isSuperAdmin(ctx)) return;
        const cars = getAllCars();
        const jsonData = JSON.stringify(cars, null, 2);
        const fileName = `diagnostika_${Date.now()}.json`;
        await ctx.replyWithDocument({
            source: Buffer.from(jsonData, 'utf-8'),
            filename: fileName
        });
    }
    
    // Bazani tozalash (faqat Super Admin)
    else if (text === '🗑️ Bazani tozalash') {
        if (!isSuperAdmin(ctx)) return;
        clearAll();
        await ctx.reply('🗑️ *Baza tozalandi!*', { parse_mode: 'Markdown' });
    }
    
    // Barcha avtomobillar (faqat Super Admin)
    else if (text === '🚘 Barcha avtomobillar') {
        if (!isSuperAdmin(ctx)) return;
        const cars = getAllCars();
        if (cars.length === 0) {
            await ctx.reply('📋 Hali hech qanday ma\'lumot yo‘q.');
        } else {
            let msg = '📋 *BARCHA AVTOMOBILLAR*\n\n';
            cars.forEach((car, idx) => {
                msg += `${idx+1}. ${car.raqam} | ${car.turi} | ${car.diagnostika} | ${car.narxi.toLocaleString()} so‘m\n`;
            });
            if (msg.length > 4000) {
                await ctx.reply('📋 Ma\'lumotlar juda ko‘p. "📁 Bazani eksport" tugmasi orqali yuklab oling.');
            } else {
                await ctx.reply(msg, { parse_mode: 'Markdown' });
            }
        }
    }
    
    // Asosiy menyuni yopish
    else if (text === '❌ Asosiy menyuni yopish') {
        await ctx.reply('❌ Menyu yopildi. Qayta ochish uchun /menu yoki /start buyrug‘ini yuboring.', {
            reply_markup: { remove_keyboard: true }
        });
    }
    
    // Orqaga qaytish (inline tugmalar uchun)
    else if (text === '🔙 Orqaga' || text === '⬅️ Orqaga') {
        await ctx.reply('📋 *Asosiy menyu:*', {
            parse_mode: 'Markdown',
            ...getMainMenu(ctx)
        });
    }
});

// ============ INLINE TUGMALAR ============
const addSteps = new Map();

// Diagnostika javoblari
bot.action(/diag_yes_(.+)_(.+)/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    const carNumber = ctx.match[1];
    const carType = ctx.match[2];
    
    addCar(carNumber, carType, true, ctx.from.id, ctx.from.first_name);
    
    await ctx.editMessageText(
        `✅ *Avtomobil qo‘shildi!*\n\n` +
        `🚗 *Raqam:* ${carNumber}\n` +
        `🏷️ *Turi:* ${carType}\n` +
        `✅ *Diagnostika:* O‘tkazildi\n` +
        `💰 *Narxi:* ${DIAGNOSIS_PRICE.toLocaleString()} so‘m\n\n` +
        `👤 *Admin:* ${ctx.from.first_name}`,
        { parse_mode: 'Markdown' }
    );
    
    // Kuzatuvchiga xabar
    await bot.telegram.sendMessage(
        OBSERVER_ID,
        `🔔 *Yangi diagnostika!*\n\n` +
        `🚗 ${carNumber} avtomobiliga diagnostika o‘tkazildi.\n` +
        `💰 Narxi: ${DIAGNOSIS_PRICE.toLocaleString()} so‘m\n` +
        `👤 Admin: ${ctx.from.first_name}`,
        { parse_mode: 'Markdown' }
    );
    
    await ctx.answerCbQuery();
    await ctx.reply('📋 *Asosiy menyu:*', { parse_mode: 'Markdown', ...getMainMenu(ctx) });
});

bot.action(/diag_no_(.+)_(.+)/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    const carNumber = ctx.match[1];
    const carType = ctx.match[2];
    
    addCar(carNumber, carType, false, ctx.from.id, ctx.from.first_name);
    
    await ctx.editMessageText(
        `✅ *Avtomobil qo‘shildi!*\n\n` +
        `🚗 *Raqam:* ${carNumber}\n` +
        `🏷️ *Turi:* ${carType}\n` +
        `❌ *Diagnostika:* O‘tkazilmadi\n` +
        `💰 *Narxi:* 0 so‘m`,
        { parse_mode: 'Markdown' }
    );
    
    await ctx.answerCbQuery();
    await ctx.reply('📋 *Asosiy menyu:*', { parse_mode: 'Markdown', ...getMainMenu(ctx) });
});

bot.action('back_to_menu', async (ctx) => {
    await ctx.deleteMessage();
    await ctx.reply('📋 *Asosiy menyu:*', {
        parse_mode: 'Markdown',
        ...getMainMenu(ctx)
    });
    await ctx.answerCbQuery();
});

// /cancel - bekor qilish
bot.command('cancel', async (ctx) => {
    addSteps.delete(ctx.from.id);
    await ctx.reply('❌ Bekor qilindi. Qaytadan /start yuboring.');
});

// ============ BOTNI ISHGA TUSHIRISH ============
bot.launch();
console.log('🤖 Bot ishga tushdi!');
console.log(`👑 Super Admin ID: ${SUPER_ADMIN_ID}`);
console.log(`💰 Diagnostika narxi: ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
