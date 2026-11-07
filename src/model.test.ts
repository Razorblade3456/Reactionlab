import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_STATE, GAME_SEQUENCE, appendTrial, assessmentDue, beginGame, continueSession, createSession,
  finishGame, gameSummary, sessionProgress, validateImport,
} from './model';

test('session transitions preserve the fixed five-game order and finish after game five', () => {
  let session = createSession('daily', 1, 1000);
  for (const [index, game] of GAME_SEQUENCE.entries()) {
    session = { ...session, currentGameIndex: index };
    session = beginGame(session, index, 1100 + index);
    session = appendTrial(session, { at: 1200 + index, correct: true, reactionMs: 500 });
    session = finishGame(session, 1300 + index);
    if (index < 4) session = continueSession(session, 1400 + index);
    else session = continueSession(session, 1400 + index);
    assert.equal(game.id, GAME_SEQUENCE[index].id);
  }
  assert.equal(session.status, 'complete');
  assert.equal(session.games.length, 5);
  assert.equal(session.currentGameIndex, 5);
});

test('metrics calculate median, accuracy, variability, misses and switch cost from raw trials', () => {
  const session = beginGame({ ...createSession('daily', 1, 0), currentGameIndex: 1 }, 1, 1);
  const withTrials = [100, 200, 300, 400, 500].reduce((current, reactionMs, i) => appendTrial(current, {
    at: i, correct: i < 4, reactionMs, switched: i === 0 || i === 2,
  }), appendTrial(session, { at: 8, correct: false, missed: true, switched: false }));
  const summary = gameSummary(withTrials.games[0]);
  assert.equal(summary.missed, 1);
  assert.equal(summary.attempts, 6);
  assert.equal(Math.round(summary.accuracy ?? 0), 67);
  assert.equal(summary.medianMs, 250);
  assert.equal(summary.switchCostMs, -100);
  assert.ok(summary.variabilityMs !== null && summary.variabilityMs > 0);
});

test('training progress is based on completed games and does not invent a score', () => {
  let session = createSession('daily', 1, 0);
  assert.equal(sessionProgress(session), 0);
  session = beginGame(session, 0, 1);
  assert.ok(Math.abs(sessionProgress(session) - 0.07) < 1e-10);
  session = finishGame(session, 2);
  session = continueSession(session, 3);
  assert.equal(sessionProgress(session), 0.2);
});

test('weekly assessments are due separately from daily training and imports reject malformed records', () => {
  assert.equal(assessmentDue([]), true);
  assert.equal(assessmentDue([{ ...createSession('assessment', 1), status: 'complete' }], 1), false);
  assert.equal(validateImport({ ...EMPTY_STATE, sessions: [{ id: 2 }] }), null);
  assert.equal(validateImport({ app: 'NeuroSpeed Lab', schemaVersion: 1, state: EMPTY_STATE })?.version, 1);
});
