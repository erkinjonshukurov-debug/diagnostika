require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const db = require('./database');

const BOT_TOKEN = process.env.BOT_TOKEN;

// 3 ta ruxsat etilgan foydalanuvchi ID
const ALLOWED_USERS = {
    ADMIN1: 123456789,   // O'z ID'ingizni qo'ying!
    ADMIN2: 987654321,   // Ikkinchi admin ID
    OBSERVER: 555555555  // Kuzatuvchi ID
};

const ADMIN_IDS = [ALLOWED_USERS.ADMIN1, ALLOWED_USERS.ADMIN2];
const OBSERVER_ID = ALLOWED_USERS.OBSERVER;
const DIAGNOSIS_PRICE = 250000;

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

function isAdmin(ctx) {
    return ADMIN_IDS.includes(ctx.from.id);
}

function isObserver(ctx) {
    return ctx.from.id === OBSERVER_ID;
}

function isAllowed(ctx) {
    return isAdmin(ctx) || isObserver(ctx);
}

// /start
bot.start(async (ctx) => {
    if (!isAllowed(ctx)) {
        return ctx.reply('❌ Sizga ruxsat yo‘q!');
    }
    
    const msg = isAdmin(ctx) ?
        `👋 Assalomu alaykum, Admin ${ctx.from.first_name}!\n\n✅ Sizning huquqlaringiz:\n• Diagnostika qo‘shish (matn/rasm)\n• Ma'lumotlarni ko‘rish\n\n📌 Buyruqlar:\n/add - Avtomobil qo‘shish\n/total - Jami summa\n/last - So‘nggi yozuvlar\n/check - Tekshirish` :
        `👋 Assalomu alaykum, ${ctx.from.first_name}!\n\n👁️ Siz kuzatuvchisiz\n\n📌 Buyruqlar:\n/check - Tekshirish\n/total - Jami summa\n/last - So‘nggi yozuvlar`;
    
    await ctx.reply(msg);
});

// /add
bot.command('add', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    await ctx.reply(
        '🚗 Yangi avtomobil qo‘shish\n\nQanday usulda?',
        Markup.inlineKeyboard([
            [Markup.button.callback('📝 Matn orqali', 'add_text')],
            [Markup.button.callback('📸 Rasm orqali', 'add_photo')],
            [Markup.button.callback('❌ Bekor', 'cancel_add')]
        ])
    );
});

// /total
bot.command('total', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const { total, count } = await db.getTotalSum();
    await ctx.reply(
        `💰 Diagnostika hisoboti\n\n` +
        `• Diagnostika qilingan: ${count} ta\n` +
        `• Jami summa: ${total.toLocaleString()} so‘m\n` +
        `• Bir diagnostika narxi: ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`
    );
});

// /last
bot.command('last', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const records = await db.getLastRecords(10);
    if (records.length === 0) {
        return ctx.reply('📋 Hali hech qanday ma'lumot yo‘q.');
    }
    
    let msg = '📋 So‘nggi 10 ta yozuv:\n\n';
    records.forEach((car, idx) => {
        msg += `${idx+1}. ${car.raqam} | ${car.turi} | ${car.diagnostika} | ${car.narxi} so‘m\n`;
    });
    await ctx.reply(msg);
});

// /check
bot.command('check', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('❌ Raqamni kiriting: `/check 01A777AA`', { parse_mode: 'Markdown' });
    }
    
    const car = await db.checkCar(args[1]);
    if (car) {
        await ctx.reply(
            `🚗 Avtomobil ma'lumotlari:\n\n` +
            `📌 Raqam: ${car.raqam}\n` +
            `🏷️ Turi: ${car.turi}\n` +
            `🔧 Diagnostika: ${car.diagnostika === 'o‘tkazildi' ? '✅ O‘tkazilgan' : '❌ O‘tkazilmagan'}\n` +
            `💰 Narxi: ${car.narxi} so‘m\n` +
            `📅 Sana: ${car.sana}`
        );
    } else {
        await ctx.reply(`❌ ${args[1]} raqamli avtomobil topilmadi.`);
    }
});

// Matn orqali qo'shish (step-by-step)
const addSteps = new Map();

bot.action('add_text', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    addSteps.set(ctx.from.id, { step: 'number' });
    await ctx.editMessageText('📝 1-qadam: Avtomobil raqamini kiriting (masalan: 01A777AA)');
    await ctx.answerCbQuery();
});

bot.action('add_photo', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    addSteps.set(ctx.from.id, { step: 'photo' });
    await ctx.editMessageText('📸 Rasm yuboring – bot raqamni avtomatik o‘qib oladi');
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
            return ctx.reply('❌ Noto‘g‘ri format! Masalan: 01A777AA');
        }
        
        step.carNumber = ctx.message.text.toUpperCase();
        step.step = 'type';
        addSteps.set(ctx.from.id, step);
        await ctx.reply(`✅ Raqam: ${step.carNumber}\n\n2-qadam: Avtomobil turini kiriting (Malibu, Cobalt, Spark...)`);
    }
    else if (step.step === 'type') {
        step.carType = ctx.message.text;
        step.step = null;
        addSteps.delete(ctx.from.id);
        
        await ctx.reply(
            `✅ Ma'lumotlar:\n🚗 ${step.carNumber}\n🏷️ ${step.carType}\n\nDiagnostika holati?`,
            Markup.inlineKeyboard([
                [Markup.button.callback(`✅ O‘tkazildi (${DIAGNOSIS_PRICE.toLocaleString()} so‘m)`, `diag_yes_${step.carNumber}_${step.carType}`)],
                [Markup.button.callback('❌ O‘tkazilmadi', `diag_no_${step.carNumber}_${step.carType}`)]
            ])
        );
    }
});

// Diagnostika javoblari
bot.action(/diag_yes_(.+)_(.+)/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    const carNumber = ctx.match[1];
    const carType = ctx.match[2];
    
    await db.addCar(carNumber, carType, true, ctx.from.id, ctx.from.first_name);
    
    await ctx.editMessageText(
        `✅ Avtomobil qo‘shildi!\n\n🚗 ${carNumber}\n🏷️ ${carType}\n✅ Diagnostika o‘tkazildi\n💰 ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`
    );
    
    // Kuzatuvchiga xabar
    await bot.telegram.sendMessage(
        OBSERVER_ID,
        `🔔 Yangi diagnostika!\n\n🚗 ${carNumber} avtomobiliga diagnostika o‘tkazildi.\n💰 Narxi: ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`
    );
    
    await ctx.answerCbQuery();
});

bot.action(/diag_no_(.+)_(.+)/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    const carNumber = ctx.match[1];
    const carType = ctx.match[2];
    
    await db.addCar(carNumber, carType, false, ctx.from.id, ctx.from.first_name);
    
    await ctx.editMessageText(
        `✅ Avtomobil qo‘shildi!\n\n🚗 ${carNumber}\n🏷️ ${carType}\n❌ Diagnostika o‘tkazilmadi\n💰 0 so‘m`
    );
    
    await ctx.answerCbQuery();
});

// Rasm qabul qilish (oddiy versiya)
bot.on('photo', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    const step = addSteps.get(ctx.from.id);
    if (!step || step.step !== 'photo') return;
    
    await ctx.reply('⏳ Rasm qabul qilindi. (OCR hozircha oddiy matn kiritishni tavsiya qilaman)');
    await ctx.reply('📝 Iltimos, avtomobil raqamini matn shaklida kiriting:');
    
    step.step = 'number';
    addSteps.set(ctx.from.id, step);
});

// Botni ishga tushirish
bot.launch();
console.log('🤖 Bot ishga tushdi (mahalliy baza bilan)...');
console.log(`📝 Adminlar: ${ADMIN_IDS.join(', ')}`);
console.log(`👁️ Kuzatuvchi: ${OBSERVER_ID}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
