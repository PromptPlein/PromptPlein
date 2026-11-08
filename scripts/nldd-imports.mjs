// Keeps one side-effect import per nldd component in every file that uses it,
// so each component lands in the chunk of the page that needs it instead of
// all of them in the first download. A tag the file renders, or names in a
// string ('nldd-notification'), needs its module imported in that same file.
//
// Usage: node scripts/nldd-imports.mjs          rewrite the imports
//        node scripts/nldd-imports.mjs --check  exit 1 when an import is missing or stale
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, normalize, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const pkgDir = join(root, 'node_modules/@nldd/design-system');
const check = process.argv.includes('--check');

const manifest = JSON.parse(readFileSync(join(pkgDir, 'custom-elements.json'), 'utf8'));
const exportsMap = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).exports;

// dist file -> subpath export ('./button')
const distToKey = new Map();
for (const [key, value] of Object.entries(exportsMap)) {
  const target = typeof value === 'string' ? value : value.default ?? value.import;
  if (typeof target === 'string' && target.endsWith('.js')) distToKey.set(normalize(target), key);
}

// tag -> subpath export. A part without an export of its own (nldd-menu-item)
// is registered by the export in its folder (./menu).
const tagToKey = new Map();
for (const mod of manifest.modules) {
  for (const dec of mod.declarations ?? []) {
    if (!dec.tagName?.startsWith('nldd-')) continue;
    const dist = normalize('./dist/' + mod.path.replace(/^src\//, '').replace(/\.ts$/, '.js'));
    let key = distToKey.get(dist);
    if (!key) {
      const folder = dist.slice(0, dist.lastIndexOf('/'));
      key = [...distToKey].find(([d]) => d.startsWith(folder + '/') && d.slice(folder.length + 1).split('/').length === 1)?.[1];
    }
    if (!key) throw new Error(`No export registers <${dec.tagName}> (${dist})`);
    tagToKey.set(dec.tagName, key);
  }
}

const PREFIX = '@nldd/design-system/';
const importLine = (key) => `import '${PREFIX}${key.slice(2)}';`;
const importRe = /^import '@nldd\/design-system\/(?!styles|translations|custom-elements)([a-z0-9-]+)';\n/gm;

function files(p) {
  if (statSync(p).isFile()) return /\.(tsx?|jsx?)$/.test(p) && !p.endsWith('.d.ts') ? [p] : [];
  return readdirSync(p).flatMap((f) => files(join(p, f)));
}

let problems = 0;
let changed = 0;
for (const file of files(join(root, 'src'))) {
  const src = readFileSync(file, 'utf8');
  const body = src.replace(importRe, '');
  const used = new Set();
  for (const m of body.matchAll(/nldd-[a-z0-9-]+/g)) {
    const key = tagToKey.get(m[0]);
    if (key) used.add(key);
  }
  const have = new Set([...src.matchAll(importRe)].map((m) => './' + m[1]));
  const missing = [...used].filter((k) => !have.has(k));
  const stale = [...have].filter((k) => !used.has(k));
  if (!missing.length && !stale.length) continue;
  if (check) {
    problems += missing.length + stale.length;
    const rel = relative(root, file);
    for (const k of missing) console.log(`${rel}: import ontbreekt voor ${k}`);
    for (const k of stale) console.log(`${rel}: import ${k} wordt niet gebruikt`);
    continue;
  }
  const lines = [...used].sort().map(importLine).join('\n');
  // After the last top-level import, or at the top when there is none.
  const imports = [...body.matchAll(/^import [\s\S]*?;\n/gm)];
  const at = imports.length ? imports.at(-1).index + imports.at(-1)[0].length : 0;
  const out = lines ? body.slice(0, at) + lines + '\n' + body.slice(at) : body;
  writeFileSync(file, out);
  changed++;
}
if (check) {
  console.log(problems ? `${problems} importproblemen` : 'nldd-imports: in orde');
  process.exit(problems ? 1 : 0);
}
console.log(`nldd-imports: ${changed} bestanden bijgewerkt`);
