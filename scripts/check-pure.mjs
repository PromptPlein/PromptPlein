// Fails when the app styles or builds anything itself instead of using
// @nldd/design-system: class names, inline styles, raw HTML elements that have
// a component, hex colors, icon sets or toast libraries of its own.
// Usage: node scripts/check-pure.mjs [--summary] [paths...]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const summary = args.includes('--summary');
const targets = args.filter((a) => !a.startsWith('--'));

// Raw elements that are allowed: they have no component, or a component wants them.
// form: the user-provided form inside nldd-form. canvas: three.js and charts draw
// there. Inline text elements: nldd-text and nldd-rich-text style them.
const ALLOWED_TAGS = new Set(['form', 'canvas', 'strong', 'em', 'b', 'i', 'code', 'br', 'mark', 'q', 'sup', 'sub', 'kbd', 'abbr', 'time', 'template', 'option', 'select']);

const RULES = [
  ['class', /\b(className|class)=/g],
  ['style', /\bstyle=\{/g],
  ['raw-element', /<([a-z][a-z0-9]*)(?=[\s>/])/g],
  ['hex-color', /['"`]#[0-9a-fA-F]{3,8}\b/g],
  ['icon-set', /from ['"](lucide-react|@\/components\/common\/icons)['"]/g],
  ['toast', /from ['"]react-hot-toast['"]/g],
  ['clsx', /from ['"]clsx['"]/g],
];

function files(p) {
  const st = statSync(p);
  if (st.isFile()) return /\.(tsx?|jsx?)$/.test(p) && !p.endsWith('.d.ts') ? [p] : [];
  return readdirSync(p).flatMap((f) => files(join(p, f)));
}

// Drop comments so a doc comment that mentions <div> or #fff is not reported.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const all = (targets.length ? targets : ['src']).flatMap((t) => files(join(root, t)));
const perFile = new Map();
const perRule = new Map();
for (const f of all) {
  const src = stripComments(readFileSync(f, 'utf8'));
  const lines = src.split('\n');
  for (const [name, re] of RULES) {
    for (const m of src.matchAll(re)) {
      if (name === 'raw-element') {
        const tag = m[1];
        if (ALLOWED_TAGS.has(tag)) continue;
        // Generic type arguments such as useRef<div> are not markup.
        const before = src.slice(Math.max(0, m.index - 1), m.index);
        if (/[A-Za-z0-9_]/.test(before)) continue;
        if (!/^(div|span|p|a|button|input|textarea|label|h[1-6]|ul|ol|li|dl|dt|dd|table|thead|tbody|tr|td|th|img|svg|path|nav|header|footer|main|section|article|aside|fieldset|legend|details|summary|hr|pre|blockquote|figure|figcaption|dialog|iframe|video|audio|small|circle|rect|line|g|polygon|polyline)$/.test(tag)) continue;
      }
      const line = src.slice(0, m.index).split('\n').length;
      const key = relative(root, f);
      if (!perFile.has(key)) perFile.set(key, []);
      perFile.get(key).push(`${line}: ${name}${name === 'raw-element' ? ' <' + m[1] + '>' : ''}  ${lines[line - 1].trim().slice(0, 100)}`);
      perRule.set(name, (perRule.get(name) ?? 0) + 1);
    }
  }
}

let total = 0;
for (const [f, hits] of [...perFile].sort()) {
  total += hits.length;
  if (summary) console.log(`${String(hits.length).padStart(5)}  ${f}`);
  else for (const h of hits) console.log(`${f}:${h}`);
}
console.log(`\n${total} bevindingen in ${perFile.size} bestanden: ` + [...perRule].map(([r, n]) => `${r} ${n}`).join(', '));
process.exit(total ? 1 : 0);
