#!/bin/sh
set -eu
cd "$(dirname "$0")"
: "${REMI_SIMULATOR_ID:?Set REMI_SIMULATOR_ID to a booted iOS simulator UDID}"
node setup-fixture.mjs
ruby create-project.rb
result="verification-$(date +%Y%m%d-%H%M%S).xcresult"
xcodebuild test -project CookbookUITests.xcodeproj -scheme CookbookUITests \
  -destination "platform=iOS Simulator,id=$REMI_SIMULATOR_ID" \
  -derivedDataPath DerivedData -resultBundlePath "$result" \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-
xcrun xcresulttool export attachments --path "$result" --output-path "${result%.xcresult}-screenshots"
