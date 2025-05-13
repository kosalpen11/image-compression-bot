// bot.js
require('dotenv').config();

const { Telegraf, Markup, session } = require('telegraf');
const axios = require('axios');
const sharp = require('sharp');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Session to track flow state, quality & count
bot.use(session({
  defaultSession: () => ({
    awaitingQuality: false,
    awaitingImage:   false,
    quality:         70,
    count:           0
  })
}));

// Helper: reset & show start menu
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

// 1. /start
bot.start(ctx => sendStartMenu(ctx));

// 2. “Compress Images” → ask for quality
bot.action('COMPRESS', async ctx => {
  await ctx.answerCbQuery();
  ctx.session.awaitingQuality = true;
  ctx.session.awaitingImage   = false;
  return ctx.reply('⚙️ Send desired JPEG quality (1–100):');
});

// 3. Quality input
bot.on('text', ctx => {
  if (!ctx.session.awaitingQuality) return;
  const val = parseInt(ctx.message.text.trim(), 10);
  if (isNaN(val) || val < 1 || val > 100) {
    return ctx.reply('❗ Invalid. Enter a number between 1 and 100.');
  }
  ctx.session.quality         = val;
  ctx.session.awaitingQuality = false;
  ctx.session.awaitingImage   = true;
  return ctx.reply(
    `👍 Quality set to ${val}%. Now send me any number of images (photo or file).`
  );
});

// 4. Photo OR image‐file handler
bot.on(['photo','document'], async ctx => {
  if (!ctx.session.awaitingImage) {
    return ctx.reply('❗ Tap “Compress Images” and set quality first.');
  }

  // Determine file_id & reject non-images when it’s a document
  let fileId;
  if (ctx.message.photo) {
    fileId = ctx.message.photo.pop().file_id;
  } else if (ctx.message.document 
             && ctx.message.document.mime_type.startsWith('image/')) {
    fileId = ctx.message.document.file_id;
  } else {
    return ctx.reply('❗ Please send a photo or an image file.');
  }

  try {
    // download
    const link = await ctx.telegram.getFileLink(fileId);
    const resp = await axios.get(link.href, { responseType: 'arraybuffer' });
    const original = Buffer.from(resp.data);
    const origSize = original.length;

    // compress
    const compressed = await sharp(original)
      .jpeg({ quality: ctx.session.quality })
      .toBuffer();
    const compSize    = compressed.length;
    const reduction   = Math.round((1 - compSize/origSize) * 100);

    // count
    ctx.session.count++;

    // caption
    const caption =
      `✅ Compressed (${ctx.session.quality}%):\n` +
      `• Original: ${(origSize/1024).toFixed(1)} KB\n` +
      `• Compressed: ${(compSize/1024).toFixed(1)} KB\n` +
      `• Reduction: ${reduction}%\n` +
      `Images processed: ${ctx.session.count}`;

    // reply & offer Done button
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

// 5. Done → summary + start over
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

// 6. Restart
bot.action('RESTART', async ctx => {
  await ctx.answerCbQuery();
  return sendStartMenu(ctx);
});

// 7. Fallback
bot.on('message', ctx => {
  if (!ctx.session.awaitingQuality && !ctx.session.awaitingImage) {
    return ctx.reply('⚙️ Use /start to begin.');
  }
});

bot.launch().then(() => console.log('Bot started'));
