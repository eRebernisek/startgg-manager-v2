const { chromium } = require('playwright-core');
const fs = require('fs');
const out = '/home/many/Documents/Programing/startgg-manager-v2/publishApp';
const shots = {
  en: [
    ['1-bracket', 'Follow <em>any bracket</em>', 'start.gg events, winners and losers'],
    ['2-editor', 'Report sets <em>game by game</em>', 'Scores and characters for every game'],
    ['3-sets', 'Every set <em>at a glance</em>', 'Filter by state and refresh live'],
    ['4-seeding', 'Seed your <em>phases</em>', 'Reorder seeds when you are an admin'],
    ['5-entrants', 'Manage <em>attendees</em>', 'Search, add, rename and remove entrants'],
    ['6-home', 'View brackets <em>without an account</em>', 'Paste a link, no token needed'],
  ],
  pt: [
    ['1-bracket', 'Acompanhe <em>qualquer chave</em>', 'Eventos do start.gg, winners e losers'],
    ['2-editor', 'Reporte sets <em>jogo a jogo</em>', 'Placar e personagens de cada jogo'],
    ['3-sets', 'Todos os sets <em>num só lugar</em>', 'Filtre por estado e atualize ao vivo'],
    ['4-seeding', 'Monte o <em>seeding</em>', 'Reordene as seeds quando for admin'],
    ['5-entrants', 'Gerencie os <em>inscritos</em>', 'Busque, adicione, renomeie e remova'],
    ['6-home', 'Veja chaves <em>sem conta</em>', 'Cole um link, sem token'],
  ],
};
const html = (img, title, sub) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1080px;height:1920px;overflow:hidden}
  body{font-family:'Noto Sans',sans-serif;color:#e8ebf2;
    background:radial-gradient(ellipse 900px 620px at 50% 0%,rgba(255,70,85,.30),rgba(255,70,85,0) 70%),
               radial-gradient(ellipse 700px 500px at 100% 100%,rgba(63,169,245,.12),rgba(63,169,245,0) 70%),#0d0f14}
  .cap{position:absolute;top:110px;left:80px;right:80px;text-align:center}
  h1{margin:0;font-size:76px;line-height:1.12;font-weight:800;letter-spacing:-.5px}
  h1 em{font-style:normal;color:#ff4655}
  p{margin:26px 0 0;font-size:40px;line-height:1.3;color:#a3abbd;font-weight:500}
  .phone{position:absolute;left:50%;top:500px;transform:translateX(-50%);width:788px;padding:18px;
    background:#1a1f29;border-radius:78px;box-shadow:0 0 0 3px #2c3342,0 40px 120px rgba(0,0,0,.6)}
  .phone img{display:block;width:788px;border-radius:60px}
</style></head><body>
  <div class="cap"><h1>${title}</h1><p>${sub}</p></div>
  <div class="phone"><img src="file://${img}"></div>
</body></html>`;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  for (const [lang, list] of Object.entries(shots)) {
    fs.mkdirSync(`${out}/screenshots/${lang}`, { recursive: true });
    for (const [name, title, sub] of list) {
      fs.writeFileSync('/tmp/shots/frame.html', html(`/tmp/shots/${lang}-${name}.png`, title, sub));
      await page.goto('file:///tmp/shots/frame.html'); await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/screenshots/${lang}/${name}.png` });
    }
  }
  await browser.close();
})();
