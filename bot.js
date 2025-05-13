require('dotenv').config();
const { Telegraf } = require('telegraf');
const attachHandlers = require('./src/handlers');

const bot = new Telegraf(process.env.BOT_TOKEN);
attachHandlers(bot);

bot.launch().then(() => console.log('⚡️ Polling bot started'));