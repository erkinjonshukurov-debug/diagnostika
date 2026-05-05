cat > bot.js << 'EOF'
const { Telegraf } = require('telegraf');
require('dotenv').config();

const token = process.env.BOT_TOKEN;

if (!token) {
    console.error('❌ .env faylda BOT_TOKEN topilmadi!');
    process.exit(1);
}

const bot = new Telegraf(token);
const SUPER_ADMIN_ID = 1437230485;

bot.start((ctx) => {
    if (ctx.from.id === SUPER_ADMIN_ID) {
        ctx.reply(`👑 Assalomu alaykum Super Admin ${ctx.from.first_name}!\n✅ Bot muvaffaqiyatli ishga tushdi!`);
    } else {
        ctx.reply(`👋 Salom ${ctx.from.first_name}!\n✅ Bot ishlayapti.`);
    }
    console.log('Start buyrug\'i:', ctx.from.id);
});

bot.launch()
    .then(() => {
        console.log('✅ Bot ishga tushdi!');
        console.log(`👑 Super Admin ID: ${SUPER_ADMIN_ID}`);
    })
    .catch(err => console.error('❌ Xato:', err.message));

process.once('SIGINT', () => bot.stop('SIGINT'));
EOF
