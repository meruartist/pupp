// server.js (Heroku 쪽)
const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

function formatToReadableKoreanNumber(num) {
    const billion = Math.floor(num / 100000000);
    const million = Math.floor((num % 100000000) / 10000);
    const thousand = num % 10000;

    let result = '';
    if (billion > 0) result += `${billion}억`;
    if (million > 0) result += `${million}만`;
    if (thousand > 0 && billion === 0) result += `${thousand}`;

    return result;
}

app.get('/api/dunam', async (req, res) => {
    const { server, characterId } = req.query;
    if (!server || !characterId) return res.status(400).json({ error: 'Missing params' });

    const url = `https://dundam.xyz/character?server=${server}&key=${characterId}`;

    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        let text = null;
        let isBuff = false;

        try {
            text = await page.$eval(
                '#content-container > div.new-cinfo > div.c-aba-stat > div > div.abas-bottom > div.abbot-alldeal > div > div > div:nth-child(8) > div > div',
                el => el.textContent.trim()
            );
        } catch (err) {
            try {
                text = await page.$eval(
                    '#content-container > div.new-cinfo > div.c-aba-stat > div > div.abas-bottom > div.abbot-alldeal > div > div > div > div > div',
                    el => el.textContent.trim()
                );
                isBuff = true;
            } catch (e2) {
                text = null;
            }
        }

        await browser.close();

        if (!text) return res.json({ success: false, message: 'No data found' });

        const cleaned = text.replace(/,/g, '').replace(/[^0-9]/g, '');
        const value = parseInt(cleaned);
        res.json({
            success: true,
            isBuff,
            raw: text,
            number: isNaN(value) ? null : value,
            readable: isNaN(value) ? null : formatToReadableKoreanNumber(value)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Internal error' });
    }
});

app.listen(PORT, () => {
    console.log(`Puppeteer API running on port ${PORT}`);
});
