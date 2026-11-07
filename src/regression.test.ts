import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrial } from './games';
import { EMPTY_STATE, appendTrial, beginGame, continueSession, createSession, exportPayload, gameSummary, validateImport } from './model';

test('race predictions include an inferable tie answer', () => {
  const trial = createTrial('future-sight', 1, undefined, () => 0);
  assert.equal(trial.scenario, 'race');
  assert.equal(trial.correct, 'Same time');
  assert.ok(trial.options.includes(trial.correct));
});

test('Stroop trials supply the actual ink and a color-independent cue', () => {
  const values = [.5, 0, 0, .5, 0, 0];
  const trial = createTrial('noise-filter', 1, undefined, () => values.shift() ?? 0);
  assert.ok(trial.ink?.startsWith('#'));
  assert.equal(trial.inkLabel, trial.correct);
  assert.notEqual(trial.prompt.toLowerCase(), trial.correct.toLowerCase());
});

test('legacy missed Go responses do not count as accurate or contribute to latency', () => {
  const run = { gameId: 'signal-rush' as const, startedAt: 1, difficulty: 1, trials: [
    { at: 2, correct: true, reactionMs: 400 },
    { at: 3, correct: true, missed: true, reactionMs: 3300 },
    { at: 4, correct: true, condition: 'no-go' },
  ] };
  assert.ok(Math.abs(gameSummary(run).accuracy! - 200 / 3) < 1e-10);
  assert.equal(gameSummary(run).medianMs, 400);
});

test('unfinished games cannot be skipped using Continue', () => {
  const session = beginGame(createSession('daily', 1, 1), 0, 2);
  assert.equal(continueSession(session), session);
});

function savedState() {
  const active = appendTrial(beginGame(createSession('daily', 1, 1), 0, 2), { at: 3, correct: true });
  return { ...structuredClone(EMPTY_STATE), active };
}

test('backup roundtrip preserves trial and elapsed progress and requires explicit resume', () => {
  const state = savedState();
  state.active.games[0].elapsedMs = 3210;
  const imported = validateImport(JSON.parse(JSON.stringify(exportPayload(state))));
  assert.equal(imported?.active?.status, 'paused');
  assert.equal(imported?.active?.games[0].elapsedMs, 3210);
  assert.deepEqual(imported?.active?.games[0].trials, state.active.games[0].trials);
});

test('imports reject invalid active sessions, metrics, level maps and duplicate sessions', () => {
  const invalids: unknown[] = [];
  let state = savedState(); state.active.currentGameIndex = 99; invalids.push(state);
  state = savedState(); state.active.games[0].trials[0].reactionMs = -1; invalids.push(state);
  state = savedState(); state.active.games[0].difficulty = Infinity; invalids.push(state);
  state = savedState(); state.active.games[0].gameId = 'future-sight'; invalids.push(state);
  state = savedState(); state.adaptiveLevels = {} as typeof state.adaptiveLevels; invalids.push(state);
  state = savedState(); state.active.checkIn = { sleepHours: 25 }; invalids.push(state);
  for (const candidate of invalids) assert.equal(validateImport(candidate), null);
  assert.equal(validateImport({ schemaVersion: 2, state: savedState() }), null);
});


test('imports reject duplicate session IDs and active/history collisions', () => {
  const state = savedState();
  const session = { ...state.active, status: 'paused' as const };
  assert.equal(validateImport({ ...state, active: null, sessions: [session, session] }), null);
  assert.equal(validateImport({ ...state, sessions: [session] }), null);
});
