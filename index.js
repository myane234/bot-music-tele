const { Telegraf, Markup } = require('telegraf');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const bot = new Telegraf('7848366747:AAHJVQp6K04D98jEb4NUi7p7uMbohfSNnMg'); // ganti sama token asli lu
const userSearchCache = {}; // simpan hasil pencarian per user

// Cari lagu pakai yt-dlp search
function searchYouTube(query) {
    return new Promise((resolve, reject) => {
        exec(`yt-dlp "ytsearch100:${query}" --flat-playlist -j`, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
            if (err) return reject(stderr);
            const results = stdout
                .trim()
                .split('\n')
                .map(line => JSON.parse(line))
                .filter(item => item.id && item.title);
            resolve(results.slice(0, 100));
        });
    });
}

// Tombol lagu 1–10
function getSongButtons(results, page) {
    const start = (page - 1) * 10;
    const end = start + 10;
    const slice = results.slice(start, end);
    const rows = slice.map((item, i) =>
        [Markup.button.callback(`${i + 1 + start}. ${item.title.substring(0, 30)}...`, `song_${i + start}`)]
    );
    return rows;
}

// Tombol navigasi halaman
function getNavButtons(page, totalPages) {
    const prev = page > 1 ? Markup.button.callback('⬅️', `nav_${page - 1}`) : Markup.button.callback(' ', 'noop');
    const next = page < totalPages ? Markup.button.callback('➡️', `nav_${page + 1}`) : Markup.button.callback(' ', 'noop');
    return [prev, Markup.button.callback(`Page ${page}/${totalPages}`, 'noop'), next];
}

// Gabungkan semua tombol
function getKeyboard(results, page) {
    const totalPages = Math.ceil(results.length / 10);
    const songButtons = getSongButtons(results, page);
    const navButtons = getNavButtons(page, totalPages);
    return Markup.inlineKeyboard([...songButtons, navButtons]);
}

// User kirim keyword pencarian
bot.on('text', async (ctx) => {
    const query = ctx.message.text.trim();
    const userId = ctx.from.id;
    ctx.reply('🔍 Mencari lagu...');

    try {
        const results = await searchYouTube(query);
        if (!results.length) return ctx.reply('Ga nemu bro 😔');

        userSearchCache[userId] = { results, page: 1 };

        await ctx.reply('🎵 Pilih lagu:', getKeyboard(results, 1));
    } catch (err) {
        ctx.reply('❌ Error pas nyari:\n' + err);
    }
});

// Navigasi halaman
bot.action(/^nav_(\d+)$/, async (ctx) => {
    const userId = ctx.from.id;
    const page = parseInt(ctx.match[1]);

    if (!userSearchCache[userId]) return ctx.answerCbQuery('Gak ada hasil pencarian');

    userSearchCache[userId].page = page;

    const results = userSearchCache[userId].results;
    const keyboard = getKeyboard(results, page);

    await ctx.editMessageReplyMarkup(keyboard.reply_markup);
    ctx.answerCbQuery(); // biar tombol ga loading
});

// Pilih lagu
bot.action(/^song_(\d+)$/, async (ctx) => {
    const userId = ctx.from.id;
    const index = parseInt(ctx.match[1]);

    if (!userSearchCache[userId]) return ctx.answerCbQuery('Hasil pencarian hilang, cari lagi ya');

    const video = userSearchCache[userId].results[index];
    const url = `https://www.youtube.com/watch?v=${video.id}`;
    const filePath = path.join(__dirname, 'temp', `${video.id}.mp3`);

    ctx.reply(`🎧 Mendownload: ${video.title}`);

    const cmd = `yt-dlp -x --audio-format mp3 -o "${filePath}" "${url}"`;

    exec(cmd, async (err) => {
        if (err) {
            ctx.reply('❌ Gagal download bro');
        } else {
            try {
                await ctx.replyWithAudio({ source: filePath }, { title: video.title });
                fs.unlinkSync(filePath);
            } catch (e) {
                ctx.reply('❌ Gagal kirim file');
            }
        }
    });

    ctx.answerCbQuery(); // stop loading animasi tombol
});

// Tombol dummy/noop (buat Page info)
bot.action('noop', (ctx) => {
    ctx.answerCbQuery();
});

bot.launch();
console.log('✅ Bot siap bro');
