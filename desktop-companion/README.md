# Jane Companion

Windows companion for the existing C-NC app. It displays the approved transparent artwork in a frameless, always-on-top Electron window. Drag to move, double-click to open the existing app, right-click for size/visibility controls. Windows forwards mouse moves while the transparent pixels let clicks pass through.

## Build

Requires Node 22.12+ and the approved `Jane_Desktop_States_25` artwork folder, available in the previous artwork download. PNGs are embedded in the desktop package and deliberately excluded from Git. The tracked manifest checks every image checksum before packaging.

```sh
cd desktop-companion
npm ci
npm test
node build.mjs win32 /absolute/path/to/Jane_Desktop_States_25
node verify-package.mjs
```

The portable output is `out/Jane Companion-win32-x64/`. Keep the whole directory together. The staging app can be launched with `npm start` after building. A development-only `JANE_COMPANION_DEV_URL=http://127.0.0.1:PORT/` override is accepted only for an unpackaged application; the packaged binary always opens the production origin.

## State and login

The native shell loads `jane-companion.html` from the existing GitHub Pages site. A sandboxed preload exposes only manifest/artwork reads, validated window operations and a fixed original-app URL. It denies child frames, navigation outside the companion/login paths, new windows, downloads and permissions. Images are loaded by manifest ID, never an arbitrary path.

An isolated persistent Electron profile shares the existing `login.html` between the pet and its login window. The successful redirect is intercepted before the original app loads. No credentials are supplied by this repository. The public Supabase publishable key is the same one used by the existing app; authorization remains Supabase Auth and row-level security.

The reader selects only `schedule_packs`, `schedule_user_events` and `cbi_db` from the signed-in owner's `user_state` rows. These raw inputs and an owner-scoped cache live only in the companion profile. The shared runtime definitions and deterministic selectors calculate activity locally. `CharacterRuntime.init`, the main app's cloud-sync layer, rewards, wallets, migrations and Claude generation are never initialized. Legacy schedule normalization may write to the isolated local copy; the companion never uploads application state. Account changes discard the previous user's inputs and ignore stale network responses.

Cloud reads repeat every 60 seconds. Activity boundaries are checked at least every 15 seconds, with additional refreshes on reconnect/resume. The main browser page need not remain open. Offline cached state is marked; without a verified account/cache, the companion asks to connect instead of asserting a live status.

## Validation limits

Node tests cover a month of real-runtime state comparisons, art mapping, sleep poses, read-only cloud selection, account races, cache handling, hit testing, IPC origin/frame checks, login redirect and dragging. Browser QA uses an isolated fake account and the actual artwork. The Windows x64 package is cross-built and inspected; Windows-native click-through/DPI behavior and the user's real login still require a first run on Windows. This initial build is unsigned.
