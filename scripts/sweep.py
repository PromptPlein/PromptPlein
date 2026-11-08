"""Measures every route in a real browser: content collapsed to zero width,
horizontal overflow, visible h1 count, page errors and nldd dev warnings.

Usage: uv run --with playwright python scripts/sweep.py <base-url> <shot-dir> [chromium-path]
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

ROUTES = ["/", "/zoeken", "/genereren", "/technieken", "/chat", "/contact", "/community", "/trending",
          "/activiteit", "/instellingen", "/instellingen/chat", "/instellingen/toegankelijkheid",
          "/instellingen/toegankelijkheid/hulp", "/auth/login", "/auth/registreren", "/auth/wachtwoord-vergeten"]

JS = r"""() => {
  const out = {collapsed: [], overflow: document.documentElement.scrollWidth - innerWidth, h1: 0};
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
      const r = el.getBoundingClientRect();
      if (/^H1$/.test(el.tagName) && r.width > 0 && r.height > 0) out.h1++;
      const text = (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) ;
      if (text && r.height > 1 && r.width > 1 && r.width < 40 && el.textContent.trim().length > 12) {
        out.collapsed.push(el.tagName.toLowerCase() + ': ' + el.textContent.trim().slice(0, 40) + ' (' + Math.round(r.width) + 'px)');
      }
      if (r.right > innerWidth + 1 && r.width > 0 && r.height > 0 && getComputedStyle(el).position !== 'fixed' && out.collapsed.length < 40) {
        const host = root.host ? root.host.tagName.toLowerCase() + '>' : '';
        out.collapsed.push('OVER ' + host + el.tagName.toLowerCase() + ' right=' + Math.round(r.right));
      }
    }
  };
  walk(document);
  out.collapsed = [...new Set(out.collapsed)].slice(0, 12);
  return out;
}"""

async def main():
    base, shots = sys.argv[1], sys.argv[2]
    exe = sys.argv[3] if len(sys.argv) > 3 else None
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=exe) if exe else await p.chromium.launch()
        for w, h, tag in ((1280, 860, "d"), (390, 844, "m"), (320, 640, "s")):
            ctx = await b.new_context(viewport={"width": w, "height": h})
            pg = await ctx.new_page()
            log = []
            pg.on("pageerror", lambda e: log.append("ERROR " + str(e)[:160]))
            pg.on("console", lambda m: log.append(m.type.upper() + " " + m.text[:160]) if (m.type == "error" or "[nldd]" in m.text) else None)
            for r in ROUTES:
                log.clear()
                await pg.goto(base + r, wait_until="networkidle")
                await pg.wait_for_timeout(700)
                res = await pg.evaluate(JS)
                name = (r.strip("/").replace("/", "_") or "start") + "-" + tag
                await pg.screenshot(path=f"{shots}/{name}.png", full_page=True)
                bad = res["h1"] != 1 or res["overflow"] > 0 or res["collapsed"] or log
                print(("FOUT " if bad else "ok   ") + f"{w}{r} h1={res['h1']} overflow={res['overflow']}")
                for c in res["collapsed"]: print("       " + c)
                for l in sorted(set(log))[:6]: print("       " + l)
            await ctx.close()
        await b.close()

asyncio.run(main())
