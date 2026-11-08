"""Records what each route can DO (links, controls, handlers, ids), not how it looks.

Usage: uv run --with playwright python scripts/surface/capture.py <base-url> <out.json> [chromium-path]
"""
import asyncio, json, re, sys
from playwright.async_api import async_playwright

ROUTES = ["/", "/zoeken", "/genereren", "/technieken", "/chat", "/contact", "/community", "/trending",
          "/activiteit", "/instellingen", "/instellingen/chat", "/instellingen/toegankelijkheid",
          "/instellingen/toegankelijkheid/hulp", "/auth/login", "/auth/registreren",
          "/auth/wachtwoord-vergeten", "/auth/nieuw-wachtwoord"]

JS = r"""() => {
  const out = {links: new Set(), controls: new Set(), headings: new Set()};
  const norm = (h) => { try { const u = new URL(h, location.href); return u.origin === location.origin ? u.pathname + u.search : 'extern:' + u.host; } catch { return h; } };
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (!visible(el)) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'a' && el.getAttribute('href')) out.links.add(norm(el.getAttribute('href')));
      for (const a of el.getAttributeNames()) if (a.endsWith('href') && a !== 'href' && tag.startsWith('nldd-')) out.links.add(norm(el.getAttribute(a)));
      const role = el.getAttribute('role') || ({button:'button', input:'input:'+(el.type||'text'), select:'select', textarea:'textarea'})[tag];
      if (role && ['button','link','tab','switch','checkbox','radio','menuitem','combobox','slider','textbox','select','textarea'].concat(role.startsWith?.('input:')?[role]:[]).includes(role)) {
        const name = (el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g,' ').slice(0,60);
        if (name) out.controls.add(role.replace(/^input:.*/,'input') + ': ' + name);
      }
      if (/^H[1-3]$/.test(el.tagName)) out.headings.add(el.textContent.trim().replace(/\s+/g,' ').slice(0,80));
    }
  };
  walk(document);
  return {links:[...out.links].sort(), controls:[...out.controls].sort(), headings:[...out.headings].sort()};
}"""

async def main():
    base, out = sys.argv[1], sys.argv[2]
    exe = sys.argv[3] if len(sys.argv) > 3 else None
    res = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=exe) if exe else await p.chromium.launch()
        for w in (1280, 390):
            pg = await (await b.new_context(viewport={"width": w, "height": 900})).new_page()
            for r in ROUTES:
                await pg.goto(base + r, wait_until="networkidle")
                await pg.wait_for_timeout(600)
                res[f"{w}{r}"] = await pg.evaluate(JS)
        await b.close()
    json.dump(res, open(out, "w"), indent=1, ensure_ascii=False)

asyncio.run(main())
