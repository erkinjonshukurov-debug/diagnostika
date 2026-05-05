require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const fs = require('fs');
const path = require('path');

// ============ KONFIGURATSIYA ============
const BOT_TOKEN = process.env.BOT_TOKEN;

// FOYDALANUVCHI ID'LARI
const SUPER_ADMIN_ID = 1437230485;     // Siz
const ADMIN2_ID = 987654321;           // 2-ADMIN (O'ZGARTIRING!)
const OBSERVER_ID = 555555555;         // KUZATUVCHI (O'ZGARTIRING!)

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
    
    // Agar raqam mavjud bo'lsa, yangilash
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
bot.use(session());

function isSuperAdmin(ctx) {
    return ctx.from.id === SUPER_ADMIN_ID;
}

function isAdmin(ctx) {
    return ADMIN_IDS.includes(ctx.from.id);
}

function isAllowed(ctx) {
    return ALLOWED_IDS.includes(ctx.from.id);
}

// ============ BUYRUQLAR ============

// /start
bot.start(async (ctx) => {
    if (!isAllowed(ctx)) {
        return ctx.reply('❌ Sizga ruxsat yo‘q! Bot faqat cheklangan foydalanuvchilar uchun.');
    }
    
    let msg = '';
    if (isSuperAdmin(ctx)) {
        msg = `👑 *Assalomu alaykum, SUPER ADMIN ${ctx.from.first_name}!*\n\n` +
              `✅ Siz to‘liq huquqlarga egasiz:\n` +
              `• Diagnostika qo‘shish (matn/rasm)\n` +
              `• Statistika ko‘rish\n` +
              `• Bazani eksport qilish\n` +
              `• Admin boshqaruvi\n\n` +
              `📌 *Buyruqlar:*\n` +
              `/add - Avtomobil qo‘shish\n` +
              `/total - Jami summa\n` +
              `/last - So‘nggi yozuvlar\n` +
              `/check - Tekshirish\n` +
              `/stats - Statistika\n` +
              `/export - Eksport\n` +
              `/clear - Bazani tozalash\n` +
              `/all - Barcha avtomobillar`;
    } else if (isAdmin(ctx)) {
        msg = `👋 *Assalomu alaykum, Admin ${ctx.from.first_name}!*\n\n` +
              `✅ Sizning huquqlaringiz:\n` +
              `• Diagnostika qo‘shish (matn/rasm)\n` +
              `• Ma'lumotlarni ko‘rish\n\n` +
              `📌 *Buyruqlar:*\n` +
              `/add - Avtomobil qo‘shish\n` +
              `/total - Jami summa\n` +
              `/last - So‘nggi yozuvlar\n` +
              `/check - Tekshirish`;
    } else {
        msg = `👋 *Assalomu alaykum, ${ctx.from.first_name}!*\n\n` +
              `👁️ *Siz kuzatuvchisiz*\n\n` +
              `📌 *Buyruqlar:*\n` +
              `/check [raqam] - Avtomobilni tekshirish\n` +
              `/total - Jami summa\n` +
              `/last - So‘nggi yozuvlar`;
    }
    
    await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// /add
bot.command('add', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    await ctx.reply(
        '🚗 *Yangi avtomobil qo‘shish*\n\nQanday usulda?',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📝 Matn orqali', 'add_text')],
                [Markup.button.callback('❌ Bekor qilish', 'cancel_add')]
            ])
        }
    );
});

// /total
bot.command('total', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const { total, count } = await getTotalSum();
    await ctx.reply(
        `💰 *Diagnostika hisoboti*\n\n` +
        `• Diagnostika qilingan avtomobillar: *${count}* ta\n` +
        `• Jami summa: *${total.toLocaleString()}* so‘m\n` +
        `• Bir diagnostika narxi: *${DIAGNOSIS_PRICE.toLocaleString()}* so‘m`,
        { parse_mode: 'Markdown' }
    );
});

// /last
bot.command('last', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const records = getLastRecords(10);
    if (records.length === 0) {
        return ctx.reply('📋 Hali hech qanday ma\'lumot yo‘q.');
    }
    
    let msg = '📋 *So‘nggi 10 ta yozuv:*\n\n';
    records.forEach((car, idx) => {
        msg += `${idx+1}. ${car.raqam} | ${car.turi} | ${car.diagnostika} | ${car.narxi.toLocaleString()} so‘m\n`;
    });
    await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// /check
bot.command('check', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply(
            '❌ *Iltimos, raqamni kiriting!*\n\nMisol: `/check 01A777AA`',
            { parse_mode: 'Markdown' }
        );
    }
    
    const car = checkCar(args[1]);
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
        await ctx.reply(`❌ *${args[1]}* raqamli avtomobil topilmadi.`, { parse_mode: 'Markdown' });
    }
});

// /stats (faqat Super Admin)
bot.command('stats', async (ctx) => {
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
});

// /export (faqat Super Admin)
bot.command('export', async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    
    const cars = getAllCars();
    const jsonData = JSON.stringify(cars, null, 2);
    const fileName = `diagnostika_${Date.now()}.json`;
    
    await ctx.replyWithDocument({
        source: Buffer.from(jsonData, 'utf-8'),
        filename: fileName
    });
});

// /clear (faqat Super Admin)
bot.command('clear', async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    
    clearAll();
    await ctx.reply('🗑️ *Baza tozalandi!* Barcha ma\'lumotlar o‘chirildi.', { parse_mode: 'Markdown' });
});

// /all (faqat Super Admin)
bot.command('all', async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    
    const cars = getAllCars();
    if (cars.length === 0) {
        return ctx.reply('📋 Hali hech qanday ma\'lumot yo‘q.');
    }
    
    let msg = '📋 *BARCHA AVTOMOBILLAR*\n\n';
    cars.forEach((car, idx) => {
        msg += `${idx+1}. ${car.raqam} | ${car.turi} | ${car.diagnostika} | ${car.narxi.toLocaleString()} so‘m\n`;
    });
    
    // Agar xabar juda uzun bo‘lsa, qismlarga bo‘lib yuborish
    if (msg.length > 4000) {
        await ctx.reply('📋 Ma\'lumotlar juda ko‘p. /export orqali fayl ko‘rinishida yuklab oling.');
    } else {
        await ctx.reply(msg, { parse_mode: 'Markdown' });
    }
});

// ============ INLINE BUTTON HANDLERS ============
const addSteps = new Map();

bot.action('add_text', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    addSteps.set(ctx.from.id, { step: 'number' });
    await ctx.editMessageText(
        '📝 *1-qadam:* Avtomobil raqamini kiriting\n\n' +
        'Format: `01A777AA` (2 raqam, 1 harf, 3 raqam, 2 harf)',
        { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
});

bot.action('cancel_add', async (ctx) => {
    addSteps.delete(ctx.from.id);
    await ctx.editMessageText('❌ Bekor qilindi');
    await ctx.answerCbQuery();
});

// Matn qabul qilish
bot.on('text', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    const step = addSteps.get(ctx.from.id);
    if (!step) return;
    
    if (step.step === 'number') {
        const platePattern = /^[0-9]{2}[A-Z][0-9]{3}[A-Z]{2}$/i;
        if (!platePattern.test(ctx.message.text)) {
            return ctx.reply(
                '❌ *Noto‘g‘ri format!*\n\n' +
                'Raqam quyidagi ko‘rinishda bo‘lishi kerak: `01A777AA`\n\n' +
                'Qaytadan kiriting yoki /cancel',
                { parse_mode: 'Markdown' }
            );
        }
        
        step.carNumber = ctx.message.text.toUpperCase();
        step.step = 'type';
        addSteps.set(ctx.from.id, step);
        await ctx.reply(
            `✅ *Raqam:* ${step.carNumber}\n\n` +
            '*2-qadam:* Avtomobil turini kiriting\n\n' +
            'Masalan: `Malibu`, `Cobalt`, `Spark`, `Nexia`, `Gentra`',
            { parse_mode: 'Markdown' }
        );
    }
    else if (step.step === 'type') {
        step.carType = ctx.message.text;
        addSteps.delete(ctx.from.id);
        
        await ctx.reply(
            `✅ *Ma'lumotlar:*\n` +
            `🚗 Raqam: ${step.carNumber}\n` +
            `🏷️ Turi: ${step.carType}\n\n` +
            `*Diagnostika holati?*`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback(`✅ O‘tkazildi (${DIAGNOSIS_PRICE.toLocaleString()} so‘m)`, `diag_yes_${step.carNumber}_${step.carType}`)],
                    [Markup.button.callback('❌ O‘tkazilmadi', `diag_no_${step.carNumber}_${step.carType}`)]
                ])
            }
        );
    }
});

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
});

// /cancel
bot.command('cancel', async (ctx) => {
    addSteps.delete(ctx.from.id);
    await ctx.reply('❌ Bekor qilindi');
});

// Botni ishga tushirish
bot.launch();
console.log('🤖 Bot ishga tushdi!');
console.log(`👑 Super Admin ID: ${SUPER_ADMIN_ID}`);
console.log(`💰 Diagnostika narxi: ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
