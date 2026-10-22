# Claude subscription connection trial

The trial sends only the fixed text “请只回复：C-NC 连接测试成功。” from an authenticated C-NC account to a Claude Code cloud task. It stores the returned text as a separate connection test. It does not send existing ledger, body, character, or conversation records.

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

Run `node --test tests/claude-routine.test.mjs tests/claude-connection.test.js tests/cloud-sync-guard.test.js` for authentication, isolation, callback verification, concurrency, timeout behavior, frontend retry handling, and existing storage guards. Confirm anonymous requests to the deployed functions are denied and client database roles have no table privileges before account setup.

Official references:

- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- https://platform.claude.com/docs/en/api/claude-code/routines-fire
- https://code.claude.com/docs/en/routines
