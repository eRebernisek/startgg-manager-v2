const { chromium } = require('playwright-core');
const fs = require('fs');
const out = '/home/many/Documents/Programing/startgg-manager-v2/publishApp';
const icon = fs.readFileSync(out + '/icon/sgg-icon.svg', 'utf8');
const copy = {
  en: ['Organizer toolkit', 'Brackets, sets and seeding<br>for start.gg events, in your pocket.'],
  pt: ['Para organizadores', 'Chaves, sets e seeding<br>dos eventos do start.gg, no bolso.'],
};
const html = (lang, [kicker, tag]) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1024px;height:500px;overflow:hidden}
  body{font-family:'Noto Sans',sans-serif;color:#e8ebf2;position:relative;
    background:radial-gradient(ellipse 520px 420px at 78% 50%,rgba(255,70,85,.38),rgba(255,70,85,0) 72%),
               radial-gradient(ellipse 420px 300px at 0% 100%,rgba(63,169,245,.14),rgba(63,169,245,0) 70%),#0d0f14}
  .left{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:470px}
  .brand{display:flex;align-items:center;gap:24px}
  .brand svg{width:104px;height:104px;border-radius:24px;box-shadow:0 12px 40px rgba(255,70,85,.35)}
  .kicker{font-size:19px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#ff4655;margin:0 0 6px}
  h1{margin:0;font-size:58px;font-weight:800;line-height:1;letter-spacing:-1px}
  p{margin:30px 0 0;font-size:27px;line-height:1.38;color:#a3abbd;font-weight:500}
  .phone{position:absolute;left:640px;top:58px;width:300px;padding:9px;background:#1a1f29;border-radius:38px;
    box-shadow:0 0 0 2px #2c3342,0 30px 80px rgba(0,0,0,.7);transform:rotate(6deg)}
  .phone img{display:block;width:300px;border-radius:30px}
</style></head><body>
  <div class="left">
    <div class="brand">${icon.replace('<svg ', '<svg ')}<div><div class="kicker">${kicker}</div><h1>SGG Manager</h1></div></div>
    <p>${tag}</p>
  </div>
  <div class="phone"><img src="file:///tmp/shots/${lang}-2-editor.png"></div>
</body></html>`;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  for (const [lang, c] of Object.entries(copy)) {
    fs.writeFileSync('/tmp/shots/feature.html', html(lang, c));
    await page.goto('file:///tmp/shots/feature.html'); await page.waitForTimeout(300);
    await page.screenshot({ path: `/tmp/shots/feature-${lang}.png` });
  }
  await browser.close();
})();
