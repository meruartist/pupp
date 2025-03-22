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

        // 두 영역 중 하나라도 로드되면 계속 진행
        await page.waitForSelector('.tab__content[name="랭킹"], .tab__content[name="버프계산"]', { timeout: 10000 });

        console.log('✅ 페이지 접속 성공:', url);

        const data = await page.evaluate(() => {
            // 총딜 (랭킹 탭 기준)
            const totalEl = document.querySelector('.tab__content[name="랭킹"] .demval .dval');
            const total = totalEl ? totalEl.textContent.trim() : null;

            // 버프 점수 (버프계산 탭 기준)
            const buffEl = document.querySelector('.tab__content[name="버프계산"] .buffpoint-box .dval');
            const buff = buffEl ? buffEl.textContent.trim() : null;

            if (total) {
                return { value: total, isBuff: false };
            } else if (buff) {
                return { value: buff, isBuff: true };
            } else {
                return { value: null, isBuff: false };
            }
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
