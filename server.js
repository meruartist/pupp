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
    if (!server || !characterId) return res.status(400).json({ success: false, message: 'Missing params' });

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
            const buffEl = document.querySelector('.tab__content[name="버프계산"] .buffpoint-box .dval');
            const buffText = buffEl ? buffEl.textContent.trim() : null;

            const totalEl = document.querySelector('.tab__content[name="랭킹"] .demval .dval');
            const totalText = totalEl ? totalEl.textContent.trim() : null;

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
        return res.status(500).json({ success: false, message: 'Internal error' });
    }
});

// ✅ 기린 득템 정보
app.get('/api/dfgear', async (req, res) => {
    const { server, characterId, characterName } = req.query;
    if (!server || !characterId || !characterName) {
        return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const url = `https://dfgear.xyz/character?sId=${server}&cName=${encodeURIComponent(characterName)}&cId=${characterId}`;
    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        await page.waitForSelector('.fameNumber', { timeout: 10000 });

        const data = await page.evaluate(() => {
            const getText = (selector) => {
                const el = document.querySelector(selector);
                return el ? el.textContent.trim() : null;
            };

            const getSpanText = (contains) => {
                const spans = [...document.querySelectorAll('span.card-text')];
                const el = spans.find(s => s.textContent.includes(contains));
                return el ? el.textContent.replace(`${contains} : `, '').trim() : null;
            };

            const fame = getText('.fameNumber');
            const kirinRank = getText('.rank:nth-of-type(1)')?.replace('기린 랭킹 : ', '');
            const obtainRank = getText('.rank:nth-of-type(2)')?.replace('획득 랭킹 : ', '');
            const ancient = getSpanText('태초 획득');
            const epic = getSpanText('에픽 획득');
            const legendary = getSpanText('레전더리 획득');
            const abyss = getSpanText('심연:숭배자');
            const potEpic = getText('.potCount .r_epic');
            const potLegend = getText('.potCount .r_legnd');

            let updated = '-';
            const spans = [...document.querySelectorAll('span.card-text.small')];
            for (let i = 0; i < spans.length; i++) {
                if (spans[i].textContent.includes('최근 업데이트')) {
                    updated = spans[i + 1]?.textContent.trim() ?? '-';
                    break;
                }
            }

            return {
                fame, kirinRank, obtainRank, ancient, epic, legendary,
                abyss, potEpic, potLegend, updated
            };
        });

        await browser.close();

        return res.json({ success: true, ...data });

    } catch (err) {
        return res.status(500).json({ success: false, message: 'Internal error' });
    }
});

// ✅ 태초 아이템 리스트
app.get('/api/taecho', async (req, res) => {
    const { server, characterId, characterName } = req.query;
    if (!server || !characterId || !characterName) {
        return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const url = `https://dfgear.xyz/character?sId=${server}&cName=${encodeURIComponent(characterName)}&cId=${characterId}`;

    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        await page.waitForSelector('#mistList ul li', { timeout: 10000 });

        const items = await page.evaluate(() => {
            const list = [];
            const mistCard = document.querySelector('#mistList');
            const ul = mistCard?.querySelector('ul.list-group');
            const lis = ul?.querySelectorAll('li') ?? [];

            lis.forEach(li => {
                const p = li.querySelector('p');
                const img = p?.querySelector('img')?.src;
                const name = p?.textContent?.trim();
                const date = p?.getAttribute('data-title') || li.getAttribute('title');

                if (img && name && date) {
                    list.push({ img, name, date });
                }
            });

            return list;
        });

        await browser.close();

        return res.json({ success: true, items });

    } catch (err) {
        console.error('🔥 태초 리스트 추출 실패:', err);
        return res.status(500).json({ success: false, message: 'Internal error' });
    }
});

// ✅ 모험단 통계 스크린샷 (신규 추가)
app.get('/api/adventure-stat', async (req, res) => {
    const { advName } = req.query;
    if (!advName) return res.status(400).json({ success: false, message: 'Missing advName' });

    const url = `https://dfgear.xyz/advtDetail?name=${encodeURIComponent(advName)}`;

    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1080 });
        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.waitForSelector('div.card-body', { timeout: 10000 });

        const target = await page.$('div.card-body');
        const imageBuffer = await target.screenshot({ type: 'png' });

        await browser.close();
        res.setHeader('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (err) {
        console.error('🔥 모험단 통계 스크린샷 오류:', err);
        return res.status(500).json({ success: false, message: 'Internal error' });
    }
});

app.get('/', (req, res) => {
    res.send('✅ Dunam Puppeteer API is running');
});

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});
