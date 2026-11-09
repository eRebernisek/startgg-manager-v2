const { chromium } = require('playwright-core');
const base = 'http://localhost:4300/#';
const ev = '/tournament/haunted-house-2-ssbu-rivals-2-arena-geek/event/fantasminhas-of-aether-singles';
const langs = { en: { locale: 'en-US', timezoneId: 'America/New_York' }, pt: { locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' } };
async function toTabs(page) {
  await page.evaluate(() => {
    const nav = document.querySelector('nav.tabs');
    const hdr = [...document.querySelectorAll('header, .topbar, app-header')].find(e => getComputedStyle(e).position === 'sticky' || getComputedStyle(e).position === 'fixed');
    const h = hdr ? hdr.getBoundingClientRect().height : 0;
    scrollTo(0, nav.getBoundingClientRect().top + scrollY - h - 4);
  });
  await page.waitForTimeout(600);
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  for (const [lang, opts] of Object.entries(langs)) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ...opts });
    const page = await ctx.newPage();
    const go = async (url) => { await page.goto(base + url, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500); };
    await go(ev + '/bracket'); await toTabs(page); await page.screenshot({ path: `${lang}-1-bracket.png` });
    await go(ev + '/sets'); await toTabs(page); await page.screenshot({ path: `${lang}-3-sets.png` });
    await page.locator('app-set-box').first().click(); await page.waitForTimeout(2500);
    await page.screenshot({ path: `${lang}-2-editor.png` });
    await go(ev + '/seeding'); await toTabs(page); await page.screenshot({ path: `${lang}-4-seeding.png` });
    await go(ev + '/entrants'); await toTabs(page); await page.screenshot({ path: `${lang}-5-entrants.png` });
    await go('/'); await page.screenshot({ path: `${lang}-6-home.png` });
    await ctx.close();
    console.log(lang, 'done');
  }
  await browser.close();
})();
