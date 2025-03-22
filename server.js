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

app.get('/api/dunam', async (req, res) => {
    const { server, characterId } = req.query;
    console.log('📥 API 요청:', { server, characterId });

    if (!server || !characterId) {
        console.error('❌ 파라미터 누락');
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
        await page.waitForSelector('.demval', { timeout: 5000 });

        console.log('✅ 페이지 접속 성공:', url);

        const data = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('.demval'));
            let value = null;
            let isBuff = false;

            for (const el of all) {
                const titleEl = el.querySelector('.dvtit');
                const valueEl = el.querySelector('.dval');

                if (!titleEl || !valueEl) continue;

                const title = titleEl.textContent.trim();
                const val = valueEl.textContent.trim();

                if (title === '총딜') {
                    value = val;
                    isBuff = false;
                    break;
                }

                if (title.includes('버프')) {
                    value = val;
                    isBuff = true;
                    break;
                }
            }

            return { value, isBuff };
        });

        await browser.close();

        console.log('🎯 추출된 값:', data);

        if (!data.value) {
            console.log('❌ 총딜/버프값 없음');
            return res.json({ success: false, message: 'No data found' });
        }

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
        console.error('🔥 서버 내부 오류:', err);
        return res.status(500).json({ success: false, message: 'Internal error' });
    }
});

app.get('/', (req, res) => {
    res.send('✅ Dunam Puppeteer API is running');
});

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});
