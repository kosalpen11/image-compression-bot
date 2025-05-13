// bot.js
require('dotenv').config();

const { Telegraf, Markup, session } = require('telegraf');
const axios = require('axios');
const sharp = require('sharp');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Session middleware to track flow state, quality & count
bot.use(session({
  defaultSession: () => ({
    awaitingQuality: false,
    awaitingImage:   false,
    quality:         70,
    count:           0
  })
}));

// Helper to reset state and show the start menu
function sendStartMenu(ctx) {
  ctx.session.awaitingQuality = false;
  ctx.session.awaitingImage   = false;
  ctx.session.quality          = 70;
  ctx.session.count            = 0;
  return ctx.reply(
    '👋 Welcome! What would you like to do?',
    Markup.inlineKeyboard([
      [ Markup.button.callback('📷 Compress Images', 'COMPRESS') ]
    ])
  );
}

// 1. /start → reset & show menu
bot.start(ctx => sendStartMenu(ctx));

// 2. User taps “Compress Images” → ask for quality
bot.action('COMPRESS', async ctx => {
  await ctx.answerCbQuery();
  ctx.session.awaitingQuality = true;
  ctx.session.awaitingImage   = false;
  return ctx.reply('⚙️ Send desired JPEG quality (1–100):');
});

// 3. Handle quality input
bot.on('text', ctx => {
  if (!ctx.session.awaitingQuality) return;
  const val = parseInt(ctx.message.text.trim(), 10);
  if (isNaN(val) || val < 1 || val > 100) {
    return ctx.reply('❗ Invalid quality. Enter a number between 1 and 100.');
  }
  ctx.session.quality          = val;
  ctx.session.awaitingQuality  = false;
  ctx.session.awaitingImage    = true;
  return ctx.reply(
    `👍 Quality set to ${val}%. Now send me any number of images (photo or file).`
  );
});

// 4. Handle photos & image files
bot.on(['photo', 'document'], async ctx => {
  if (!ctx.session.awaitingImage) {
    return ctx.reply('❗ Tap “Compress Images” and set quality first.');
  }

  // Determine file_id for photo or image-document
  let fileId;
  if (ctx.message.photo) {
    fileId = ctx.message.photo.pop().file_id;
  } else if (
    ctx.message.document &&
    ctx.message.document.mime_type.startsWith('image/')
  ) {
    fileId = ctx.message.document.file_id;
  } else {
    return ctx.reply('❗ Please send a photo or an image file.');
  }

  try {
    // Download the file
    const link = await ctx.telegram.getFileLink(fileId);
    const resp = await axios.get(link.href, { responseType: 'arraybuffer' });
    const original = Buffer.from(resp.data);
    const origSize = original.length;

    // Compress in-memory
    const compressed = await sharp(original)
      .jpeg({ quality: ctx.session.quality })
      .toBuffer();
    const compSize = compressed.length;
    const reduction = Math.round((1 - compSize / origSize) * 100);

    // Increment counter
    ctx.session.count++;

    // Caption with stats and session count
    const caption =
      `✅ Compressed (${ctx.session.quality}% quality)\n` +
      `• Original: ${(origSize/1024).toFixed(1)} KB\n` +
      `• Compressed: ${(compSize/1024).toFixed(1)} KB\n` +
      `• Reduction: ${reduction}%\n` +
      `Images processed: ${ctx.session.count}`;

    // Reply with the compressed image + Done button
    await ctx.replyWithPhoto(
      { source: compressed },
      {
        caption,
        ...Markup.inlineKeyboard([
          [ Markup.button.callback('✅ Done', 'COMPRESS_DONE') ]
        ])
      }
    );
  } catch (err) {
    console.error('Compression error:', err);
    return ctx.reply('❗ Oops—could not process your image.');
  }
});

// 5. Done button → summary + “Start Over”
bot.action('COMPRESS_DONE', async ctx => {
  await ctx.answerCbQuery();
  const total = ctx.session.count;
  ctx.session.awaitingImage = false;
  return ctx.reply(
    `🎉 Done! You processed ${total} image${total === 1 ? '' : 's'}.\n` +
    `Tap below to start again.`,
    Markup.inlineKeyboard([
      [ Markup.button.callback('🔄 Start Over', 'RESTART') ]
    ])
  );
});

// 6. Start over handler
bot.action('RESTART', async ctx => {
  await ctx.answerCbQuery();
  return sendStartMenu(ctx);
});

// 7. Fallback for other messages
bot.on('message', ctx => {
  if (!ctx.session.awaitingQuality && !ctx.session.awaitingImage) {
    return ctx.reply('⚙️ Use /start to begin.');
  }
});

module.exports.handler = async function(event, context) {
  // Handle Netlify Dev health-check GETs
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, body: 'OK' };
  }

  // Now it must be a Telegram POST
  try {
    const update = JSON.parse(event.body);
    await bot.handleUpdate(update, context);
    
    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Error handling update:', err);
    return { statusCode: 500, body: 'Error' };
  }
};