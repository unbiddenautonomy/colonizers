const { chromium } = require('playwright');
const VIEWPORTS = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
  small: { width: 360, height: 640, isMobile: true, hasTouch: true },
  land: { width: 844, height: 390, isMobile: true, hasTouch: true },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 720 },
};
const BASE = process.env.BASE || 'http://localhost:5173';

async function open(browser, vp, opts = {}) {
  const v = VIEWPORTS[vp];
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    isMobile: !!v.isMobile,
    hasTouch: !!v.hasTouch,
    ...(opts.context || {}),
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text().slice(0, 400)}`);
  });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!u.includes('fonts.g')) logs.push(`requestfailed: ${u} ${r.failure()?.errorText}`);
  });
  page.on('dialog', (d) => {
    logs.push(`dialog(${d.type()}): ${d.message()}`);
    d.accept().catch(() => {});
  });
  page.logs = logs;
  return { ctx, page, logs };
}

/** Layout problems: sideways scroll, things off-screen, clipped text, small touch targets. */
async function layoutReport(page, { touch = true } = {}) {
  return page.evaluate((touch) => {
    const out = { hScroll: 0, offscreen: [], clipped: [], small: [], overlaps: [] };
    const de = document.documentElement;
    out.hScroll = de.scrollWidth - de.clientWidth;
    const vw = de.clientWidth;
    const label = (el) => {
      const t = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.value || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''}"${t}"`;
    };
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
      // Hidden by a closed ancestor?
      let p = el;
      while (p) {
        if (p.hidden) return false;
        p = p.parentElement;
      }
      return true;
    };
    for (const el of document.querySelectorAll('button, a, select, input, textarea, [role="button"], label.toggle')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) out.offscreen.push(`${label(el)} x=${Math.round(r.left)}..${Math.round(r.right)} (vw ${vw})`);
      if (touch && (r.width < 32 || r.height < 32) && el.type !== 'checkbox' && el.type !== 'radio')
        out.small.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    for (const el of document.querySelectorAll('button, h1, h2, h3, h4, p, span, strong, dd, dt, label, li, small, option')) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el);
      if ((s.overflow === 'hidden' || s.overflowX === 'hidden' || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0 && !el.classList.contains('sr-only'))
        out.clipped.push(`${label(el)} ${el.scrollWidth}>${el.clientWidth}`);
    }
    return out;
  }, touch);
}

function fmtLayout(r) {
  const lines = [];
  if (r.hScroll > 0) lines.push(`  sideways scroll: ${r.hScroll}px`);
  if (r.offscreen.length) lines.push(`  off-screen (${r.offscreen.length}): ${r.offscreen.slice(0, 6).join(' | ')}`);
  if (r.clipped.length) lines.push(`  clipped text (${r.clipped.length}): ${r.clipped.slice(0, 6).join(' | ')}`);
  if (r.small.length) lines.push(`  small targets (${r.small.length}): ${r.small.slice(0, 10).join(' | ')}`);
  return lines.join('\n');
}

module.exports = { chromium, VIEWPORTS, BASE, open, layoutReport, fmtLayout };
