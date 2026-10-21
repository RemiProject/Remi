#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

npx tsc-alias -p tsconfig.build.json

mkdir -p dist/platform/mail
rm -rf dist/platform/mail/templates
cp -R src/platform/mail/templates dist/platform/mail/

exec node dist/main.js
