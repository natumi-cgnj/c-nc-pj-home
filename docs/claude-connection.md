# Claude subscription connection trial

The authenticated C-NC page has a fixed connectivity test and office-dialogue generation. Opening a visible CBI office with at least one member present automatically prepares the current period's short status (`s`) and direct dialogue (`m`), using the current account's saved Sacramento story context plus repository fallbacks. User-authorized world canon and opted-in story entries are supplied in the per-run prompt. Only the CBI story columns (historical personnel, timeline and case narrative) supplement Sacramento; ledger, body, runtime and conversation records are excluded. Character clicks use saved content and never start a Claude run.

## Office dialogue

Copy the worker instructions from the page into the existing Claude cloud task once, retaining its repository and API trigger. After this initial setup, normal office use prepares four lines per character automatically; “立即更新” remains an optional manual refresh. The worker follows the per-run prompt and returns JSON with `format: cbi-office-lines`, `version: 1`, `scene: office-seated`, and the five `characters` pools. Each line has only `s` and `m`; allowed short statuses are enumerated in `cbi-office-content.mjs`. Stage-direction parentheses, recipient labels, extra descriptions and unsupported postures are rejected.

The callback validates and normalizes a valid batch into the existing run result. Authenticated reads retrieve the newest validated batch for that user, independently of the eight-entry recent-test list. No new table, client database grant, localStorage record, or cloud-sync migration is introduced. Previous prose samples remain test records and are never installed as dialogue.

The homepage loads the saved batch after cloud sign-in and on page return. When the office is visible and someone is present, `office_auto` ensures one batch per Japan-time period (06:00, 11:00, 17:00, 22:00). The night remains one period across midnight and 04:00. A server-derived request ID scoped to the account and period deduplicates reloads, devices and uncertain starts; a sufficiently recent manually generated batch also satisfies that period. Failed or expired automatic starts are not blindly repeated in the same period.

The page checks a pending run every four seconds and installs the callback result without navigation. Once ready, a local timer checks for the next period without polling the server each minute. Hidden pages and empty offices do not start new automatic work. A cloud task already launched continues after the page closes; new periods begin on office entry or while the visible office remains open, rather than from a separate always-on scheduler.

Existing click handlers prefer the saved batch only for present characters in the CBI office; Jane's home/sleep lines and other worlds keep their existing paths. Old dialogue remains available while a new batch runs or a load fails. The visual scene and the runtime's whereabouts do not change.

## What runs where

- `claude.html` uses the current C-NC Supabase login and `CloudSync.invokeFunction`.
- `claude-bridge` validates that session with Supabase Auth, stores the routine's dedicated URL/token on the server, and fires one cloud task per request ID.
- The Claude task runs the checked-in `tools/claude-routine-result.py` helper to POST the result back.
- `claude-result` accepts only an unexpired, 256-bit credential scoped to that run. Only its hash is stored. Results and status are returned through the authenticated bridge.
- The two database tables have RLS enabled and no client grants or client policies. Only the server service role accesses them. Every bridge lookup includes the verified user ID.

## Set up the Claude task

1. Sign into the existing Pro account at `https://claude.ai/code/routines`.
2. Create a Claude Code cloud task with the `natumi-cgnj/c-nc-pj-home` repository and an **API** trigger. No schedule is needed.
3. Paste the task instructions copied from the C-NC connection page.
4. In the task environment, allow outbound HTTPS to `lbxjshaiffklmalcxiif.supabase.co` for result delivery. The standard repository tools include Python; the helper has no third-party dependencies.
5. Copy the API trigger's Fire URL and Token directly into the authenticated C-NC connection page. Do not put them into this public repository, a chat, or frontend/local-storage configuration.
6. Save, then send the connection test. The page shows the returned text or an actionable failure, plus the Claude session URL when provided.

## Server deployment

Home scenes also reuse this connection without another saved-task setup. A visible home with an awake Jane calls `home_auto` once per period, preparing all four spaces together. Results use `cbi-home-lines`, remain separate from office lines, and are validated against the installed art catalogue. Ordinary home entries keep `{activity,m}`; the optional `topic: "case"` variant is limited to existing reading/TV/meal images and remains compatible with older batches. Activity duration is independent of the four-period cloud refresh. Home requests retain the already accepted `office-lines` worker kind for compatibility with existing routines; the per-run prompt selects the home result schema. See `cbi-home-scenes.md`. Include both root content modules when deploying the bridge and result functions.

Apply `supabase/claude-bridge-schema.sql` as migration `add_claude_routine_bridge`. Deploy the two function entrypoints plus their relative `_shared/claude-routine.mjs` dependency. The entrypoints use the runtime's `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optional `SUPABASE_ANON_KEY` values; there are no third-party packages or frontend service keys.

Both functions use `verify_jwt = false` because they perform their own authentication: the bridge validates the user's bearer token through Supabase Auth, and the callback validates its expiring per-run credential. Anonymous requests cannot configure, start, or read tests.

The bridge accepts only the official `https://api.anthropic.com/v1/claude_code/routines/trig_…/fire` URL and never follows redirects. It makes exactly one external attempt. A timeout or ambiguous upstream response remains pending rather than automatically firing again. A unique request ID and one-active-run-per-user index protect against concurrent submissions. There are at most three explicit test starts per user per fifteen minutes; a pending run expires after fifteen minutes.

The Claude API is experimental. Cloud runs are asynchronous. A successful trigger alone is not a successful test: C-NC marks success only after receiving an authenticated callback. The account-specific end-to-end test still requires the subscriber's own Claude sign-in and task setup.

## Validation

Run `node --test tests/claude-routine.test.mjs tests/claude-connection.test.js tests/cbi-office-lines.test.mjs tests/cbi-office-scene.test.js tests/cloud-sync-guard.test.js` for authentication, isolation, callback verification, content validation, homepage click rendering, concurrency, timeout behavior, frontend retry handling, and existing storage guards. Confirm anonymous requests to the deployed functions are denied and client database roles have no table privileges before account setup.

Official references:

- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- https://platform.claude.com/docs/en/api/claude-code/routines-fire
- https://code.claude.com/docs/en/routines

Current dialogue also includes `continuity: "meta-2006-ten-years-v1"`. Both prompts embed the same current META/2006 relationship context, including ten shared years; `cbi-data.js` early biographies remain historical. Old structured batches can be read as history but are filtered out of active clicks. Automatic deduplication includes continuity, allowing one corrective batch within an existing period while preserving the active-run guard and rate limit. Include `cbi-current-canon.mjs` with both content modules in each function deployment. The existing saved task still works because the per-run prompt specifies this context and format.


## Editable world archives

WORLD FILES now opens `world-files.html`. The five stable IDs match the diet/ledger stages: `meta`, `sacramento`, `palace`, `fox`, and `heist`. Display titles follow existing stage titles. This archive selection is independent of the homepage's `liminal`/`cbi` scene selection; the Liminal chapter save is retained separately. The Claude connection shortcut moved from DIET into WORLD FILES.

`jane_world_files_v1` uses the existing account-scoped `user_state` sync and history protection. Editors save canon and story entries, including an explicit include-in-generation flag and reversible removal. `CloudSync.syncKey` flushes only the requested page-owned key, propagates write failures, and retains the existing compare-and-swap protection. Save confirmation checks `archive_revision` from the authenticated bridge; a temporarily unsynced auxiliary CBI history must not falsely invalidate the world archive's successful save.

The bridge reads saved records server-side by the authenticated user, selects one world, and hashes a canonical snapshot. `canon_revision` binds new batches to that snapshot. `story_context` reports archive/context revisions without returning story bodies; `world_lines` reads the latest validated world batch; `world_generate` explicitly starts a new vignette; `world_auto` prepares one batch per visible world's existing Japan-time period. Empty new worlds skip generation. Existing configured workers retain the `office-lines` channel with per-request `content_type: world-lines`; no task reconfiguration is required.

Saved-story reads forward the verified caller's bearer token to `user_state` for only `jane_world_files_v1` and `cbi_db`, with the owner ID obtained from Supabase Auth. These reads use the account's existing authenticated grants and RLS; the routine service identity has no `SELECT` grant on `user_state` in this project. A missing caller token fails closed rather than falling back to that identity. The token stays within the current request and is never stored, returned, or included in a Claude payload. Connection credentials and routine rows retain their original server-only access. No database grants or RLS policies need changing for story generation.

Office and home prompts include saved Sacramento context and its revision. A revised archive may trigger one replacement within the same period; old results remain in history and are marked stale for active display. The automatic request namespace contains account, world/type, period and context revision. A pending run's `result` stores a small `c-nc-generation-context` binding (type/world/revision only), hidden by `publicRun` until completion. Callback verification rejects a different result type, world, or revision before installation. Completed results overwrite the pending binding. No schema change or client grant is added.

Diet and ledger world views display their own saved vignette, alongside existing static ledger tasks. Visible pages prepare batches; hidden views do not start model work. WORLD FILES can generate explicitly, and a generated vignette becomes canonical only when the user saves it into the story archive. The global one-active-run guard, three-starts-per-fifteen-minutes limit, callback expiry and original office/home image and timing constraints remain in force.
