# NeuroSpeed Lab

A local-first cognitive-training experiment built with React, TypeScript, and Vite. It records measurable task performance in this browser; it does not claim to increase neural conduction speed, intelligence, or general brain capacity.

## Run locally

1. Install Node.js 22 (also specified in `.nvmrc`).
2. In this folder, run `npm ci --include=dev`.
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


## Automatic Netlify deployment

Connect this GitHub repository to the existing Netlify site. The committed `netlify.toml` uses the repository root, Node.js 22, a clean `npm ci --include=dev` followed by `npm run build`, and publishes `dist`. The clean install intentionally replaces any stale dependency cache before building. TypeScript and Vite remain normal development dependencies; `.npmrc` and Netlify flags explicitly include them even when `NODE_ENV=production`.

Commit source, configuration, and `package-lock.json`. Do not commit `node_modules/`, `dist/`, or `*.tsbuildinfo`: Windows-generated npm shims are regular non-executable files in a Linux checkout, and Windows native binaries cannot run on Netlify. npm recreates the correct executable links and platform binaries during installation. Do not fix this with `chmod` or by committing installed dependencies again.

The Production build workflow runs on Ubuntu for pushes and pull requests. It rejects tracked generated files, performs a clean install, checks the Linux compiler/bundler executables, runs tests, and verifies the production output. Netlify's Git connection deploys pushes independently; inspect the Netlify deploy status for the same commit to confirm publication.

For local verification: `npm ci --include=dev`, `npm test`, then `npm run build`. Application code and IndexedDB storage are unaffected by these deployment settings. Keep the same site origin to retain access to existing browser history.
