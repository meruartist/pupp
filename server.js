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

        // 요소가 로딩될 때까지 대기
        await page.waitForSelector('.abbot-alldeal', { timeout: 5000 });
        console.log('✅ 페이지 접속 성공:', url);

        let text = null;
        let isBuff = false;

        try {
            // 딜러용
            text = await page.$eval(
                '.abbot-topdamage .value',
                el => el.textContent.trim()
            );
        } catch (err) {
            console.warn('⚠️ 딜 선택자 실패:', err.message);
            try {
                // 버퍼용
                text = await page.$eval(
                    '.abbot-topbuff .value',
                    el => el.textContent.trim()
                );
                isBuff = true;
            } catch (e2) {
                console.error('❌ 버프 선택자도 실패:', e2.message);
                text = null;
            }
        }

        await browser.close();

        if (!text) {
            console.log('❌ text 없음');
            return res.json({ success: false, message: 'No data found' });
        }

        const number = parseInt(text.replace(/[^0-9]/g, ''));
        const readable = isNaN(number) ? null : formatToReadableKoreanNumber(number);

        return res.json({
            success: true,
            isBuff,
            raw: text,
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
