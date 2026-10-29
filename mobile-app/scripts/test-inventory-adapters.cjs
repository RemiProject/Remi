const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

const { BackendUnit, BackendStorageLocation } = require('../src/domain/backend-inventory.ts');
const { unitOptions, storageOptions } = require('../src/domain/inventory.ts');
const { toBackendUnit, toMobileUnit, toBackendStorage, toMobileStorage } = require('../src/domain/inventory-enum-adapters.ts');
const { parseDecimal, formatDecimal, compareDecimals, calculateInventoryDelta } = require('../src/domain/inventory-decimal.ts');

for (const [mobile, backend] of [['g', 'GRAM'], ['kg', 'KILOGRAM'], ['ml', 'MILLILITER'], ['l', 'LITER'], ['pieces', 'PIECE'], ['cups', 'CUP']]) {
  test(`unit round trip: ${mobile} <-> ${backend}`, () => {
    assert.deepEqual(toBackendUnit(mobile), { supported: true, value: backend });
    assert.deepEqual(toMobileUnit(backend), { supported: true, value: mobile });
  });
}

test('packs, tablespoons and teaspoons are explicitly unsupported without substitutions', () => {
  assert.deepEqual(toBackendUnit('packs'), { supported: false, input: 'packs', reason: 'UNSUPPORTED_UNIT' });
  for (const input of ['TABLESPOON', 'TEASPOON']) {
    assert.deepEqual(toMobileUnit(input), { supported: false, input, reason: 'UNSUPPORTED_UNIT' });
  }
  assert.equal(unitOptions.length, 7);
  assert.equal(Object.keys(BackendUnit).length, 8);
});

for (const [mobile, backend] of [['refrigerator', 'FRIDGE'], ['freezer', 'FREEZER'], ['pantry', 'PANTRY']]) {
  test(`storage round trip: ${mobile} <-> ${backend}`, () => {
    assert.deepEqual(toBackendStorage(mobile), { supported: true, value: backend });
    assert.deepEqual(toMobileStorage(backend), { supported: true, value: mobile });
  });
}

test('counter and other storage are explicitly unsupported on mobile', () => {
  for (const input of ['COUNTER', 'OTHER']) {
    assert.deepEqual(toMobileStorage(input), { supported: false, input, reason: 'UNSUPPORTED_STORAGE' });
  }
  assert.equal(storageOptions.length, 3);
  assert.equal(Object.keys(BackendStorageLocation).length, 5);
});

test('unknown enum values never silently map to valid units/storage', () => {
  for (const adapter of [toBackendUnit, toMobileUnit, toBackendStorage, toMobileStorage]) {
    assert.equal(adapter('unknown').supported, false);
  }
});

test('decimal parsing and formatting preserve exact thousandths and zero balances', () => {
  for (const [input, scaled, output] of [
    ['0', 0n, '0.000'], ['0.000', 0n, '0.000'], ['0.001', 1n, '0.001'],
    ['1', 1000n, '1.000'], ['1.2', 1200n, '1.200'], ['1.23', 1230n, '1.230'],
    ['0001.234', 1234n, '1.234'], ['999999999.999', 999999999999n, '999999999.999'],
  ]) {
    assert.equal(parseDecimal(input), scaled);
    assert.equal(formatDecimal(scaled), output);
    assert.equal(parseDecimal(output), scaled);
  }
});

test('invalid decimals reject precision loss, non-strings, scientific notation and range overflow', () => {
  for (const input of ['', ' ', ' 1', '1 ', '1\n', '1\r\n', 'NaN', 'Infinity', '-Infinity', '1e3', '0x10', '.5', '1.', '+1',
    '1.0000', '0.0001', '1.2345', '1.2.3', '1000000000', '1000000000.000', NaN, Infinity, 0, 1.25, null, undefined, {}, []]) {
    assert.throws(() => parseDecimal(input), undefined, String(input));
  }
  for (const input of [NaN, Infinity, 1, '1000', null, undefined, 1000000000000n]) {
    assert.throws(() => formatDecimal(input));
  }
});

test('negative values require explicit signed mode and format correctly below one', () => {
  for (const input of ['-1', '-0.001', '-0', '-0.000']) assert.throws(() => parseDecimal(input));
  assert.throws(() => formatDecimal(-1n));
  const signed = { allowNegative: true };
  assert.equal(parseDecimal('-0.001', signed), -1n);
  assert.equal(formatDecimal(-1n, signed), '-0.001');
  assert.equal(formatDecimal(-1234n, signed), '-1.234');
  assert.equal(formatDecimal(parseDecimal('-0.000', signed), signed), '0.000');
  assert.equal(formatDecimal(parseDecimal('-999999999.999', signed), signed), '-999999999.999');
  assert.throws(() => parseDecimal('-1.0000', signed));
  assert.throws(() => parseDecimal('-1000000000', signed));
  assert.throws(() => formatDecimal(-1000000000000n, signed));
});

test('comparison is exact, including equivalent decimal representations and signed opt-in', () => {
  assert.equal(compareDecimals('0', '0.000'), 0);
  assert.equal(compareDecimals('0.1', '0.100'), 0);
  assert.equal(compareDecimals('0.299', '0.300'), -1);
  assert.equal(compareDecimals('999999999.999', '999999999.998'), 1);
  assert.equal(compareDecimals('-0.001', '0', { allowNegative: true }), -1);
  assert.throws(() => compareDecimals('-0.001', '0'));
  assert.throws(() => compareDecimals('0', 'NaN'));
});

test('desired minus current produces exact positive, negative and zero deltas', () => {
  for (const [desired, current, expected] of [
    ['0.3', '0.1', '0.200'], ['0.1', '0.3', '-0.200'], ['1.50', '1.500', '0.000'],
    ['0', '0', '0.000'], ['0', '0.001', '-0.001'], ['0.001', '0', '0.001'],
    ['999999999.999', '0', '999999999.999'], ['0', '999999999.999', '-999999999.999'],
  ]) assert.equal(calculateInventoryDelta(desired, current), expected);
  for (const [desired, current] of [['-1', '0'], ['0', '-1'], ['1.0001', '0'], ['0', 'NaN'], [NaN, '1']]) {
    assert.throws(() => calculateInventoryDelta(desired, current));
  }
});
