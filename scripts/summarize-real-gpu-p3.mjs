import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('artifacts/performance-premium/stutter-p3');
const modes = ['baseline', 'optimized', 'direct'];
const source = Object.fromEntries(await Promise.all(modes.map(async (mode) => [
  mode,
  JSON.parse(await readFile(path.join(outputDirectory, `${mode}-run.json`), 'utf8'))
])));

const requiredEvents = [
  'first-bloom-frame',
  'first-enemy-visible',
  'first-player-shot',
  'first-projectile',
  'first-impact',
  'first-shield-hit',
  'first-player-shield-hit',
  'first-destruction',
  'first-player-torpedo-launch',
  'first-torpedo',
  'destruction-2'
];

function getRun(mode, phase) {
  return source[mode].runs.find((run) => run.phase === phase);
}

function compactRun(mode, phase) {
  const run = getRun(mode, phase);
  const profile = run.profile;
  return {
    mode,
    phase,
    label: profile.label,
    frames: profile.frames,
    renderer: profile.renderer,
    device: profile.device,
    programsBefore: run.programsBefore,
    programsAfter: run.programsAfter,
    programDelta: run.programDelta,
    gcCandidateFrames: profile.timeline.gcCandidateFrames,
    consoleErrors: source[mode].browserVerification.consoleErrors,
    pageErrors: source[mode].browserVerification.pageErrors
  };
}

function eventCorrelations(mode, phase) {
  const timeline = getRun(mode, phase).profile.timeline;
  return Object.fromEntries(requiredEvents.map((eventName) => {
    const event = timeline.events.find((entry) => entry.name === eventName) ?? null;
    const matchingFrames = timeline.slowFrames
      .filter((frame) => frame.recentEvent === eventName || frame.recentEvents.includes(eventName))
      .sort((left, right) => right.durationMs - left.durationMs);
    return [eventName, {
      event,
      worstCorrelatedFrame: matchingFrames[0] ?? null,
      correlatedFramesOver50Ms: matchingFrames.length
    }];
  }));
}

function metrics(mode, phase) {
  const run = getRun(mode, phase);
  const frames = run.profile.frames;
  return {
    fps: frames.fpsAverage,
    onePercentLow: frames.fpsOnePercentLow,
    meanMs: frames.frameMs.mean,
    p95Ms: frames.frameMs.p95,
    p99Ms: frames.frameMs.p99,
    maxMs: frames.frameMs.max,
    framesOver33Ms: frames.over33ms,
    framesOver50Ms: frames.over50ms,
    programs: `${run.programsBefore}->${run.programsAfter}`
  };
}

function numericDelta(before, after) {
  return Number((after - before).toFixed(2));
}

function compare(beforeMode, afterMode, phase) {
  const before = metrics(beforeMode, phase);
  const after = metrics(afterMode, phase);
  return {
    before,
    after,
    delta: {
      fps: numericDelta(before.fps, after.fps),
      onePercentLow: numericDelta(before.onePercentLow, after.onePercentLow),
      meanMs: numericDelta(before.meanMs, after.meanMs),
      p95Ms: numericDelta(before.p95Ms, after.p95Ms),
      p99Ms: numericDelta(before.p99Ms, after.p99Ms),
      maxMs: numericDelta(before.maxMs, after.maxMs),
      framesOver33Ms: after.framesOver33Ms - before.framesOver33Ms,
      framesOver50Ms: after.framesOver50Ms - before.framesOver50Ms
    }
  };
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, 'cold-run.json'), JSON.stringify({
  kind: 'ARCA_EPSILON_P3_COLD_COMPARISON',
  capturedAt: source.optimized.capturedAt,
  scenario: source.optimized.scenario,
  baseline: compactRun('baseline', 'cold'),
  optimized: compactRun('optimized', 'cold'),
  direct: compactRun('direct', 'cold')
}, null, 2));

await writeFile(path.join(outputDirectory, 'warm-run.json'), JSON.stringify({
  kind: 'ARCA_EPSILON_P3_WARM_COMPARISON',
  capturedAt: source.optimized.capturedAt,
  scenario: source.optimized.scenario,
  baseline: compactRun('baseline', 'warm'),
  optimized: compactRun('optimized', 'warm'),
  direct: compactRun('direct', 'warm')
}, null, 2));

await writeFile(path.join(outputDirectory, 'event-timeline.json'), JSON.stringify({
  kind: 'ARCA_EPSILON_P3_EVENT_TIMELINE',
  correlationRule: 'Frames over 50 ms use the event nearest the measured frame start; up to six nearby markers are retained.',
  runs: Object.fromEntries(modes.map((mode) => [mode, Object.fromEntries(['cold', 'warm'].map((phase) => {
    const timeline = getRun(mode, phase).profile.timeline;
    return [phase, {
      programCountAtStart: timeline.programCountAtStart,
      programCountAtEnd: timeline.programCountAtEnd,
      gcCandidateFrames: timeline.gcCandidateFrames,
      correlations: eventCorrelations(mode, phase),
      events: timeline.events,
      slowFrames: timeline.slowFrames
    }];
  }))]))
}, null, 2));

await writeFile(path.join(outputDirectory, 'before-after.json'), JSON.stringify({
  kind: 'ARCA_EPSILON_P3_BEFORE_AFTER',
  hardware: source.optimized.runs[0].profile.device,
  priorP2SustainedReference: {
    note: 'Reference supplied before P3; it is not the same combat event sequence.',
    optimized: { fps: 48.9, onePercentLow: 13, meanMs: 20.46, p95Ms: 39.5, p99Ms: 60.5, framesOver33Ms: 48, framesOver50Ms: 20 },
    direct: { fps: 59.6, onePercentLow: 32.6, meanMs: 16.77, p95Ms: 17.9, p99Ms: 24.4, framesOver33Ms: 3, framesOver50Ms: 0 }
  },
  sameP3Sequence: {
    baseline: { cold: metrics('baseline', 'cold'), warm: metrics('baseline', 'warm') },
    optimized: { cold: metrics('optimized', 'cold'), warm: metrics('optimized', 'warm') },
    direct: { cold: metrics('direct', 'cold'), warm: metrics('direct', 'warm') },
    baselineToOptimizedCold: compare('baseline', 'optimized', 'cold'),
    baselineToOptimizedWarm: compare('baseline', 'optimized', 'warm')
  },
  preparation: {
    story: 'Runs during Story launch transition and touches only player weapon/shield resources.',
    combat: 'Runs before the Combat setup becomes interactive.',
    measuredCombat: source.optimized.preparation
  },
  browserVerification: Object.fromEntries(modes.map((mode) => [mode, source[mode].browserVerification]))
}, null, 2));

console.log(`P3 artifacts written to ${outputDirectory}`);
