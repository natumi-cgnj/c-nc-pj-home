# Jane Companion for Android

Android 8.0+ personal companion, package `app.liminal.jane`, initial version 0.1.0. It bundles the same approved 25 transparent PNGs and deterministic state selectors as Windows. The installed app provides a full-width correspondence screen and an optional, user-started floating companion.

## Use

Install the APK, sign in with the same account as the Windows companion, then choose **开启悬浮** and grant Android's **显示在其他应用上层** permission. Returning to the home screen shows Jane. Notification permission is requested when enabling the companion on Android 13+, and the foreground notification includes a stop action. Startup on boot and battery exemptions are not enabled automatically.

- Drag to reposition; release to snap to either screen edge.
- Tap Jane for current status/dialogue; double-tap opens the original main program through Android's normal app/browser handling.
- Tap **留言**, or long-press Jane, for correspondence.
- The app settings control size and tag visibility; closing the floating companion retains the login and correspondence screen.
- The floating windows hide while the companion's own app is open. Screen-off pauses cloud/mail checks, screen-on refreshes them; this is not a new server push or unattended scheduler.

State and accepted messages/replies use the existing cloud account. Both devices use the same `claude-bridge` actions and backend deduplication, variable reply delay and 1–3 hour / 3–5 daily proactive policy. One device may continue polling while the other is closed. Cached/draft data, read markers, window placement and size are per-device. Reading on the phone does not mark a letter read on Windows. No database migration, existing-message rewrite or Windows update is required.

## Boundaries

The APK contains its interface, SDK, shared selector/mailbox modules and verified original artwork; no authentication credentials, user cloud rows or signing key are packaged. All documents/scripts are intercepted from APK assets under a dedicated virtual path at the existing production origin (`https://natumi-cgnj.github.io/c-nc-pj-home/__jane_android/`). This preserves the existing backend's exact CORS origin without expanding its allowlist. The privileged WebView never loads the main application, arbitrary remote pages or files. It reads only the three existing schedule/CBI inputs and does not initialize `CharacterRuntime.init` or cloud-sync uploads.

The native bridge is limited to whitelisted artwork/status snapshots, bounded status text and the fixed login action. A fresh navigation nonce is delivered to the trusted top-level mobile document only; login pages cannot use the bridge. Local filesystem/content access, mixed content, frames, file uploads and native web permissions are denied. All API reads and messages still require the user's verified Supabase session and existing owner checks. Backup is disabled.

The user explicitly starts a `specialUse` foreground service while the Activity is visible, respecting Android 14–16 foreground start restrictions. A small noninteractive WebView host runs the shared reader while the companion is visible; screen-off pauses it. The foreground notification and overlay can be stopped from the app or notification. Device-specific battery management can still stop it; enabling background operation is a user setting when needed. No battery, boot or background-start exemptions are requested.

## Build and signing

The standalone build uses Android platform 36, build-tools 36.0.0, Eclipse ECJ 3.40.0 and the pinned Supabase JS 2.58.0 UMD bundle. Android build-tools' `core-lambda-stubs.jar` is included on ECJ's boot classpath; D8 desugars the compiled Java. The SDK bundle and all 25 artwork hashes are checked before packaging. The original PNGs remain unchanged.

```sh
python3 build.py \
  --tools /absolute/path/to/build-tools/36.0.0 \
  --platform /absolute/path/to/platforms/android-36/android.jar \
  --compiler /absolute/path/to/ecj-3.40.0.jar \
  --artwork /absolute/path/to/Jane_Desktop_States_25 \
  --supabase /absolute/path/to/supabase-2.58.0.js \
  --signing-store /absolute/private/path/jane-android-release.p12 \
  --output /absolute/path/to/Jane_Companion_Android_v0.1.0.apk
```

Supply the signing password through `JANE_ANDROID_KEY_PASSWORD`, never a command argument or tracked file. The keystore alias is `jane-companion`. Future releases must increment `versionCode`/`versionName` and reuse this release key to install over the app while retaining login, drafts and window settings. The release identity is retained privately outside Git and is never embedded in the APK. Native changes and bundled UI updates currently use a replacement APK, not the Windows signed-core feed.

## Validation

Run `node --test android-companion/tests/mobile-runtime.test.mjs`, the existing `tests/companion-mailbox.test.mjs`, and the Windows cloud/state tests. The new runtime checks bidirectional correspondence, shared state, account isolation, screen-off/resume and in-flight polling races. Existing server checks verify simultaneous devices claim one generation and retain the current limits. Compile/run `tests/NativePolicyTest.java` with `src/app/liminal/jane/NativePolicy.java` to check exact origin/path handling, traversal/host rejection and snap geometry. `build.py` compiles all native code, checks the v2/v3 release signature, alignment, ZIP integrity, asset count and key exclusion.

Browser QA uses a synthetic account and the packaged interface at 360px width, then 320px × 380px to check available height with a keyboard. Composition/held-Enter/Shift-Enter guards and one-send completion are exercised with synthetic input events. No real messages or generation calls are used. Browser checks do not exercise Android WindowManager, device permission screens, an actual IME, launcher routing or vendor battery retention; those still need a physical Android check.
