# Receipt scanner

## Diagnostic follow-up (14 October 2026)

Installed versions verified from node_modules: Expo 57.0.28, React Native 0.86.3, image-picker 57.0.20, file-system 57.0.7, text-extractor 2.0.0. `expo-modules-autolinking resolve --platform android --json` discovers `expo.modules.textextractor.ExpoTextExtractorModule`. No missing OCR config plugin was found: the package registers an Expo native module through expo-module.config.json and needs compilation/autolinking, not an app.json plugin entry. Broad peer ranges accept this SDK; that is not proof that Gradle/Kotlin compilation succeeds.

The reported unavailable state is returned before image resolution or OCR when the running native module is absent/unsupported. The installed Android implementation advertises isSupported=true, so a missing module in the running binary is the leading explanation. Expo Go cannot contain this third-party module; an older custom binary would have the same result. Without inspecting the phone's installed application or logs, which binary is running is not confirmed. A Metro restart cannot add native code to either binary. Web is explicitly unsupported by this adapter.

Metro was found listening on port 8081, with its process pointing to this project and `/status` responding `packager-status:running`. Existing logs include completed Android bundles. These are host-side checks, not proof of the phone's current connection. The warning comes from Expo's HMR connection error implementation, separately from the OCR adapter. Its full URL and Error lines are needed to identify the failing phone-side address/transport. No phone logs or directly accessible screenshot file were available in this diagnostic task; the supplied description was used. No process was stopped or server configuration changed.

The default Android SDK/adb location was absent, adb was not on PATH, ANDROID_HOME/ANDROID_SDK_ROOT/JAVA_HOME were unset, and Java on PATH was version 23. No android/ native project or eas.json exists. Local native compilation/device enumeration could not therefore be verified. Configure the Android SDK and a JDK supported by the generated Gradle project (Expo's Android setup recommends JDK 17), then use the commands below. Do not uninstall the existing app or clear its data; preserve its application ID/signing identity when updating an existing native installation.

### Native Android build and connection

From the project directory, after Android Studio SDK/platform-tools and the appropriate JDK are configured:

```powershell
adb devices
npx.cmd expo run:android --device
```

The second command generates the native project when absent, compiles the OCR module, installs a debug application and starts Metro. The current npm android script only starts Expo; it does not compile native dependencies. If prompted for an Android application ID, use the project's agreed stable ID (or the existing native app's ID); no ID was invented in configuration here. Build errors must be collected before declaring SDK compatibility or selecting a replacement OCR dependency. This project's expo-dev-client is not installed; do not use a development-client/EAS development profile as though it already exists. The local debug-build path does not require installing it.

For an authorized USB device and an already installed debug app, in separate terminals:

```powershell
adb reverse tcp:8081 tcp:8081
npx.cmd expo start --localhost --port 8081
```

First stop the existing Metro process in its own terminal if replacing it; do not run a second server on a silently chosen port. Reload the installed Remy debug app. For LAN instead, use `npx.cmd expo start --lan --port 8081`; both devices must reach the computer's LAN address/port. Check the full warning URL against that address and test `http://<computer-LAN-IP>:8081/status` from the phone. VPN, firewall and Wi-Fi isolation remain hypotheses until tested; no firewall changes were made. Restoring Metro connectivity does not enable OCR in Expo Go.

### Receipt review limits and device checklist

Text corrections remain in screen state while reviewing, including on an extraction error/unavailable result. Selecting a different image intentionally clears the previous text/name, and a successful or empty re-extraction replaces text. Leaving/restarting the screen does not preserve a receipt draft. Only one explicitly entered food name is handed to the manual form; there is no line-item parsing, bulk confirmation, or saved receipt history. No receipt text or prices are interpreted as quantities.

On the actual installed native build, verify camera denial/cancellation, gallery cancellation, preview/replacement and failed replacement retaining the prior image; then OCR success, empty text, unreadable images and offline/model-unavailable errors. Confirm editable review, cancel without writes, explicit manual validation/save, and inventory after restart. Verify English/Arabic UI and keyboard on-device. Android recognition is Latin-only; Arabic OCR remains unsupported there and unverified on iOS.

The Add chooser opens `/receipt`. Camera/gallery use the existing FoodPhotoField and managed storage (awaited native copies; IndexedDB on web). Images can be previewed and replaced before extracting text. Nothing writes inventory here. Raw OCR text is editable. Users type/copy one food name, explicitly continue to the existing manual form, enter its required quantity/unit/category/storage, then save normally. Receipt prices never become quantities. Receipt images are not attached to inventory food items.

## Engine and build requirements

Installed `expo-text-extractor` 2.0.0 through Expo CLI. Its peer ranges accept Expo 57; native Gradle/plugin and podspec sources were inspected. It wraps Android Google ML Kit Latin recognition and iOS Apple Vision. This is an actual native extraction call, not mock data or a remote API. Its API does not return confidence scores. Android's file-path API needs normalized paths rather than `file://` URLs; the adapter does this without changing the stored reference. The Android Google Play Services recognition model may need an initial download; missing models surface as retryable extraction errors.

Native compilation with this SDK is **not yet verified**. Expo Go does not contain this module. Web has no OCR engine. Both show an explicit unavailable message and permit manual entry. Optional module lookup prevents an Expo Go startup crash.

Build an Android native application with `npx.cmd expo run:android` on a configured Android SDK machine; this generates native projects and compiles/autolinks the module. iOS requires a Mac/Xcode with `npx expo run:ios`. Rebuild after dependency changes; a JS export alone cannot install the engine. No API keys/config plugin are required by this library. No development client dependency or native projects were generated in this task.

Arabic UI is translated, but **Arabic OCR is not supported by the selected Android engine and is unverified on iOS**. Automatic receipt line-item parsing is deliberately absent: OCR does not establish reliable products or quantities. Verify accuracy, rotation, formats and model availability with real receipts before release.

## Storage and testing limitations

Receipt images reuse the existing private photo store and its 20 MB actual-file validation. They are local only, with no cloud upload. As with cancelled food drafts, abandoned receipt photos can remain unreferenced; there is no unsafe cleanup that could remove referenced inventory photos. Raw OCR text is held in screen memory, not persisted or sent as a route parameter. Only the explicitly entered food name is handed to the form.

Tests use injected OCR adapters and mocked React hooks. They verify output handling, failures, unavailable builds, URI conversion, editable review, confirmation/cancellation and translation parity. They do not prove native module compilation, camera hardware permissions, OCR accuracy, Arabic rendering, keyboard behavior or screen-reader behavior. These require device testing.
