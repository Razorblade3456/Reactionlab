import { useEffect, useMemo, useRef, useState } from 'react';
import { GAME_SEQUENCE, gameDuration, gameSummary, type GameId, type GameRun, type Preferences, type TrainingSession, type TrialRecord } from './model';
import { createTrial, type GameTrial } from './games';

type GameMeta = typeof GAME_SEQUENCE[number];
type Props = {
  session: TrainingSession; run: GameRun; game: GameMeta; preferences: Preferences; history: TrainingSession[];
  onBegin: () => void; onTrial: (trial: TrialRecord) => void; onElapsed: (elapsedMs: number) => void;
  onFinish: () => void; onPause: () => void; onResume: () => void; onContinueResult: () => void; onSound: () => void;
};

const TASK: Record<GameId, { lead: string; instructions: string[]; measured: string[]; strategy: string }> = {
  'neural-track': { lead: 'Keep a moving target in reach, then time an interception.', instructions: ['Follow the target with your cursor as it changes direction.', 'Click the target to record an interception attempt.', 'Cursor distance is sampled each second; clicks outside the target count as misses.'], measured: ['Distance to target', 'Tracking accuracy', 'Intercept accuracy'], strategy: 'There is no advantage to wild clicking. Steady tracking helps your accuracy measurement.' },
  'signal-rush': { lead: 'Match the signal as quickly and accurately as you can.', instructions: ['Begin each response from the central marker.', 'Choose the matching symbol when it appears.', 'A hollow ring is a No-Go trial: keep your hands still until it clears.'], measured: ['Median reaction time', 'Correct responses', 'Wrong, missed & false-alarm responses'], strategy: 'Accuracy stays visible beside speed. A missed response is recorded after the response window closes.' },
  'noise-filter': { lead: 'Find the relevant cue while ignoring visual interference.', instructions: ['For color words, name the ink color—not the word.', 'For arrow groups, report the center arrow.', 'A hollow-circle cue means withhold your response. Written instructions accompany the visual cue.'], measured: ['Accuracy by condition', 'Median response time', 'False alarms & missed responses'], strategy: 'Difficulty responds to your accuracy, not to how quickly you click.' },
  'rule-shift': { lead: 'Use the rule shown above each number; notice when the rule changes.', instructions: ['ODD / EVEN: classify the number’s parity.', 'LOW / HIGH: 1–5 is low; 6–9 is high.', 'Repeated rules and unexpected switches are mixed together.'], measured: ['Correct response time', 'Accuracy', 'Switch cost versus repeat trials'], strategy: 'Pause for the rule cue. Switch cost is calculated only when both switch and repeat trials exist.' },
  'future-sight': { lead: 'Read the visible cue, then predict what happens next.', instructions: ['A runner’s time is distance divided by speed.', 'A covered trajectory continues along its visible path.', 'A gate cue indicates the moving marker’s exit direction. The cue needed for each answer is shown.'], measured: ['Prediction accuracy', 'Response time', 'Performance by scenario and uncertainty'], strategy: 'Scenarios are procedurally varied. Explanations after each choice point to the cue that mattered.' },
};

export function TrainingWorkspace(props: Props) {
  const { session, run, game } = props;
  const [practicing, setPracticing] = useState(false);
  const summary = gameSummary(run);
  const previous = [...props.history].filter((candidate) => candidate.kind === session.kind && candidate.id !== session.id && candidate.status === 'complete' && candidate.startedAt < session.startedAt).sort((a,b)=>b.startedAt-a.startedAt)[0];
  const previousRun = previous?.games.find((candidate) => candidate.gameId === game.id);
  const before = previousRun ? gameSummary(previousRun) : null;
  const isResult = run.completedAt !== undefined;
  const isIntro = !isResult && run.startedAt === 0;
  if (isResult) return <GameResult {...props} summary={summary} previous={before} onContinue={props.onContinueResult}/>;
  if (isIntro && !practicing) return <GameBrief {...props} onPractice={() => setPracticing(true)} onStart={props.onBegin} onExit={props.onPause}/>;
  return <ActiveGame {...props} practice={practicing} onPracticeFinish={() => setPracticing(false)} onExit={props.onPause}/>;
}

function GameBrief({ session, run, game, onPractice, onStart, onExit }: Props & { onPractice: () => void; onStart: () => void; onExit: () => void }) {
  const gameIndex = session.currentGameIndex;
  const duration = gameDuration(game.id, session.kind);
  const spec = TASK[game.id];
  return <div className="training-shell">
    <div className="training-topline"><button className="text-button" onClick={onExit}>← Return to Today</button><div className="training-progress-label"><span>{session.kind === 'assessment' ? 'WEEKLY ASSESSMENT' : 'TODAY’S SEQUENCE'}</span><b>{String(gameIndex + 1).padStart(2, '0')} <i>/ 05</i></b></div></div>
    <div className="training-progress"><span style={{ width: `${(gameIndex / GAME_SEQUENCE.length) * 100}%` }}/></div>
    <div className="game-intro-grid"><div className="game-intro-copy"><p className="eyebrow">GAME {game.number} · {game.focus.toUpperCase()} <span className="game-accent-dot" style={{background:game.color}}/></p><h1>{game.name}</h1><p className="game-lead">{spec.lead}</p><div className="instruction-list">{spec.instructions.map((line,index)=><div className="instruction-row" key={line}><span>{String(index+1).padStart(2,'0')}</span><p>{line}</p></div>)}</div><div className="game-measures"><span className="micro-label">MEASURES RECORDED</span><div>{spec.measured.map((measure)=><span key={measure}>{measure}</span>)}</div></div><div className="strategy-note"><span className="strategy-spark">✳</span><p>{spec.strategy}</p></div></div>
      <div className="game-preview-wrap"><GamePreview game={game.id} difficulty={run.difficulty}/><div className="duration-pill"><span className="tiny-dot" style={{background:game.color}}/>{session.kind === 'assessment' ? '1 minute · fixed difficulty' : `${duration / 60} minutes · difficulty ${run.difficulty + 1}`}</div><p className="practice-help">Short, unscored practice is optional. Your session starts only when you choose.</p><button className="button secondary practice-button" onClick={onPractice}>Try a 20-second practice</button><button className="button primary begin-button" onClick={onStart}>Start {game.name} <Arrow/></button></div>
    </div>
  </div>;
}

function GamePreview({game,difficulty}:{game:GameId;difficulty:number}) {
  if(game==='neural-track')return <div className="preview-board tracking-preview"><span className="preview-track-line line-a"/><span className="preview-track-line line-b"/><span className="preview-target"/><span className="preview-cursor"/><small>TRACKING FIELD</small></div>;
  if(game==='signal-rush')return <div className="preview-board signal-preview"><div className="preview-signal">▲</div><div className="preview-options">● <i>·</i> ▲ <i>·</i> ■</div><small>{difficulty>1?'FOUR-CHOICE SIGNAL':'CHOICE RESPONSE'}</small></div>;
  if(game==='noise-filter')return <div className="preview-board noise-preview"><span className="noise-word">VIOLET</span><span className="noise-label">ink color ≠ word</span><div className="preview-options">AMBER <i>·</i> MINT <i>·</i> CYAN</div><small>IGNORE THE DISTRACTOR</small></div>;
  if(game==='rule-shift')return <div className="preview-board rule-preview"><span className="rule-tag">CURRENT RULE · ODD / EVEN</span><strong>7</strong><div className="preview-options">ODD <i>·</i> EVEN</div><small>NOTICE THE CUE</small></div>;
  return <div className="preview-board future-preview"><div className="future-runner"><span/><span/></div><div className="future-lane"><i/><i/><i/></div><span className="future-cue">→</span><small>READ THE CUE · PREDICT THE EXIT</small></div>;
}

function ActiveGame(props: Props & { practice: boolean; onPracticeFinish: () => void; onExit: () => void }) {
  const {session,run,game,preferences,onElapsed,onFinish,onPause,onSound,practice,onPracticeFinish,onExit}=props;
  const duration=practice?20:gameDuration(game.id,session.kind);
  const [elapsed,setElapsed]=useState(practice?0:run.elapsedMs??0);
  const finishGuard=useRef(false);
  const callbacks=useRef({onElapsed,onFinish,onPracticeFinish});
  callbacks.current={onElapsed,onFinish,onPracticeFinish};
  useEffect(()=>{setElapsed(practice?0:run.elapsedMs??0);finishGuard.current=false;},[practice,game.id,session.id]);
  useEffect(()=>{
    const base=practice?0:run.elapsedMs??0;
    const started=performance.now();
    let lastPersist=Math.floor(base/1000);
    const timer=window.setInterval(()=>{
      const next=Math.min(duration*1000,base+performance.now()-started);
      setElapsed(next);
      if(!practice&&Math.floor(next/1000)>lastPersist){lastPersist=Math.floor(next/1000);callbacks.current.onElapsed(next);}
      if(next>=duration*1000&&!finishGuard.current){finishGuard.current=true;if(practice)callbacks.current.onPracticeFinish();else callbacks.current.onFinish();}
    },100);
    return ()=>window.clearInterval(timer);
  },[duration,practice,game.id,session.id]);
  const pauseRef=useRef(onPause);pauseRef.current=onPause;
  useEffect(()=>{const hide=()=>{if(document.hidden)pauseRef.current();};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);},[]);
  const remaining=Math.max(0,Math.ceil((duration*1000-elapsed)/1000));
  const progress=Math.min(100,elapsed/(duration*1000)*100);
  const totalTrials=run.trials.length;
  const responseCapture=(trial:TrialRecord)=>{if(!practice)props.onTrial(trial);if(trial.condition!=='continuous-tracking-sample')onSound();};
  return <div className={`training-shell playing-shell ${preferences.reducedMotion?'reduce-motion':''}`}>
    <div className="training-topline"><button className="text-button" onClick={onExit}>← Leave for now</button><div className="training-progress-label"><span>{practice?'UNSCORED PRACTICE':session.kind==='assessment'?'FIXED-DIFFICULTY ASSESSMENT':'LIVE · TRIALS SAVED AS YOU GO'}</span><b>{game.number} <i>/ 05</i></b></div><button className="button secondary small pause-training" onClick={onPause}>Pause & save <IconPause/></button></div>
    <div className="training-progress"><span style={{width:`${(session.currentGameIndex/5+progress/500)*100}%`}}/></div>
    <div className="playing-heading"><div><p className="eyebrow">{game.focus.toUpperCase()} <span className="game-accent-dot" style={{background:game.color}}/></p><h1>{game.name}</h1></div><div className="round-timer"><span>{practice?'PRACTICE · ':''}TIME LEFT</span><b>{String(Math.floor(remaining/60)).padStart(2,'0')}:{String(remaining%60).padStart(2,'0')}</b><div className="timer-track"><span style={{width:`${100-progress}%`}}/></div></div></div>
    {game.id==='neural-track'?<TrackGame elapsed={elapsed} difficulty={run.difficulty} reducedMotion={preferences.reducedMotion} onSample={responseCapture} practice={practice}/>:<TrialGame game={game.id} difficulty={run.difficulty} elapsed={elapsed} onTrial={responseCapture} onFinishNoGo={() => undefined} practice={practice}/>}
    <div className="game-footer"><span><b>{practice?'PRACTICE':`${totalTrials} TRIAL${totalTrials===1?'':'S'}`}</b><i>·</i>{practice?'not saved':'saved locally'}</span><span>Accuracy matters as much as pace</span></div>
    {practice&&<button className="practice-end" onClick={onPracticeFinish}>End practice</button>}
  </div>;
}

function TrackGame({elapsed,difficulty,reducedMotion,onSample,practice}:{elapsed:number;difficulty:number;reducedMotion:boolean;onSample:(trial:TrialRecord)=>void;practice:boolean}) {
  const [motionSeed]=useState(()=>Math.random()*Math.PI*2);const origin=useRef(performance.now()-elapsed);
  const board=useRef<HTMLDivElement>(null);const pointer=useRef<{x:number;y:number}|null>(null);const lastSample=useRef(0);const [frame,setFrame]=useState(()=>performance.now());
  useEffect(()=>{let raf=0;const tick=()=>{setFrame(performance.now());raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);},[reducedMotion]);
  const position=useMemo(()=>{const t=(frame-origin.current)/1000;const speed=(.55+difficulty*.13)*(reducedMotion?.55:1);const x=50+34*Math.sin(t*speed*.73+motionSeed)+7*Math.sin(t*speed*1.41);const y=50+34*Math.cos(t*speed*.59+motionSeed*.7)+6*Math.sin(t*speed*1.23);return{x:Math.min(88,Math.max(12,x)),y:Math.min(86,Math.max(14,y))};},[frame,elapsed,difficulty,reducedMotion,motionSeed]);
  const getDistance=()=>{if(!board.current||!pointer.current)return null;const box=board.current.getBoundingClientRect();const targetX=position.x/100*box.width,targetY=position.y/100*box.height;return {distance:Math.hypot(pointer.current.x-targetX,pointer.current.y-targetY),box};};
  useEffect(()=>{const seconds=Math.floor(elapsed/1000);if(seconds>lastSample.current){lastSample.current=seconds;const result=getDistance();if(!practice)onSample({at:Date.now(),correct:result!==null&&result.distance<62,...(result?{distancePx:Math.round(result.distance)}:{}),condition:'continuous-tracking-sample'});}},[elapsed,position,practice,onSample]);
  const registerClick=(event:React.MouseEvent<HTMLDivElement>)=>{if(practice)return;const box=board.current?.getBoundingClientRect();if(!box)return;const distance=Math.hypot(event.clientX-(box.left+position.x/100*box.width),event.clientY-(box.top+position.y/100*box.height));const hit=distance<=Math.max(25,40-difficulty*4);onSample({at:Date.now(),correct:hit,intercepted:hit,distancePx:Math.round(distance),condition:'interception',response:hit?'intercept':'miss'});};
  return <div className="track-game-card"><div className="track-instructions"><div><b>Stay with it.</b><span>Pointer distance is sampled every second.</span></div><div className="track-key"><span>●</span> TARGET <i/> <span className="cursor-glyph">＋</span> POINTER</div></div><div ref={board} className="track-board" onPointerLeave={()=>{pointer.current=null;}} onPointerMove={(event)=>{const rect=event.currentTarget.getBoundingClientRect();pointer.current={x:event.clientX-rect.left,y:event.clientY-rect.top};}} onClick={registerClick} aria-label="Tracking field"><div className="track-crosshair h"/><div className="track-crosshair v"/><div className="track-guide guide-one"/><div className="track-guide guide-two"/><div className="track-ring" style={{left:`${position.x}%`,top:`${position.y}%`,transform:`translate(-50%,-50%) scale(${1+Math.sin(frame/280)*.06})`}}/><button className="moving-target" style={{left:`${position.x}%`,top:`${position.y}%`,transform:'translate(-50%,-50%)'}} aria-label="Moving target" onClick={(event)=>{event.stopPropagation();registerClick(event as unknown as React.MouseEvent<HTMLDivElement>);}}><span/></button><div className="track-board-label">VISUAL–MOTOR FIELD <i>· LIVE</i></div><div className="track-board-center">+<span>RETURN TO CENTER</span></div></div><div className="track-status-row"><span><i className="status-dot live"/> TARGET IN MOTION</span><span>Click on target to intercept</span><span>Level {difficulty+1}</span></div></div>;
}

function TrialGame({game,difficulty,elapsed,onTrial,practice}:{game:Exclude<GameId,'neural-track'>;difficulty:number;elapsed:number;onTrial:(trial:TrialRecord)=>void;onFinishNoGo:()=>void;practice:boolean}) {
  const [sequence,setSequence]=useState(1);
  const [trial,setTrial]=useState(()=>createTrial(game,difficulty));
  const [phase,setPhase]=useState<'center'|'waiting'|'stimulus'|'feedback'>('center');
  const [feedback,setFeedback]=useState('');
  const previousRule=useRef(trial.nextRule);
  const started=useRef(0);
  const answered=useRef(false);
  const capture=useRef(onTrial); capture.current=onTrial;
  const arm=()=>{if(phase==='center')setPhase('waiting');};
  useEffect(()=>{
    if(phase!=='waiting')return;
    const timer=window.setTimeout(()=>setPhase('stimulus'),600+Math.random()*900);
    return()=>window.clearTimeout(timer);
  },[phase]);
  const settle=(answer?:string)=>{
    if(answered.current||phase!=='stimulus')return;
    answered.current=true;
    const correct=trial.falseAlarm?answer===undefined:answer===trial.correct;
    const missed=!trial.falseAlarm&&answer===undefined;
    if(!practice)capture.current({at:Date.now(),correct,stimulusOnsetMs:started.current,timeOriginMs:performance.timeOrigin,
      reactionMs:answer===undefined?undefined:Math.round(performance.now()-started.current),
      condition:trial.condition,missed,falseAlarm:trial.falseAlarm&&answer!==undefined,
      switched:trial.switched,scenario:trial.scenario,uncertainty:trial.uncertainty,
      cue:trial.cue,response:answer??(trial.falseAlarm?'withheld':'missed')});
    setFeedback(`${correct?'Correct':missed?'Response missed':'Incorrect'}${trial.falseAlarm?' · This signal required withholding.':` · Answer: ${trial.correct}.`}${game==='future-sight'?' '+trial.cue:''}`);
    setPhase('feedback');
  };
  useEffect(()=>{
    if(phase!=='stimulus')return;
    answered.current=false;
    let timer=0;
    const frame=requestAnimationFrame(()=>{
      started.current=performance.now();
      timer=window.setTimeout(()=>settle(),trial.falseAlarm?1350:game==='future-sight'?10000:3300);
    });
    return()=>{cancelAnimationFrame(frame);window.clearTimeout(timer);};
  },[phase,trial]);
  useEffect(()=>{
    if(phase!=='feedback')return;
    const timer=window.setTimeout(()=>{
      const next=createTrial(game,difficulty,previousRule.current);
      if(next.nextRule)previousRule.current=next.nextRule;
      setTrial(next);setSequence(value=>value+1);setPhase('center');
    },game==='future-sight'?2400:750);
    return()=>window.clearTimeout(timer);
  },[phase,game,difficulty]);
  const visible=phase==='stimulus'||phase==='feedback';
  return <div className="trial-game-card" onPointerDown={(event)=>{if(trial.falseAlarm&&phase==='stimulus'&&!(event.target instanceof HTMLButtonElement))settle('clicked');}}>
    <div className="trial-strip"><span className="trial-count">ROUND <b>{String(sequence).padStart(2,'0')}</b></span><span className="trial-status">{phase==='stimulus'?'RESPONSE WINDOW OPEN':phase==='feedback'?'TRIAL RECORDED':'RETURN TO CENTER'}</span></div>
    <div className={`stimulus-stage ${trial.falseAlarm?'no-go':''} ${game==='future-sight'?'future-stage':''}`}>
      {visible?<><div className="stimulus-cue">{trial.cue}</div>
      {game==='future-sight'?<><div className="stimulus-cue">{trial.prompt}</div><ScenarioVisual trial={trial}/></>:<div style={trial.ink&&!trial.falseAlarm?{color:trial.ink}:undefined} className={`stimulus-word ${game==='noise-filter'?'noise-stimulus':''}`}>{trial.falseAlarm?'○':trial.prompt}</div>}
      {trial.inkLabel&&!trial.falseAlarm&&<span className="ink-accessibility-cue">Ink cue: {trial.inkLabel}</span>}
      {trial.falseAlarm&&<div className="withhold-chip">NO-GO · HOLD</div>}</>:<div className="hold-response"><b>{phase==='center'?'Return to the center marker':'Wait for the signal…'}</b><span>{phase==='center'?'Move your pointer onto + to begin the next trial.':'Keep your pointer centered.'}</span></div>}
    </div>
    {phase==='stimulus'&&!trial.falseAlarm?<div className={`response-options options-${trial.options.length}`}>{trial.options.map((option,index)=><button className="response-button" key={`${sequence}-${option}`} onClick={()=>settle(option)}><span className="option-key">{index+1}</span><span>{option}</span></button>)}</div>:phase==='feedback'?<div className="trial-feedback" role="status">{feedback}</div>:<div className="hold-response"><span>{trial.falseAlarm&&phase==='stimulus'?'Withhold your response.':''}</span></div>}
    <div className="center-return"><button className="center-marker" aria-label="Start next trial from center" onPointerEnter={arm} onClick={arm} disabled={phase!=='center'}>+</button><span>Return cursor to center between trials</span></div>
    <span className="hidden-timer-keepalive" aria-hidden="true">{elapsed}</span>
  </div>;
}

function ScenarioVisual({trial}:{trial:GameTrial}) {
  const visual=trial.visual;
  if(!visual)return <div className="scenario-default"><span className="scenario-ring"/><span className="scenario-point"/></div>;
  if(visual.kind==='race')return <div className="scenario-race"><div className="race-track"><div className="race-label"><b>RUNNER A</b><span>{visual.values[0]} m · {visual.values[1]} m/s</span></div><div className="race-line"><i style={{width:`${Math.max(20,80-visual.values[0]*2)}%`}}/></div></div><div className="race-track"><div className="race-label"><b>RUNNER B</b><span>{visual.values[2]} m · {visual.values[3]} m/s</span></div><div className="race-line"><i style={{width:`${Math.max(20,80-visual.values[2]*2)}%`}}/></div></div><span className="marker-flag">FINISH</span></div>;
  if(visual.kind==='trajectory')return <div className="scenario-trajectory"><div className="lane-labels">{['LANE 1','LANE 2','LANE 3'].map((lane)=><span key={lane}>{lane}</span>)}</div><div className="trajectory-field"><div className="trajectory-lane-lines"><i/><i/></div><span className="entry-node" style={{top:`${15+visual.values[0]*30}%`}}>●</span><span className="path-segment" style={{top:`${15+visual.values[0]*30}%`,transform:`rotate(${visual.values[1]===0?0:visual.values[1]>0?24:-24}deg)`}}/><span className="occluder"/><span className="exit-question">?</span></div><small>VISIBLE ENTRY + DIRECTION → HIDDEN SEGMENT → EXIT</small></div>;
  return <div className="scenario-gate"><div className="gate-track"><span className="gate-marker">●</span><div className="gate-obscure"/><span className="gate-direction">{['←','→','↑','↓'][visual.values[0]]}</span><span className="gate-exit">?</span></div><span className="gate-caption">FOLLOW THE MARKED EXIT CUE</span></div>;
}

function GameResult({session,run,game,onContinue,summary,previous,onPause}:{session:TrainingSession;run:GameRun;game:GameMeta;onContinue:()=>void;summary:ReturnType<typeof gameSummary>;previous:ReturnType<typeof gameSummary>|null;onPause:()=>void}) {
  const isLast=session.currentGameIndex===GAME_SEQUENCE.length-1;
  const pct=summary.accuracy===null?null:Math.round(summary.accuracy);
  const isAssessment=session.kind==='assessment';
  const accuracyDelta=pct!==null&&previous?.accuracy!==null&&previous?.accuracy!==undefined?Math.round(pct-previous.accuracy):null;
  const reactionDelta=summary.medianMs!==null&&previous?.medianMs!==null&&previous?.medianMs!==undefined?Math.round(summary.medianMs-previous.medianMs):null;
  const conditionRows=conditionSummary(run);
  return <div className="training-shell result-shell"><div className="training-topline"><button className="text-button" onClick={onPause}>← Return to Today</button><span className="micro-label">{isAssessment?'ASSESSMENT RESULT':'GAME RESULT'} · {game.number} / 05</span><span className="saved-indicator"><i className="status-dot"/> SAVED AUTOMATICALLY</span></div><div className="training-progress"><span style={{width:`${((session.currentGameIndex+1)/5)*100}%`}}/></div><div className="result-heading"><div className="result-orbit" style={{'--game-color':game.color} as React.CSSProperties}><span>{summary.accuracy===null?'—':Math.round(summary.accuracy)}</span><i>{summary.accuracy===null?'NO TRIALS':'% ACCURATE'}</i></div><div><p className="eyebrow">{game.focus.toUpperCase()}</p><h1>{game.name}<br/><em>{isLast?'complete.':'logged.'}</em></h1><p className="subheading">Raw responses are saved. Here’s what this round recorded.</p></div></div>
    <div className="result-metric-grid"><ResultMetric label="Median correct response" value={summary.medianMs===null?'—':`${Math.round(summary.medianMs)} ms`} hint={reactionDelta===null?'Reference established on your first comparable session':`${reactionDelta>0?'+':''}${reactionDelta} ms vs previous`} trend={reactionDelta===null?null:reactionDelta<0?'good':reactionDelta>0?'watch':'same'}/><ResultMetric label={game.id==='neural-track'?'Tracking accuracy':'Accuracy'} value={pct===null?'—':`${pct}%`} hint={accuracyDelta===null?'Separate measure · no combined score':`${accuracyDelta>0?'+':''}${accuracyDelta} percentage points`} trend={accuracyDelta===null?null:accuracyDelta>0?'good':accuracyDelta<0?'watch':'same'}/><ResultMetric label="Response spread" value={metricValue(summary.variabilityMs)} hint="Standard deviation · correct responses"/><ResultMetric label="Missed / false alarms" value={`${summary.missed} / ${summary.falseAlarms}`} hint="Recorded separately from wrong choices"/></div>
    <div className="result-secondary-grid"><div className="panel result-breakdown"><div className="panel-head"><div><p className="eyebrow">TRIAL SUMMARY</p><h3>{summary.attempts} scored responses</h3></div><span className="chip">LEVEL {run.difficulty+1}</span></div>{game.id==='neural-track'&&<><div className="breakdown-row"><span>Cursor-tracking samples</span><b>{summary.trackingSamples}</b></div><div className="breakdown-row"><span>Successful interceptions</span><b>{summary.interceptions} / {summary.attempts}</b></div><div className="breakdown-row"><span>Interception accuracy</span><b>{summary.interceptionAccuracy===null?'—':`${Math.round(summary.interceptionAccuracy)}%`}</b></div></>}<div className="breakdown-row"><span>Correct responses</span><b>{summary.correct}</b></div><div className="breakdown-row"><span>Incorrect selections</span><b>{summary.incorrect}</b></div><div className="breakdown-row"><span>Missed response windows</span><b>{summary.missed}</b></div><div className="breakdown-row"><span>False alarms</span><b>{summary.falseAlarms}</b></div>{summary.switchCostMs!==null&&<div className="breakdown-row"><span>Switch cost · switch minus repeat</span><b>{Math.round(summary.switchCostMs)} ms</b></div>}{summary.averageDistancePx!==null&&<div className="breakdown-row"><span>Average cursor distance</span><b>{Math.round(summary.averageDistancePx)} px</b></div>}</div><div className="panel result-insight"><span className="insight-glyph">✳</span><p className="eyebrow">READING THIS RESULT</p><h3>{pct===null?'Not enough recorded trials':'One domain, one measure'}</h3><p>{pct===null?'No responses were captured in this game. Complete another session to build a meaningful record.':'Accuracy and response time are shown separately. A faster result is not necessarily a better result if accuracy also changes.'}</p><span className="insight-foot">{session.kind==='assessment'?'Assessment results stay separate from training.':'Difficulty adjustment uses accuracy, never speed alone.'}</span></div></div>
    {conditionRows.length>0&&<div className="panel condition-panel"><div className="panel-head"><div><p className="eyebrow">RESULTS BY CONDITION</p><h3>Compare like with like</h3></div><span className="chip">RAW TRIALS</span></div><div className="condition-table"><div className="condition-head"><span>Condition</span><span>n</span><span>Accuracy</span><span>Median correct</span></div>{conditionRows.map((row)=><div className="condition-row" key={row.name}><span>{row.name}</span><b>{row.n}</b><b>{row.accuracy===null?'—':`${Math.round(row.accuracy)}%`}</b><b>{row.median===null?'—':`${Math.round(row.median)} ms`}</b></div>)}</div><small className="condition-note">{game.id==='signal-rush'?'Simple and choice responses are separated; no-go errors are shown as false alarms.':game.id==='noise-filter'?'Easy, conflicting, and withhold conditions are separated.':game.id==='future-sight'?'Scenario type and cue uncertainty are preserved in each trial.':'Condition details are computed from recorded trials only.'}</small></div>}
    <div className="result-action-row"><span>{isLast?isAssessment?'End of assessment · 5 min total':'End of sequence · 30 min total':'Next up · '+GAME_SEQUENCE[session.currentGameIndex+1]?.name}</span><button className="button primary continue-button" onClick={onContinue}>{isLast?isAssessment?'Finish assessment':'Finish today’s session':`Continue to Game ${session.currentGameIndex+2}`} <Arrow/></button></div>
  </div>;
}
function ResultMetric({label,value,hint,trend}:{label:string;value:string;hint:string;trend?:'good'|'watch'|'same'|null}){return <div className="result-metric"><span>{label}</span><b>{value}</b><small className={trend?`trend-${trend}`:''}>{hint}</small></div>;}
function conditionSummary(run:GameRun){
  const grouping:Record<string,string[]>={
    'signal-rush':['simple','choice','no-go'],
    'noise-filter':['congruent','aligned-flanker','incongruent','conflict-flanker','withhold-stroop','withhold-flanker'],
    'future-sight':['race-prediction','occlusion-trajectory','cue-prediction'],
  };
  const names=grouping[run.gameId];if(!names)return [];
  return names.map((name)=>{const trials=run.trials.filter((trial)=>trial.condition===name);const correct=trials.filter((trial)=>trial.correct&&!trial.missed&&!trial.falseAlarm);const times=correct.map((trial)=>trial.reactionMs).filter((value):value is number=>typeof value==='number').sort((a,b)=>a-b);return {name:name.replaceAll('-',' ').replace(/\b\w/g,(letter)=>letter.toUpperCase()),n:trials.length,accuracy:trials.length?correct.length/trials.length*100:null,median:times.length?times.length%2?times[(times.length-1)/2]:(times[times.length/2-1]+times[times.length/2])/2:null};}).filter((row)=>row.n>0);
}
function metricValue(value:number|null){return value===null?'—':`${Math.round(value)} ms`;}
function Arrow(){return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>;}
function IconPause(){return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 5v14M16 5v14"/></svg>;}
