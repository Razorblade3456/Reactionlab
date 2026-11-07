import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GAME_SEQUENCE, EMPTY_STATE, adaptDifficulty, assessmentDue, beginGame, continueSession, createSession,
  currentExperimentWeek, exportPayload, finishGame, gameSummary, pauseSession, sessionProgress,
  type AppState, type CheckIn, type GameRun, type SessionKind, type TrainingSession,
  validateImport,
} from './model';
import { downloadCsv, downloadJson, loadState, saveState, SavedDataError } from './storage';
import { TrainingWorkspace } from './Training';

type View = 'Today' | 'Progress' | 'Experiment' | 'History' | 'Settings';
const NAV: Array<{ name: View; icon: string; meta?: string }> = [
  { name: 'Today', icon: 'grid' }, { name: 'Progress', icon: 'chart' }, { name: 'Experiment', icon: 'orbit' }, { name: 'History', icon: 'calendar' }, { name: 'Settings', icon: 'sliders' },
];
const fmtDate = (time: number, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) => new Intl.DateTimeFormat(undefined, options).format(new Date(time));
const localDateKey = (time: number) => { const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const timeAgo = (time: number) => {
  const days = Math.floor((Date.now() - time) / 86400000);
  if (days <= 0) return 'Today'; if (days === 1) return 'Yesterday'; if (days < 7) return `${days} days ago`;
  return fmtDate(time, { month: 'short', day: 'numeric' });
};
const metric = (value: number | null | undefined, suffix = '') => value === null || value === undefined || !Number.isFinite(value) ? '—' : `${Math.round(value)}${suffix}`;
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/><circle cx="20" cy="6" r="1"/></>,
    orbit: <><circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-32 12 12)"/><circle cx="19" cy="7" r="1"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
    sliders: <><path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    play: <path d="m8 5 12 7-12 7z"/>, pause: <><path d="M8 5v14M16 5v14"/></>,
    check: <path d="m5 12 4 4L19 6"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 17v3h14v-3"/></>,
    upload: <><path d="M12 16V4m-5 5 5-5 5 5"/><path d="M5 17v3h14v-3"/></>,
    pauseCircle: <><circle cx="12" cy="12" r="9"/><path d="M10 8v8m4-8v8"/></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.orbit}</svg>;
}

export default function App() {
  const [state, setState] = useState<AppState>(structuredClone(EMPTY_STATE));
  const stateRef = useRef(state);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [loaded, setLoaded] = useState(false);
  const [bootError, setBootError] = useState<Error | null>(null);
  const [view, setView] = useState<View>('Today');
  const [checkinFor, setCheckinFor] = useState<SessionKind | null>(null);
  const [notice, setNotice] = useState('');
  const [finishedSession, setFinishedSession] = useState<TrainingSession | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    loadState().then((saved) => {
      if (!mounted) return;
      stateRef.current = saved;
      setState(saved);
      setLoaded(true);
    }).catch((error: unknown) => {
      if (!mounted) return;
      setBootError(error instanceof Error ? error : new Error('Could not read local data.'));
      setLoaded(true);
    });
    return () => { mounted = false; };
  }, []);

  const commit = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
    saveQueue.current = saveQueue.current.catch(() => undefined).then(() => saveState(next)).catch((error: unknown) => {
      setNotice(error instanceof Error ? `Save issue · ${error.message}` : 'Could not save to this browser. Export a backup before leaving.');
    });
  }, []);
  const currentWeek = currentExperimentWeek(state.sessions);
  const due = assessmentDue(state.sessions, currentWeek);

  function updateActive(edit: (session: TrainingSession) => TrainingSession) {
    const current = stateRef.current;
    if (!current.active) return;
    commit({ ...current, active: edit(current.active) });
  }
  function updateRun(edit: (run: GameRun) => GameRun) {
    updateActive((session) => {
      const games = [...session.games];
      if (!games.length) return session;
      games[games.length - 1] = edit(games[games.length - 1]);
      return { ...session, games };
    });
  }
  function start(kind: SessionKind, checkIn?: CheckIn) {
    const current = stateRef.current;
    if(current.active){setCheckinFor(null);setNotice('Resume your saved session before starting another.');resume();return;}
    const week = currentExperimentWeek(current.sessions);
    const active = createSession(kind, week, Date.now(), checkIn);
    commit({ ...current, active });
    setFinishedSession(null);
    setCheckinFor(null);
    setView('Today');
  }
  function beginCurrentGame() {
    const current = stateRef.current;
    if (!current.active) return;
    const { active, preferences, adaptiveLevels } = current;
    const game = GAME_SEQUENCE[active.currentGameIndex];
    if (!game) return;
    const existing = active.games.find((run) => run.gameId === game.id);
    if (existing) {
      updateActive((session) => ({ ...session, status: 'in-progress' }));
      return;
    }
    const levelForMode = preferences.difficultyMode === 'gentle' ? 0 : preferences.difficultyMode === 'standard' ? 1 : preferences.difficultyMode === 'challenge' ? 3 : adaptiveLevels[game.id];
    const difficulty = active.kind === 'assessment' ? 1 : current.sessions.some((session) => session.kind === 'daily' && session.status === 'complete') ? levelForMode : 1;
    updateActive((session) => beginGame(session, difficulty));
  }
  function saveGameElapsed(elapsedMs: number) {
    updateRun((run) => ({ ...run, elapsedMs }));
  }
  function endGame() {
    const current = stateRef.current;
    if (!current.active) return;
    const ended = finishGame(current.active);
    if (ended === current.active) return;
    let next: AppState = { ...current, active: { ...ended, status: 'in-progress' } };
    const lastRun = ended.games.at(-1);
    if (lastRun && ended.kind === 'daily') next = adaptDifficulty(next, lastRun);
    commit(next);
  }
  function proceedAfterResult() {
    const current = stateRef.current;
    if (!current.active) return;
    const nextSession = continueSession(current.active);
    if (nextSession.status === 'complete') {
      const complete = { ...nextSession, status: 'complete' as const, completedAt: Date.now() };
      const sessions = [...current.sessions.filter((session) => session.id !== complete.id), complete].sort((a, b) => a.startedAt - b.startedAt);
      setFinishedSession(complete);
      commit({ ...current, active: null, sessions });
      setView('Today');
    } else {
      commit({ ...current, active: nextSession });
    }
  }
  function pauseAndLeave() {
    const current = stateRef.current;
    if (!current.active) return;
    commit({ ...current, active: pauseSession(current.active) });
    setView('Today');
    setNotice('Progress saved. Pick up whenever you’re ready.');
  }
  function resume() {
    updateActive((session) => ({ ...session, status: 'in-progress' }));
    setView('Today');
    setFinishedSession(null);
  }
  function updatePreferences(patch: Partial<AppState['preferences']>) {
    commit({ ...stateRef.current, preferences: { ...stateRef.current.preferences, ...patch } });
  }
  function exportJson() { downloadJson(`neurospeed-lab-${new Date().toISOString().slice(0, 10)}.json`, exportPayload(stateRef.current)); }
  function exportCsv() {
    const rows = [...stateRef.current.sessions, ...(stateRef.current.active?[stateRef.current.active]:[])].flatMap((session) => session.games.flatMap((run) => run.trials.map((trial, trialIndex) => ({
      session_id: session.id, session_kind: session.kind, session_date: new Date(session.startedAt).toISOString(), week: session.week,
      game: run.gameId, difficulty: run.difficulty, trial: trialIndex + 1, trial_at: new Date(trial.at).toISOString(), condition: trial.condition ?? '',
      correct: trial.correct && !trial.missed && !trial.falseAlarm, stimulus_onset_ms:trial.stimulusOnsetMs??'', time_origin_ms:trial.timeOriginMs??'', reaction_ms: trial.reactionMs ?? '', missed: Boolean(trial.missed), false_alarm: Boolean(trial.falseAlarm), switched: trial.switched ?? '',
      cursor_distance_px: trial.distancePx ?? '', intercepted: trial.intercepted ?? '', uncertainty: trial.uncertainty ?? '', scenario: trial.scenario ?? '', response: trial.response ?? '', cue: trial.cue ?? '',
    }))));
    downloadCsv(`neurospeed-lab-trials-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }
  async function importJson(file?: File) {
    if (!file) return;
    try {
      const imported = validateImport(JSON.parse(await file.text()));
      if (!imported) throw new Error('That file does not match the supported NeuroSpeed Lab export format.');
      if (!window.confirm(`Replace this browser's ${stateRef.current.sessions.length} saved session(s) with ${imported.sessions.length} imported session(s)? Export first if you want a backup.`)) return;
      commit(imported);
      setNotice('Validated data imported.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The file could not be read.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (!loaded) return <div className="boot-screen"><div className="loader-orbit" /><span>Opening your lab notebook…</span></div>;
  if (bootError) return <div className="recovery-screen"><div className="brand-mark"><Icon name="orbit" size={26}/></div><p className="eyebrow">LOCAL NOTEBOOK</p><h1>Your saved data couldn’t be opened</h1><p>{bootError instanceof SavedDataError ? bootError.message : bootError.message}</p><p>The database has not been cleared or replaced. Close duplicate tabs and reload. If you have a prior JSON export, import it after the app opens.</p><button className="button secondary" onClick={() => location.reload()}>Try again <Icon name="arrow"/></button></div>;

  const currentGame = state.active ? GAME_SEQUENCE[state.active.currentGameIndex] : undefined;
  const activeRun = currentGame ? state.active?.games.find((run) => run.gameId === currentGame.id) : undefined;
  const isCurrentResult = Boolean(view === 'Today' && state.active?.status === 'in-progress' && currentGame && activeRun?.gameId === currentGame.id && activeRun.completedAt);
  const isPlaying = Boolean(view === 'Today' && state.active?.status === 'in-progress' && currentGame && (!activeRun || !activeRun.completedAt));
  const currentRun = state.active && currentGame ? activeRun ?? {
    gameId: currentGame.id, startedAt: 0, difficulty: state.active.kind === 'assessment' ? 1 : state.adaptiveLevels[currentGame.id], elapsedMs: 0, trials: [],
  } : null;

  return <div className={`app-shell ${state.preferences.reducedMotion?'reduce-motion':''} ${state.preferences.cueContrast?'high-contrast-cues':''}`}>
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-mark"><Icon name="orbit" size={23}/></div><div><b>NeuroSpeed</b><span>PERFORMANCE LAB</span></div></div>
      <div className="side-label">WORKSPACE</div>
      <nav className="primary-nav" aria-label="Main navigation">
        {NAV.map((item) => <button key={item.name} className={`nav-item ${view === item.name ? 'selected' : ''}`} onClick={() => { if(stateRef.current.active?.status==='in-progress')pauseAndLeave();setView(item.name); setFinishedSession(null); }}><Icon name={item.icon}/><span>{item.name}</span>{item.name === 'Today' && state.active ? <i className="nav-dot"/> : null}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="week-tile"><div className="week-orbit"><span>W{currentWeek}</span></div><div><span className="micro-label">8-WEEK PROTOCOL</span><b>{currentWeek < 8 ? `Week ${currentWeek} of 8` : 'Transfer phase'}</b></div></div>
        <div className="local-note"><span className="local-dot"/><span>Private to this browser</span></div>
      </div>
    </aside>

    <main className="main-column">
      <header className="topbar"><div className="breadcrumb"><span>NeuroSpeed Lab</span><span className="crumb-sep">/</span><b>{isPlaying || isCurrentResult ? 'Training session' : view}</b></div><div className="topbar-right"><div className="local-chip"><Icon name="shield" size={14}/> Local data</div><div className="avatar">N</div></div></header>
      <div className="page-content">
        {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><Icon name="close" size={15}/></button></div>}
        {isPlaying && state.active && currentGame && currentRun ? <TrainingWorkspace
          session={state.active} run={currentRun} game={currentGame} preferences={state.preferences} history={state.sessions}
          onBegin={beginCurrentGame} onTrial={(trial) => updateActive((session) => ({ ...session, games: [...session.games.slice(0, -1), { ...session.games.at(-1)!, trials: [...session.games.at(-1)!.trials, trial] }] }))}
          onElapsed={saveGameElapsed} onFinish={endGame} onPause={pauseAndLeave} onResume={resume}
          onContinueResult={proceedAfterResult} onSound={() => { if (stateRef.current.preferences.sound) { try { const audio = new AudioContext(); const osc = audio.createOscillator(); const gain = audio.createGain(); osc.frequency.value = 660; gain.gain.value = 0.035; osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + .045); osc.onended = () => void audio.close(); } catch { /* Audio is optional. */ } } }}
        /> : isCurrentResult && state.active && currentGame && activeRun ? <TrainingWorkspace session={state.active} run={activeRun} game={currentGame} preferences={state.preferences} history={state.sessions} onBegin={beginCurrentGame} onTrial={() => undefined} onElapsed={() => undefined} onFinish={endGame} onPause={pauseAndLeave} onResume={resume} onContinueResult={proceedAfterResult} onSound={() => undefined} /> : view === 'Today' ? <TodayView
          state={state} week={currentWeek} due={due} finishedSession={finishedSession}
          onStart={() => setCheckinFor('daily')} onAssess={() => setCheckinFor('assessment')} onResume={resume} onNavigate={(next) => setView(next)}
        /> : view === 'Progress' ? <ProgressView sessions={state.sessions}/> : view === 'Experiment' ? <ExperimentView sessions={state.sessions} week={currentWeek} due={due} onAssess={() => setCheckinFor('assessment')}/> : view === 'History' ? <HistoryView sessions={state.sessions}/> : <SettingsView preferences={state.preferences} onChange={updatePreferences} onExportJson={exportJson} onExportCsv={exportCsv} onImport={() => fileRef.current?.click()}/>}
      </div>
    </main>
    <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importJson(event.target.files?.[0])}/>
    {checkinFor && <CheckInModal kind={checkinFor} onSkip={() => start(checkinFor, { skipped: true })} onCancel={() => setCheckinFor(null)} onStart={(data) => start(checkinFor, data)}/>}
  </div>;
}

function TodayView({ state, week, due, finishedSession, onStart, onAssess, onResume, onNavigate }: {
  state: AppState; week: number; due: boolean; finishedSession: TrainingSession | null; onStart: () => void; onAssess: () => void; onResume: () => void; onNavigate: (view: View) => void;
}) {
  const active = state.active;
  const past = state.sessions.filter((session) => session.kind === 'daily' && session.status === 'complete').sort((a, b) => b.startedAt - a.startedAt);
  const last = past[0];
  const recentSummary=finishedSession??(last&&localDateKey(last.startedAt)===localDateKey(Date.now())?last:null);
  const accuracies = last?.games.map((game) => gameSummary(game).accuracy).filter((value): value is number => value !== null) ?? [];
  const avgAccuracy = accuracies.length ? accuracies.reduce((a,b)=>a+b,0)/accuracies.length : null;
  const completedCount = last?.games.filter((game) => game.completedAt).length ?? 0;
  return <div className="view-stack">
    <div className="page-heading"><div><p className="eyebrow">YOUR DAILY PROTOCOL <span className="eyebrow-line"/></p><h1>Good to have you here.</h1><p className="subheading">A focused half-hour for noticing how your mind performs today.</p></div><div className="today-date"><span className="date-day">{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date()).toUpperCase()}</span><b>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date())}</b></div></div>
    {active && active.status !== 'complete' ? <section className="resume-banner"><div className="resume-symbol"><Icon name="play" size={17}/></div><div className="resume-copy"><span className="micro-label">SAVED SESSION · {active.kind === 'assessment' ? 'WEEKLY ASSESSMENT' : 'TODAY’S TRAINING'}</span><b>{active.status === 'paused' ? 'Pick up where you left off' : 'Your training is in progress'}</b><div className="progress-track"><span style={{ width: `${sessionProgress(active) * 100}%` }}/></div></div><button className="button primary small" onClick={onResume}>{active.games.at(-1)?.completedAt ? 'Review result' : 'Resume'} <Icon name="arrow" size={16}/></button></section> : null}
    <section className="hero-card">
      <div className="hero-grid" aria-hidden="true"/><div className="hero-copy"><div className="hero-kicker"><span className="live-indicator"/> PERSONAL PERFORMANCE EXPERIMENT</div><h2>Train with intention.<br/><em>Measure what matters.</em></h2><p>Five original cognitive tasks. Real trial-level data. A clearer picture of your own performance over time.</p><div className="hero-meta"><span><Icon name="clock" size={15}/> 30 minutes</span><span className="meta-divider"/><span>5 focused domains</span><span className="meta-divider"/><span>Week {week} / 8</span></div><button className="button start-button" onClick={active ? onResume : onStart}>{active ? 'RESUME TODAY’S TRAINING' : 'START TODAY’S TRAINING'} <Icon name="arrow" size={17}/></button><span className="micro-note">You can pause, leave, and return at any time.</span></div>
      <div className="hero-visual" aria-hidden="true"><div className="visual-ring ring-one"/><div className="visual-ring ring-two"/><div className="visual-cross cross-a"/><div className="visual-cross cross-b"/><div className="visual-core"><span className="core-dot"/><span className="core-wave wave-one"/><span className="core-wave wave-two"/></div><div className="visual-label label-a">30:00 <i>SESSION</i></div><div className="visual-label label-b">01—05 <i>SEQUENCE</i></div><div className="visual-spark spark-a"/><div className="visual-spark spark-b"/></div>
    </section>
    <div className="overview-grid"><section className="panel sequence-panel"><div className="panel-head"><div><p className="eyebrow">THE SEQUENCE</p><h3>Today’s training</h3></div><span className="sequence-count">05 <i>GAMES</i></span></div><div className="sequence-list">{GAME_SEQUENCE.map((game, index) => {
      const run = active?.games.find((item) => item.gameId === game.id) ?? (finishedSession?.games.find((item) => item.gameId === game.id));
      const complete = Boolean(run?.completedAt);
      const current = active?.currentGameIndex === index;
      return <div className={`sequence-row ${current ? 'current' : ''} ${complete ? 'done' : ''}`} key={game.id}><div className="sequence-index" style={{ '--game-color': game.color } as React.CSSProperties}>{complete ? <Icon name="check" size={15}/> : game.number}</div><div className="sequence-name"><b>{game.name}</b><span>{game.focus}</span></div><div className="sequence-duration">{active?.kind === 'assessment' ? '1 min' : game.duration / 60 + ' min'}</div><div className={`sequence-status ${complete ? 'status-done' : current ? 'status-current' : ''}`}>{complete ? 'DONE' : current ? 'UP NEXT' : 'QUEUED'}</div></div>;
    })}</div><div className="sequence-foot"><span><span className="tiny-dot cyan"/> Fixed order</span><span><span className="tiny-dot violet"/> Adaptive, by accuracy</span></div></section>
    <div className="right-stack"><section className="panel metric-card"><div className="panel-head"><div><p className="eyebrow">LAST SESSION</p><h3>{last ? timeAgo(last.startedAt) : 'Your baseline'}</h3></div><button className="text-link" onClick={() => onNavigate('Progress')}>Details <Icon name="arrow" size={14}/></button></div><div className="last-metrics"><div><span>Accuracy</span><b>{avgAccuracy === null ? '—' : `${Math.round(avgAccuracy)}%`}</b></div><div><span>Completed</span><b>{last ? <>{completedCount}<small> / 5</small></> : '—'}</b></div></div><div className="metric-card-foot">{last ? 'Across all five domains' : 'Complete your first training to establish a reference point.'}</div></section>
      <section className={`assessment-card ${due ? 'assessment-due' : ''}`}><div className="assessment-icon"><Icon name="orbit" size={19}/></div><div className="assessment-copy"><span className="micro-label">{state.sessions.some((session) => session.kind === 'assessment') ? 'WEEKLY CHECK' : 'BASELINE CHECK'}</span><b>{due ? 'Assessment ready' : 'Next weekly assessment'}</b><span>{due ? 'A steady, five-minute reference across all domains.' : 'Keep this quick reference separate from practice.'}</span></div><button className="icon-button" onClick={onAssess} aria-label="Start weekly assessment"><Icon name="arrow" size={17}/></button></section>
    </div></div>
    {recentSummary&&<DailySummary session={recentSummary} sessions={state.sessions} onNavigate={()=>onNavigate('Progress')}/>}
    <div className="bottom-note"><Icon name="shield" size={15}/><span>Your performance data stays in this browser. It is not uploaded to a server.</span><span className="bottom-note-spacer"/><span>Timing is approximate; hardware and display latency matter.</span></div>
  </div>;
}

function DailySummary({session,sessions,onNavigate}:{session:TrainingSession;sessions:TrainingSession[];onNavigate:()=>void}){
  const earlier=sessions.filter((item)=>item.kind===session.kind&&item.status==='complete'&&item.startedAt<session.startedAt).sort((a,b)=>b.startedAt-a.startedAt);
  const previous=earlier[0];
  const completed=session.games.filter((run)=>run.completedAt);
  return <section className="panel daily-summary"><div className="panel-head"><div><p className="eyebrow">{session.kind==='assessment'?'ASSESSMENT SAVED':'SESSION SAVED'} · {fmtDate(session.completedAt??session.startedAt)}</p><h3>{session.kind==='assessment'?'Five-domain reference':'Today’s results, by domain'}</h3></div><button className="text-link" onClick={onNavigate}>Long-term progress <Icon name="arrow" size={14}/></button></div><div className="daily-domain-grid">{GAME_SEQUENCE.map((game)=>{const run=session.games.find((entry)=>entry.gameId===game.id);if(!run)return <div className="daily-domain empty" key={game.id}><span className="domain-color" style={{background:game.color}}/><b>{game.name}</b><span>Not completed</span></div>;const summary=gameSummary(run);const prevRun=previous?.games.find((entry)=>entry.gameId===game.id);const prev=prevRun?gameSummary(prevRun):null;const allRuns=sessions.filter((item)=>item.kind===session.kind&&item.status==='complete'&&item.id!==session.id).flatMap((item)=>item.games.filter((entry)=>entry.gameId===game.id));const bestAccuracy=Math.max(-1,...allRuns.map((entry)=>gameSummary(entry).accuracy??-1));const bestSpeed=Math.min(Infinity,...allRuns.map((entry)=>gameSummary(entry).medianMs??Infinity));const prAcc=summary.accuracy!==null&&summary.accuracy>=bestAccuracy;const prSpeed=summary.medianMs!==null&&summary.medianMs<=bestSpeed;const accuracyDelta=summary.accuracy!==null&&prev?.accuracy!==null&&prev?.accuracy!==undefined?Math.round(summary.accuracy-prev.accuracy):null;const speedDelta=summary.medianMs!==null&&prev?.medianMs!==null&&prev?.medianMs!==undefined?Math.round(summary.medianMs-prev.medianMs):null;return <div className="daily-domain" key={game.id}><div className="daily-domain-name"><span className="domain-color" style={{background:game.color}}/><b>{game.name}</b>{(prAcc||prSpeed)&&<i>PERSONAL BEST</i>}</div><div className="daily-domain-values"><div><span>{game.id==='neural-track'?'Track accuracy':'Accuracy'}</span><b>{summary.accuracy===null?'—':`${Math.round(summary.accuracy)}%`}</b></div><div><span>Median correct</span><b>{summary.medianMs===null?'—':`${Math.round(summary.medianMs)} ms`}</b></div><div><span>Previous change</span><b className={accuracyDelta===null?'':accuracyDelta>0?'improved':accuracyDelta<0?'declined':''}>{accuracyDelta===null?'Baseline':`${accuracyDelta>0?'+':''}${accuracyDelta} pp`}</b></div></div><span className="daily-domain-foot">{speedDelta===null?'First comparable result':`${speedDelta>0?'+':''}${speedDelta} ms median · separate from accuracy`}</span></div>;})}</div><div className="daily-summary-foot"><span>{completed.length} of 5 games recorded</span><span>Personal bests are individual measures; there is no combined brain score.</span></div></section>;
}

function CheckInModal({ kind, onSkip, onCancel, onStart }: { kind: SessionKind; onSkip: () => void; onCancel: () => void; onStart: (value: CheckIn) => void }) {
  const [sleep, setSleep] = useState(''); const [energy, setEnergy] = useState<number | undefined>(undefined); const [stress, setStress] = useState<number | undefined>(undefined);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="checkin-modal" role="dialog" aria-modal="true" aria-labelledby="checkin-title"><button className="modal-close" onClick={onCancel} aria-label="Close"><Icon name="close"/></button><div className="modal-mark"><Icon name="orbit" size={22}/></div><p className="eyebrow">OPTIONAL · 10 SECONDS</p><h2 id="checkin-title">A quick check-in</h2><p className="subheading">Context for your own comparisons. These notes show association, not cause.</p><label className="field-label">Sleep last night <span>hours</span><input type="number" min="0" max="24" step="0.5" value={sleep} onChange={(event) => setSleep(event.target.value)} placeholder="e.g. 7.5"/></label><div className="checkin-scales">{([['Energy', energy, setEnergy], ['Stress', stress, setStress]] as const).map(([label, value, setter]) => <div className="scale-field" key={label}><div><b>{label}</b><span>{label === 'Energy' ? 'low → high' : 'low → high'}</span></div><div className="scale-buttons">{[1,2,3,4,5].map((point) => <button key={point} className={point === value ? 'selected' : ''} onClick={() => setter(point)} aria-label={`${label} ${point}`}>{point}</button>)}</div></div>)}</div><div className="modal-actions"><button className="text-button" onClick={onSkip}>Skip check-in</button><button className="button primary" onClick={() => { const hours = Number(sleep); onStart({ sleepHours: sleep && hours >= 0 && hours <= 24 ? hours : undefined, energy, stress }); }}>{kind === 'assessment' ? 'Begin assessment' : 'Begin training'} <Icon name="arrow" size={16}/></button></div></section></div>;
}

type DomainMetric = 'accuracy' | 'median' | 'variability';
function chartValue(run: GameRun, metricType: DomainMetric): number | null {
  const summary = gameSummary(run);
  return metricType === 'accuracy' ? summary.accuracy : metricType === 'median' ? summary.medianMs : summary.variabilityMs;
}
function ProgressView({ sessions }: { sessions: TrainingSession[] }) {
  const [selected, setSelected] = useState<DomainMetric>('accuracy');
  const daily = sessions.filter((session) => session.kind === 'daily' && session.status === 'complete').sort((a,b)=>a.startedAt-b.startedAt);
  const metricLabel = selected === 'accuracy' ? 'Accuracy' : selected === 'median' ? 'Median correct response' : 'Response variability';
  const metricUnit = selected === 'accuracy' ? '%' : 'ms';
  return <div className="view-stack"><PageHeader eyebrow="MEASURE · REFLECT · REPEAT" title="Progress, by domain." desc="Separate measures keep a faster click from hiding an accuracy change."/>
    <div className="segmented metric-toggle">{([['accuracy','Accuracy'],['median','Median response'],['variability','Variability']] as const).map(([key,label])=><button key={key} className={selected===key?'active':''} onClick={()=>setSelected(key)}>{label}</button>)}</div>
    <div className="domain-grid">{GAME_SEQUENCE.map((game)=>{const points=daily.flatMap((session)=>{const run=session.games.find((entry)=>entry.gameId===game.id);const value=run?chartValue(run,selected):null;return value===null?[]:[{x:session.startedAt,y:value,label:fmtDate(session.startedAt,{month:'short',day:'numeric'})}];});return <section className="panel domain-card" key={game.id}><div className="domain-card-head"><span className="domain-color" style={{background:game.color}}/><div><span className="micro-label">{game.focus}</span><h3>{game.name}</h3></div><span className="domain-count">{points.length} <i>SESSIONS</i></span></div><MetricChart points={points} color={game.color} unit={metricUnit} label={metricLabel}/><div className="chart-foot"><span>{points[0]?.label ?? 'Waiting for data'}</span><span>{metricLabel}{selected==='accuracy'?' · higher is more accurate':' · lower is faster/steadier'}</span><span>{points.at(-1)?.label ?? '—'}</span></div></section>;})}</div>
    <p className="science-note"><Icon name="shield" size={15}/> Reaction times use browser high-resolution timestamps; monitor refresh, system load, and mouse hardware affect measurements. Compare sessions using the same setup.</p>
  </div>;
}
function MetricChart({ points, color, unit, label }: { points: Array<{x:number;y:number;label:string}>; color:string; unit:string; label:string }) {
  const width=600,height=170,left=35,right=14,top=20,bottom=26, innerW=width-left-right, innerH=height-top-bottom;
  if (!points.length) return <div className="chart-empty"><div className="chart-empty-grid"/><span>No recorded {label.toLowerCase()} yet</span><small>Complete a session to draw your first point.</small></div>;
  const raw=points.map((point)=>point.y), min=Math.min(...raw),max=Math.max(...raw),padding=Math.max((max-min)*.22,unit==='%'?5:20), low=unit==='%'?Math.max(0,min-padding):Math.max(0,min-padding),high=unit==='%'?Math.min(100,max+padding):max+padding;
  const coords=points.map((point,index)=>({...point,value:point.y,x:left+(points.length===1?innerW/2:index/(points.length-1)*innerW),y:top+innerH-(point.y-low)/(high-low||1)*innerH}));
  return <svg className="metric-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} over ${points.length} daily sessions`}>
    {[0,.5,1].map((step)=><g key={step}><line x1={left} x2={width-right} y1={top+innerH*step} y2={top+innerH*step} stroke="rgba(144,167,199,.12)" strokeDasharray="3 5"/><text x={left-7} y={top+innerH*step+3} textAnchor="end" fill="#657184" fontSize="9">{Math.round(high-(high-low)*step)}{unit}</text></g>)}
    {coords.length>1&&<polyline points={coords.map((p)=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>}
    {coords.map((point,index)=><g key={point.x+':'+index}><circle cx={point.x} cy={point.y} r="10" fill={color} opacity=".08"/><circle cx={point.x} cy={point.y} r="3.6" fill="#101720" stroke={color} strokeWidth="2"/><title>{point.label}: {Math.round(point.value)}{unit}</title></g>)}
  </svg>;
}

function ExperimentView({ sessions, week, due, onAssess }: { sessions: TrainingSession[]; week: number; due:boolean; onAssess:()=>void }) {
  const assessments=sessions.filter((session)=>session.kind==='assessment'&&session.status==='complete').sort((a,b)=>a.startedAt-b.startedAt);
  const baseline=assessments[0], latest=assessments.at(-1), dailyCount=sessions.filter((session)=>session.kind==='daily'&&session.status==='complete').length;
  const weeks=[
    ['01','Baseline & mechanics','Learn the tasks; keep reference difficulty steady.'],['02—03','Accuracy & consistency','Build reliable responses before speed.'],['04—05','Response speed','Track latency alongside accuracy.'],['06—07','Increasing complexity','Practice under greater uncertainty.'],['08','Transfer comparison','Compare standardized assessments to baseline.'],
  ];
  const correlations=checkInCorrelations(sessions);
  return <div className="view-stack"><PageHeader eyebrow="THE 8-WEEK EXPERIMENT" title="A plan, not a promise." desc="A flexible structure for collecting repeated personal performance measurements."/>
    <section className="panel experiment-overview"><div><p className="eyebrow">PROGRAM POSITION</p><h2>{week < 8 ? `Week ${week}` : 'Week 8+'}</h2><p>{dailyCount} completed practice session{dailyCount===1?'':'s'} so far. Rest days are part of the plan; there is no streak penalty.</p></div><div className="program-progress"><div className="program-progress-label"><span>8-week arc</span><b>{week < 8 ? `${week} / 8` : 'Continue beyond week 8'}</b></div><div className="program-track"><span style={{width:`${Math.min(100,week/8*100)}%`}}/></div><small>Training remains available after the initial program.</small></div></section>
    <div className="experiment-grid"><section className="panel roadmap-panel"><div className="panel-head"><div><p className="eyebrow">PROTOCOL MAP</p><h3>Eight weeks, at your pace</h3></div><span className="chip">FLEXIBLE</span></div><div className="roadmap">{weeks.map(([number,title,body],index)=>{const ranges:Array<[number,number]>=[[1,1],[2,3],[4,5],[6,7],[8,8]];const [startWeek,endWeek]=ranges[index];return <div className={`roadmap-row ${week>=startWeek&&week<=endWeek?'in-range':''}`} key={number}><div className="roadmap-mark">{number}</div><div><b>{title}</b><span>{body}</span></div><small>{index===0?'WEEK 1':index===1?'WEEKS 2–3':index===2?'WEEKS 4–5':index===3?'WEEKS 6–7':'WEEK 8'}</small></div>;})}</div></section>
      <section className="panel assessment-results"><div className="panel-head"><div><p className="eyebrow">STANDARDIZED ASSESSMENTS</p><h3>Practice ≠ assessment</h3></div><Icon name="orbit" size={20}/></div><p className="panel-description">Weekly checks use fixed difficulty, separate records, and fresh scenarios. This helps distinguish a change in assessment performance from a change in practice difficulty.</p>
        {!baseline?<div className="empty-assessment"><span className="assessment-pulse"/><div><b>No baseline recorded</b><span>Begin the five-minute reference check when you’re ready.</span></div></div>:<div className="assessment-compare"><div><span className="micro-label">BASELINE</span><b>W{baseline.week} <small>· {fmtDate(baseline.startedAt,{month:'short',day:'numeric'})}</small></b></div><div className="compare-arrow">→</div><div><span className="micro-label">LATEST</span><b>{latest&&latest.id!==baseline.id?`W${latest.week} · ${fmtDate(latest.startedAt,{month:'short',day:'numeric'})}`:'Awaiting next'}</b></div></div>}
        {baseline&&latest&&baseline.id!==latest.id&&<div className="assessment-domains">{GAME_SEQUENCE.map((game)=>{const base=baseline.games.find((run)=>run.gameId===game.id), recent=latest.games.find((run)=>run.gameId===game.id);const a=base?gameSummary(base):null,b=recent?gameSummary(recent):null;const delta=a?.accuracy!==null&&a?.accuracy!==undefined&&b?.accuracy!==null&&b?.accuracy!==undefined?Math.round(b.accuracy-a.accuracy):null;return <div key={game.id}><span>{game.name}</span><b className={delta===null?'':delta>1?'improved':delta< -1?'declined':''}>{delta===null?'—':`${delta>0?'+':''}${delta} pp`}</b></div>;})}</div>}
        <div className="assessment-footnote">{baseline&&latest&&baseline.id!==latest.id?'Assessment accuracy comparison only · differences are descriptive, not proof of training transfer.':'No change classification until two comparable assessments are recorded.'}</div>
        {due&&<button className="button secondary full-button" onClick={onAssess}>Start this week’s assessment <Icon name="arrow" size={16}/></button>}
      </section></div>
    <section className="panel correlation-panel"><div className="panel-head"><div><p className="eyebrow">OPTIONAL CONTEXT · EXPLORATORY ONLY</p><h3>Check-in correlations</h3></div><span className="chip">NOT CAUSAL</span></div><p className="panel-description">Sleep, energy, or stress ratings compared with the average accuracy from the same daily session. This is descriptive only and cannot show that one factor caused another.</p>{correlations.length?<div className="correlation-grid">{correlations.map((item)=><div key={item.name}><span>{item.name}</span><b>{item.r===null?'—':`r = ${item.r.toFixed(2)}`}</b><small>{item.n} paired sessions</small></div>)}</div>:<div className="correlation-empty">Add an optional check-in before at least five daily sessions to see an exploratory relationship here. Skipped values are not filled in.</div>}</section>
    <section className="science-note"><Icon name="shield" size={16}/><span>These original games are personal practice tools, not validated clinical tests. Performance changes here do not establish changes in neural conduction speed, intelligence, or general brain capacity.</span></section>
  </div>;
}

function checkInCorrelations(sessions:TrainingSession[]){
  const completed=sessions.filter((session)=>session.kind==='daily'&&session.status==='complete');
  const keys=[['Sleep','sleepHours'],['Energy','energy'],['Stress','stress']] as const;
  return keys.map(([name,key])=>{const pairs=completed.flatMap((session)=>{const checkin=session.checkIn?.[key];const values=session.games.map((run)=>gameSummary(run).accuracy).filter((value):value is number=>value!==null);if(typeof checkin!=='number'||values.length===0)return[];return[{x:checkin,y:values.reduce((a,b)=>a+b,0)/values.length}];});if(pairs.length<5)return null;const xMean=pairs.reduce((sum,pair)=>sum+pair.x,0)/pairs.length;const yMean=pairs.reduce((sum,pair)=>sum+pair.y,0)/pairs.length;const numerator=pairs.reduce((sum,pair)=>sum+(pair.x-xMean)*(pair.y-yMean),0);const denominator=Math.sqrt(pairs.reduce((sum,pair)=>sum+(pair.x-xMean)**2,0)*pairs.reduce((sum,pair)=>sum+(pair.y-yMean)**2,0));return{name,n:pairs.length,r:denominator?numerator/denominator:null};}).filter((item):item is NonNullable<typeof item>=>item!==null);
}
function formatLocalKey(key:string){const [year,month,day]=key.split('-').map(Number);return new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date(year,month-1,day));}

function HistoryView({ sessions }: { sessions:TrainingSession[] }) {
  const [month,setMonth]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1);});
  const [selected,setSelected]=useState<string|null>(null);
  const map=useMemo(()=>{const result=new Map<string,TrainingSession[]>();for(const session of sessions){const key=localDateKey(session.startedAt);result.set(key,[...(result.get(key)??[]),session]);}return result;},[sessions]);
  const first=new Date(month.getFullYear(),month.getMonth(),1);const offset=(first.getDay()+6)%7;const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const selectedSessions=selected?map.get(selected)??[]:[];
  return <div className="view-stack"><PageHeader eyebrow="SESSION ARCHIVE" title="Your history." desc="Return to a day, then inspect the raw results saved for that session."/>
    <section className="panel history-panel"><div className="history-calendar"><div className="calendar-toolbar"><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))} aria-label="Previous month">‹</button><b>{new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(month)}</b><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))} aria-label="Next month">›</button></div><div className="calendar-grid">{['M','T','W','T','F','S','S'].map((day,index)=><span className="calendar-weekday" key={`${day}-${index}`}>{day}</span>)}{Array.from({length:offset},(_,index)=><span className="calendar-spacer" key={`s-${index}`}/>)}{Array.from({length:days},(_,index)=>{const date=new Date(month.getFullYear(),month.getMonth(),index+1);const key=localDateKey(date.getTime());const has=map.has(key);const active=selected===key;const today=date.toDateString()===new Date().toDateString();return <button key={key} className={`calendar-day ${has?'has-session':''} ${active?'active':''} ${today?'today':''}`} onClick={()=>setSelected(key)} aria-label={`${date.toDateString()}${has?', session saved':''}`}>{index+1}{has&&<i/>}</button>;})}</div><div className="calendar-legend"><span><i className="tiny-dot cyan"/> Training saved</span><span><i className="tiny-dot violet"/> Assessment</span></div></div>
      <div className="history-detail">{selected?<><div className="history-detail-head"><span className="micro-label">SELECTED DAY</span><h3>{formatLocalKey(selected)}</h3></div>{!selectedSessions.length?<div className="history-empty"><span className="empty-rings"><Icon name="calendar" size={22}/></span><b>No recorded sessions</b><span>There’s no training saved for this date.</span></div>:selectedSessions.map((session)=><div className="history-session" key={session.id}><div className="history-session-title"><div><span className="micro-label">{session.kind==='daily'?'DAILY TRAINING':'WEEKLY ASSESSMENT'} · WEEK {session.week}</span><b>{session.status==='complete'?'Completed':session.status==='paused'?'Paused':'In progress'}</b></div><span className="history-session-time">{fmtDate(session.startedAt,{hour:'numeric',minute:'2-digit'})}</span></div>{session.games.map((run)=>{const game=GAME_SEQUENCE.find((entry)=>entry.id===run.gameId)!;const summary=gameSummary(run);return <div className="history-game" key={run.gameId}><span className="domain-color" style={{background:game.color}}/><b>{game.name}</b><span>{summary.accuracy===null?'—':`${Math.round(summary.accuracy)}%`}</span><span>{metric(summary.medianMs,' ms')}</span></div>;})}<button className="text-link" onClick={()=>downloadJson(`neurospeed-session-${session.id}.json`,{app:'NeuroSpeed Lab',schemaVersion:1,session})}>Export this session <Icon name="download" size={14}/></button></div>)}</>:<div className="history-empty"><span className="empty-rings"><Icon name="calendar" size={22}/></span><b>Select a date</b><span>Saved sessions are marked in cyan.</span></div>}</div>
    </section><p className="science-note"><Icon name="shield" size={15}/> Unfinished sessions remain available to resume from Today; nothing is removed when you inspect history.</p>
  </div>;
}

function SettingsView({ preferences,onChange,onExportJson,onExportCsv,onImport }: { preferences:AppState['preferences'];onChange:(patch:Partial<AppState['preferences']>)=>void;onExportJson:()=>void;onExportCsv:()=>void;onImport:()=>void }) {
  return <div className="view-stack"><PageHeader eyebrow="YOUR LAB, YOUR PREFERENCES" title="Settings." desc="Adjust comfort, scoring difficulty, and the records stored in this browser."/>
    <section className="panel settings-panel"><div className="settings-section-head"><div><p className="eyebrow">COMFORT</p><h3>Make the room yours</h3></div></div>
      <SettingRow title="Soft response sounds" desc="Quiet confirmation tones after a response. No sound plays until you enable this." control={<Toggle value={preferences.sound} onChange={(value)=>onChange({sound:value})} label="Response sounds"/>}/>
      <SettingRow title="Reduced motion" desc="Use restrained movement and remove animated transitions." control={<Toggle value={preferences.reducedMotion} onChange={(value)=>onChange({reducedMotion:value})} label="Reduced motion"/>}/>
      <SettingRow title="High-contrast cue labels" desc="Keep written labels beside visual and color cues." control={<Toggle value={preferences.cueContrast} onChange={(value)=>onChange({cueContrast:value})} label="High contrast cues"/>}/>
      <SettingRow title="Difficulty approach" desc="Difficulty never rewards fast guessing over correct responses." control={<select className="settings-select" value={preferences.difficultyMode} onChange={(event)=>onChange({difficultyMode:event.target.value as AppState['preferences']['difficultyMode']})}><option value="adaptive">Adaptive · based on accuracy</option><option value="gentle">Gentle · introductory</option><option value="standard">Standard · steady challenge</option><option value="challenge">Challenge · more complex</option></select>}/>
    </section>
    <section className="panel settings-panel data-panel"><div className="settings-section-head"><div><p className="eyebrow">LOCAL DATA</p><h3>Notebook & backups</h3></div><span className="chip"><Icon name="shield" size={13}/> THIS BROWSER</span></div><p className="panel-description">Training history is stored in IndexedDB on this device. NeuroSpeed Lab has no account or cloud service. A JSON export keeps all trial-level data and is the best backup format.</p><div className="data-actions"><button className="button secondary" onClick={onExportJson}><Icon name="download" size={16}/> Export JSON</button><button className="button secondary" onClick={onExportCsv}><Icon name="download" size={16}/> Export trial CSV</button><button className="button secondary" onClick={onImport}><Icon name="upload" size={16}/> Import JSON</button></div><div className="import-note"><b>Import replaces this browser’s records</b><span>The file is validated and you’ll be asked before replacing saved sessions.</span></div></section>
    <section className="panel methodology-card"><span className="method-icon"><Icon name="shield"/></span><div><b>About these measurements</b><p>Reaction times are taken with <code>performance.now()</code>. Browser scheduling, refresh rate, system load, and input devices affect results. This is not medical or cognitive diagnosis.</p></div></section>
  </div>;
}
function SettingRow({ title,desc,control }: { title:string;desc:string;control:React.ReactNode }) { return <div className="setting-row"><div><b>{title}</b><span>{desc}</span></div><div className="setting-control">{control}</div></div>; }
function Toggle({ value,onChange,label }: {value:boolean;onChange:(value:boolean)=>void;label:string}) { return <button className={`toggle ${value?'on':''}`} role="switch" aria-checked={value} aria-label={label} onClick={()=>onChange(!value)}><span/></button>; }
function PageHeader({eyebrow,title,desc}:{eyebrow:string;title:string;desc:string}){return <div className="page-heading"><div><p className="eyebrow">{eyebrow}<span className="eyebrow-line"/></p><h1>{title}</h1><p className="subheading">{desc}</p></div></div>;}
