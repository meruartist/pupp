const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());

function formatToReadableKoreanNumber(num) {
  const billion = Math.floor(num / 100000000);
  const million = Math.floor((num % 100000000) / 10000);
  const thousand = num % 10000;

  let result = "";
  if (billion > 0) result += `${billion}억`;
  if (million > 0) result += `${million}만`;
  if (thousand > 0 && billion === 0) result += `${thousand}`;
  return result;
}

// ✅ Puppeteer 실행 안정화
async function launchBrowser() {
  return await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
    ],
  });
}

/* ==========================
   던담 총딜/버프
========================== */
app.get("/api/dunam", async (req, res) => {
  const { server, characterId } = req.query;

  if (!server || !characterId) {
    return res.status(400).json({
      success: false,
      message: "Missing params",
    });
  }

  const url = `https://dundam.xyz/character?server=${server}&key=${characterId}`;
  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    await page.waitForSelector(
      '.tab__content[name="랭킹"], .tab__content[name="버프계산"]',
      { timeout: 10000 },
    );

    const data = await page.evaluate(() => {
      const buffEl = document.querySelector(
        '.tab__content[name="버프계산"] .buffpoint-box .dval',
      );
      const totalEl = document.querySelector(
        '.tab__content[name="랭킹"] .demval .dval',
      );

      const buffText = buffEl ? buffEl.textContent.trim() : null;
      const totalText = totalEl ? totalEl.textContent.trim() : null;

      if (buffText) return { value: buffText, isBuff: true };
      if (totalText) return { value: totalText, isBuff: false };

      return { value: null, isBuff: false };
    });

    if (!data.value) {
      return res.json({
        success: false,
        message: "No data found",
      });
    }

    const number = parseInt(data.value.replace(/[^0-9]/g, ""), 10);
    const readable = isNaN(number)
      ? null
      : formatToReadableKoreanNumber(number);

    return res.json({
      success: true,
      isBuff: data.isBuff,
      raw: data.value,
      number,
      readable,
    });
  } catch (err) {
    console.error("🔥 /api/dunam 오류:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal error",
    });
  } finally {
    if (browser) await browser.close();
  }
});

/* ==========================
   기린 득템 정보
========================== */
app.get("/api/dfgear", async (req, res) => {
  const { server, characterId, characterName } = req.query;
  if (!server || !characterId || !characterName) {
    return res
      .status(400)
      .json({ success: false, message: "Missing parameters" });
  }

  const url = `https://dfgear.xyz/character?sId=${server}&cName=${encodeURIComponent(characterName)}&cId=${characterId}`;
  let browser;

  try {
    browser = await launchBrowser(); // ✅ 기존 launchBrowser 그대로 사용
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("body", { timeout: 10000 });

    const data = await page.evaluate(() => {
      const lines = (document.body.innerText || "")
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);

      const getLineValue = (...labels) => {
        for (const label of labels) {
          const line = lines.find((v) => v.startsWith(label));
          if (line) {
            return line.replace(label, "").trim();
          }
        }
        return null;
      };

      const getNextLineAfter = (label) => {
        const idx = lines.findIndex((v) => v.includes(label));
        if (idx !== -1 && lines[idx + 1]) {
          return lines[idx + 1].trim();
        }
        return null;
      };

      const fame =
        document.querySelector(".fameNumber")?.textContent?.trim() ||
        getLineValue("명성 :", "명성:") ||
        "-";

      const epic = getLineValue("태초 서약 :", "태초 서약:") || "0";

      const legendary = getLineValue("태초 결정 :", "태초 결정:") || "0";

      const epicMix =
        getLineValue("에픽 서약/결정 :", "에픽 서약/결정:") || "0";

      const ancient =
        getLineValue("중천 태초 획득 :", "중천 태초 획득:") || "0";

      const updated = getNextLineAfter("최근 업데이트") || "-";

      return {
        fame,
        epic,
        legendary,
        epicMix,
        ancient,
        updated,
      };
    });

    return res.json({ success: true, ...data });
  } catch (err) {
    console.error("🔥 /api/dfgear 오류:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal error",
    });
  } finally {
    if (browser) await browser.close();
  }
});

/* ==========================
   태초 아이템 리스트
========================== */
app.get("/api/taecho", async (req, res) => {
  const { server, characterId, characterName } = req.query;

  if (!server || !characterId || !characterName) {
    return res.status(400).json({
      success: false,
      message: "Missing parameters",
    });
  }

  const url = `https://dfgear.xyz/character?sId=${server}&cName=${encodeURIComponent(characterName)}&cId=${characterId}`;
  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("#mistList ul li", { timeout: 15000 });

    const items = await page.evaluate(() => {
      const list = [];
      const lis = document.querySelectorAll("#mistList ul.list-group li");

      lis.forEach((li) => {
        const p = li.querySelector("p");
        const img = p?.querySelector("img")?.src;
        const name = p?.textContent?.trim();
        const date = p?.getAttribute("data-title") || li.getAttribute("title");

        if (img && name && date) {
          list.push({ img, name, date });
        }
      });

      return list;
    });

    return res.json({
      success: true,
      items,
    });
  } catch (err) {
    console.error("🔥 태초 리스트 추출 실패:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal error",
    });
  } finally {
    if (browser) await browser.close();
  }
});

/* ==========================
   모험단 통계 캡처
========================== */
app.get("/api/adventure-stat", async (req, res) => {
  const { advName } = req.query;

  if (!advName) {
    return res.status(400).json({
      success: false,
      message: "Missing advName",
    });
  }

  const url = `https://dfgear.xyz/advtDetail?name=${encodeURIComponent(advName)}`;
  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    console.log("[DEBUG] 접속 시도:", url);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    await page.addStyleTag({
      url: "https://fonts.googleapis.com/css2?family=Noto+Sans+KR&display=swap",
    });
    await page.addStyleTag({
      content: `* { font-family: 'Noto Sans KR', sans-serif !important; }`,
    });

    await page.waitForSelector("#detailTable", { timeout: 20000 });
    console.log("[DEBUG] #detailTable 로드됨");

    const target = await page.$("#detailTable");
    if (!target) {
      console.error("❌ 캡처 대상 #detailTable을 찾지 못했습니다.");
      return res.status(500).json({
        success: false,
        message: "#detailTable not found",
      });
    }

    const imageBuffer = await target.screenshot({ type: "png" });

    console.log("[DEBUG] 캡처 완료");

    res.setHeader("Content-Type", "image/png");
    res.send(imageBuffer);
  } catch (err) {
    console.error("🔥 모험단 통계 캡처 오류:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal error",
    });
  } finally {
    if (browser) await browser.close();
  }
});

app.get("/", (req, res) => {
  res.send("✅ Dunam Puppeteer API is running");
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
