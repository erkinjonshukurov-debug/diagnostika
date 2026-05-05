require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

// ============ KONFIGURATSIYA ============
const BOT_TOKEN = process.env.BOT_TOKEN;

const SUPER_ADMIN_ID = 1437230485;
const ADMIN2_ID = 987654321;
const OBSERVER_PHONE = '+998915425700';
let registeredObserverId = null;

const ADMIN_IDS = [SUPER_ADMIN_ID, ADMIN2_ID];
const DIAGNOSIS_PRICE = 250000;

// AVTOMOBIL TURLARI
const CAR_TYPES = [
    'CNG', 'D-MAX RG', 'D-MAX RT', 'NPR75', 'HD50',
    'HC45', 'CYZ EXR', 'NQR90', 'NMR77', 'NMR85'
];

// ============ AVTOMOBIL RAQAMINI TEKSHIRISH (BIR NECHTA FORMATLAR) ============
function isValidPlate(plate) {
    const patterns = [
        /^[0-9]{2}[A-Z][0-9]{3}[A-Z]{2}$/i,  // 01A777AA
        /^[0-9]{2}[A-Z][0-9]{6}$/i,          // 01A111111
        /^[0-9]{5}[A-Z]{3}$/i,               // 01111AAA
        /^[A-Z][0-9]{3}[A-Z]{2}$/i,          // A777AA
        /^[0-9]{3}[A-Z]{3}$/i,               // 123ABC
        /^[0-9]{2}[A-Z]{2}[0-9]{3}$/i,       // 01AA777
        /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/i,       // AA777AA
        /^[0-9]{2}[A-Z]{3}[0-9]{2}$/i,       // 01ABC77
        /^[A-Z][0-9]{2}[A-Z][0-9]{2}[A-Z]$/i // A12B34C
    ];
    
    return patterns.some(pattern => pattern.test(plate));
}

function getCarTypeKeyboard() {
    const buttons = CAR_TYPES.map(type => [Markup.button.callback(type, `car_type_${type}`)]);
    buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_add')]);
    return Markup.inlineKeyboard(buttons);
}

// ============ MA'LUMOTLAR BAZASI ============
const DB_FILE = path.join(__dirname, 'cars.json');
const OBSERVER_FILE = path.join(__dirname, 'observer.json');
const PAID_CARS_FILE = path.join(__dirname, 'paid_cars.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(OBSERVER_FILE)) fs.writeFileSync(OBSERVER_FILE, JSON.stringify({ userId: null }, null, 2));
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
    const diagnosedCars = cars.filter(car => car.diagnostika.includes('o‘tkazildi'));
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
    const remainingSum = totalSum - paidSum;
    const paidCars = getPaidCarsList();
    const paidCarsCount = paidCars.length;
    return { total: cars.length, diagnosed, notDiagnosed, totalSum, paidSum, remainingSum, paidCarsCount };
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
            ['✅ Tasdiqlanganlar', '💵 To\'lovni tasdiqlash'],
            ['💾 Backup olish', '🔄 Backup tiklash']
        ]).resize();
    } else if (isAdmin(ctx)) {
        return Markup.keyboard([
            ['🚗 Avtomobil qo\'shish', '⬅️ Oxirgi avtomobilni o\'chirish']
        ]).resize();
    } else if (isObserver(ctx)) {
        return Markup.keyboard([
            ['💰 Jami summa', '📋 So\'nggi yozuvlar', '✅ Tasdiqlanganlar']
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
        message += `${num}. *${car.raqam}* | ${car.turi} | ${car.amount.toLocaleString()} so‘m\n`;
        message += `   📅 ${sana} | 👤 ${car.admin_name}\n\n`;
    });
    
    message += `📊 *Jami tasdiqlangan:* ${paidCars.length} ta\n`;
    message += `💰 *Jami summa:* ${getPaidSum().toLocaleString()} so‘m\n`;
    message += `📄 *Sahifa:* ${page + 1}/${totalPages}`;
    
    const navButtons = [];
    if (page > 0) {
        navButtons.push(Markup.button.callback('◀️ Oldingi', `paid_page_${page - 1}`));
    }
    if (end < paidCars.length) {
        navButtons.push(Markup.button.callback('Keyingi ▶️', `paid_page_${page + 1}`));
    }
    navButtons.push(Markup.button.callback('❌ Yopish', 'close_paid'));
    
    await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([navButtons])
    });
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

// ============ TO'LOVNI TASDIQLASH (KO'P TANLASH) ============
let selectedCars = new Map();

async function showUnpaidCars(ctx, page = 0) {
    const unpaidCars = getUnpaidCars();
    if (unpaidCars.length === 0) {
        await ctx.reply('✅ Barcha avtomobillar uchun to‘lov qilingan!');
        return;
    }
    
    const itemsPerPage = 5;
    const totalPages = Math.ceil(unpaidCars.length / itemsPerPage);
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageCars = unpaidCars.slice(start, end);
    
    if (!selectedCars.has(ctx.from.id)) {
        selectedCars.set(ctx.from.id, { selected: new Set(), messageId: null });
    }
    const userSelection = selectedCars.get(ctx.from.id);
    
    let message = '💰 *TO‘LOV QILINMAGAN AVTOMOBILLAR*\n\n';
    
    pageCars.forEach((car, idx) => {
        const isSelected = userSelection.selected.has(car.raqam);
        const checkbox = isSelected ? '☑️' : '⬜';
        message += `${checkbox} ${start + idx + 1}. *${car.raqam}* | ${car.turi} | ${car.narxi.toLocaleString()} so‘m\n`;
    });
    
    message += `\n📊 *Jami to‘lov qilinmagan:* ${unpaidCars.reduce((s, c) => s + c.narxi, 0).toLocaleString()} so‘m`;
    message += `\n✅ *Tanlanganlar:* ${userSelection.selected.size} ta`;
    message += `\n📄 *Sahifa:* ${page + 1}/${totalPages}`;
    
    const selectButtons = [];
    pageCars.forEach((car) => {
        const isSelected = userSelection.selected.has(car.raqam);
        selectButtons.push([
            Markup.button.callback(
                `${isSelected ? '❌' : '✅'} ${car.raqam}`,
                `toggle_car_${car.raqam}_${car.turi}_${car.narxi}`
            )
        ]);
    });
    
    const navButtons = [];
    if (page > 0) {
        navButtons.push(Markup.button.callback('◀️ Oldingi', `unpaid_page_${page - 1}`));
    }
    if (end < unpaidCars.length) {
        navButtons.push(Markup.button.callback('Keyingi ▶️', `unpaid_page_${page + 1}`));
    }
    
    const actionButtons = [];
    if (userSelection.selected.size > 0) {
        actionButtons.push([Markup.button.callback(`✅ Tasdiqlash (${userSelection.selected.size} ta)`, 'confirm_payment')]);
    }
    actionButtons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_payment')]);
    
    const allButtons = [...selectButtons];
    if (navButtons.length > 0) allButtons.push(navButtons);
    allButtons.push(...actionButtons);
    
    const sentMessage = await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(allButtons)
    });
    
    userSelection.messageId = sentMessage.message_id;
    userSelection.currentPage = page;
    selectedCars.set(ctx.from.id, userSelection);
}

bot.action(/unpaid_page_(\d+)/, async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    const page = parseInt(ctx.match[1]);
    await showUnpaidCars(ctx, page);
    await ctx.answerCbQuery();
});

bot.action(/toggle_car_(.+)_(.+)_(.+)/, async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    
    const carNumber = ctx.match[1];
    const userSelection = selectedCars.get(ctx.from.id);
    if (!userSelection) return;
    
    if (userSelection.selected.has(carNumber)) {
        userSelection.selected.delete(carNumber);
    } else {
        userSelection.selected.add(carNumber);
    }
    
    selectedCars.set(ctx.from.id, userSelection);
    
    const unpaidCars = getUnpaidCars();
    const itemsPerPage = 5;
    const page = userSelection.currentPage || 0;
    const start = page * itemsPerPage;
    const pageCars = unpaidCars.slice(start, start + itemsPerPage);
    const totalPages = Math.ceil(unpaidCars.length / itemsPerPage);
    
    let message = '💰 *TO‘LOV QILINMAGAN AVTOMOBILLAR*\n\n';
    
    pageCars.forEach((car, idx) => {
        const isSelected = userSelection.selected.has(car.raqam);
        const checkbox = isSelected ? '☑️' : '⬜';
        message += `${checkbox} ${start + idx + 1}. *${car.raqam}* | ${car.turi} | ${car.narxi.toLocaleString()} so‘m\n`;
    });
    
    message += `\n📊 *Jami to‘lov qilinmagan:* ${unpaidCars.reduce((s, c) => s + c.narxi, 0).toLocaleString()} so‘m`;
    message += `\n✅ *Tanlanganlar:* ${userSelection.selected.size} ta`;
    message += `\n📄 *Sahifa:* ${page + 1}/${totalPages}`;
    
    await ctx.editMessageText(message, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery();
});

bot.action('confirm_payment', async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    
    const userSelection = selectedCars.get(ctx.from.id);
    if (!userSelection || userSelection.selected.size === 0) {
        await ctx.answerCbQuery('Hech qanday avtomobil tanlanmagan!');
        return;
    }
    
    const unpaidCars = getUnpaidCars();
    const carsToPay = unpaidCars.filter(car => userSelection.selected.has(car.raqam));
    const totalAmount = carsToPay.reduce((sum, car) => sum + car.narxi, 0);
    
    addMultiplePaidCars(carsToPay, ctx.from.first_name);
    
    const totalDiagnosed = getTotalDiagnosedSum();
    const newPaidSum = getPaidSum();
    const remainingSum = totalDiagnosed - newPaidSum;
    
    let carsList = '';
    carsToPay.forEach((car, idx) => {
        carsList += `${idx + 1}. ${car.raqam} | ${car.turi} | ${car.narxi.toLocaleString()} so‘m\n`;
    });
    
    if (registeredObserverId) {
        await bot.telegram.sendMessage(registeredObserverId,
            `✅ *TO‘LOV TASDIQLANDI!*\n\n` +
            `🚗 *To‘lov qilingan avtomobillar:*\n${carsList}\n` +
            `💰 *Jami summa:* ${totalAmount.toLocaleString()} so‘m\n` +
            `👤 *Admin:* ${ctx.from.first_name}\n\n` +
            `📊 *Jami diagnostika summasi:* ${totalDiagnosed.toLocaleString()} so‘m\n` +
            `💵 *To‘lov qilingan umumiy summa:* ${newPaidSum.toLocaleString()} so‘m\n` +
            `📉 *Qolgan qoldiq:* ${remainingSum.toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    await ctx.editMessageText(
        `✅ *TO‘LOV TASDIQLANDI!*\n\n` +
        `🚗 *To‘lov qilingan avtomobillar:* ${carsToPay.length} ta\n` +
        `💰 *Jami summa:* ${totalAmount.toLocaleString()} so‘m\n` +
        `👤 *Admin:* ${ctx.from.first_name}\n\n` +
        `📊 *Jami diagnostika summasi:* ${totalDiagnosed.toLocaleString()} so‘m\n` +
        `💵 *To‘lov qilingan umumiy summa:* ${newPaidSum.toLocaleString()} so‘m\n` +
        `📉 *Qolgan qoldiq:* ${remainingSum.toLocaleString()} so‘m`,
        { parse_mode: 'Markdown' }
    );
    
    selectedCars.delete(ctx.from.id);
    await ctx.answerCbQuery();
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
});

bot.action('cancel_payment', async (ctx) => {
    selectedCars.delete(ctx.from.id);
    await ctx.editMessageText('❌ Bekor qilindi');
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    await ctx.answerCbQuery();
});

// ============ XABAR BOSHQARISH ============
const addSteps = new Map();
const deleteSteps = new Map();

bot.on('text', async (ctx) => {
    if (!isAllowed(ctx)) return;
    
    const text = ctx.message.text;
    const step = addSteps.get(ctx.from.id);
    const deleteStep = deleteSteps.get(ctx.from.id);
    
    if (step?.step === 'number') {
        if (!isAdmin(ctx)) return;
        
        // YANGI VALIDATSIYA - bir nechta formatlarni qabul qiladi
        if (!isValidPlate(text)) {
            return ctx.reply(
                `❌ *Noto‘g‘ri format!*\n\n` +
                `Qabul qilinadigan formatlar:\n` +
                `• 01A777AA (2 raqam, 1 harf, 3 raqam, 2 harf)\n` +
                `• 01A111111 (2 raqam, 1 harf, 6 raqam)\n` +
                `• 01111AAA (5 raqam, 3 harf)\n` +
                `• A777AA (1 harf, 3 raqam, 2 harf)\n` +
                `• 123ABC (3 raqam, 3 harf)\n` +
                `• 01AA777 (2 raqam, 2 harf, 3 raqam)\n` +
                `• AA777AA (2 harf, 3 raqam, 2 harf)\n\n` +
                `Qaytadan urinib ko'ring!`,
                { parse_mode: 'Markdown' }
            );
        }
        
        step.carNumber = text.toUpperCase();
        step.step = 'waiting_for_type';
        addSteps.set(ctx.from.id, step);
        
        return ctx.reply(
            `✅ Raqam: ${step.carNumber}\n\n*Avtomobil turini tanlang:*`,
            { parse_mode: 'Markdown', ...getCarTypeKeyboard() }
        );
    }
    
    if (deleteStep?.step === 'delete_car' && isSuperAdmin(ctx)) {
        const deleted = deleteCar(text);
        await ctx.reply(deleted ? `✅ Avtomobil o‘chirildi: ${text.toUpperCase()}` : `❌ ${text} topilmadi.`);
        deleteSteps.delete(ctx.from.id);
        return ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    }
    
    // ============ MENYU TUGMALARI ============
    
    if (text === '🚗 Avtomobil qo\'shish' && isAdmin(ctx)) {
        addSteps.set(ctx.from.id, { step: 'number' });
        return ctx.reply(
            `📝 *1-qadam:* Avtomobil raqamini kiriting\n\n` +
            `Qabul qilinadigan formatlar:\n` +
            `• 01A777AA (standart)\n` +
            `• 01A111111\n` +
            `• 01111AAA\n` +
            `• A777AA\n` +
            `• 123ABC\n` +
            `• 01AA777\n` +
            `• AA777AA`,
            { parse_mode: 'Markdown' }
        );
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
            `💵 *Tasdiqlangan avtomobillar:* ${s.paidCarsCount} ta\n\n` +
            `💰 *Jami diagnostika summasi:* ${s.totalSum.toLocaleString()} so‘m\n` +
            `💵 *To‘lov qilingan summa:* ${s.paidSum.toLocaleString()} so‘m\n` +
            `📉 *Qolgan qoldiq:* ${s.remainingSum.toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    if (text === '💰 Jami summa') {
        const total = getTotalDiagnosedSum();
        const paidSum = getPaidSum();
        const remaining = total - paidSum;
        return ctx.reply(
            `💰 *SUMMA HISOBOTI*\n\n` +
            `📊 *Jami diagnostika summasi:* ${total.toLocaleString()} so‘m\n` +
            `💵 *To‘lov qilingan:* ${paidSum.toLocaleString()} so‘m\n` +
            `📉 *Qoldiq:* ${remaining.toLocaleString()} so‘m`,
            { parse_mode: 'Markdown' }
        );
    }
    
    if (text === '✅ Tasdiqlanganlar') {
        await showPaidCars(ctx);
        return;
    }
    
    if (text === '💵 To\'lovni tasdiqlash' && isSuperAdmin(ctx)) {
        await showUnpaidCars(ctx);
        return;
    }
    
    if (text === '💾 Backup olish' && isSuperAdmin(ctx)) {
        const backupData = { 
            cars: getAllCars(), 
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

// ============ AVTOMOBIL TURINI TANLASH ============
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

bot.action('cancel_add', async (ctx) => {
    addSteps.delete(ctx.from.id);
    await ctx.editMessageText('❌ Bekor qilindi');
    await ctx.reply('📋 Asosiy menyu:', getMainMenu(ctx));
    await ctx.answerCbQuery();
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
    const paidSum = getPaidSum();
    const remaining = total - paidSum;
    
    if (registeredObserverId) {
        await bot.telegram.sendMessage(registeredObserverId,
            `🔔 *Yangi diagnostika!*\n\n` +
            `🚗 *Raqam:* ${carNumber}\n` +
            `🏷️ *Turi:* ${carType}\n` +
            `💰 *Summa:* ${DIAGNOSIS_PRICE.toLocaleString()} so‘m\n` +
            `👤 *Admin:* ${ctx.from.first_name}\n\n` +
            `📊 *JAMI SUM:* ${total.toLocaleString()} so‘m\n` +
            `💵 *TO‘LOV QILINGAN:* ${paidSum.toLocaleString()} so‘m\n` +
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
console.log(`📞 Kuzatuvchi telefoni: ${OBSERVER_PHONE}`);
console.log(`🚗 Avtomobil turlari: ${CAR_TYPES.join(', ')}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
