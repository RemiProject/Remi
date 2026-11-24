// Writes docs/privacy-policy.md and docs/terms.md from src/data/legal.ts (English, then Arabic). `--check` fails when they are stale.
const fs = require('node:fs'); const path = require('node:path'); const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/data/legal.ts'), 'utf8');
const m = { exports: {} }; new Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
const { legal } = m.exports;
const render = doc => ['en', 'ar'].map(lang => { const t = legal[doc][lang];
  return [`${lang === 'en' ? '#' : '##'} ${t.title}`, '', `_${t.updated}_`, '', ...t.sections.flatMap(s => [`${lang === 'en' ? '##' : '###'} ${s.heading}`, '', ...s.body.flatMap(p => [p, ''])])].join('\n');
}).join('\n---\n\n<div dir="rtl">\n\n').replace(/$/, '\n</div>\n');
const files = { privacy: '../../docs/privacy-policy.md', terms: '../../docs/terms.md' };
let stale = false;
for (const [doc, file] of Object.entries(files)) {
  const target = path.join(__dirname, file), text = `<!-- Generated from mobile-app/src/data/legal.ts by mobile-app/scripts/legal-docs.cjs. Edit that file, then run the script. -->\n\n${render(doc)}`;
  if (process.argv.includes('--check')) { if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text) { console.error(`${file} is stale: run node scripts/legal-docs.cjs`); stale = true; } }
  else fs.writeFileSync(target, text);
}
process.exitCode = stale ? 1 : 0;
