# Remy AI Kitchen Assistant — Real Device & Manual QA Checklist

**Audit Date:** October 14, 2026  
**Auditor:** Senior React Native Engineer / Mobile App QA Tester  
**Target Environments:** Physical iOS / Android Devices, Android Emulator, iOS Simulator, Development Builds  

---

## Prerequisites & Development Build Setup

### 1. Standard Testing (Expo Go / Metro)
```powershell
# Start Metro bundler with cache cleared
npx.cmd expo start -c
```
*Note: Camera intake, inventory, shopping list, meal planner, recipes, cooking mode, themes, and localization can be fully exercised in Expo Go. Receipt OCR requires a native development build.*

### 2. Native Development Build (Required for Receipt OCR)
```powershell
# Verify connected Android device
adb devices

# Build and install debug APK with autolinked native modules (expo-text-extractor)
npx.cmd expo run:android --device
```

---

## Manual Test Checklist

### Section 1: Navigation & Layout Symmetry
- [ ] **Tab Bar Physical Order:**
  - Launch app in English. Confirm bottom tab order is: `Home`, `Kitchen`, `Add` (elevated icon), `Health`, `More`.
  - Navigate to **More** -> **Settings**, switch language to `العربية`.
  - **Critical Check:** Confirm the physical tab bar order remains strictly `Home`, `Kitchen`, `Add`, `Health`, `More` (Left-to-Right layout), and labels read: `الرئيسية`, `المطبخ`, `إضافة`, `الصحة`, `المزيد`.
- [ ] **Safe-Area Insets:**
  - Verify on notched devices (e.g. iPhone 15/16 Dynamic Island, Android hole-punch display).
  - Verify that top headers and bottom tab bars do not collide with status bars, camera cutouts, or home indicators.
- [ ] **Orientation Lock:**
  - Rotate device to landscape. Confirm the application remains locked to portrait mode as configured in `app.json`.

---

### Section 2: Photo Intake & Device Permissions
- [ ] **Camera Permission Flow (First Launch):**
  - Tap center **Add** tab -> Tap **Take a Photo**.
  - System permission dialog appears: *"Allow Remy to take an optional food photo."*
  - **Path A (Allow):** Camera viewfinder launches. Take photo -> confirm -> image previews in managed card.
  - **Path B (Deny):** Reject permission -> app displays localized alert: *"Camera permission is needed. Allow access in device settings or choose a gallery photo."* App does not crash.
- [ ] **Gallery Photo Selection:**
  - Tap **Upload a Photo** -> system gallery opens.
  - Select JPEG, PNG, or WebP photo -> image copies to private sandbox and displays preview.
- [ ] **Photo Replacement & Deletion:**
  - Tap **Replace photo** -> select alternative photo. Prior photo is replaced without dangling references.
  - Tap **Remove photo** -> card clears and shows placeholder icon.
- [ ] **Large / Unsupported File Handling:**
  - Attempt to select an oversized image (> 20 MB).
  - App rejects file with alert: *"This prepared photo exceeds 20 MB. Choose a smaller image."*

---

### Section 3: Receipt OCR on Native Development Build
*Prerequisite: Run on device with `expo run:android` or `expo run:ios` (not Expo Go).*
- [ ] **Clean Latin Receipt:**
  - Tap **Add** -> **Scan a Receipt** -> select or capture clear receipt photo.
  - Tap **Extract text**. Activity indicator shows *"Reading receipt…"*.
  - Extracted text populates the review box: *"Text extracted. Check every line; confidence scores are not available."*
- [ ] **Extracted Text Correction:**
  - Tap inside the extracted text multiline field. Edit text using keyboard.
  - Type or copy one food item into **Food name to add** field.
  - Tap **Review food details** -> navigates to `/food/manual` with the item name pre-filled.
- [ ] **Arabic Receipt Limitation:**
  - Scan receipt containing Arabic text on Android.
  - Confirm Latin numerals/text are extracted, while Arabic script is omitted (due to ML Kit Latin model limitation).
  - Confirm informational label remains visible: *"Android OCR supports Latin text only. Arabic recognition is not verified on iOS."*
- [ ] **Receipt Cancel / Exit:**
  - Tap **Cancel** or **Back** -> draft state clears without persisting empty records or unreferenced inventory entries.

---

### Section 4: Keyboard Handling & Form Usability
- [ ] **Keyboard Avoidance (iOS & Android):**
  - Navigate to **Kitchen** -> **Add food** -> **Add Manually** (`/food/manual`).
  - Tap into **Food name** input -> keyboard opens.
  - Tap **Optional details** disclosure -> tap into **Notes** multiline input.
  - Scroll form while keyboard is active -> confirm inputs are never obscured behind keyboard.
- [ ] **Numeric Keypad Behavior:**
  - Tap into **Quantity** input -> decimal keypad opens.
  - Enter decimal values (e.g., `0.5`, `1.25`).
  - In Arabic mode, confirm digits type Left-to-Right (`inputDirection="ltr"`) without cursor jitter.
  - Attempt to enter invalid characters (e.g. letters, negative numbers) -> form validation displays: *"Enter a positive quantity using digits 0–9 and a dot..."*.

---

### Section 5: Modals, Dialogs & Touch Targets
- [ ] **Kitchen Filters Modal:**
  - Navigate to **Kitchen** -> tap **Filters**.
  - Select chips (Storage, Category, Expiration sort, Use First).
  - Tap **Close** (Cancel) without pressing Apply -> screen list remains unchanged.
  - Re-open Filters -> tap **Apply** -> list filters and shows result count.
- [ ] **Delete Food Confirmation:**
  - Open any food item detail -> tap **Delete food** (red text action).
  - Central modal appears with scrim overlay.
  - Tap **Keep food** -> dialog dismisses, item remains intact.
  - Tap **Delete** -> button shows *"Deleting…"*, item is removed from storage, router navigates to `/kitchen`.
- [ ] **Clear Shopping List Confirmation:**
  - Open **Shopping List** -> mark one or more items as purchased.
  - Tap **Clear purchased** -> confirmation modal appears: *"Clear all purchased items? This cannot be undone."*
  - Confirm clear -> purchased items deleted; unpurchased items remain intact.

---

### Section 6: Accessibility & Screen Readers (TalkBack / VoiceOver)
- [ ] **Screen Reader Traversal:**
  - Enable TalkBack (Android) or VoiceOver (iOS).
  - Swipe sequentially through Home, Kitchen, Meal Planner, and Shopping List screens.
  - Confirm every interactive button has a clear spoken label (e.g. *"Add food. Open entry chooser, button"*).
  - Confirm headers announce as `header` role.
  - Confirm checkboxes announce state (e.g. *"Milk, checked, checkbox"* or *"Milk, not checked, checkbox"*).
- [ ] **Progress Indicators:**
  - In Cooking Mode, verify the progress bar announces: *"Steps completed, progress bar, 2 of 4"*.
- [ ] **Minimum Touch Targets:**
  - Verify all touch targets (calendar days, checkboxes, chip filters, back buttons) meet or exceed the 44x44 pt minimum.

---

### Section 7: Cold Restart & Persistence Verification
- [ ] **Full App Termination Test:**
  - Add 2 inventory items with different storage locations and dates.
  - Schedule 1 meal in Meal Planner.
  - Add 2 items in Shopping List (1 marked purchased).
  - Switch language to Arabic (`العربية`).
  - Force-close app from native app switcher (swipe away process).
  - Re-launch app from home screen.
  - **Verification:**
    - App starts in Arabic.
    - Kitchen contains both inventory items with identical details.
    - Meal Planner displays scheduled meal on selected date.
    - Shopping List retains both items with correct purchased status.
    - Appearance defaults to system (session-only behavior).
