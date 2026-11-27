# Remi Cookbook build

## Acceptance
Independent iOS app runs in simulator with the approved colorful paper cookbook design. Existing auth, kitchen inventory and stock operations survive. Recipes, cooking, meal planning, shopping, health/profile, notifications and household settings use real backend contracts. Receipt intake offers review before saving. User-facing placeholders are replaced with working behavior where possible; external-provider requirements are documented honestly. Sourced recipe content has attribution, original concise instructions, and image provenance. Real-app and API checks, lint and typecheck pass. Original source/data stays untouched.

## Phases
1. Inventory source, log baseline, isolate app/data/runtime and start services.
2. Build shared paper/color/type system and main native navigation.
3. Connect recipes, planner, shopping, profile, health, household and notifications.
4. Add sourced content/images and recipe seeding.
5. Complete intake, assistant, leftovers and secondary flows.
6. Verify real API behavior, tests, simulator interactions and screenshots. Review gaps and fix them.

## Version 2 integration
The current branch incorporates the newest upstream recipe matcher, availability/expired statuses, backend cooking steps and confirmed ingredient deduction. See VERSION-2.md and native-verification.md for delivered scope and actual checks. Deployment credentials, physical-device QA and store distribution remain environment work.
