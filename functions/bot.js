// functions/bot.js
require('dotenv').config();
const { Telegraf } = require('telegraf');
const attachHandlers = require('../src/handlers');

const bot = new Telegraf(process.env.BOT_TOKEN);
attachHandlers(bot);
bot.launch().then(() => console.log('⚡️ Polling bot started'));

module.exports.handler = async function(event, context) {
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, body: 'OK' };
  }
  try {
    const update = JSON.parse(event.body);
    await bot.handleUpdate(update, context);
    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Error handling update:', err);
    return { statusCode: 500, body: 'Error' };
  }
};
