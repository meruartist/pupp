app.get('/api/dunam', async (req, res) => {
    const { server, characterId } = req.query;
    console.log('📥 API 요청 받음:', { server, characterId });

    if (!server || !characterId) {
        console.error('❌ Missing query params');
        return res.status(400).json({ success: false, message: 'Missing params' });
    }

    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        const url = `https://dundam.xyz/character?server=${server}&key=${characterId}`;
        await page.goto(url, { waitUntil: 'networkidle2' });

        console.log('✅ 페이지 접속 성공:', url);

        let text = null;
        let isBuff = false;

        try {
            text = await page.$eval(
                '#content-container .abbot-alldeal .abbot-topdamage .value',
                el => el.textContent.trim()
            );
        } catch (err) {
            console.warn('⚠️ 딜량 선택자 실패:', err.message);
            try {
                text = await page.$eval(
                    '#content-container .abbot-alldeal .abbot-topbuff .value',
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
