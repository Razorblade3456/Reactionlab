export const GAME_SEQUENCE = [
  { id: 'neural-track', name: 'Neural Track', focus: 'Visual–motor coordination', duration: 5 * 60, number: '01', color: '#69d8d1' },
  { id: 'signal-rush', name: 'Signal Rush', focus: 'Choice reaction', duration: 5 * 60, number: '02', color: '#8fb5ff' },
  { id: 'noise-filter', name: 'Noise Filter', focus: 'Selective attention', duration: 5 * 60, number: '03', color: '#c39bff' },
  { id: 'rule-shift', name: 'Rule Shift', focus: 'Cognitive flexibility', duration: 5 * 60, number: '04', color: '#f0bd82' },
  { id: 'future-sight', name: 'Future Sight', focus: 'Anticipation', duration: 10 * 60, number: '05', color: '#f08f9c' },
] as const;

export type GameId = (typeof GAME_SEQUENCE)[number]['id'];
export type SessionKind = 'daily' | 'assessment';
export type SessionStatus = 'in-progress' | 'paused' | 'complete';
export type CheckIn = { sleepHours?: number; energy?: number; stress?: number; skipped?: boolean };
export type TrialRecord = {
  at: number;
  correct: boolean;
  reactionMs?: number;
  stimulusOnsetMs?: number;
  timeOriginMs?: number;
  condition?: string;
  missed?: boolean;
  falseAlarm?: boolean;
  switched?: boolean;
  distancePx?: number;
  intercepted?: boolean;
  uncertainty?: number;
  scenario?: string;
  response?: string;
  cue?: string;
};
export type GameRun = { gameId: GameId; startedAt: number; completedAt?: number; difficulty: number; elapsedMs?: number; trials: TrialRecord[] };
export type TrainingSession = {
  id: string;
  kind: SessionKind;
  startedAt: number;
  completedAt?: number;
  status: SessionStatus;
  week: number;
  currentGameIndex: number;
  games: GameRun[];
  checkIn?: CheckIn;
};
export type Preferences = {
  sound: boolean;
  reducedMotion: boolean;
  cueContrast: boolean;
  difficultyMode: 'adaptive' | 'gentle' | 'standard' | 'challenge';
};
export type AppState = {
  version: 1;
  sessions: TrainingSession[];
  active: TrainingSession | null;
  preferences: Preferences;
  adaptiveLevels: Record<GameId, number>;
  accurateStreaks: Record<GameId, number>;
  lastSelectedView: string;
};

export const DEFAULT_PREFERENCES: Preferences = { sound: false, reducedMotion: false, cueContrast: true, difficultyMode: 'adaptive' };
export const DEFAULT_LEVELS: Record<GameId, number> = {
  'neural-track': 0, 'signal-rush': 0, 'noise-filter': 0, 'rule-shift': 0, 'future-sight': 0,
};
export const EMPTY_STATE: AppState = {
  version: 1,
  sessions: [],
  active: null,
  preferences: DEFAULT_PREFERENCES,
  adaptiveLevels: DEFAULT_LEVELS,
  accurateStreaks: DEFAULT_LEVELS,
  lastSelectedView: 'Today',
};

export function gameDuration(gameId: GameId, kind: SessionKind): number {
  const full = GAME_SEQUENCE.find((game) => game.id === gameId)?.duration ?? 300;
  return kind === 'assessment' ? 60 : full;
}

export function currentExperimentWeek(sessions: TrainingSession[], now = Date.now()): number {
  const first = sessions.filter((session) => session.kind === 'daily').reduce<number | null>((min, session) => min === null ? session.startedAt : Math.min(min, session.startedAt), null);
  if (first === null) return 1;
  return Math.max(1, Math.min(8, Math.floor((now - first) / (7 * 24 * 60 * 60 * 1000)) + 1));
}

export function createSession(kind: SessionKind, week: number, now = Date.now(), checkIn?: CheckIn): TrainingSession {
  return {
    id: `session-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind, startedAt: now, status: 'in-progress', week, currentGameIndex: 0,
    games: [], checkIn,
  };
}

export function beginGame(session: TrainingSession, difficulty: number, now = Date.now()): TrainingSession {
  const game = GAME_SEQUENCE[session.currentGameIndex];
  if (!game || session.games.some((run) => run.gameId === game.id)) return session;
  return { ...session, status: 'in-progress', games: [...session.games, { gameId: game.id, startedAt: now, difficulty, trials: [] }] };
}

export function appendTrial(session: TrainingSession, trial: TrialRecord): TrainingSession {
  const games = [...session.games];
  const index = games.length - 1;
  if (index < 0 || games[index].completedAt !== undefined) return session;
  games[index] = { ...games[index], trials: [...games[index].trials, trial] };
  return { ...session, games };
}

export function finishGame(session: TrainingSession, now = Date.now()): TrainingSession {
  const games = [...session.games];
  const index = games.length - 1;
  if (index < 0 || games[index].completedAt !== undefined) return session;
  games[index] = { ...games[index], completedAt: now };
  return { ...session, games, status: 'paused' };
}

export function continueSession(session: TrainingSession, now = Date.now()): TrainingSession {
  if (!session.games[session.currentGameIndex]?.completedAt) return session;
  const nextIndex = session.currentGameIndex + 1;
  if (nextIndex >= GAME_SEQUENCE.length) return { ...session, status: 'complete', completedAt: now, currentGameIndex: GAME_SEQUENCE.length };
  return { ...session, status: 'in-progress', currentGameIndex: nextIndex };
}

export function pauseSession(session: TrainingSession): TrainingSession {
  return session.status === 'complete' ? session : { ...session, status: 'paused' };
}

export function gameSummary(run: GameRun) {
  const trackingSamples = run.trials.filter((trial) => trial.condition === 'continuous-tracking-sample');
  const intercepts = run.gameId === 'neural-track' ? run.trials.filter((trial) => trial.condition === 'interception') : [];
  const scored = run.gameId === 'neural-track' ? intercepts : run.trials.filter((trial) => trial.condition !== 'continuous-tracking-sample');
  const hits = scored.filter((trial) => trial.correct && !trial.missed && !trial.falseAlarm).length;
  const responseTrials = scored.filter((trial) => trial.correct && !trial.missed && !trial.falseAlarm);
  const reactionTimes = responseTrials.flatMap((trial) => typeof trial.reactionMs === 'number' && trial.reactionMs >= 0 ? [trial.reactionMs] : []);
  const sorted = [...reactionTimes].sort((a, b) => a - b);
  const median = sorted.length ? sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : null;
  const mean = reactionTimes.length ? reactionTimes.reduce((sum, value) => sum + value, 0) / reactionTimes.length : null;
  const variability = mean === null ? null : Math.sqrt(reactionTimes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / reactionTimes.length);
  const switchTrials = responseTrials.filter((trial) => trial.switched && trial.reactionMs !== undefined).map((trial) => trial.reactionMs!);
  const repeatTrials = responseTrials.filter((trial) => trial.switched === false && trial.reactionMs !== undefined).map((trial) => trial.reactionMs!);
  const switchCost = switchTrials.length && repeatTrials.length
    ? switchTrials.reduce((a, b) => a + b, 0) / switchTrials.length - repeatTrials.reduce((a, b) => a + b, 0) / repeatTrials.length
    : null;
  const distances = run.trials.flatMap((trial) => typeof trial.distancePx === 'number' ? [trial.distancePx] : []);
  const trackingAccuracy = trackingSamples.length ? trackingSamples.filter((trial) => trial.correct && !trial.missed).length / trackingSamples.length * 100 : null;
  const accuracy = run.gameId === 'neural-track' ? trackingAccuracy : scored.length ? hits / scored.length * 100 : null;
  return {
    attempts: scored.length,
    correct: hits,
    incorrect: scored.filter((trial) => !trial.correct && !trial.missed).length,
    missed: run.trials.filter((trial) => trial.missed).length,
    falseAlarms: run.trials.filter((trial) => trial.falseAlarm).length,
    accuracy,
    medianMs: median,
    meanMs: mean,
    variabilityMs: variability,
    switchCostMs: switchCost,
    averageDistancePx: distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : null,
    interceptions: run.trials.filter((trial) => trial.intercepted).length,
    trackingSamples: trackingSamples.length,
    interceptionAccuracy: intercepts.length ? intercepts.filter((trial) => trial.correct).length / intercepts.length * 100 : null,
  };
}

export function sessionProgress(session: TrainingSession | null): number {
  if (!session) return 0;
  const done = session.games.filter((game) => game.completedAt !== undefined).length;
  const current = session.games.at(-1);
  if (current && current.completedAt === undefined) return (done + 0.35) / GAME_SEQUENCE.length;
  return done / GAME_SEQUENCE.length;
}

export function latestAssessmentWeek(sessions: TrainingSession[]): number {
  return sessions.filter((session) => session.kind === 'assessment' && session.status === 'complete').reduce((latest, session) => Math.max(latest, session.week), 0);
}

export function assessmentDue(sessions: TrainingSession[], week = currentExperimentWeek(sessions)): boolean {
  return week > latestAssessmentWeek(sessions);
}

export function exportPayload(state: AppState) {
  return { app: 'NeuroSpeed Lab', schemaVersion: 1, exportedAt: new Date().toISOString(), state };
}

export function validateImport(value: unknown): AppState | null {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const number = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const integer = (v: unknown, min: number, max: number): v is number => number(v, min, max) && Number.isInteger(v);
  const optionalNumber = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => v === undefined || number(v, min, max);
  const validTrial = (v: unknown) => {
    if (!object(v) || !number(v.at) || typeof v.correct !== 'boolean') return false;
    if (!optionalNumber(v.stimulusOnsetMs) || !optionalNumber(v.timeOriginMs) || !optionalNumber(v.reactionMs) || !optionalNumber(v.distancePx) || !optionalNumber(v.uncertainty, 0, 4)) return false;
    for (const key of ['missed', 'falseAlarm', 'switched', 'intercepted']) if (v[key] !== undefined && typeof v[key] !== 'boolean') return false;
    for (const key of ['condition', 'scenario', 'response', 'cue']) if (v[key] !== undefined && typeof v[key] !== 'string') return false;
    // Legacy versions incorrectly marked missed Go trials correct. Preserve raw data;
    // gameSummary excludes missed trials when recalculating accuracy.
    return true;
  };
  const validSession = (v: unknown, active: boolean) => {
    if (!object(v) || typeof v.id !== 'string' || !v.id.length || !number(v.startedAt) || !integer(v.week, 1, 8)) return false;
    if (!['daily', 'assessment'].includes(String(v.kind)) || !['complete', 'paused', 'in-progress'].includes(String(v.status))) return false;
    if (active && v.status === 'complete') return false;
    if (!integer(v.currentGameIndex, 0, v.status === 'complete' ? 5 : 4) || !Array.isArray(v.games) || v.games.length > 5) return false;
    if (!optionalNumber(v.completedAt) || (typeof v.completedAt === 'number' && v.completedAt < v.startedAt)) return false;
    for (const [index, run] of v.games.entries()) {
      if (!object(run) || run.gameId !== GAME_SEQUENCE[index].id || !number(run.startedAt) || !integer(run.difficulty, 0, 3)) return false;
      if (!optionalNumber(run.completedAt) || !optionalNumber(run.elapsedMs, 0, gameDuration(GAME_SEQUENCE[index].id, v.kind as SessionKind) * 1000)) return false;
      if (typeof run.completedAt === 'number' && run.completedAt < run.startedAt) return false;
      if (!Array.isArray(run.trials) || !run.trials.every(validTrial)) return false;
      if (index < v.currentGameIndex && run.completedAt === undefined) return false;
    }
    if (v.status === 'complete' && (v.currentGameIndex !== 5 || v.games.length !== 5 || v.completedAt === undefined || v.games.some(run => !object(run) || run.completedAt === undefined))) return false;
    if (v.status !== 'complete' && (v.games.length < v.currentGameIndex || v.games.length > v.currentGameIndex + 1)) return false;
    if (v.checkIn !== undefined) {
      if (!object(v.checkIn) || !optionalNumber(v.checkIn.sleepHours, 0, 24) || !optionalNumber(v.checkIn.energy, 1, 5) || !optionalNumber(v.checkIn.stress, 1, 5)) return false;
      if (v.checkIn.skipped !== undefined && typeof v.checkIn.skipped !== 'boolean') return false;
    }
    return true;
  };
  if (!object(value)) return null;
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) return null;
  const candidate = value.state === undefined ? value : value.state;
  if (!object(candidate) || candidate.version !== 1 || !Array.isArray(candidate.sessions)) return null;
  if (!candidate.sessions.every(session => validSession(session, false))) return null;
  if (new Set(candidate.sessions.map(session => (session as TrainingSession).id)).size !== candidate.sessions.length) return null;
  if (candidate.active !== null && candidate.active !== undefined && !validSession(candidate.active, true)) return null;
  const levels = (v: unknown) => object(v) && GAME_SEQUENCE.every(game => integer(v[game.id], 0, 3));
  const streaks = (v: unknown) => object(v) && GAME_SEQUENCE.every(game => integer(v[game.id], 0, 1));
  if (candidate.adaptiveLevels !== undefined && !levels(candidate.adaptiveLevels)) return null;
  if (candidate.accurateStreaks !== undefined && !streaks(candidate.accurateStreaks)) return null;
  const preferences = object(candidate.preferences) ? candidate.preferences : {};
  const safePreferences: Preferences = {
    sound: preferences.sound === true, reducedMotion: preferences.reducedMotion === true, cueContrast: preferences.cueContrast !== false,
    difficultyMode: ['adaptive', 'gentle', 'standard', 'challenge'].includes(String(preferences.difficultyMode)) ? preferences.difficultyMode as Preferences['difficultyMode'] : 'adaptive',
  };
  const active = candidate.active ? structuredClone(candidate.active) as TrainingSession : null;
  if (active && candidate.sessions.some(session => (session as TrainingSession).id === active.id)) return null;
  if (active) active.status = 'paused';
  return {
    version: 1, sessions: structuredClone(candidate.sessions) as TrainingSession[], active,
    preferences: safePreferences,
    adaptiveLevels: { ...(candidate.adaptiveLevels as AppState['adaptiveLevels'] ?? DEFAULT_LEVELS) },
    accurateStreaks: { ...(candidate.accurateStreaks as AppState['accurateStreaks'] ?? DEFAULT_LEVELS) },
    lastSelectedView: typeof candidate.lastSelectedView === 'string' ? candidate.lastSelectedView : 'Today',
  };
}

export function adaptDifficulty(state: AppState, run: GameRun): AppState {
  if (state.preferences.difficultyMode !== 'adaptive') return state;
  const summary = gameSummary(run);
  if (summary.accuracy === null || summary.attempts < 8) return state;
  const level = state.adaptiveLevels[run.gameId] ?? 0;
  const streak = summary.accuracy >= 90 ? (state.accurateStreaks[run.gameId] ?? 0) + 1 : 0;
  let nextLevel = level;
  if (streak >= 2) nextLevel = Math.min(3, level + 1);
  else if (summary.accuracy < 60) nextLevel = Math.max(0, level - 1);
  return {
    ...state,
    adaptiveLevels: { ...state.adaptiveLevels, [run.gameId]: nextLevel },
    accurateStreaks: { ...state.accurateStreaks, [run.gameId]: streak >= 2 ? 0 : streak },
  };
}
