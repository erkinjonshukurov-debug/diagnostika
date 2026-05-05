require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// ============ TOKEN .env dan olinadi ============
const BOT_TOKEN = process.env.BOT_TOKEN;

// 3 ta ruxsat etilgan foydalanuvchi ID (o'zingizni ID laringizni yozing)
const ALLOWED_USERS = {
    ADMIN1: YOUR_TELEGRAM_ID_1,     // O'z ID'ingizni qo'ying
    ADMIN2: YOUR_TELEGRAM_ID_2,     // Ikkinchi admin ID
    OBSERVER: YOUR_TELEGRAM_ID_3    // Kuzatuvchi ID
};

const ADMIN_IDS = [ALLOWED_USERS.ADMIN1, ALLOWED_USERS.ADMIN2];
const OBSERVER_ID = ALLOWED_USERS.OBSERVER;

// Diagnostika narxi
const DIAGNOSIS_PRICE = 250000;

// ============ BOT ============
const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// ============ Google Sheets sozlamalari ============
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

// ============ Avatar (welcome photo) ============
const WELCOME_PHOTO = 'https://example.com/welcome.jpg'; // O'z rasmingizni URL ini qo'ying

// ============ ASOSIY FUNKSIYALAR ============
let doc;

async function initGoogleSheets() {
    try {
        doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        });
        await doc.loadInfo();
        
        // Agar sheet mavjud bo'lmasa, yaratish
        let sheet = doc.sheetsByIndex[0];
        if (!sheet) {
            sheet = await doc.addSheet({ title: 'Diagnostika' });
            await sheet.setHeaderRow(['Sana', 'Raqam', 'Turi', 'Diagnostika', 'Narxi', 'Admin']);
        }
        
        console.log('✅ Google Sheets ulandi');
        return true;
    } catch (err) {
        console.error('❌ Google Sheets xatosi:', err.message);
        return false;
    }
}

// Ma'lumot qo'shish
async function addToSheet(carNumber, carType, isDiagnosed, adminId, adminName) {
    try {
        const sheet = doc.sheetsByIndex[0];
        const price = isDiagnosed ? DIAGNOSIS_PRICE : 0;
        const diagnosisStatus = isDiagnosed ? "✅ o‘tkazildi" : "❌ o‘tkazilmadi";
        
        const now = new Date();
        const date = now.toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
        
        await sheet.addRow({
            Sana: date,
            Raqam: carNumber.toUpperCase(),
            Turi: carType,
            Diagnostika: diagnosisStatus,
            Narxi: price,
            Admin: `${adminName} (${adminId})`
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
        let count = 0;
        
        rows.forEach(row => {
            if (row.Diagnostika.includes('o‘tkazildi')) {
                const price = parseInt(row.Narxi) || 0;
                total += price;
                count++;
            }
        });
        
        return { total, count };
    } catch (err) {
        console.error('❌ Jami summa xatosi:', err);
        return { total: 0, count: 0 };
    }
}

// Avtomobilni tekshirish
async function checkCar(carNumber) {
    try {
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        const car = rows.find(row => row.Raqam === carNumber.toUpperCase());
        
        if (car) {
            return {
                exists: true,
                carType: car.Turi,
                diagnosed: car.Diagnostika.includes('o‘tkazildi'),
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

// So'nggi yozuvlarni olish
async function getLastRecords(limit = 10) {
    try {
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        
        if (rows.length === 0) {
            return "📋 Hali hech qanday ma'lumot yo‘q.";
        }
        
        const lastRecords = rows.slice(-limit).reverse();
        let message = `📋 So‘nggi ${lastRecords.length} ta yozuv:\n\n`;
        
        lastRecords.forEach((row, idx) => {
            message += `${idx+1}. ${row.Raqam} | ${row.Turi} | ${row.Diagnostika} | ${row.Narxi} so‘m\n`;
        });
        
        return message;
    } catch (err) {
        return "❌ Ma'lumot olishda xatolik";
    }
}

// ============ RASMDAN RAQAM O'QISH ============
async function downloadPhoto(fileId) {
    const fileLink = await bot.telegram.getFileLink(fileId);
    const response = await fetch(fileLink.href);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
}

async function recognizePlateFromImage(imageBuffer) {
    try {
        // Vaqtinchalik faylga saqlash
        const tempPath = path.join(__dirname, `temp_${Date.now()}.jpg`);
        fs.writeFileSync(tempPath, imageBuffer);
        
        // Rasmni optimallashtirish
        const optimizedPath = path.join(__dirname, `temp_opt_${Date.now()}.jpg`);
        await sharp(tempPath)
            .resize(1000, null, { fit: 'inside' })
            .grayscale()
            .normalize()
            .sharpen()
            .toFile(optimizedPath);
        
        // OCR
        const { data: { text } } = await Tesseract.recognize(
            optimizedPath,
            'uzb+eng',
            {
                logger: m => console.log(m)
            }
        );
        
        // Tozalash
        fs.unlinkSync(tempPath);
        fs.unlinkSync(optimizedPath);
        
        // Matnni tozalash
        const cleanText = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        
        // O'zbek avto raqam patterni
        const patterns = [
            /[0-9]{2}[A-Z]{1}[0-9]{3}[A-Z]{2}/,  // 01A777AA
            /[0-9]{2}[A-Z]{2}[0-9]{3}[A-Z]{1}/,  // 01AA777A
            /[0-9]{3}[A-Z]{1}[0-9]{3}[A-Z]{1}/   // 123A456B
        ];
        
        for (const pattern of patterns) {
            const match = cleanText.match(pattern);
            if (match) return match[0];
        }
        
        return null;
    } catch (err) {
        console.error('OCR xatosi:', err);
        return null;
    }
}

// ============ RUHSAT TEKSHIRISH ============
function isAdmin(ctx) {
    return ADMIN_IDS.includes(ctx.from.id);
}

function isObserver(ctx) {
    return ctx.from.id === OBSERVER_ID;
}

function isAllowed(ctx) {
    return isAdmin(ctx) || isObserver(ctx);
}

// ============ BOT BUYRUQLARI ============

// /start
bot.start(async (ctx) => {
    if (!isAllowed(ctx)) {
        return ctx.reply(
            '❌ *Sizga ruxsat yo‘q!*\n\n' +
            'Bu bot faqat cheklangan foydalanuvchilar uchun.',
            { parse_mode: 'Markdown' }
        );
    }
    
    const welcomeMessage = isAdmin(ctx) ?
        `👋 *Assalomu alaykum, Admin ${ctx.from.first_name}!*\n\n` +
        `✅ *Sizning huquqlaringiz:*\n` +
        `• Diagnostika qo‘shish (matn/rasm)\n` +
        `• Ma'lumotlarni ko‘rish\n` +
        `• Hisobot olish\n\n` +
        `📌 *Buyruqlar:*\n` +
        `/add - Avtomobil qo‘shish\n` +
        `/total - Jami summa\n` +
        `/last - So‘nggi yozuvlar\n` +
        `/check - Tekshirish\n` +
        `/help - Yordam`
        :
        `👋 *Assalomu alaykum, ${ctx.from.first_name}!*\n\n` +
        `👁️ *Siz kuzatuvchisiz*\n\n` +
        `📌 *Buyruqlar:*\n` +
        `/check [raqam] - Avtomobilni tekshirish\n` +
        `/total - Jami summa\n` +
        `/last - So‘nggi yozuvlar\n` +
        `/help - Yordam`;
    
    await ctx.replyWithPhoto(
        { url: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800' },
        { caption: welcomeMessage, parse_mode: 'Markdown' }
    );
});

// /help
bot.help(async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const helpText = isAdmin(ctx) ?
        `📖 *Admin uchun qo‘llanma*\n\n` +
        `🔹 /add - Yangi avtomobil qo‘shish\n` +
        `   • Matn orqali raqam kiritish\n` +
        `   • Rasm yuborish (avtomatik raqam o‘qiladi)\n\n` +
        `🔹 /total - Jami diagnostika summasini ko‘rish\n` +
        `🔹 /last - So‘nggi 10 ta yozuv\n` +
        `🔹 /check [raqam] - Avtomobilni tekshirish\n` +
        `🔹 /help - Yordam\n\n` +
        `💡 *Misol:* /check 01A777AA`
        :
        `📖 *Kuzatuvchi uchun qo‘llanma*\n\n` +
        `🔹 /check [raqam] - Avtomobil diagnostikasini tekshirish\n` +
        `🔹 /total - Barcha diagnostika summasi\n` +
        `🔹 /last - So‘nggi 10 ta yozuv\n` +
        `🔹 /help - Yordam\n\n` +
        `💡 *Misol:* /check 01A777AA`;
    
    await ctx.reply(helpText, { parse_mode: 'Markdown' });
});

// /add
bot.command('add', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    await ctx.reply(
        '🚗 *Yangi avtomobil qo‘shish*\n\n' +
        'Qanday usulda qo‘shmoqchisiz?',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('📝 Matn orqali', 'add_text'),
                    Markup.button.callback('📸 Rasm orqali', 'add_photo')
                ],
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
        `• Diagnostika qilingan avtomobillar: ${count} ta\n` +
        `• Jami summa: ${total.toLocaleString()} so‘m\n\n` +
        `🏷️ *Bir diagnostika narxi:* ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`,
        { parse_mode: 'Markdown' }
    );
});

// /last
bot.command('last', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const message = await getLastRecords(10);
    await ctx.reply(message);
});

// /check
bot.command('check', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply(
            '❌ *Iltimos, raqamni kiriting!*\n\n' +
            'Misol: `/check 01A777AA`',
            { parse_mode: 'Markdown' }
        );
    }
    
    const carNumber = args[1].toUpperCase();
    const result = await checkCar(carNumber);
    
    if (result.error) {
        return ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko‘ring.');
    }
    
    if (result.exists) {
        const statusIcon = result.diagnosed ? '✅' : '❌';
        const statusText = result.diagnosed ? 'O‘tkazilgan' : 'O‘tkazilmagan';
        
        await ctx.replyWithPhoto(
            { url: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400' },
            {
                caption: `🚗 *Avtomobil ma'lumotlari*\n\n` +
                        `📌 *Raqam:* ${carNumber}\n` +
                        `🏷️ *Turi:* ${result.carType}\n` +
                        `🔧 *Diagnostika:* ${statusIcon} ${statusText}\n` +
                        `💰 *Narxi:* ${result.price} so‘m\n` +
                        `📅 *Sana:* ${result.date}`,
                parse_mode: 'Markdown'
            }
        );
    } else {
        await ctx.reply(
            `❌ *${carNumber}* raqamli avtomobil topilmadi.\n\n` +
            `Diagnostika qilinmagan yoki noto‘g‘ri raqam kiritilgan bo‘lishi mumkin.`,
            { parse_mode: 'Markdown' }
        );
    }
});

// ============ INLINE BUTTON HANDLERS ============

// Qo'shish usulini tanlash
bot.action('add_text', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    await ctx.editMessageText(
        '📝 *Matn orqali qo‘shish*\n\n' +
        '1. Avtomobil raqamini kiriting (masalan: 01A777AA)',
        { parse_mode: 'Markdown' }
    );
    
    // Holatni saqlash
    ctx.session = ctx.session || {};
    ctx.session.addStep = 'number';
    await ctx.answerCbQuery();
});

bot.action('add_photo', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    await ctx.editMessageText(
        '📸 *Rasm orqali qo‘shish*\n\n' +
        'Avtomobil raqami aniq ko‘rinadigan rasm yuboring.\n\n' +
        'Bot raqamni avtomatik o‘qib oladi.',
        { parse_mode: 'Markdown' }
    );
    
    ctx.session = ctx.session || {};
    ctx.session.addStep = 'photo';
    await ctx.answerCbQuery();
});

bot.action('cancel_add', async (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.addStep = null;
    await ctx.editMessageText('❌ Bekor qilindi');
    await ctx.answerCbQuery();
});

// Matn orqali qo'shish jarayoni
bot.on('text', async (ctx) => {
    if (!isAdmin(ctx)) return;
    if (!ctx.session || !ctx.session.addStep) return;
    
    const step = ctx.session.addStep;
    const text = ctx.message.text;
    
    if (step === 'number') {
        // Raqamni tekshirish
        const platePattern = /^[0-9]{2}[A-Z]{1}[0-9]{3}[A-Z]{2}$/i;
        if (!platePattern.test(text)) {
            return ctx.reply(
                '❌ *Noto‘g‘ri format!*\n\n' +
                'Raqam quyidagi ko‘rinishda bo‘lishi kerak:\n' +
                '`01A777AA`\n\n' +
                'Qaytadan kiriting yoki /cancel',
                { parse_mode: 'Markdown' }
            );
        }
        
        ctx.session.carNumber = text.toUpperCase();
        ctx.session.addStep = 'type';
        await ctx.reply(
            `✅ Raqam: *${text.toUpperCase()}*\n\n` +
            '2. Avtomobil turini kiriting (masalan: Malibu, Cobalt, Spark)',
            { parse_mode: 'Markdown' }
        );
    }
    else if (step === 'type') {
        ctx.session.carType = text;
        ctx.session.addStep = null;
        
        await ctx.reply(
            `✅ *Ma'lumotlar qabul qilindi*\n\n` +
            `🚗 Raqam: ${ctx.session.carNumber}\n` +
            `🏷️ Turi: ${text}\n\n` +
            `🔧 Diagnostika holati?`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(`✅ O‘tkazildi (${DIAGNOSIS_PRICE.toLocaleString()} so‘m)`, 'diag_yes'),
                        Markup.button.callback('❌ O‘tkazilmadi', 'diag_no')
                    ]
                ])
            }
        );
    }
});

// Diagnostika javoblari
bot.action('diag_yes', async (ctx) => {
    if (!isAdmin(ctx)) return;
    if (!ctx.session || !ctx.session.carNumber) return;
    
    const success = await addToSheet(
        ctx.session.carNumber,
        ctx.session.carType,
        true,
        ctx.from.id,
        ctx.from.first_name
    );
    
    if (success) {
        await ctx.editMessageText(
            `✅ *Avtomobil qo‘shildi!*\n\n` +
            `🚗 Raqam: ${ctx.session.carNumber}\n` +
            `🏷️ Turi: ${ctx.session.carType}\n` +
            `🔧 Diagnostika: O‘tkazilgan ✅\n` +
            `💰 Narxi: ${DIAGNOSIS_PRICE.toLocaleString()} so‘m\n\n` +
            `➕ Admin: ${ctx.from.first_name}`,
            { parse_mode: 'Markdown' }
        );
        
        // Kuzatuvchiga xabar yuborish
        await bot.telegram.sendMessage(
            OBSERVER_ID,
            `🔔 *Yangi diagnostika qo‘shildi!*\n\n` +
            `🚗 ${ctx.session.carNumber} avtomobiliga diagnostika o‘tkazildi.\n` +
            `💰 Narxi: ${DIAGNOSIS_PRICE.toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
    } else {
        await ctx.editMessageText('❌ Xatolik yuz berdi. Qaytadan urinib ko‘ring.');
    }
    
    ctx.session = {};
    await ctx.answerCbQuery();
});

bot.action('diag_no', async (ctx) => {
    if (!isAdmin(ctx)) return;
    if (!ctx.session || !ctx.session.carNumber) return;
    
    const success = await addToSheet(
        ctx.session.carNumber,
        ctx.session.carType,
        false,
        ctx.from.id,
        ctx.from.first_name
    );
    
    if (success) {
        await ctx.editMessageText(
            `✅ *Avtomobil qo‘shildi!*\n\n` +
            `🚗 Raqam: ${ctx.session.carNumber}\n` +
            `🏷️ Turi: ${ctx.session.carType}\n` +
            `🔧 Diagnostika: O‘tkazilmagan ❌\n` +
            `💰 Narxi: 0 so‘m`,
            { parse_mode: 'Markdown' }
        );
    } else {
        await ctx.editMessageText('❌ Xatolik yuz berdi.');
    }
    
    ctx.session = {};
    await ctx.answerCbQuery();
});

// Rasm orqali qo'shish
bot.on('photo', async (ctx) => {
    if (!isAdmin(ctx)) return;
    if (!ctx.session || ctx.session.addStep !== 'photo') return;
    
    await ctx.reply('⏳ *Rasm tahlil qilinmoqda...*\nIltimos, kuting.', { parse_mode: 'Markdown' });
    
    try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const imageBuffer = await downloadPhoto(photo.file_id);
        const plateNumber = await recognizePlateFromImage(imageBuffer);
        
        if (!plateNumber) {
            await ctx.reply(
                '❌ *Raqamni o‘qib bo‘lmadi*\n\n' +
                'Iltimos, aniqroq rasm yuboring yoki matn orqali kiritish uchun /add buyrug‘idan foydalaning.',
                { parse_mode: 'Markdown' }
            );
            ctx.session.addStep = null;
            return;
        }
        
        ctx.session.carNumber = plateNumber;
        ctx.session.addStep = 'photo_type';
        
        await ctx.reply(
            `🔍 *Rasmda topilgan raqam:* \`${plateNumber}\`\n\n` +
            `✅ To‘g‘ri bo‘lsa, avtomobil turini kiriting:\n` +
            `❌ Noto‘g‘ri bo‘lsa, /cancel buyrug‘ini yuboring.`,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        console.error(err);
        await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko‘ring.');
        ctx.session.addStep = null;
    }
});

// Rasm orqali tur kiritish
bot.on('text', async (ctx) => {
    if (!isAdmin(ctx)) return;
    if (!ctx.session || ctx.session.addStep !== 'photo_type') return;
    
    if (ctx.message.text.toLowerCase() === '/cancel') {
        ctx.session.addStep = null;
        return ctx.reply('❌ Bekor qilindi');
    }
    
    ctx.session.carType = ctx.message.text;
    ctx.session.addStep = null;
    
    await ctx.reply(
        `✅ *Ma'lumotlar qabul qilindi*\n\n` +
        `🚗 Raqam: ${ctx.session.carNumber}\n` +
        `🏷️ Turi: ${ctx.message.text}\n\n` +
        `🔧 Diagnostika holati?`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback(`✅ O‘tkazildi (${DIAGNOSIS_PRICE.toLocaleString()} so‘m)`, 'diag_yes'),
                    Markup.button.callback('❌ O‘tkazilmadi', 'diag_no')
                ]
            ])
        }
    );
});

bot.command('cancel', async (ctx) => {
    if (ctx.session) ctx.session = {};
    await ctx.reply('❌ Bekor qilindi');
});

// ============ BOTNI ISHGA TUSHIRISH ============
async function startBot() {
    const sheetsReady = await initGoogleSheets();
    if (!sheetsReady) {
        console.log('⚠️ Google Sheets ulanishi muvaffaqiyatsiz, lekin bot davom etadi...');
    }
    
    bot.launch();
    console.log('🤖 Bot ishga tushdi...');
    console.log(`📝 Admin IDlar: ${ADMIN_IDS.join(', ')}`);
    console.log(`👁️ Kuzatuvchi ID: ${OBSERVER_ID}`);
    console.log(`💰 Diagnostika narxi: ${DIAGNOSIS_PRICE} so‘m`);
}

startBot();

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
