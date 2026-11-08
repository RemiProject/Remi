# Prints nutrition.csv rows for the foods in data/nutrition-usda-additions.csv from the official USDA SR Legacy CSVs.
# Usage: python3 -I scripts/usda-nutrition-rows.py <FoodData_Central_sr_legacy_food_csv_2018-04 folder> [data/nutrition-usda-additions.csv]
# Download: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip (public domain).
import csv, sys
src = sys.argv[1]; mapping = sys.argv[2] if len(sys.argv) > 2 else 'data/nutrition-usda-additions.csv'
NUTRIENTS = {'1008': 'calories_per_100g', '1003': 'protein_g', '1005': 'carbs_g', '1004': 'fat_g', '1079': 'fiber_g', '2000': 'sugar_g', '1093': 'sodium_mg'}
rows = [r for r in csv.DictReader(l for l in open(mapping, encoding='utf-8') if not l.startswith('#'))]
wanted = {r['fdc_id'] for r in rows}
desc = {r['fdc_id']: r['description'] for r in csv.DictReader(open(f'{src}/food.csv', encoding='utf-8')) if r['fdc_id'] in wanted}
values = {}
for r in csv.DictReader(open(f'{src}/food_nutrient.csv', encoding='utf-8')):
    if r['fdc_id'] in wanted and r['nutrient_id'] in NUTRIENTS: values.setdefault(r['fdc_id'], {})[NUTRIENTS[r['nutrient_id']]] = r['amount']
fmt = lambda v: ('%f' % float(v)).rstrip('0').rstrip('.') if v not in (None, '') else ''
out = csv.writer(sys.stdout, lineterminator='\n')
for r in rows:
    fid = r['fdc_id']
    if desc.get(fid) != r['usda_description']: sys.exit(f"{r['food']}: FDC {fid} is '{desc.get(fid)}', expected '{r['usda_description']}'")
    v = values.get(fid, {})
    if 'calories_per_100g' not in v: sys.exit(f"{r['food']}: FDC {fid} has no energy value")
    out.writerow([r['food'], *(fmt(v.get(k)) for k in NUTRIENTS.values()), f'USDA FoodData Central, SR Legacy (April 2018 release), FDC ID {fid}'])
