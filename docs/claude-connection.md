# Claude subscription connection trial

The authenticated C-NC page has a fixed connectivity test and an explicit office-dialogue generation action. The latter asks for the existing seated office scene's short status (`s`) and direct dialogue (`m`), using only the repository's static AU reference. It does not send existing ledger, body, character, or conversation records. Opening the homepage or clicking characters never starts a Claude run.

## Office dialogue

Copy the updated worker instructions from the page into the existing Claude cloud task once, retaining its repository and API trigger. Click “生成并用于办公室” to request two lines per character. The worker follows the per-run prompt and returns JSON with `format: cbi-office-lines`, `version: 1`, `scene: office-seated`, and the five `characters` pools. Each line has only `s` and `m`; allowed short statuses are enumerated in `cbi-office-content.mjs`. Stage-direction parentheses, recipient labels, extra descriptions and unsupported postures are rejected.

The callback validates and normalizes a valid batch into the existing run result. Authenticated reads retrieve the newest validated batch for that user, independently of the eight-entry recent-test list. No new table, client database grant, localStorage record, or cloud-sync migration is introduced. Previous prose samples remain test records and are never installed as dialogue.

The homepage loads the saved batch after cloud sign-in and on page return. Existing click handlers prefer it only for present characters in the CBI office; Jane's home/sleep lines and other worlds keep their existing paths. A failed load retains the built-in dialogue. The visual scene and the runtime's whereabouts do not change.

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
