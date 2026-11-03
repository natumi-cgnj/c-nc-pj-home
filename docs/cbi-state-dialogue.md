# State-driven CBI dialogue — 2026-11-03

The homepage determines each present character's state first. Claude receives only the current state sessions, their duration-dependent line budgets and the authenticated account's saved Sacramento story context. Office and home no longer generate evenly sized batches at four fixed times. Other world vignette pages keep their existing schedule.

`cbi-state-content.mjs` is shared between the browser and Edge Functions. Its office catalogue contains 33 seated states, with character-specific availability, weights, durations and cooldowns. Each person's sequence is deterministic and independent, anchored to actual arrival or return. The existing runtime still decides presence, field work, errands, days off and sleep. Finished field/errand blocks and saved manual deployment returns create a short return state; return states never appear as arbitrary random work. The next absence/departure clips the current office session. All states fit the installed seated art.

| State family | Typical planned duration | Lines per state |
| --- | --- | --- |
| Focused work, reports, extended case study | 45–120 minutes | 2–4 |
| Checking/sorting and medium actions | 25–44 minutes | 2–3 |
| Short breaks and small actions | 10–24 minutes | 1–2 |
| Arrival and actual field/errand return | 5–18 minutes | 1–2 |
| Very brief actions and private bathroom responses | Varies by existing action | 1 |

Home actions retain their existing weighted sequence, cooldowns, images, case-thinking variants and duration bands. State keys include the existing action session and topic. Sleep never generates dialogue and remains restricted to the bedroom bed or living-room sofa bed. Home state weights and keys use Japan time across host time zones.

`cbi-state-lines.js` replaces the old office/home period clients in the homepage and connection page. It checks state boundaries locally and requests `state_auto` only for new/missing sessions. The server recomputes allowed states and line budgets from validated timing/presence context; caller-supplied labels, activity IDs or prompts are not accepted. Present office members can be batched in one run, but already cached ongoing states are reused. Reloads and multiple devices deduplicate by account, story revision and missing session keys. Hidden/empty scenes and sleeping/absent Jane do not start work. Clicks do not invoke Claude.

Within a long state, `sessionLine` rotates through the returned lines in shared 3–12 minute windows. Two devices with the same state, time and batch select the same utterance. New state pools, changed story revisions, account changes and absence close obsolete bubbles. While a new result is pending or unavailable, each current state has a matching built-in response; an old state's lines are never borrowed.

The existing configured routine still uses the accepted `office-lines` worker channel, with `content_type: state-lines`. Per-run instructions specify `cbi-state-lines`, the exact current actor/state/session keys, permitted line count and current saved world snapshot. The worker returns only direct lines. It does not choose state, duration, presence or sleep and does not advance canon. Existing saved-task setup does not need another account or connection.

Results use `{format, version, scene, continuity, canon_revision, states}`, where each state contains `{key, character, state, lines}`. Callbacks bind scene, actor, state, session keys, story revision and line budgets to the pending run. A late valid result remains historical and cannot replace another active session. Legacy office/home/world formats remain readable. All results reuse the existing server-only `claude_routine_runs` table; no application save, grant or schema migration is added.

The cache lookup is scoped to the authenticated account, canonical state format and requested current session keys, then filters the story revision. It does not depend on the most recent batch alone. The bridge keeps one active run per account and queues starts after six starts in fifteen minutes; ordinary connection tests and legacy/world routes retain their existing limit. Pending runs poll every four seconds and expire after fifteen minutes. Ambiguous and failed starts do not repeatedly fire the same session request.

The connection page's manual update targets only the office members currently present; an empty office reports that there is no state to generate. Returned state lines are shown as saved records. Office/home history and other world vignettes remain separate.

Validation: `node --experimental-vm-modules --test tests/cbi-state-lines.test.mjs tests/claude-routine.test.mjs tests/claude-connection.test.js tests/cbi-scene-first-frame.test.mjs`. Existing home sleep, timing and lighting checks also apply. Binary artwork is unchanged.
