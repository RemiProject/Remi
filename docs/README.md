# Remi documentation

Start with [`VERSION-3.md`](../VERSION-3.md) for the current version: one section per element, with commits.

## Features (version 3)

| Document | What it covers |
|---|---|
| [nutrition.md](nutrition.md) | Recipe nutrition per serving from USDA data: the evaluation against the Mob app, the plan, results and rules |
| [receipt-scanning.md](receipt-scanning.md) | Reading a receipt photo: research into receipt apps, the parser, catalogue matching, adding to the kitchen, and the first real receipt and its fixes |
| [shelf-life.md](shelf-life.md) | Purchase dates and probable expiry dates for fresh produce from USDA FoodKeeper averages |
| [account-setup/](account-setup/README.md) | Creating a Remi account on an iPhone, step by step with screenshots |
| [recipe-import.md](recipe-import.md) | Saving a recipe from a link: page parsing, ingredient lines, catalogue matching and My recipes |
| [ui-spacing.md](ui-spacing.md) | The spacing and motion pass: rules, before and after per screen |
| [feel-and-nutrition.md](feel-and-nutrition.md) | Haptics, sounds and motion, and the Nutrition dashboard page |
| [release.md](release.md) | Publishing: what is done in code, hosting, email, Apple account steps, App Store listing and privacy answers |
| [privacy-policy.md](privacy-policy.md), [terms.md](terms.md) | The privacy policy and terms the app shows (generated from `mobile-app/src/data/legal.ts`) |
| [phone-testing.md](phone-testing.md) | Building and installing on an iPhone against a local API, stress-test results, and bugs found on the phone |

## Data and content

| Document | What it covers |
|---|---|
| [../backend/data/README.md](../backend/data/README.md) | Catalogue CSVs, the importer, nutrition and shelf-life sources (Arabic, with English sections for version 3) |
| [recipe-sources.md](recipe-sources.md), [asset-sourcing.md](asset-sourcing.md) | Where cookbook recipes and images come from |
| `recipe-image-manifest.json`, `ingredient-image-manifest.json`, `recipe-source-checks.json` | Image and source records |
| [../Design/](../Design/) | Colour boards, palette, fonts, logo, food photography and screenshots for versions 1–3 |
| [../DESIGN.md](../DESIGN.md), [../PRODUCT.md](../PRODUCT.md) | The visual world and product context |

## Backend

| Document | What it covers |
|---|---|
| [../backend/README.md](../backend/README.md) | Setup, scripts, phases and handoff notes |
| [../backend/GRAPHQL_ENDPOINTS.md](../backend/GRAPHQL_ENDPOINTS.md) | Every GraphQL operation, including version 3's recipe nutrition, `matchReceiptItems`, `receiveReceipt` and expiry estimates |
| `../backend/prisma/migrations/` | The schema, one SQL file per change. Version 3 added 0030 (nutrition values that USDA doesn't report), 0031 (shelf life), 0032 (receipt storage fix), 0033 (saved recipes from links) and 0034 (account deletion) |

## Earlier versions

| Document | What it covers |
|---|---|
| [../VERSION-2.md](../VERSION-2.md) | The Living Cookbook redesign |
| [native-verification.md](native-verification.md) | Version 2 verification |
| [intake-features.md](intake-features.md) | Version 2 intake, kitchen helper and leftovers |
| [BUILD-PLAN.md](BUILD-PLAN.md) | The original cookbook build plan |
| `../mobile-app/*.md` | Version 2 working notes. `RECEIPT-SCANNER.md` is superseded by `receipt-scanning.md` |
