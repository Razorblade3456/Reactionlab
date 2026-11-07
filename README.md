# NeuroSpeed Lab

A local-first cognitive-training experiment built with React, TypeScript, and Vite. It records measurable task performance in this browser; it does not claim to increase neural conduction speed, intelligence, or general brain capacity.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Run `npm run dev` and open the local URL printed by Vite.
4. For a production check, run `npm test` and `npm run build`.

Training history is kept in this browser's IndexedDB. Export JSON regularly if you want a portable backup. Browser/device changes do not sync automatically.

## Deploy free as a static site

Run `npm run build`, then deploy the generated `dist/` directory to a static host such as Netlify Drop, Cloudflare Pages, or GitHub Pages. No server is needed. Each browser keeps its own local database; use JSON export/import to move records between devices.

## Research and measurement notes

The games are original practice tasks inspired by cognitive and visuomotor paradigms. They are not validated clinical tests. Browser scheduling, display refresh, mouse hardware, device load, and input latency affect timing. Compare repeated sessions on the same setup when possible. Keep accuracy and speed measures separate; do not interpret an arbitrary combined score as evidence of general cognitive change.

## Reliability update

The response games now require a center start, use randomized foreperiods, and record stimulus-onset timestamps alongside reaction times. Missed responses are errors, including when recalculating legacy records. Stroop trials display their assigned ink color with a written accessibility cue. Tied races have a “Same time” answer. Tracking click timings are omitted because continuous tracking has no discrete stimulus onset.

Switching tabs pauses training. Reloading or importing a backup leaves unfinished sessions paused until explicitly resumed. Starting another session cannot overwrite an unfinished one. CSV exports include the active session as well as completed sessions. Backup validation checks ordered games, trial values, progress, difficulty maps, and check-ins before accepting data.

Run `npm test` for the model and game regression suite; run `npm run build` for the production bundle. The stylesheet uses system fonts and the app requires no third-party font requests.
