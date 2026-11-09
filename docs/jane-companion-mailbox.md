# Jane desktop correspondence

Version 0.1.3 adds a separate desktop mailbox. The existing CBI CHAT remains the authored, state-triggered narrative system described in D-080. Mail never changes application state, character schedules or saved world canon.

## Use and delivery

An installed 0.1.2 companion receives this release through `检查在线更新` → `更新并重启`; no new ZIP, image download, runtime, login or routine credential is needed. The existing signed-core update format and pinned key are unchanged. The new core advertises `messageInset: 360`, expands the window above the character for the panel, and retains the resting location across close, drag and restart. Narrow artwork gets a usable 300px panel. Whole-pixel center offsets avoid repeated one-pixel drift. The core version in the initial URL bypasses stale HTML after restart.

The hosted page shows a small `留言` button, a scrolling history and a text box. A message saves on the server before attempting a Claude task. Sleeping/away Jane leaves it queued; when the companion is running and he is available, the existing subscription routine prepares a reply. An already started task can finish while the pet is closed. Queued work starts when a running pet checks again, not from a new always-on background scheduler. Incoming replies add an unread badge; a single character click opens unread mail, otherwise it retains the existing state/speech panel. Double-click still opens the selected installed application.

The client checks pending mail every five seconds, idle mail once a minute. Draft text, uncertain-send request IDs and the read marker remain local and account-scoped; accepted messages/replies persist on the server. Reloads and uncertain HTTP results reuse the same message ID, so retries cannot silently create duplicate paid tasks. Failed or expired runs remain visible and may be explicitly resent as a new message. An automatic or ambiguous task is never blindly refired.

Older cores keep status/speech working and show an update hint when the mailbox button is clicked. They do not start automatic companion tasks until the upgraded native capability is available.

## Model context and frequency

The existing configured `office-lines` routine channel carries `content_type: companion-message`, preserving saved worker compatibility. A per-run prompt specifies the new result schema. It includes current saved Sacramento canon, ten-year continuity, Milo's male identity, the current deterministic Jane state, up to fourteen completed exchanges and a bounded snapshot of recent shared records. It does not create a new Messages API account or use a new credential.

Only the new diet `calorie_log_db`, all six `wallet_accounts_v1.expenseBooks`, and SUITCASE cleanup/brought records are selected. The snapshot covers at most 24 records within the previous seven working days; the date boundary remains 04:00 JST. It excludes legacy diet, assets/balances, body logs, photos and unrelated private columns. The server reads with the verified caller bearer token and existing RLS, never the routine service identity. Account IDs supplied by the client are only compared against the verified identity, never trusted as authorization.

Shared records are framed as material Milo deliberately shared in this correspondence, not as Jane gaining screen-reading or general access to private information. The prompt distinguishes a log date from when an event just happened, does not equate missing logs with not eating, and disallows invented details, spending/calorie judgment and supervisory reminders. Jane responds in his existing light, clever voice, without narrating Milo's actions or resetting the established relationship. Model output is text-only and bound to the owner, message, canon revision and a whitelist of record fingerprints.

Automatic letters are at least 45 minutes apart and at most eight in 24 hours, and pause for at least 30 minutes after any correspondence. Only records actually referenced by a validated reply enter the mentioned-key set; later automatic letters omit those records. State-only greetings also deduplicate by session/time bucket. Manual messages take priority over automatic letters and share the original global one-active-run gate and six-starts-per-fifteen-minute budget. These are initial implementation defaults, not new world rules.

## Backend and validation

`jane_companion_messages` is a new dedicated server-only table. RLS is enabled, client/PUBLIC grants are revoked, and every Edge Function read/update scopes `user_id` from Supabase Auth. Existing records, schemas, grants and sync formats remain unchanged. Apply `supabase/companion-messages-schema.sql` and deploy both function entrypoints with `claude-companion.mjs`, `jane-companion-content.mjs` and their existing content dependencies. Deploy callback support before the bridge. Both functions retain their existing `verify_jwt: false` with in-function bearer/run-token authentication.

Tests cover queued-to-running-to-completed delivery, sleeping/away deferral, account and callback isolation, matching canon/record bindings, concurrent claims, ambiguous starts, expiry, deduplication, record selection, uncertain drafts, account ABA races, and the native panel's resting position. Browser QA uses only a fake account and fake delayed replies. Windows-native focus/relaunch and the subscriber's actual Claude callback are not exercised by the isolated preview.
