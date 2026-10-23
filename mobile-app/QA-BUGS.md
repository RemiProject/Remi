# Remy AI Kitchen Assistant — Confirmed Bugs & Defect Log

**Audit Date:** October 14, 2026  
**Auditor:** Senior React Native Engineer / QA Automation Engineer  
**Scope:** Frontend Architecture, Static Analysis, Automated Test Suites, Navigation Contracts, Theme & Localization  

---

## Severity Classification
- **P0 (Critical):** Data loss, security breach, or fatal app-wide crash.
- **P1 (High):** Major feature broken or critical navigation failure with no workaround.
- **P2 (Medium):** Functional issue with an available workaround.
- **P3 (Low):** Visual polish, layout alignment, typography, or minor usability defect.

---

## 1. Confirmed Bugs (Fixed)

### BUG-001: Missing RTL Direction on Feature Preview Back Button
- **ID:** `BUG-001`
- **Severity:** `P3` (Low — Usability & RTL Polish)
- **Status:** **RESOLVED**
- **Affected Route / File:** [`src/screens/feature-preview-screen.tsx`](file:///c:/Users/M/Desktop/RemyAI_Assistant/src/screens/feature-preview-screen.tsx#L41)
- **Reproduction Steps:**
  1. Open app and switch language to Arabic (`العربية`) via More -> Settings.
  2. Navigate to More tab, and select any preview feature (e.g., Remi Chat, Leftovers, Notifications, Community, Profile, or Contact Us).
  3. Inspect the top back button labeled "الرجوع إلى المزيد".
- **Expected Behavior:** In RTL mode, directional back arrow icons must mirror (`scaleX: -1`) to point to the right, indicating navigation back to the originating screen.
- **Actual Behavior:** The `Button` component call omitted the `rtl={rtl}` prop on line 41 (unlike lines 29 and 34 in the same file), causing the back arrow to default to `I18nManager.isRTL` (which is `false` during in-memory language switching) and point left.
- **Root Cause:** Omission of `rtl={rtl}` prop on line 41 in `FeaturePreview` fallback return statement.
- **Fix Applied:** Passed `rtl={rtl}` to `<Button label={a.backMore} icon="back" rtl={rtl} variant="text" ... />` on line 41.
- **Regression Test:** [`scripts/test-audit-regressions.cjs`](file:///c:/Users/M/Desktop/RemyAI_Assistant/scripts/test-audit-regressions.cjs) (Test: `regression: FeaturePreview passes rtl={rtl} to back button in fallback preview screens`).

---

### BUG-002: Category Validation Error Alert in Shopping Modal Lacks Error Styling
- **ID:** `BUG-002`
- **Severity:** `P3` (Low — Visual Polish & Accessibility)
- **Status:** **RESOLVED**
- **Affected Route / File:** [`src/screens/shopping-screen.tsx`](file:///c:/Users/M/Desktop/RemyAI_Assistant/src/screens/shopping-screen.tsx#L86)
- **Reproduction Steps:**
  1. Navigate to Shopping List (`/feature?feature=shopping`).
  2. Tap "Add item" to open the shopping modal.
  3. Enter an item with an invalid category or trigger category validation error.
  4. Inspect the category error text below category chips.
- **Expected Behavior:** Category validation error alert must render with semantic error coloring (`style={{ color: colors.errorText }}`), matching all other error alerts across the app (`name`, `quantity`, `writeError`).
- **Actual Behavior:** The category error message rendered with default text color (`colors.text`), providing insufficient visual distinction between error feedback and standard labels.
- **Root Cause:** Missing `style={{ color: colors.errorText }}` prop on `<AppText accessibilityRole="alert">`.
- **Fix Applied:** Added `style={{ color: colors.errorText }}` to `{errors.category && <AppText accessibilityRole="alert" style={{ color: colors.errorText }}>{t[errors.category]}</AppText>}`.
- **Regression Test:** [`scripts/test-audit-regressions.cjs`](file:///c:/Users/M/Desktop/RemyAI_Assistant/scripts/test-audit-regressions.cjs) (Test: `regression: ShoppingScreen modal styles category validation error with errorText color`).

---

### BUG-003: Recipe Preview Modal Card in Home Screen Lacks Explicit RTL Direction
- **ID:** `BUG-003`
- **Severity:** `P3` (Low — RTL Layout Alignment)
- **Status:** **RESOLVED**
- **Affected Route / File:** [`src/screens/home-screen.tsx`](file:///c:/Users/M/Desktop/RemyAI_Assistant/src/screens/home-screen.tsx#L100)
- **Reproduction Steps:**
  1. Switch language to Arabic (`العربية`).
  2. On the Home screen, tap any recipe card (e.g., Spinach & rice bowl or Berry yogurt breakfast) to open the preview modal.
  3. Inspect the modal card layout.
- **Expected Behavior:** In Arabic mode, modal dialog containers must specify `direction: rtl ? 'rtl' : 'ltr'`, ensuring all child rows and flex alignments respect RTL orientation consistently with `ConfirmDialog` and `KitchenFilters` modal.
- **Actual Behavior:** The `<Card>` component inside the recipe preview modal lacked explicit `direction: rtl ? 'rtl' : 'ltr'`.
- **Root Cause:** Missing style property `direction: rtl ? 'rtl' : 'ltr'` on line 100.
- **Fix Applied:** Added `direction: rtl ? 'rtl' : 'ltr'` to the modal Card style.
- **Regression Test:** [`scripts/test-audit-regressions.cjs`](file:///c:/Users/M/Desktop/RemyAI_Assistant/scripts/test-audit-regressions.cjs) (Test: `regression: HomeScreen recipe modal Card has explicit direction: rtl ? "rtl" : "ltr"`).

---

## 2. Confirmed Open Bugs
**None.** No P0, P1, P2, or unresolved P3 bugs remain in the codebase. All identified functional and visual defects were verified, fixed, and guarded with automated regression tests.

---

## 3. Known Architectural Constraints & Non-Bugs
The following behaviors are intentional architectural decisions or external platform limitations and are **not** bugs:
1. **Mock Services & Preview Screens:** Features in More menu (Remy Chat, Leftovers, Notifications, Community, Profile, Contact Us) and Health tab are explicitly designed and labeled as previews and unavailable notices. AI, OCR backends, server synchronization, and authentication are not mocked as working.
2. **Receipt OCR Runtime Constraint:** Native OCR relies on `expo-text-extractor` (Google ML Kit on Android, Apple Vision on iOS). Expo Go and Web environments cannot bundle this native code; they cleanly display an informative unavailable notice and provide a manual food entry fallback.
3. **Session-Scoped Theme Mode:** Appearance selection (`System`, `Light`, `Dark`) is intentionally session-scoped (in React state via `useRemyTheme`) and does not persist across cold native restarts, as explicitly labeled in UI: *"Applies for this session."*
4. **Gregorian Calendar Enforcement:** In Arabic localization, dates are formatted using the Gregorian calendar (`calendar: 'gregory'`), preserving standard date-key comparisons and ISO `YYYY-MM-DD` inputs across platforms.
5. **Brand Font Fallback:** Custom brand fonts (`Shrikhand`, `Fredoka`, `Nunito`) are not committed to avoid unlicensed asset distribution; `RemyFontProvider` falls back safely to system typography.
