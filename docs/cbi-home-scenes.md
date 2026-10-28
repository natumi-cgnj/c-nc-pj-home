# Jane home scenes

The 1672 × 941 approved clear apartment remains the base. Nineteen native-resolution activity modules cover fourteen awake activities and five sleep poses. They include the corrected sofa-sleep and window-clutter proportions, the approved depthwise shower divider, and one additional bedroom-armchair sleep pose so every existing nightly location has artwork.

Modules are lossless WebP crops. Reconstructing all nineteen morning frames from the base and crops was checked pixel-for-pixel against their source pictures. The added image files total about 0.97 MB; the base is reused. Only the selected activity loads. TV states use separate sofa and screen crops. Four lighting periods are applied after assembly, with window crops behind the crouching head and the active TV screen retained at night. The exterior margin stays white.

`CharacterRuntime` still decides whether Jane is home, away or asleep and retains the existing sleep location, phase, companion and nightmare decisions. The home content module builds a deterministic sequence anchored to waking or returning home. Activity weights, independent duration bands and cooldowns decide the sequence; dialogue batches and refreshes never reroll the current image. Long reading/TV sessions dominate, with quieter choices at night. The sequence continues across midnight until sleep or leaving home interrupts it. The image and click bubble use the same activity ID. Sleep never consumes awake dialogue. The curtain or door sign is the click target for private bathroom states; no body is displayed.

`home_auto` prepares one batch for each Japan-time 06:00 / 11:00 / 17:00 / 22:00 period while a visible home page has an awake Jane. All four spaces are prepared together, so moving or clicking does not launch extra model calls. A cached batch remains usable while another is pending; without a batch, matching built-in lines and all existing actions remain available. Closing the page does not start future periods; already launched routines can finish and persist their results. A successful new batch replaces the current home pool while previous runs remain in history. Home and office pools are separate but share the existing account authentication, run concurrency guard and rate limit.

The saved Claude routine already accepts the `office-lines` content-generation channel and follows its per-run prompt. Home requests deliberately keep that kind for compatibility, add `content_type: home-states`, and request the strictly validated `cbi-home-lines` result format. No routine reconfiguration is required for an already working connection. The updated optional saved-task prompt documents both scene families. Both Edge Function deployments must include `cbi-home-content.mjs` and its `cbi-office-content.mjs` dependency.

New home results use `{format, version, scene, spaces, continuity}` with the continuity from `cbi-current-canon.mjs`; the previous four-field schema remains readable for history. All four spaces and every supported awake activity must be represented. Ordinary entries contain `{activity, m}`. Optional `topic: "case"` is accepted only for `bedroom_read`, `living_read`, `living_tv` and `kitchen_meal`; those reuse the same art with a matching thinking-about-a-case status and line. Ordinary and case lines do not mix. Legacy batches remain readable in history. Current clicks require the shared META/2006 continuity marker; older continuity uses matching built-in text while its replacement runs. Missing case lines also use corresponding built-in text. The prompt requires ordinary coverage and all four case variants without fabricating cases, evidence or unseen props. Statuses come from the fixed catalogue. Wrong-space IDs, sleep IDs, unsupported actions, recipient parentheses, stage directions, extra fields and oversized lines are rejected before replacing a usable batch. No application progress, inventory, financial or world storage schema is changed.

Validation: `node --test tests/cbi-home-states.test.mjs tests/claude-routine.test.mjs tests/cbi-office-lines.test.mjs tests/cbi-scene-lighting.test.js tests/claude-connection.test.js tests/cbi-office-scene.test.js tests/cloud-sync-guard.test.js`.

## Activity rhythm and rest days (2026-10-28)

| Activity | Duration in minutes | Probability / spacing |
| --- | --- | --- |
| Reading / TV | 105–135 / 60–75 / 180–240 | 65% / 15% / 20% duration bands |
| Meal | 30–60 / 65–90 | 80% / 20%; favored around meals; 3h cooldown |
| Shower | 30–60 / 65–90 | 85% / 15%; mostly mornings/evenings; 8h cooldown |
| Brushing / kettle | 15–30 | 6h / 2h cooldown |
| Tea | 30–60 / 65–100 | 70% / 30%; 90min cooldown |
| Wardrobe / bedside | 15–30 / 15–60 | wardrobe 6h cooldown; bedside usually 15–30min |
| Window clutter / manga | 10–25 / 25–90 | 3h cooldown; manga usually 25–50min |
| Fridge / private bathroom | 5–15 / 10–25 | 90min / 3h cooldown |

Cooldowns run from the previous activity's end. Identical activities cannot immediately repeat. Actual availability and sleep take priority over the planned duration. At night long quiet activities carry more weight. Supported activities have a stable 40% case-thinking chance on rest days, 30% on workdays, or 15% at night; this does not start another model request.

Bed poses start with a stable nightly choice, then get an opportunity every randomly selected 180–240 minutes. Each opportunity has a 55% chance to change to a different existing bed pose and a 45% chance to keep it. Sofa/chair sleep each have one approved pose and remain in that pose. Neither pose opportunities nor activity timing alter sleep place, phase, companion or nightmare probabilities.

`CharacterRuntime.getCbiRestCalendar(month)` derives a stable, unsaved monthly calendar: Jane stays home 8–10 irregular days; Cho, Lisbon, Van Pelt and Rigsby each rest four. Exactly two of Van Pelt's and Rigsby's dates overlap each month. The calendar follows the existing 04:00 workday boundary and changes by month, including leap years. Duty previews include a rest row; rest-day office desks show the person's absence without a misleading return ETA. Jane's automatic page choice is home on rest days, while an explicit manual page visit remains possible. Resting people cannot be promoted into the office by the minimum-staff fallback. Explicit calendar duty and selected deployment/returned agents retain manual priority; an unselected person's rest day is preserved. No storage keys or save schema are added.

Current relationship continuity is shared with the office via `cbi-current-canon.mjs` and documented in `docs/cbi-current-continuity.md`. High-dimensional/META context and ten shared years survive the program returning to 2006. Early first-meeting biographies do not determine present-day familiarity. Automatic request IDs also include this continuity revision so a fresh but obsolete batch is replaced once in the same period.

## Shared home dialogue (2026-10-28)

Each awake activity frame selects one utterance deterministically from its matching activity/topic pool, using the shared activity-session key. Devices using the same activity session and batch show the same utterance; clicking or reloading does not reroll it. A later activity session or a newly installed batch can select another utterance. The full pool stays available, and dialogue selection does not affect activity duration or artwork.

While Jane is awake on a visible home page, the client reads the saved batch through `home_lines` at most every 60 seconds between generation periods. This lets an already-open device receive a batch obtained by another device without launching extra model work. Pending tasks retain their four-second polling and the existing 06:00 / 11:00 / 17:00 / 22:00 generation schedule. Failed read-only refreshes retain the current batch and generation deadline. A changed selected utterance closes an already-visible old bubble; the next click displays the new line. Hidden pages and pages where Jane is asleep or absent retain their existing guards.

## Night lighting and sleeping-room lamps (2026-10-29)

CBI map lighting and banner periods use Japan time explicitly, matching the content-generation periods across devices with different local time zones. The CBI banner's period key also uses the Japan date and keeps 22:00–05:59 in one night period. Liminal periods retain their existing local clock. Returning through `pageshow` or making the home document visible invalidates its painted-frame cache and redraws the current lighting.

The home night canvas adds warm light around the existing bedside and TV-console lamps without changing the approved image files. During sleep only Jane's sleeping-room lamp is on: all three bed poses and the bedroom chair use the bedroom lamp; the living-room sofa bed uses the living lamp. An empty home has neither lamp on. Awake night scenes retain both lamps; other periods do not apply this lamp layer. Light stays within the apartment mask and each lamp's room. Window replacements exclude the complete foreground bedside-lamp silhouette and the headboard overlapping the lower-right window corner. Both retain the live room lighting, so the window crop cannot replace half the shade or leave its old always-on lamp glow on the bed when the bedroom lamp is off.
