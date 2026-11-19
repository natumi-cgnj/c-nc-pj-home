# Daily calorie allowance and difference

The user's 2026-11-19 request adds optional manual calorie settings to DIET's existing nutrition view. It supersedes the old temporary decision to show only intake/activity totals without a target. No calorie target or basal metabolism is supplied by the app.

- Daily allowance balance = manually set daily intake allowance − logged food/drink intake.
- Daily energy difference = logged intake − manually set daily basal metabolism − logged activity expenditure.
- The existing WeChat step estimate and manually logged exercise remain ordinary burn records, included once. Exercise does not increase the daily intake allowance.
- Positive differences mean surplus, negative differences mean deficit. Unset inputs show `—`, not zero or a guessed value.
- The working day continues to turn at 04:00 Asia/Tokyo, independently of the device timezone.

`calorie_log_db.caloriePlans` is an additive array of `{startDate,dailyBudget,basalKcal,createdAt,updatedAt}`. The newest start date on or before the displayed day applies. Saving on the same effective date edits that stage; a later effective date preserves older days. Either numeric field can stay blank or be cleared. Existing records, period boundaries, unknown fields, storage key, version and cloud sync route stay intact. Opening or rendering the page never initializes or rewrites settings.

The settings form defaults to the displayed day, supports backdating and uses the current working day as its maximum date. Basal input is the daily basal value alone; it excludes step and exercise expenditure. No new nutrition estimates, body-data access, automated calorie advice or character monitoring is introduced.
