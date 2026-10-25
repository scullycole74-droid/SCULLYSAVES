# SCULLY v1.3 — Automated NHL matchup screening and forward performance tracker

SCULLY is a noncommercial research website for NHL team shot-volume screens and exploratory opposing-goalie saves forecasts. **This release preserves Stage 1, the Stage 2 home/away correction, and the MoneyPuck refresh workflow.** No betting edge or financial return is claimed.

## Live project to update (do not create a new website)

- GitHub repository: `scullycole74-droid/SCULLYSAVES`
- Netlify site: `https://scullysaves.netlify.app/`
- Use **SCULLY_v1.3_SAFE_GitHub_Update.zip** to update an existing deployment. It intentionally does **NOT** contain `data/current-season.json` because your GitHub copy is already refreshed daily; uploading an older copy would roll back your statistics.
- The separate **SCULLY_v1.3_COMPLETE_Source_Archive.zip** is an archival source snapshot and includes old bundled game logs. **Do not replace GitHub's live data/current-season.json with the archived version.**

## Four tabs

1. **Matchup Finder:** automatic NHL slate above the preserved manual matchup textarea. Every game has two independent classifications: which team is most likely to generate shots. Colours, scenarios S01–S10 and original 2025–26 Wilson-CI rule are unchanged.
2. **Goalie Saves Analyzer:** preserved Stage 2 including the fixed 2025–26 ±0.543 home/away adjustment and original odds/goalie input logic. Clicking a scheduled direction transfers attacking team, defending team and actual home team to Stage 2. Note that Stage 2 runs on the *currently loaded* stats, while the tracker separately preserves the pregame projection.
3. **Performance Tracker:** metrics for actual, graded pregame classifications: 25+/30+/35+/40+ hit rates, average actual shots, mean absolute shot forecast error, forecast bias, green versus yellow versus red, cumulative green 35+ trend, date/period filters, and daily archives.
4. **Research + Data:** original 2025–26 research, current-season MoneyPuck imports, update provenance, team situation tables and diagnostics.

## Architecture and live data flow

- Existing `.github/workflows/daily-moneypuck.yml` continues the daily official MoneyPuck CSV download and commits `data/current-season.json`. Source and terms: https://moneypuck.com/data.htm . MoneyPuck data is for permitted noncommercial usage and requires attribution.
- New `.github/workflows/scully-tracker.yml` is a separate hourly GitHub Action. It runs `node scripts/test_tracker.js` and `node scripts/track_games.js` without needing a browser to remain open.
- The tracker requests the NHL **score/date** endpoint (`https://api-web.nhle.com/v1/score/YYYY-MM-DD`) for the active slate and prior pending slates. The official NHL game ID, scheduled start, home/away abbreviations and state determine eligibility. It uses `https://api-web.nhle.com/v1/gamecenter/ID/boxscore` for **verified final** shot totals.
- Crucially, rather than approximating SCULLY's S01–S10 logic in Python, the Node updater **executes the actual original JavaScript functions extracted from `index.html`**. Manual and automated screening share the same original formulas and fixed rule priority. If the source format changes, the updater aborts rather than producing mismatched classifications.
- Predicted team shots (when available) come from the Stage 2 pregame model, trained on only prior-date game logs, with the appropriate venue correction applied exactly once.
- For each shot-generating team, the tracker writes `recordId = NHL game ID + attacking team`, unique within the schedule, including its original classification, scenario, underlying matching rules, projected shots, data-through date, model version, scheduled start and timestamp of first snapshot. A rescheduled game with the same ID receives a **new day-suffixed record**, preserving its prior postponed snapshot. Records are never reconstructed from games that already started.
- After the NHL reports a final game and the boxscore validates the shots, the updater adds actual shots, 25+/30+/35+/40+ results, and grading time without altering original pregame forecasts. Missing, postponements and nonfinal games are excluded from hit-rate denominators until appropriately graded.
- Records and date slates are committed to `data/tracking/season-2026.json` on the existing repository and automatically published by the existing GitHub-to-Netlify connection. Neither browser storage nor manual entry is necessary.
- The website itself uses **2:00 a.m. America/Toronto** for the next display slate, daylight saving time included. This is a display change only; the historical JSON is never reset.
- A newly installed tracker starts forward from its first live execution; it **does not retroactively label** prior 2026–27 games as historical green selections. If the scheduled job misses a pregame window, the missing snapshot is counted as coverage lost and not fabricated later.

## Installation — easiest no-Terminal route

1. Download and **unzip** `SCULLY_v1.3_SAFE_GitHub_Update.zip` on your Mac. Reveal the hidden `.github` folder with **Command + Shift + .** in Finder.
2. In https://github.com/scullycole74-droid/SCULLYSAVES choose **Add file → Upload files** and drag the *contents* of the extracted folder, not the ZIP itself. Keep `index.html` at the repository root and preserve folder paths (`scripts/`, `data/tracking/`, `.github/workflows/`). Commit to `main` with message `SCULLY v1.3 automatic matchup tracking`.
3. **Do not delete or replace** `data/current-season.json`. Also keep the existing `.github/workflows/daily-moneypuck.yml`; the v1.3 patch adds the new tracker workflow alongside it.
4. On GitHub, verify you see **`.github/workflows/scully-tracker.yml`** in the repository (hidden only in macOS Finder, not GitHub). If it was omitted by the browser upload, use **Add file → Create new file**, name it `.github/workflows/scully-tracker.yml`, and paste the content from the same path inside the extracted ZIP.
5. In GitHub, open **Actions → SCULLY Automatic Schedule and Performance Tracker → Run workflow → main → Run workflow**. Expect a green success check and new commits to `data/tracking/season-2026.json` when the slate or results change.
6. Open the existing Netlify site at https://scullysaves.netlify.app/ , refresh with **Command + Shift + R**, and check Tab 1 for recorded automated games and Tab 3 for forward tracking. Tab 3 will be empty until pregame records are captured and finalized; **do not fill that history retroactively**.
7. Check **Actions** again the following day to verify scheduled, unattended runs. GitHub schedules can be delayed; gaps are explicitly marked rather than reconstructed.

### If something fails

- GitHub Action red X: open the workflow run and expand its failed step; the script logs the actual network, schema, data or permission error. The previous historical JSON is not overwritten on failure.
- `git push` permission error: GitHub → repository Settings → Actions → General → Workflow permissions; enable workflow read/write if account policy allows.
- No saved matchup before a game: check Actions run time, MoneyPuck freshness, and whether the game started earlier than the first successful snapshot. Missed predictions are never created after puck drop.
- Netlify 404: the root of the deployed repository must have `index.html`, not a ZIP file. The existing `netlify.toml` publishes `.`.
- MoneyPuck is temporarily stale: the tracker will label any would-be selections **GREY** if the last verified game logs are more than four calendar days old; no stale data is passed off as a current green call.

## How to interpret the dashboard

- A *selection* is a **directed team-game**: BOS shooting against TOR and TOR shooting against BOS count separately.
- Green `35+ %` = verified finalized green selections with actual team SOG >= 35 / verified finalized green selections. Analogous for 25+/30+/40+.
- Projected shot MAE = mean of |pre-game projected shots − verified actual shots| among graded selections where a valid pregame projection exists.
- Forecast bias = mean(projected shots − actual shots); positive means overprediction.
- Red/yellow/grey baselines in Tab 3 are actual tracked directions during the selected period; they do not include unscreened/missed games. Sample sizes and missing coverage matter.
- **Team shots are not goalie saves.** The tracker does not record sportsbook odds or betting returns and is not a profitability report.
- Rankings and output thresholds come from the same original Stage 1 model. The 2025–26 research is frozen and never retrained using 2026–27 outcomes.

## Testing summary

- `node scripts/test_tracker.js` exercises a deterministic *mock* NHL API, not actual historical selections: exact S01–S10 green logic, pregame cutoff, session restart, idempotent grading, shot validations, daypart/DST rollover, no NHL games, network failure, missing source, no backward-created predictions and Stage 2 venue adjustment.
- `python scripts/test_tracker_browser.py` checks the actual rendered 4-tab page with mock records inserted **in memory only** and verifies both existing stages, tracker charts, filters, and Stage 2 navigation.
- Original `node scripts/test_browser_logic.js`, `node scripts/test_venue.js`, `python scripts/test_update.py`, and existing browser smoke tests also pass.
- **Limit:** this build environment cannot make the actual remote NHL/MoneyPuck requests or execute your GitHub workflow or Netlify publication. The first live Actions run and first official finalized game are necessary for end-to-end verification. The release starts with an empty audited record file on purpose.
