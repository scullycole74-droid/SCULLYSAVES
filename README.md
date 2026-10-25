# SCULLY v1.1 — October 25, 2026

A noncommercial personal NHL shot-volume and goalie-saves research website. Existing two-stage interface and the original 2025–26 historical research remain intact.

## What changed

- Imported the four MoneyPuck **October 25, 2026, 6:34 AM ET** team-summary tables: all situations, 5-on-5, 5-on-4, and 4-on-5. Each covers **32 teams and 179 completed NHL games**.
- Full-season **team profile inputs** immediately use these newer all-situations totals while more recent complete game logs are absent. This includes reported Corsi %, shot rates, Fenwick and expected-goals context. Two shot-attempt rates are approximated from rounded published percentages, and this is disclosed on the Research page.
- Preserved the original 151 complete game logs through October 20 as a fallback. **Do not misstate the updated 179-game team totals as 179 verified game logs.** Until automatic game-log downloading first succeeds, last-5/10/20 windows and regression training remain based on those 151 games.
- Added an October 25 team-statistics table with all four situations on the Research + Data page.
- Added automatic same-site JSON loading when the browser opens and hourly refresh while open; app validates data and retrains the regression on valid new game logs.
- Added an automated daily GitHub Actions workflow that downloads the official MoneyPuck **game-by-game CSV** linked from <https://moneypuck.com/data.htm>, validates all game/situation rows and commits `data/current-season.json`. Netlify automatically publishes the changes **once Git deployment is linked**.
- Added clear freshness status, failure fallback, sources and methodology notes.

## Important: a ZIP upload alone does **not** enable unattended daily updating

The website's live URL will *not* change simply because this project was edited. For **true automatic daily updates**, the source repository must be linked to the existing Netlify website. The included scheduled workflow then pulls and publishes refreshed data once per day. A drag-and-drop ZIP deploy alone publishes static data once; it does not start the GitHub workflow.

### One-time setup for daily updates (no Terminal or Python required)

1. Create a new GitHub repository for SCULLY, using the GitHub website. Unzip `SCULLY_v1.1_Auto_Update_Source.zip` and upload the **contents** (not the ZIP itself) to its default branch. Include hidden `.github/workflows/daily-moneypuck.yml` (on Mac, `Cmd + Shift + .` toggles hidden files). GitHub supports file uploads; preserve the folders `data/`, `scripts/`, `.github/workflows/`.
2. Open your **existing** Netlify SCULLY project, keeping the same site and address. Go to **Project configuration → Developer settings → Continuous deployment → Repository → Link repository**. Select the SCULLY GitHub repository. Leave the build command blank; the site's `netlify.toml` publishes the repository root (`.`).
3. In GitHub, open **Actions → SCULLY Daily MoneyPuck Data → Run workflow** once. This downloads the latest actual individual NHL game logs, validates them and commits the dataset. A successful commit triggers a Netlify redeploy.
4. Reopen SCULLY and check **Research + Data → Automatic MoneyPuck updates**. It should report game logs at least as recent as October 24, 2026 (179 games), depending on MoneyPuck's last published data. Stage 1 and Stage 2 will then both use updated season-to-date, last-5, last-10 and last-20 game data.
5. Thereafter, the workflow runs daily at **13:30 UTC** (9:30 AM Toronto daylight time / 8:30 AM standard time). Github's scheduler may delay a run; MoneyPuck's own nightly update time may vary. Site always shows the actual latest game-log date; it does not pretend to be live.

**If a scheduled update fails:** GitHub's Actions job reports an error; old verified JSON is not replaced and the website stays functional. You can always use the page's manual CSV upload fallback.

### Quick one-time update without GitHub

`SCULLY_v1.1_Netlify_Manual_Upload.zip` is an optional static package containing the updated site and the four October 25 team-summary tables. It is ready for deployment to the **existing** Netlify site as a manual deploy. It displays the 179-game summaries immediately but its 151-game detailed logs are only complete through October 20. **It will not update every day by itself.** Use the complete source ZIP and steps above to enable daily updates.

## Data accuracy and limitations

- Approved noncommercial download source: <https://moneypuck.com/data.htm>; original team stats page: <https://moneypuck.com/teams.htm>. Credit MoneyPuck. Commercial use requires contacting MoneyPuck for permission.
- Use the complete 2026–27 **regular-season** game-by-game `all_teams.csv`, filtered to `season=2026` and game IDs starting with `202602`. Do not scrape the HTML team table daily.
- Every game must have two matched team entries; all five raw situations (`all`, `5on5`, `5on4`, `4on5`, `other`) are required. A dataset with missing, duplicated or non-finite values is rejected. Team summaries supplied by the user cover four situations but the original per-game source also carries `other`; keep `other` when importing full logs.
- The website's primary matchup research remains based on **all-situations** stats. Historical 2025–26 metrics are frozen. 2026–27 logs refresh; no new historical research conclusions are implied.
- Team shots and goaltender saves are not equivalent. The saves distribution assumes full goalie playing time and remains exploratory; it does not validate betting profitability.
- The daily update path is implemented and tested offline on the original schema (including the 2027 calendar-year rollover), but **live MoneyPuck retrieval and your Netlify/GitHub deployment cannot be tested or activated from this isolated build environment**. The first GitHub Action run is a required live end-to-end check.

## Developer checks

The project uses Python's standard library only; no local user installation is required when GitHub Actions runs it.

- `python scripts/test_update.py` — tests the CSV-to-JSON updater against a generated local fixture from the bundled original dataset, validates snapshot team counts and all 5 game situations.
- `node scripts/test_browser_logic.js` — offline Node sandbox tests the current website's data layer, October 25 summary UI, Stage 1 and Stage 2 output. No browser or network required.
- `python scripts/test_actual_browser.py` — optional Chromium visual and click-through smoke test (requires Playwright/Chromium on the testing computer).
- `python scripts/update_moneypuck.py` — performs one live download and writes validated JSON (intended for GitHub's runner).

Current historical workbook is unchanged; the 2025–26 research is bundled inside `index.html` as before.
