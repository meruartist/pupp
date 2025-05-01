const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

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

// ✅ 던담 총딜/버프
app.get('/api/dunam', async (req, res) => {
    const { server, characterId } = req.query;
    if (!server || !characterId) {
        return res.status(400).json({ success: false, message: 'Missing params' });
    }

    const url = `https://dundam.xyz/character?server=${server}&key=${characterId}`;
    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        await page.waitForSelector('.tab__content[name="랭킹"], .tab__content[name="버프계산"]', { timeout: 10000 });

        const data = await page.evaluate(() => {
            const getText = (selector) => {
                const el = document.querySelector(selector);
                return el ? el.textContent.trim() : null;
            };

            const buffText = getText('.tab__content[name="버프계산"] .buffpoint-box .dval');

            // 총딜: demval이 없으면 skc에서 대체
            let totalText = getText('.tab__content[name="랭킹"] .demval .dval');
            if (!totalText) {
                const valList = [...document.querySelectorAll('.tab__content[name="랭킹"] .skc ul li span.val')];
                totalText = valList.length > 0 ? valList[0].textContent.trim() : null;
            }

            if (buffText) return { value: buffText, isBuff: true };
            if (totalText) return { value: totalText, isBuff: false };
            return { value: null, isBuff: false };
        });

        await browser.close();

        if (!data.value) return res.json({ success: false, message: 'No data found' });

        const number = parseInt(data.value.replace(/[^0-9]/g, ''));
        const readable = isNaN(number) ? null : formatToReadableKoreanNumber(number);

        return res.json({
            success: true,
            isBuff: data.isBuff,
            raw: data.value,
            number,
            readable
        });

    } catch (err) {
        console.error('❌ puppeteer 오류:', err.message);
        return res.status(500).json({ success: false, message: 'Internal error' });
    }
});
