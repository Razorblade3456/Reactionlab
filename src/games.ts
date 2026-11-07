import type { GameId } from './model';

export type GameTrial = {
  ink?: string;
  inkLabel?: string;
  prompt: string;
  cue: string;
  options: string[];
  correct: string;
  condition: string;
  falseAlarm: boolean;
  switched?: boolean;
  nextRule?: string;
  scenario?: string;
  uncertainty?: number;
  visual?: { kind: string; values: number[]; labels: string[] };
};

const pick = <T,>(items: readonly T[], random: () => number) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
export function createTrial(gameId: GameId, difficulty: number, previousRule?: string, random = Math.random): GameTrial {
  if (gameId === 'signal-rush') {
    const noGo = random() < 0.12 + Math.min(0.12, difficulty * 0.025);
    const simple = !noGo && random() < 0.22;
    const count = Math.min(4, 2 + Math.max(0, difficulty - 1));
    const options = ['●', '▲', '■', '◆'].slice(0, count);
    const correct = simple ? 'Respond' : pick(options, random);
    return {
      prompt: noGo ? 'Hold your response' : simple ? pick(options, random) : correct,
      cue: noGo ? 'A hollow ring is a No-Go signal. Keep your cursor centered.' : simple ? 'Simple reaction trial · click Respond when any signal appears.' : 'Choose the matching symbol. Return to center between responses.',
      options: simple ? ['Respond'] : options,
      correct,
      condition: noGo ? 'no-go' : simple ? 'simple' : 'choice',
      falseAlarm: noGo,
    };
  }
  if (gameId === 'noise-filter') {
    const noGo = random() < 0.1 + Math.min(0.1, difficulty * 0.02);
    if (random() < 0.5) {
      const words = ['AMBER', 'MINT', 'VIOLET', 'CYAN'];
      const inks = ['Amber', 'Mint', 'Violet', 'Cyan'];
      const wordIndex = Math.floor(random() * words.length);
      let inkIndex = Math.floor(random() * inks.length);
      if (difficulty >= 1 && random() < 0.7) inkIndex = (wordIndex + 1 + Math.floor(random() * (inks.length - 1))) % inks.length;
      return {
        prompt: noGo ? '○' : words[wordIndex],
        ink: ['#f0bd82', '#69d8b0', '#c39bff', '#71d7ef'][inkIndex],
        inkLabel: inks[inkIndex],
        cue: noGo ? 'Open circle means do not respond.' : `Name the ink color${wordIndex !== inkIndex ? ' — ignore the word itself' : ''}.`,
        options: inks,
        correct: inks[inkIndex],
        condition: noGo ? 'withhold-stroop' : wordIndex === inkIndex ? 'congruent' : 'incongruent',
        falseAlarm: noGo,
      };
    }
    const center = pick(['←', '→', '↑', '↓'], random);
    const flanker = difficulty > 1 && random() < 0.6 ? pick(['←', '→', '↑', '↓'], random) : center;
    return {
      prompt: noGo ? '○' : `${flanker}${flanker}${center}${flanker}${flanker}`,
      cue: noGo ? 'Open circle means do not respond.' : 'Report the direction of the center arrow; ignore its neighbors.',
      options: ['←', '→', '↑', '↓'], correct: center,
      condition: noGo ? 'withhold-flanker' : flanker === center ? 'aligned-flanker' : 'conflict-flanker',
      falseAlarm: noGo,
    };
  }
  if (gameId === 'rule-shift') {
    const rules = ['ODD / EVEN', 'LOW / HIGH'];
    const switched = previousRule !== undefined && random() < 0.36;
    const rule = switched ? rules.find((value) => value !== previousRule)! : previousRule ?? pick(rules, random);
    const number = 1 + Math.floor(random() * 9);
    const correct = rule === rules[0] ? (number % 2 ? 'Odd' : 'Even') : (number <= 5 ? 'Low' : 'High');
    return {
      prompt: String(number), cue: `Current rule · ${rule}`, options: rule === rules[0] ? ['Odd', 'Even'] : ['Low (1–5)', 'High (6–9)'],
      correct: correct === 'Low' ? 'Low (1–5)' : correct === 'High' ? 'High (6–9)' : correct,
      condition: switched ? 'switch' : 'repeat', falseAlarm: false, switched, nextRule: rule,
    };
  }
  if (gameId === 'future-sight') {
    const scenarioType = Math.floor(random() * 3);
    const uncertainty = 1 + Math.floor(random() * Math.min(4, difficulty + 1));
    if (scenarioType === 0) {
      const left = 6 + Math.floor(random() * 8);
      const right = 6 + Math.floor(random() * 8);
      const speedLeft = 2 + Math.floor(random() * 3);
      const speedRight = 2 + Math.floor(random() * 3);
      const timeLeft = left / speedLeft;
      const timeRight = right / speedRight;
      const correct = timeLeft === timeRight ? 'Tie' : timeLeft < timeRight ? 'A' : 'B';
      return {
        prompt: 'Which runner reaches the marker first?',
        cue: 'Compare remaining distance with speed. Time to marker = distance ÷ speed.',
        options: ['Runner A', 'Runner B', 'Same time'], correct: correct === 'Tie' ? 'Same time' : correct === 'A' ? 'Runner A' : 'Runner B',
        condition: 'race-prediction', falseAlarm: false, scenario: 'race', uncertainty,
        visual: { kind: 'race', values: [left, speedLeft, right, speedRight], labels: ['A', 'B'] },
      };
    }
    if (scenarioType === 1) {
      const entry = Math.floor(random() * 3);
      const slopes = [-1, 0, 1].filter((value) => entry + value >= 0 && entry + value <= 2);
      const slope = pick(slopes, random);
      const exit = entry + slope;
      return {
        prompt: 'Predict the lane at the far edge.',
        cue: `The object enters in lane ${entry + 1}. Its visible path ${slope < 0 ? 'rises one lane' : slope > 0 ? 'drops one lane' : 'stays level'} across the covered section.`,
        options: ['Lane 1', 'Lane 2', 'Lane 3'], correct: `Lane ${exit + 1}`,
        condition: 'occlusion-trajectory', falseAlarm: false, scenario: 'trajectory', uncertainty,
        visual: { kind: 'trajectory', values: [entry, slope, exit], labels: ['Entry', 'Hidden path', 'Exit'] },
      };
    }
    const cueIndex = Math.floor(random() * 4);
    const cues = ['left', 'right', 'up', 'down'];
    const correct = cues[cueIndex];
    return {
      prompt: 'Where will the moving marker appear?',
      cue: `Before it disappears, the marker crosses a gate showing “${correct.toUpperCase()}”. The gate points to its next exit.`,
      options: ['Left', 'Right', 'Up', 'Down'], correct: `${correct[0].toUpperCase()}${correct.slice(1)}`,
      condition: 'cue-prediction', falseAlarm: false, scenario: 'gate-cue', uncertainty,
      visual: { kind: 'gate', values: [cueIndex], labels: ['Gate cue'] },
    };
  }
  return { prompt: 'Track the moving target', cue: 'Keep your pointer close. Click the target to intercept it.', options: [], correct: '', condition: 'tracking', falseAlarm: false };
}

export function signalResponseIsNoGo(trial: GameTrial): boolean {
  return trial.falseAlarm;
}
