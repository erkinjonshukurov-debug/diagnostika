const { Telegraf, Markup, session } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// ============ KONFIGURATSIYA ============
const BOT_TOKEN = 'YOUR_BOT_TOKEN'; // Bot tokenini shu yerga yozing

// 3 ta ruxsat etilgan foydalanuvchi ID (Telegram user ID)
const ALLOWED_USERS = {
    ADMIN1: 123456789,   // 1-admin ID
    ADMIN2: 987654321,   // 2-admin ID
    OBSERVER: 555555555  // Kuzatuvchi ID
};

const ADMIN_IDS = [ALLOWED_USERS.ADMIN1, ALLOWED_USERS.ADMIN2];
const OBSERVER_ID = ALLOWED_USERS.OBSERVER;

// Google Sheets sozlamalari
// Google Cloud Console dan olingan service account json fayli kerak
const GOOGLE_SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
const GOOGLE_SERVICE_ACCOUNT_EMAIL = 'your-service-account@project.iam.gserviceaccount.com';
const GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n';

// Diagnostika narxi
const DIAGNOSIS_PRICE = 250000;

// ============ SESSIYA ============
const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// ============ GOOGLE SHEETS (Async) ============
let doc;
async function initGoogleSheets() {
    try {
        doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: GOOGLE_PRIVATE_KEY,
        });
        await doc.loadInfo();
        console.log('✅ Google Sheets ga ulandi');
    } catch (err) {
        console.error('❌ Google Sheets xatosi:', err.message);
    }
}

// Ma'lumot qo'shish
async function addToSheet(carNumber, carType, isDiagnosed, adminId) {
    try {
        const sheet = doc.sheetsByIndex[0];
        const price = isDiagnosed ? DIAGNOSIS_PRICE : 0;
        const diagnosisStatus = isDiagnosed ? "o‘tkazildi" : "o‘tkazilmadi";
        const date = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
        
        await sheet.addRow({
            Sana: date,
            Raqam: carNumber,
            Turi: carType,
            Diagnostika: diagnosisStatus,
            Narxi: price,
            Admin: adminId
        });
        
        return true;
    } catch (err) {
        console.error('❌ Sheetsga yozish xatosi:', err);
        return false;
    }
}

// Jami summani olish
async function getTotalSum() {
    try {
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        let total = 0;
        rows.forEach(row => {
            if (row.Diagnostika === "o‘tkazildi") {
                total += parseInt(row.Narxi) || 0;
            }
        });
        return total;
    } catch (err) {
        console.error('❌ Jami summa xatosi:', err);
        return 0;
    }
}

// Avtomobilni tekshirish
async function checkCar(carNumber) {
    try {
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        const car = rows.find(row => row.Raqam === carNumber);
        
        if (car) {
            return {
                exists: true,
                carType: car.Turi,
                diagnosed: car.Diagnostika === "o‘tkazildi",
                price: car.Narxi,
                date: car.Sana
            };
        }
        return { exists: false };
    } catch (err) {
        console.error('❌ Tekshirish xatosi:', err);
        return { exists: false, error: true };
    }
}

// So'nggi 10 ta yozuvni olish
async function getLast10Records() {
    try {
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        const last10 = rows.slice(-10).reverse();
        let message = "📋 So‘nggi 10 ta diagnostika:\n\n";
        last10.forEach((row, idx) => {
            message += `${idx+1}. ${row.Raqam} | ${row.Turi} | ${row.Diagnostika} | ${row.Narxi} so‘m\n`;
        });
        return message;
    } catch (err) {
        return "❌ Ma'lumot olishda xatolik";
    }
}

// ============ RAQAMNI RASMDAN O'QISH (OCR) ============
async function recognizePlateFromImage(filePath) {
    try {
        // Rasmni optimallashtirish (kichraytirish, kontrast oshirish)
        const optimizedPath = path.join(__dirname, 'temp_optimized.jpg');
        await sharp(filePath)
            .resize(800)
            .grayscale()
            .normalize()
            .toFile(optimizedPath);
        
        // OCR bilan raqamni o'qish
        const { data: { text } } = await Tesseract.recognize(
            optimizedPath,
            'uzb+eng',
            {
                logger: m => console.log(m)
            }
        );
        
        // Tozalash: faqat harflar va raqamlarni olish
        const cleanText = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        
        // O'zbek avto raqam patterni (masalan: 01A777AA)
        const pattern = /[0-9]{2}[A-Z]{1}[0-9]{3}[A-Z]{2}/;
        const match = cleanText.match(pattern);
        
        // Tozalash
        fs.unlinkSync(optimizedPath);
        if (filePath.includes('temp_')) fs.unlinkSync(filePath);
        
        return match ? match[0] : null;
    } catch (err) {
        console.error('OCR xatosi:', err);
        return null;
    }
}

// ============ RUHSATNI TEKSHIRISH ============
function isAdmin(ctx) {
    return ADMIN_IDS.includes(ctx.from.id);
}

function isObserver(ctx) {
    return ctx.from.id === OBSERVER_ID;
}

function isAllowed(ctx) {
    return isAdmin(ctx) || isObserver(ctx);
}

// ============ ASOSIY BOT FUNKSIYALARI ============
bot.start(async (ctx) => {
    if (!isAllowed(ctx)) {
        return ctx.reply('❌ Sizga ruxsat yo‘q! Bot faqat cheklangan foydalanuvchilar uchun.');
    }
    
    await ctx.reply(
        `👋 Xush kelibsiz, ${ctx.from.first_name}!\n\n` +
        (isAdmin(ctx) ? 
            "✅ **Admin huquqlari:**\n" +
            "/add_car - Avtomobil qo‘shish (matn)\n" +
            "/add_photo - Rasm orqali qo‘shish\n" +
            "/total - Jami summani ko‘rish\n" +
            "/last - So‘nggi 10 ta yozuv\n" +
            "/help - Yordam"
            :
            "👁️ **Kuzatuvchi huquqlari:**\n" +
            "/check [raqam] - Avtomobilni tekshirish\n" +
            "/total - Jami summani ko‘rish\n" +
            "/last - So‘nggi 10 ta yozuv\n" +
            "/help - Yordam"
        ),
        { parse_mode: 'Markdown' }
    );
});

// Yordam
bot.help(async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    if (isAdmin(ctx)) {
        await ctx.reply(
            "📖 **Admin buyruqlari:**\n\n" +
            "/add_car - Matn orqali avtomobil qo‘shish\n" +
            "/add_photo - Rasm yuborib qo‘shish\n" +
            "/total - Diagnostika jami summasini ko‘rish\n" +
            "/last - So‘nggi 10 ta yozuv\n" +
            "/start - Bosh menyu\n" +
            "/help - Bu yordam\n\n" +
            "💡 **Ishlatish tartibi:**\n" +
            "1. /add_car → raqam → turi → diagnostika holati\n" +
            "2. Rasm yuborsangiz, avtomatik raqam o‘qiladi"
        );
    } else {
        await ctx.reply(
            "📖 **Kuzatuvchi buyruqlari:**\n\n" +
            "/check [raqam] - Avtomobil diagnostikasi bor yoki yo‘q\n" +
            "/total - Barcha diagnostika summasi\n" +
            "/last - So‘nggi 10 ta yozuv\n" +
            "/start - Bosh menyu\n" +
            "/help - Bu yordam"
        );
    }
});

// Jami summa
bot.command('total', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const total = await getTotalSum();
    await ctx.reply(`💰 **Jami diagnostika summasi:** ${total.toLocaleString()} so‘m\n📊 (faqat "o‘tkazildi" bo‘lganlar)`, { parse_mode: 'Markdown' });
});

// So'nggi 10 ta yozuv
bot.command('last', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const message = await getLast10Records();
    await ctx.reply(message);
});

// Avtomobilni tekshirish (faqat kuzatuvchi va adminlar ham tekshira oladi)
bot.command('check', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('❌ Iltimos, raqamni kiriting: `/check 01A777AA`', { parse_mode: 'Markdown' });
    }
    
    const carNumber = args[1].toUpperCase();
    const result = await checkCar(carNumber);
    
    if (result.error) {
        return ctx.reply('❌ Xatolik yuz berdi');
    }
    
    if (result.exists) {
        await ctx.reply(
            `🚗 **Avtomobil ma'lumotlari:**\n\n` +
            `📌 Raqam: ${carNumber}\n` +
            `🏷️ Turi: ${result.carType}\n` +
            `🔧 Diagnostika: ${result.diagnosed ? '✅ O‘tkazilgan' : '❌ O‘tkazilmagan'}\n` +
            `💰 Narxi: ${result.price} so‘m\n` +
            `📅 Sana: ${result.date}`,
            { parse_mode: 'Markdown' }
        );
    } else {
        await ctx.reply(`❌ ${carNumber} raqamli avtomobil topilmadi.`);
    }
});

// ADMIN: Matn orqali qo'shish (step-by-step)
const addCarSteps = new Map();

bot.command('add_car', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    addCarSteps.set(ctx.from.id, { step: 'number' });
    await ctx.reply('🚗 **Yangi avtomobil qo‘shish**\n\n1-qadam: Avtomobil raqamini kiriting (masalan: 01A777AA)', { parse_mode: 'Markdown' });
});

// ADMIN: Rasm orqali qo'shish
bot.command('add_photo', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    await ctx.reply('📸 **Rasm yuboring** – bot avtomobil raqamini avtomatik o‘qib oladi.\n\nRasm aniq va raqam yaqqol ko‘rinishi kerak.');
    addCarSteps.set(ctx.from.id, { step: 'photo' });
});

// Matn va rasmlarni qayta ishlash
bot.on('text', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    const stepData = addCarSteps.get(ctx.from.id);
    if (!stepData) return;
    
    const text = ctx.message.text;
    
    if (stepData.step === 'number') {
        // Raqamni tekshirish
        const platePattern = /^[0-9]{2}[A-Z]{1}[0-9]{3}[A-Z]{2}$/;
        if (!platePattern.test(text.toUpperCase())) {
            return ctx.reply('❌ Noto‘g‘ri format! Masalan: 01A777AA (2 raqam, 1 harf, 3 raqam, 2 harf)');
        }
        
        stepData.carNumber = text.toUpperCase();
        stepData.step = 'type';
        addCarSteps.set(ctx.from.id, stepData);
        await ctx.reply('✅ Raqam qabul qilindi!\n\n2-qadam: Avtomobil turini kiriting (masalan: Malibu, Cobalt, Spark, Nexia)');
    }
    else if (stepData.step === 'type') {
        stepData.carType = text;
        stepData.step = 'diagnosis';
        addCarSteps.set(ctx.from.id, stepData);
        
        await ctx.reply(
            `✅ Avtomobil turi: ${text}\n\n3-qadam: Diagnostika holatini tanlang:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Diagnostika o‘tkazildi (250 000 so‘m)', 'diag_yes')],
                [Markup.button.callback('❌ Diagnostika o‘tkazilmadi', 'diag_no')],
                [Markup.button.callback('❌ Bekor qilish', 'cancel')]
            ])
        );
    }
});

// Rasm qabul qilish (admin uchun)
bot.on('photo', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    const stepData = addCarSteps.get(ctx.from.id);
    const isPhotoFlow = stepData && stepData.step === 'photo';
    
    await ctx.reply('⏳ Rasm tahlil qilinmoqda, iltimos kuting...');
    
    try {
        // Rasmni yuklab olish
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        
        const tempPath = path.join(__dirname, `temp_${Date.now()}.jpg`);
        const response = await fetch(fileLink.href);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(tempPath, Buffer.from(buffer));
        
        // OCR orqali raqamni o'qish
        const plateNumber = await recognizePlateFromImage(tempPath);
        
        if (!plateNumber) {
            return ctx.reply('❌ Raqamni o‘qib bo‘lmadi. Iltimos, aniqroq rasm yuboring yoki /add_car buyrug‘idan foydalaning.');
        }
        
        await ctx.reply(`🔍 Rasmda topilgan raqam: *${plateNumber}*\n\nTo‘g‘rimi?`, { parse_mode: 'Markdown' });
        
        // Saqlash uchun vaqtinchalik ma'lumot
        addCarSteps.set(ctx.from.id, {
            step: 'photo_type',
            carNumber: plateNumber
        });
        
    } catch (err) {
        console.error(err);
        await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko‘ring.');
    }
});

// Inline button handler
bot.action('diag_yes', async (ctx) => {
    const stepData = addCarSteps.get(ctx.from.id);
    if (!stepData || stepData.step !== 'diagnosis') {
        return ctx.answerCbQuery('Bot holati noto‘g‘ri, /add_car qaytadan boshlang');
    }
    
    const success = await addToSheet(stepData.carNumber, stepData.carType, true, ctx.from.id);
    
    if (success) {
        await ctx.editMessageText(
            `✅ **Avtomobil qo‘shildi!**\n\n` +
            `🚗 Raqam: ${stepData.carNumber}\n` +
            `🏷️ Turi: ${stepData.carType}\n` +
            `🔧 Diagnostika: o‘tkazildi\n` +
            `💰 Narxi: ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`
        );
    } else {
        await ctx.editMessageText('❌ Ma\'lumotni saqlashda xatolik yuz berdi');
    }
    
    addCarSteps.delete(ctx.from.id);
    await ctx.answerCbQuery();
});

bot.action('diag_no', async (ctx) => {
    const stepData = addCarSteps.get(ctx.from.id);
    if (!stepData || stepData.step !== 'diagnosis') {
        return ctx.answerCbQuery('Bot holati noto‘g‘ri, /add_car qaytadan boshlang');
    }
    
    const success = await addToSheet(stepData.carNumber, stepData.carType, false, ctx.from.id);
    
    if (success) {
        await ctx.editMessageText(
            `✅ **Avtomobil qo‘shildi!**\n\n` +
            `🚗 Raqam: ${stepData.carNumber}\n` +
            `🏷️ Turi: ${stepData.carType}\n` +
            `🔧 Diagnostika: o‘tkazilmadi\n` +
            `💰 Narxi: 0 so‘m`
        );
    } else {
        await ctx.editMessageText('❌ Ma\'lumotni saqlashda xatolik yuz berdi');
    }
    
    addCarSteps.delete(ctx.from.id);
    await ctx.answerCbQuery();
});

bot.action('cancel', async (ctx) => {
    addCarSteps.delete(ctx.from.id);
    await ctx.editMessageText('❌ Bekor qilindi');
    await ctx.answerCbQuery();
});

// Rasm orqali kiritish uchun type so'rash
bot.on('text', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    const stepData = addCarSteps.get(ctx.from.id);
    if (!stepData || stepData.step !== 'photo_type') return;
    
    if (ctx.message.text.toLowerCase() === 'ha') {
        stepData.step = 'photo_type_wait';
        addCarSteps.set(ctx.from.id, stepData);
        await ctx.reply('Avtomobil turini kiriting (masalan: Malibu):');
    } 
    else if (ctx.message.text.toLowerCase() === 'yo\'q' || ctx.message.text.toLowerCase() === 'no') {
        addCarSteps.delete(ctx.from.id);
        await ctx.reply('❌ Bekor qilindi. Qaytadan /add_photo yuboring.');
    }
    else if (stepData.step === 'photo_type_wait') {
        // Endi tur kiritiladi
        stepData.carType = ctx.message.text;
        stepData.step = 'photo_diagnosis';
        addCarSteps.set(ctx.from.id, stepData);
        
        await ctx.reply(
            `✅ Avtomobil turi: ${ctx.message.text}\n\nDiagnostika holatini tanlang:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Diagnostika o‘tkazildi (250 000 so‘m)', 'photo_diag_yes')],
                [Markup.button.callback('❌ Diagnostika o‘tkazilmadi', 'photo_diag_no')]
            ])
        );
    }
});

// Photo flow uchun diagnosis handler
bot.action('photo_diag_yes', async (ctx) => {
    const stepData = addCarSteps.get(ctx.from.id);
    if (!stepData || stepData.step !== 'photo_diagnosis') return;
    
    const success = await addToSheet(stepData.carNumber, stepData.carType, true, ctx.from.id);
    
    if (success) {
        await ctx.editMessageText(
            `✅ **Rasm orqali avtomobil qo‘shildi!**\n\n` +
            `🚗 Raqam: ${stepData.carNumber}\n` +
            `🏷️ Turi: ${stepData.carType}\n` +
            `🔧 Diagnostika: o‘tkazildi\n` +
            `💰 Narxi: ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`
        );
    } else {
        await ctx.editMessageText('❌ Xatolik');
    }
    
    addCarSteps.delete(ctx.from.id);
    await ctx.answerCbQuery();
});

bot.action('photo_diag_no', async (ctx) => {
    const stepData = addCarSteps.get(ctx.from.id);
    if (!stepData || stepData.step !== 'photo_diagnosis') return;
    
    const success = await addToSheet(stepData.carNumber, stepData.carType, false, ctx.from.id);
    
    if (success) {
        await ctx.editMessageText(
            `✅ **Avtomobil qo‘shildi!**\n\n` +
            `🚗 Raqam: ${stepData.carNumber}\n` +
            `🏷️ Turi: ${stepData.carType}\n` +
            `🔧 Diagnostika: o‘tkazilmadi\n` +
            `💰 Narxi: 0 so‘m`
        );
    } else {
        await ctx.editMessageText('❌ Xatolik');
    }
    
    addCarSteps.delete(ctx.from.id);
    await ctx.answerCbQuery();
});

// ============ BOTNI ISHGA TUSHIRISH ============
async function startBot() {
    await initGoogleSheets();
    bot.launch();
    console.log('🤖 Bot ishga tushdi...');
}

startBot();

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
