// Receipt structure: header, items, totals and payment are told apart, and only item lines become food.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { parseReceipt, readItemLine, rowsFromLines, cleanItemName, receiptAmount, findDate, parseMoney } = require('../src/domain/receipt-parser.ts');

const today = new Date('2026-11-08T12:00:00');
let passed = 0;
const test = (name, fn) => { fn(); passed++; };
const names = parse => parse.items.map(item => item.name);

test('money formats', () => {
  assert.equal(parseMoney('1,234.50'), 1234.5);
  assert.equal(parseMoney('12,50'), 12.5);
  assert.equal(parseMoney('2.00-'), -2);
  assert.equal(parseMoney('-3.25'), -3.25);
  assert.equal(parseMoney('3.500'), 3.5);
});

test('English supermarket receipt with weighed produce and a multi-row quantity', () => {
  const parse = parseReceipt([
    'CARREFOUR MAADI',
    'City Centre Maadi, Ring Road',
    'Tel: 19061',
    'VAT Reg No 100-200-300',
    '07/11/2026 18:42 Cashier: 12',
    'TOMATOES LOOSE',
    '1.235 kg @ 12.50/kg 15.44',
    'BANANA 0.850 kg x 30.00 25.50',
    'JUHAYNA FULL CREAM MILK 1L 2 x 38.00 76.00',
    'CHKN BRST BNLS 1KG 210.00',
    'BALADI BREAD 5 PCS 10.00',
    'EGGS WHITE 30PCS 165.00',
    'Discount -10.00',
    'PERSIL DETERGENT 2.5KG 320.00',
    'CARRIER BAG 1.00',
    'SUBTOTAL 812.94',
    'VAT 14% 0.00',
    'TOTAL EGP 812.94',
    'VISA ************1234 812.94',
    'CHANGE 0.00',
    'Items sold: 8',
    'Thank you for shopping with us',
  ], today);
  assert.equal(parse.store, 'CARREFOUR MAADI');
  assert.equal(parse.date, '2026-11-07');
  assert.deepEqual(names(parse), ['tomatoes', 'banana', 'juhayna full cream milk', 'chicken breast boneless', 'baladi bread', 'eggs white']);
  const [tomato, banana, milk, chicken, bread, eggs] = parse.items;
  assert.deepEqual([tomato.size, tomato.weighed, tomato.total], [{ amount: 1.235, unit: 'KILOGRAM' }, true, 15.44]);
  assert.deepEqual([banana.size, banana.total], [{ amount: 0.85, unit: 'KILOGRAM' }, 25.5]);
  assert.deepEqual([milk.count, milk.size, milk.unitPrice, milk.total], [2, { amount: 1, unit: 'LITER' }, 38, 76]);
  assert.deepEqual(chicken.size, { amount: 1, unit: 'KILOGRAM' });
  assert.deepEqual(bread.size, { amount: 5, unit: 'PIECE' });
  assert.equal(eggs.discount, 10);
  const reasons = Object.fromEntries(parse.ignored.map(line => [line.text, line.reason]));
  assert.equal(reasons['PERSIL DETERGENT 2.5KG 320.00'], 'non-food');
  assert.equal(reasons['CARRIER BAG 1.00'], 'fee');
  assert.equal(reasons['TOTAL EGP 812.94'], 'total');
  assert.equal(reasons['VISA ************1234 812.94'], 'payment');
  assert.equal(reasons['Tel: 19061'], 'header');
  assert.equal(parse.subtotal, 812.94);
  assert.equal(parse.check.status, 'match');
  assert.deepEqual(receiptAmount(milk, { defaultUnit: 'MILLILITER' }), { amount: 2, unit: 'LITER' });
  assert.deepEqual(receiptAmount(eggs, { defaultUnit: 'PIECE' }), { amount: 30, unit: 'PIECE' });
});

test('Arabic receipt read left to right, with Arabic digits', () => {
  const parse = parseReceipt([
    'هايبر بنده',
    'الرياض - طريق الملك فهد',
    'الرقم الضريبي ٣٠٠١٢٣٤٥٦٧',
    'التاريخ ٢٠٢٦/١١/٠٥',
    '١٢٫٥٠ طماطم ١ كجم',
    '٨٫٧٥ حليب طازج ١ لتر',
    '٢٤٫٠٠ أرز بسمتي ٢ كجم',
    '٥٫٠٠ مناديل',
    'الإجمالي ٥٠٫٢٥',
    'ضريبة القيمة المضافة ١٥٪ ٦٫٥٥',
    'مدى ٥٠٫٢٥',
    'شكراً لزيارتكم',
  ], today);
  assert.equal(parse.store, 'هايبر بنده');
  assert.equal(parse.date, '2026-11-05');
  assert.deepEqual(names(parse), ['طماطم', 'حليب', 'أرز بسمتي']);
  assert.deepEqual(parse.items[0].size, { amount: 1, unit: 'KILOGRAM' });
  assert.equal(parse.items[0].total, 12.5);
  assert.deepEqual(parse.items[2].size, { amount: 2, unit: 'KILOGRAM' });
  assert.equal(parse.ignored.find(line => line.text.includes('مناديل')).reason, 'non-food');
  assert.equal(parse.total, 50.25);
  assert.equal(parse.check.status, 'match');
});

test('US receipt with tax flags, item codes and a name whose price is on the next row', () => {
  const parse = parseReceipt([
    'Walmart',
    'Save money. Live better.',
    '( 555 ) 123 - 4567',
    'ST# 1234 OP# 00001 TE# 01 TR# 0001',
    'PRODUCE',
    'BANANAS 000000004011 F 1.24 N',
    'AVOCADO HASS 3CT 007874231234 3.98 N',
    'GV WHL MLK GAL 007874235186 3.48 N',
    'DAIRY',
    'GREAT VALUE SHREDDED',
    'MOZZ 8OZ 2.47 N',
    'COCA COLA 12PK 6.98 X',
    'BOUNTY PAPER TOWEL 12.97 X',
    'SUBTOTAL 31.12',
    'TAX 1 7.000 % 1.39',
    'TOTAL 32.51',
    'DEBIT TEND 32.51',
    'CHANGE DUE 0.00',
    '11/06/26 14:22:10',
  ], today);
  assert.equal(parse.store, 'Walmart');
  assert.equal(parse.date, '2026-11-06');
  assert.deepEqual(names(parse), ['bananas', 'avocado hass', 'gv whole milk gal', 'great shredded mozzarella', 'coca cola']);
  assert.deepEqual(parse.items[1].size, { amount: 3, unit: 'PIECE' });
  assert.deepEqual(parse.items[3].size, { amount: 226.8, unit: 'GRAM' });
  assert.equal(parse.items[3].department, 'dairy');
  assert.equal(parse.items[0].department, 'produce');
  assert.equal(parse.ignored.find(line => line.text.startsWith('BOUNTY')).reason, 'non-food');
  assert.equal(parse.check.status, 'match');
  assert.equal(parse.total, 32.51);
});

test('quantity row above the price, and a "2 x" row under a name', () => {
  const parse = parseReceipt([
    'LULU HYPERMARKET',
    'YOGHURT PLAIN 500G',
    '2 x 7.50 15.00',
    'ONION RED 1.020 KG',
    '5.10',
    'TOTAL 20.10',
  ], today);
  assert.deepEqual(names(parse), ['yogurt plain', 'onion red']);
  assert.deepEqual([parse.items[0].count, parse.items[0].size, parse.items[0].total], [2, { amount: 500, unit: 'GRAM' }, 15]);
  assert.deepEqual([parse.items[1].size, parse.items[1].total], [{ amount: 1.02, unit: 'KILOGRAM' }, 5.1]);
  assert.equal(parse.check.status, 'match');
});

test('no item is read from header, payment or footer lines', () => {
  const parse = parseReceipt([
    'Spinneys', 'Branch 14, Sheikh Zayed', 'Invoice 55102', 'Order #9921',
    'APPLE RED 1.1 kg 49.50', 'TOTAL 49.50', 'CASH 100.00', 'CHANGE 50.50', 'Loyalty points earned 49', 'www.spinneys-egypt.com',
  ], today);
  assert.deepEqual(names(parse), ['apple red']);
  assert.equal(parse.ignored.length, 9);
});

test('a mismatched total is reported, so the screen can ask for a check', () => {
  const parse = parseReceipt(['SHOP', 'RICE 5KG 120.00', 'SUGAR 1KG 35.00', 'TOTAL 190.00'], today);
  assert.equal(parse.check.status, 'mismatch');
  assert.equal(parse.check.itemsSum, 155);
});

test('rows rebuilt from Vision boxes, including a slightly tilted photo', () => {
  const box = (text, x, y, width) => ({ text, x, y, width, height: 0.02, angle: 0.03 });
  // Name and price come back as separate boxes, out of order, on a photo rotated by ~1.7°.
  const rows = rowsFromLines([
    box('42.00', 0.80, 0.300, 0.10),
    box('FETA CHEESE 250G', 0.10, 0.320, 0.40),
    box('TOTAL', 0.10, 0.360, 0.15),
    box('LABNEH 500G', 0.10, 0.345, 0.30),
    box('31.00', 0.80, 0.325, 0.10),
    box('73.00', 0.80, 0.340, 0.10),
  ], 1, 1);
  assert.deepEqual(rows, ['FETA CHEESE 250G 42.00', 'LABNEH 500G 31.00', 'TOTAL 73.00']);
});

test('item lines and names', () => {
  assert.deepEqual(readItemLine('3 x LEMON 1.50 4.50'), { name: 'lemon', count: 3, size: null, weighed: false, unitPrice: 1.5, total: 4.5 });
  assert.equal(cleanItemName('ORG GRND BF 85% 1LB'), 'ground beef');
  assert.equal(cleanItemName('FRZN MIXED VEG 900G'), 'frozen mixed vegetable');
  assert.equal(readItemLine('12345678'), null);
  assert.equal(findDate(['Date 31/02/2026']), null);
  assert.equal(findDate(['01/01/2030'], today), null);
  assert.deepEqual(receiptAmount({ count: 2, size: null, weighed: false }, { defaultUnit: 'GRAM', gramsPerPiece: null }), null);
  assert.deepEqual(receiptAmount({ count: 4, size: null, weighed: false }, { defaultUnit: 'GRAM', gramsPerPiece: '120' }), { amount: 4, unit: 'PIECE' });
});

test('real Apple Vision output of a tilted receipt photo (scripts/fixtures/receipt-vision-tilted.json)', () => {
  const vision = require('./fixtures/receipt-vision-tilted.json');
  const parse = parseReceipt(rowsFromLines(vision.lines, vision.width, vision.height), today);
  assert.deepEqual(names(parse), ['tomatoes', 'juhayna full cream milk', 'chicken breast boneless', 'baladi bread', 'eggs white', 'americana frozen mixed vegetable', 'isis tahini', 'el doha rice', 'pringles']);
  assert.deepEqual([parse.items[1].count, parse.items[1].size], [2, { amount: 1, unit: 'LITER' }]);
  assert.deepEqual(parse.check, { status: 'match', itemsSum: 1229.44, printed: 1229.44 });
  assert.deepEqual(parse.ignored.filter(l => ['non-food', 'fee'].includes(l.reason)).map(l => l.reason), ['non-food', 'non-food', 'fee']);
});

test('real Apple Vision output of an Arabic receipt photo (scripts/fixtures/receipt-vision-arabic.json)', () => {
  const vision = require('./fixtures/receipt-vision-arabic.json');
  const parse = parseReceipt(rowsFromLines(vision.lines, vision.width, vision.height), today);
  assert.equal(parse.store, 'هايبر بنده');
  assert.equal(parse.date, '2026-11-05');
  assert.deepEqual(names(parse), ['طماطم', 'حليب', 'أرز بسمتي', 'صدور دجاج', 'لبنة']);
  assert.deepEqual(parse.items.map(i => i.size), [{ amount: 1, unit: 'KILOGRAM' }, { amount: 1, unit: 'LITER' }, { amount: 2, unit: 'KILOGRAM' }, { amount: 1, unit: 'KILOGRAM' }, { amount: 500, unit: 'GRAM' }]);
  assert.deepEqual(parse.check, { status: 'match', itemsSum: 96, printed: 96 });
  assert.deepEqual(parse.ignored.filter(l => ['non-food', 'fee'].includes(l.reason)).map(l => l.reason).sort(), ['fee', 'non-food']);
});

const { buildReview, groupByCategory, submission, withFood } = require('../src/domain/receipt-review.ts');
test('review: confident matches are included, guesses are flagged, unknown lines stay out', () => {
  const parse = parseReceipt(['SHOP', 'MILK FULL CREAM 1L 2 x 38.00 76.00', 'CREAMY THING 400G 30.00', 'PRINGLES 165G 85.00', 'RICE 120.00', 'TOTAL 311.00'], today);
  const food = (name, categoryCode, defaultUnit, storageLocation) => ({ foodId: name, name, arabicName: null, categoryCode, categoryName: categoryCode, defaultUnit, gramsPerPiece: null, storageLocation, score: 1 });
  const milk = food('whole milk', 'DAIRY', 'MILLILITER', 'FRIDGE'), cream = food('cream', 'DAIRY', 'MILLILITER', 'FRIDGE'), rice = food('white rice', 'GRAINS', 'GRAM', 'PANTRY');
  const lines = buildReview(parse, [
    { query: '', confidence: 'HIGH', food: milk, alternatives: [], inKitchen: [] },
    { query: '', confidence: 'MEDIUM', food: cream, alternatives: [], inKitchen: [] },
    { query: '', confidence: 'NONE', food: null, alternatives: [cream], inKitchen: [] },
    { query: '', confidence: 'HIGH', food: rice, alternatives: [], inKitchen: [] },
  ]);
  assert.deepEqual(lines.map(l => [l.include, l.check, l.amount, l.unit, l.storage]), [
    [true, false, '2', 'LITER', 'FRIDGE'], [true, true, '400', 'GRAM', 'FRIDGE'], [false, false, '', 'PIECE', 'PANTRY'], [true, false, '', 'GRAM', 'PANTRY'],
  ]);
  const { groups, unmatched } = groupByCategory(lines);
  assert.deepEqual(groups.map(g => [g.code, g.lines.length]), [['DAIRY', 2], ['GRAINS', 1]]);
  assert.equal(unmatched.length, 1);
  // Rice has no printed size, so nothing is sent until the person enters one.
  assert.deepEqual(submission(lines), { ok: false, missing: ['3'] });
  lines[3] = { ...lines[3], amount: '5' }; lines[3] = { ...lines[3], unit: 'KILOGRAM' };
  const sent = submission(lines);
  assert.equal(sent.ok, true);
  assert.deepEqual(sent.items.map(i => [i.foodId, i.amount, i.unit]), [['whole milk', '2', 'LITER'], ['cream', '400', 'GRAM'], ['white rice', '5', 'KILOGRAM']]);
  assert.equal(withFood(lines[0], null).include, false);
});

console.log(`receipt parser: ${passed} passed`);
