const { chromium } = require('playwright-core');
const base = 'http://localhost:4300/#';
const ev = '/tournament/haunted-house-2-ssbu-rivals-2-arena-geek/event/fantasminhas-of-aether-singles';
const langs = { en: { locale: 'en-US', timezoneId: 'America/New_York', noAcc: 'No start.gg account' }, pt: { locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  for (const [lang, { noAcc, ...opts }] of Object.entries(langs)) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ...opts });
    const page = await ctx.newPage();
    await page.goto(base + ev + '/entrants', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
    const hidden = await page.evaluate(() => {
      let n = 0;
      // Rows without a start.gg account show a translated "no account" label; anything else is a legal name.
      const labels = new Set(['No start.gg account']);
      document.querySelectorAll('span.real').forEach((s) => {
        const t = s.textContent.trim();
        if (t && !labels.has(t) && !/conta/i.test(t)) { s.remove(); n++; }
      });
      const nav = document.querySelector('nav.tabs');
      const hdr = [...document.querySelectorAll('header, .topbar, app-header')].find(e => ['sticky','fixed'].includes(getComputedStyle(e).position));
      scrollTo(0, nav.getBoundingClientRect().top + scrollY - (hdr ? hdr.getBoundingClientRect().height : 0) - 4);
      return n;
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${lang}-5-entrants.png` });
    console.log(lang, 'hidden', hidden);
    await ctx.close();
  }
  await browser.close();
})();
