# SCULLY change notes

## v1.3 — 2026-10-25 — automatic NHL slate and forward tracker

- Added automatic daily NHL schedule snapshots to the original Stage 1 tab, preserving its manual input mode.
- Added tab 3 performance tracker with forward-only recorded results, actual verified shot thresholds, MAE, bias, breakdowns, running hit rate and daily history.
- Existing Research + Data moved to tab 4; Stage 2 and the original 2025–26 screening research remain unchanged.
- Added an hourly scheduled GitHub Action using NHL schedule/score and official boxscore endpoints. It executes Stage 1's ORIGINAL embedded functions from the HTML in a Node.js VM rather than replicating formulas.
- The 2:00 a.m. America/Toronto slate changes only the display, not the historical tracking database.
- Added data/tracking/season-2026.json initialized empty, no fabricated retrospective performance.
- Added offline validation for duplicates, start-time freezes, output grading, missing data, DST, empty slates and existing website functionality.
- Existing MoneyPuck daily workflow and the newer GitHub data/current-season.json must be preserved at deployment.
- Live NHL API and Netlify/GitHub end-to-end operation are not verified until the user runs the workflow in their connected repository.

## v1.2 — prior release

- Added the historical league-wide home/away shot-volume adjustment to Stage 2 without double counting; preserved the original classification rules.

## v1.1 — prior release

- Added MoneyPuck daily 2026–27 game-log updater, October 25 published summaries, and model diagnostic updates.
