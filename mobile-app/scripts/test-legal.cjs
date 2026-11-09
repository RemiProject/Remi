const test = require('node:test'); const assert = require('node:assert/strict'); const { execFileSync } = require('node:child_process'); const path = require('node:path');
test('docs/privacy-policy.md and docs/terms.md match the text the app shows', () => {
  execFileSync(process.execPath, [path.join(__dirname, 'legal-docs.cjs'), '--check'], { stdio: 'pipe' });
});
test('the version shown in More matches app.json', () => {
  const fs = require('node:fs');
  const shown = fs.readFileSync(path.join(__dirname, '../src/data/app-version.ts'), 'utf8').match(/'([\d.]+)'/)[1];
  assert.equal(shown, require('../app.json').expo.version);
});
