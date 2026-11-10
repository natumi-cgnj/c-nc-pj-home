# Jane Companion

Windows companion for the existing C-NC app. It displays the approved transparent artwork in a frameless, always-on-top Electron window. Single-click to see the current state and dialogue, drag to move, double-click to open the existing app, right-click for size/visibility and update controls. Windows forwards mouse moves while the transparent pixels let clicks pass through.

## Build

Requires Node 22.12+ and the approved `Jane_Desktop_States_25` artwork folder, available in the previous artwork download. PNGs are embedded in the desktop package and deliberately excluded from Git. The tracked manifest checks every image checksum before packaging.

```sh
cd desktop-companion
npm ci
npm test
node build.mjs win32 /absolute/path/to/Jane_Desktop_States_25
node verify-package.mjs
python3 package-windows.py "out/Jane Companion-win32-x64" /absolute/path/Jane_Companion_Windows_x64_v0.1.5.zip
```

The portable output is `out/Jane Companion-win32-x64/`. Keep the whole directory together. The staging app can be launched with `npm start` after building. A development-only `JANE_COMPANION_DEV_URL=http://127.0.0.1:PORT/` override is accepted only for an unpackaged application; the packaged binary always opens the production origin.

## Open the installed app

The first double-click offers local Desktop and Start Menu shortcuts. Select the existing Liminal Space entrance once; subsequent double-clicks launch that same `.lnk` through `shell.openPath`. The original shortcut keeps its browser app ID, profile arguments and login context. Right-click → `双击打开` changes the entrance. Other shortcut folders and independent `.exe` programs are supported. The default browser is used only after the user explicitly chooses `使用网页版本`; a missing or failing installed entrance never silently falls back to the website.

Shortcut discovery stays local, skips symlinks and has a bounded scan. Native menu callbacks alone choose the saved path. The renderer's open IPC ignores all arguments and cannot set a program path. We deliberately select `.lnk` files from directory listings rather than the Windows file picker, which may resolve a PWA shortcut to a browser proxy and discard its arguments. The executable picker rejects bare browser executables/proxies. Program choice, window preferences, app name and authentication partition remain stable across updates.

Use `package-windows.py` for the download ZIP. It writes explicit directory entries and ordinary DOS file attributes, uses ASCII paths (`使用说明.txt` becomes `README.txt`), and avoids inherited Unix modes, extra fields, encryption and ZIP64. It checks paths, name collisions, entry flags and CRC before replacing the output. This is a compatibility measure; it does not diagnose or alter the user's local download/destination permissions. To validate a download, extract it into a fresh directory with an independent extractor and run `verify-package.mjs` on that extracted app.

## State and login

The native shell loads `jane-companion.html` from the existing GitHub Pages site. A sandboxed preload exposes only manifest/artwork reads, validated window operations and a no-argument open action for the locally selected app (or the fixed original-app URL in explicit browser mode). It denies child frames, navigation outside the companion/login paths, new windows, downloads and permissions. Images are loaded by manifest ID, never an arbitrary path.

An isolated persistent Electron profile shares the existing `login.html` between the pet and its login window. The successful redirect is intercepted before the original app loads. No credentials are supplied by this repository. The public Supabase publishable key is the same one used by the existing app; authorization remains Supabase Auth and row-level security.

The reader selects only `schedule_packs`, `schedule_user_events` and `cbi_db` from the signed-in owner's `user_state` rows. These raw inputs and an owner-scoped cache live only in the companion profile. The shared runtime definitions and deterministic selectors calculate activity locally. `CharacterRuntime.init`, the main app's cloud-sync layer, rewards, wallets, migrations and the original main-page Claude auto-generation are never initialized. The separate mailbox starts only its own companion tasks. Legacy schedule normalization may write to the isolated local copy; the companion never uploads application state. Account changes discard the previous user's inputs and ignore stale network responses.

Cloud reads repeat every 60 seconds. Activity boundaries are checked at least every 15 seconds, with additional refreshes on reconnect/resume. The main browser page need not remain open. Offline cached state is marked; without a verified account/cache, the companion asks to connect instead of asserting a live status.

## Click to see status and dialogue

A single click opens a small speech panel; a double-click cancels it and opens the selected installed app. Dragging cancels a pending single click. Closing the panel, pressing Esc or leaving it idle hides it. The native window grows above the character so the artwork remains anchored and transparent pixels still pass clicks through.

The panel reads the existing `claude-bridge` `state_lines` action and validates its revision, session, scene, continuity and line count. It uses the same timed line selector as the original app. It never requests dialogue generation. With no current pool or no connection, it uses the shared state fallback. Sleeping shows status only; being away shows status and the remaining estimate. Account switches discard cached dialogue and pending results.

Core 0.1.5 anchors the artwork by its centre and bottom edge independently of its panels, so Jane can touch either monitor edge even with text open. Speech stays above the character, uses the same width as the artwork and wraps naturally; panels shift inward within the work area instead of pushing the character away from an edge. The side tags form a column: `留言` above the status, with the status bottom aligned to the artwork. Right-click → `显示状态／留言` chooses whether that column remains visible, and the choice survives restart. Incidental hovering does not change visibility or show a native title tooltip. Artwork, speech text/padding and mailbox controls still share one scene scale, including on DPI-scaled and negative-coordinate displays. Hidden tags do not reserve extra window width. The page retains the 0.1.4 layout protocol while an older core awaits online update; older hosted/offline pages retain their original inset layout.

## Correspondence (0.1.3)

The `留言` button opens an account-scoped mailbox. Messages are saved before the existing asynchronous Claude subscription routine is started; sleeping/away Jane defers replies. Completed replies persist, show unread badges, and can include the current state, conversation history and a bounded selection of shared new diet, six-ledger and SUITCASE records. Read [the mailbox specification](../docs/jane-companion-mailbox.md) for queue, context and privacy boundaries. The original CBI CHAT and application state remain separate.

Enter sends the current message; Shift+Enter inserts a new line. IME composition and candidate-confirmation keys do not send, and holding Enter cannot repeat-send a message. The send button and existing Ctrl/Cmd+Enter shortcuts remain available. This keyboard change is a hosted UI update; the native core stays at 0.1.5.

Existing 0.1.2 installations install the 0.1.3 core from `检查在线更新` → `更新并重启`, without downloading another full package. The hosted UI waits for the new native capability before starting automatic mail tasks. The Windows executable's bundled base version remains 0.1.2; the native manifest/update dialog reports the active core version.

The current 0.1.5 layout release is delivered through that same signed online update, from 0.1.2, 0.1.3 or 0.1.4. Clicking the character always opens status/dialogue; the dedicated side button opens correspondence. Selecting a control cancels any pending character single click, so a quickly opened mailbox stays open. The existing 0.1.2 full download remains a valid upgrade entrance and has not been rebuilt for this release.

Each signed core bundle includes all eight current core files, rather than a delta from the previous version. Install only the latest offered version; intermediate releases are not required. The hosted page then loads the latest interface, including Enter-to-send, while retaining previous layout and interaction improvements.

## Online updates (0.1.2+)

One initial replacement of the old portable package is required. Hosted HTML/CSS/dialogue changes then refresh automatically while the pet is idle (checked every five minutes). Core changes use a fixed HTTPS feed, `desktop-companion-update.json`, checked shortly after startup, every six hours and from the native `检查在线更新` menu. The user chooses `更新并重启`; their login profile, position and installed-app entrance remain in the existing user-data directory.

The immutable bootstrap verifies Ed25519 signatures against the bundled public key and verifies each SHA-256 checksum. A strict eight-file whitelist, 1 MiB limit and minimum shell version bound the update. It stages a new core in user data, changes an atomic pointer and relaunches. Every startup verifies installed bytes; a failed boot or modified core falls back to the previous healthy core or the bundled one. No renderer can supply a feed URL, signing key, program path or executable update payload. The bootstrap, updater, public key, Electron runtime and artwork are deliberately outside the small-core update format; changing these still requires a new full package.

After the final build, publish the matching signed feed with the source:

```sh
node make-update.mjs /absolute/private/path/Jane_Companion_Update_Signing_Private_Key.pem
```

The Ed25519 private signing key must be retained privately outside the repository. Never commit it, embed it in a download, or replace the pinned public key casually: existing installations need that exact key to verify future small-core updates. `make-update.mjs` self-verifies with the tracked public key and fails on a mismatch. The feed is versioned from `package.json`; bump the package version for a new core release. Approved images are already embedded and are not re-downloaded by the updater.

## Validation limits

Node tests cover a month of real-runtime state comparisons, art mapping, sleep poses, read-only cloud selection, account races, cache handling, hit testing, IPC origin/frame checks, login redirect, dragging installed-app launching, speech/drag/double-click separation, dialogue account races, signed update staging and rollback. Browser QA uses an isolated fake account and the actual artwork. The Windows x64 package is cross-built and inspected; Windows-native shortcut activation, window focus and update/relaunch still require checking on the user's computer. This build is unsigned.
