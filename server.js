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


async function launchBrowser() {
    return await puppeteer.launch({
        headless: 'new',
        executablePath: puppeteer.executablePath(),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process',
            '--no-zygote'
        ]
    });
}

/* ==========================
   던담 총딜/버프 (networkidle2 유지)
========================== */
app.get('/api/dunam', async (req, res) => {
    const { server, characterId } = req.query;
    if (!server || !characterId) return res.status(400).json({ success: false, message: 'Missing params' });

    const url = `https://dundam.xyz/character?server=${server}&key=${characterId}`;
    let browser;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(30000);
        // 🔹 딜/버프력 로딩 보장
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

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

        if (!data.value) return res.json({ success: false, message: 'No data found' });

        const number = parseInt(data.value.replace(/[^0-9]/g, ''));
        const readable = isNaN(number) ? null : formatToReadableKoreanNumber(number);

        return res.json({ success: true, isBuff: data.isBuff, raw: data.value, number, readable });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Internal error' });
    } finally {
        if (browser) await browser.close();
    }
});

/* ==========================
   기린 득템 정보
========================== */
app.get('/api/dfgear', async (req, res) => {
    const { server, characterId, characterName } = req.query;
    if (!server || !characterId || !characterName) {
        return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const url = `https://dfgear.xyz/character?sId=${server}&cName=${encodeURIComponent(characterName)}&cId=${characterId}`;
    let browser;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(30000);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

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
            const ancient = getSpanText('중천 태초 획득');
            const tc = getSpanText('태초 서약');
            const tca = getSpanText('태초 결정');
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

            return { fame, kirinRank, obtainRank, ancient, tc, tca, abyss, potEpic, potLegend, updated };
        });

        return res.json({ success: true, ...data });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Internal error' });
    } finally {
        if (browser) await browser.close();
    }
});

/* ==========================
   태초 아이템 리스트
========================== */
app.get('/api/taecho', async (req, res) => {
    const { server, characterId, characterName } = req.query;
    if (!server || !characterId || !characterName) {
        return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const url = `https://dfgear.xyz/character?sId=${server}&cName=${encodeURIComponent(characterName)}&cId=${characterId}`;
    let browser;

    try {
        browser = await launchBrowser();
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(30000);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        await page.waitForSelector('#mistList', { timeout: 15000 });

        const items = await page.evaluate(() => {
        const list = [];

        // 🔥 태초 서약결정 리스트만 정확히 선택
        const lis = document.evaluate(
            '//*[@id="mistList"]/ul[2]/li',
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null
        );

        for (let i = 0; i < lis.snapshotLength; i++) {
            const li = lis.snapshotItem(i);

            const p = li.querySelector('p');
            const img = p?.querySelector('img')?.getAttribute('src') || null;
            const name = p?.textContent?.trim() || null;
            const date =
                p?.getAttribute('data-title') ||
                li.getAttribute('title') ||
                null;

            if (img && name && date) {
                list.push({ img, name, date });
            }
        }

        return list;
    });

            const root = document.querySelector('#mistList');
            if (!root) return [];

            const uls = root.querySelectorAll(':scope > ul.list-group');

            const oathItems = parseUl(uls[0]);    // 태초 서약 리스트
            const pledgeItems = parseUl(uls[1]);  // 태초 서약결정 리스트

            return [...oathItems, ...pledgeItems];
        });

        console.log('[TAECHO] result count =', items.length);
        console.log('[TAECHO] sample =', items.slice(0, 3));

        return res.json({ success: true, items });
    } catch (err) {
        console.error('🔥 태초 리스트 추출 실패:', err);
        return res.status(500).json({ success: false, message: err.message || 'Internal error' });
    } finally {
        if (browser) await browser.close();
    }
});

/* ==========================
   모험단 통계 캡처
========================== */
app.get('/api/adventure-stat', async (req, res) => {
    const { advName } = req.query;
    if (!advName) return res.status(400).json({ success: false, message: 'Missing advName' });

    const url = `https://dfgear.xyz/advtDetail?name=${encodeURIComponent(advName)}`;
    let browser;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(30000);

        console.log('[DEBUG] 접속 시도:', url);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        await page.addStyleTag({ url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR&display=swap' });
        await page.addStyleTag({ content: `* { font-family: 'Noto Sans KR', sans-serif !important; }` });

        await page.waitForSelector('#detailTable', { timeout: 20000 });
        console.log('[DEBUG] #detailTable 로드됨');

        const target = await page.$('#detailTable');
        if (!target) {
            console.error('❌ 캡처 대상 #detailTable을 찾지 못했습니다.');
            return res.status(500).json({ success: false, message: '#detailTable not found' });
        }

        const imageBuffer = await target.screenshot({ type: 'png' });
        console.log('[DEBUG] 캡처 완료');

        res.setHeader('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (err) {
        console.error('🔥 모험단 통계 캡처 오류:', err);
        return res.status(500).json({ success: false, message: err.message || 'Internal error' });
    } finally {
        if (browser) await browser.close();
    }
});

app.get('/', (req, res) => res.send('✅ Dunam Puppeteer API is running'));

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});
    