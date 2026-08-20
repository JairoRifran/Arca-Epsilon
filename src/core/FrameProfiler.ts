import type * as THREE from 'three';

/**
 * Frame-time profiler.
 *
 * The existing benchmark reads `diagnostics.data.fps`, an average. An average
 * cannot answer the question that actually matters here -- "does this stutter?"
 * -- because a run that alternates 8 ms and 120 ms frames reports a perfectly
 * respectable 60. This records every frame in a window and reports the
 * distribution, plus the renderer and device facts needed to compare two runs
 * on different machines.
 *
 * Sampling is a single number pushed into a pre-allocated array: no objects per
 * frame, so the profiler cannot become the thing it is measuring.
 */

export type FrameStats = {
  frames: number;
  seconds: number;
  fpsAverage: number;
  /** Mean of the slowest 1% of frames, the standard "1% low" figure. */
  fpsOnePercentLow: number;
  frameMs: { mean: number; p50: number; p95: number; p99: number; max: number };
  /** Frames over 33 ms (a dropped frame at 30 Hz) and over 50 ms (visible hitch). */
  over33ms: number;
  over50ms: number;
  longestRunOver33ms: number;
};

export type RendererSnapshot = {
  calls: number;
  triangles: number;
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  programs: number;
};

export type DeviceSnapshot = {
  glRenderer: string;
  glVendor: string;
  devicePixelRatio: number;
  rendererPixelRatio: number;
  cssWidth: number;
  cssHeight: number;
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  /** Pixels actually shaded per frame, the number pixel ratio really controls. */
  drawingBufferPixels: number;
  jsHeapMb: number | null;
};

export type ProfileResult = {
  label: string;
  frames: FrameStats;
  renderer: RendererSnapshot;
  device: DeviceSnapshot;
  timeline?: FrameTimeline;
};

export type FrameContextSnapshot = {
  activeVfx: number;
  projectiles: number;
  enemies: number;
  explosions: number;
  impacts: number;
  shieldEffects: number;
  fragments: number;
  damageMarks: number;
  temporaryLights: number;
  trails: number;
  groundQueries: number;
  raycasts: number;
  collisionQueries: number;
  groundUpdateMs: number;
  visibleObjects: number;
  newlyVisibleObjects: number;
  shadowUpdate: number;
};

export type FrameEventMarker = FrameContextSnapshot & {
  name: string;
  occurrence: number;
  timestampMs: number;
  programs: number;
  geometries: number;
  textures: number;
  heapMb: number | null;
};

export type SlowFrameMarker = FrameContextSnapshot & {
  timestampMs: number;
  durationMs: number;
  recentEvent: string;
  recentEvents: string[];
  programs: number;
  programDelta: number;
  geometries: number;
  textures: number;
  drawCalls: number;
  triangles: number;
  heapMb: number | null;
  heapDeltaMb: number | null;
};

export type WorstFrameMarker = FrameContextSnapshot & {
  timestampMs: number;
  durationMs: number;
  recentEvent: string;
  programs: number;
  geometries: number;
  textures: number;
  drawCalls: number;
  triangles: number;
  heapMb: number | null;
};

export type FrameTimeline = {
  events: FrameEventMarker[];
  slowFrames: SlowFrameMarker[];
  /** Slowest frames regardless of the 50 ms hitch threshold. */
  worstFrames: WorstFrameMarker[];
  programCountAtStart: number;
  programCountAtEnd: number;
  gcCandidateFrames: number;
};

/** Capacity of the sample ring. 60 s at 240 Hz, far past any real window. */
const MAX_SAMPLES = 14_400;
const MAX_TIMELINE_EVENTS = 128;
const MAX_SLOW_FRAMES = 128;
const MAX_WORST_FRAMES = 20;
const RECENT_EVENT_WINDOW_MS = 1_800;
const EMPTY_FRAME_CONTEXT: FrameContextSnapshot = {
  activeVfx: 0,
  projectiles: 0,
  enemies: 0,
  explosions: 0,
  impacts: 0,
  shieldEffects: 0,
  fragments: 0,
  damageMarks: 0,
  temporaryLights: 0,
  trails: 0,
  groundQueries: 0,
  raycasts: 0,
  collisionQueries: 0,
  groundUpdateMs: 0,
  visibleObjects: 0,
  newlyVisibleObjects: 0,
  shadowUpdate: 0
};

function percentile(sorted: Float64Array, count: number, fraction: number): number {
  if (count === 0) return 0;
  const index = Math.min(count - 1, Math.max(0, Math.round(fraction * (count - 1))));
  return sorted[index];
}

export class FrameProfiler {
  private readonly samples = new Float64Array(MAX_SAMPLES);
  private readonly scratch = new Float64Array(MAX_SAMPLES);
  private count = 0;
  private recording = false;
  private label = '';
  private startedAt = 0;
  private programCountAtStart = 0;
  private previousHeapBytes = 0;
  private readonly eventOccurrences = new Map<string, number>();
  private readonly events: FrameEventMarker[] = [];
  private readonly slowFrames: SlowFrameMarker[] = [];
  private readonly worstFrames: WorstFrameMarker[] = [];
  private gcCandidateFrames = 0;

  /** True while a window is open, so the caller can wait it out. */
  get active(): boolean {
    return this.recording;
  }

  get currentLabel(): string {
    return this.label;
  }

  start(label: string, renderer?: THREE.WebGLRenderer): void {
    this.label = label;
    this.count = 0;
    this.startedAt = performance.now();
    this.programCountAtStart = renderer?.info.programs?.length ?? 0;
    this.previousHeapBytes = this.readHeapBytes();
    this.eventOccurrences.clear();
    this.events.length = 0;
    this.slowFrames.length = 0;
    this.worstFrames.length = 0;
    this.gcCandidateFrames = 0;
    this.recording = true;
  }

  /** One frame's wall-clock duration, in milliseconds. */
  sample(
    frameMs: number,
    renderer?: THREE.WebGLRenderer,
    contextProvider?: () => FrameContextSnapshot
  ): void {
    if (!this.recording || this.count >= MAX_SAMPLES) return;
    // The very first frame after a mode switch carries the switch itself and
    // would dominate the maximum; it is dropped rather than allowed to lie.
    this.samples[this.count] = frameMs;
    this.count += 1;
    const heapBytes = this.readHeapBytes();
    const heapDeltaBytes = heapBytes > 0 && this.previousHeapBytes > 0
      ? heapBytes - this.previousHeapBytes
      : 0;
    if (heapBytes > 0) this.previousHeapBytes = heapBytes;
    if (frameMs > 50 && renderer && this.slowFrames.length < MAX_SLOW_FRAMES) {
      const context = contextProvider?.() ?? EMPTY_FRAME_CONTEXT;
      const now = performance.now();
      const frameEndedAtMs = now - this.startedAt;
      const frameStartedAtMs = frameEndedAtMs - frameMs;
      const candidateEvents: FrameEventMarker[] = [];
      // `sample` runs at the beginning of the next RAF, so a marker emitted by
      // the frame being measured can be `frameMs` old already. Include that
      // frame span or the event that caused a long compile hitch disappears
      // from its own correlation window.
      const oldestRelevantTimestamp = frameStartedAtMs - RECENT_EVENT_WINDOW_MS;
      for (let index = this.events.length - 1; index >= 0; index -= 1) {
        const event = this.events[index];
        if (event.timestampMs < oldestRelevantTimestamp) break;
        if (event.timestampMs <= frameEndedAtMs) candidateEvents.push(event);
      }
      const causalEvent = candidateEvents.reduce<FrameEventMarker | undefined>((nearest, event) => (
        !nearest || Math.abs(event.timestampMs - frameStartedAtMs) < Math.abs(nearest.timestampMs - frameStartedAtMs)
          ? event
          : nearest
      ), undefined);
      const recentEvents = candidateEvents
        .sort((left, right) => Math.abs(left.timestampMs - frameStartedAtMs) - Math.abs(right.timestampMs - frameStartedAtMs))
        .slice(0, 6)
        .sort((left, right) => left.timestampMs - right.timestampMs)
        .map((event) => event.name);
      const heapDeltaMb = heapBytes > 0 ? Number((heapDeltaBytes / 1048576).toFixed(2)) : null;
      if (heapDeltaMb !== null && heapDeltaMb < -0.5) this.gcCandidateFrames += 1;
      this.slowFrames.push({
        timestampMs: Number((now - this.startedAt).toFixed(2)),
        durationMs: Number(frameMs.toFixed(2)),
        recentEvent: causalEvent?.name ?? '',
        recentEvents,
        programs: renderer.info.programs?.length ?? 0,
        programDelta: (renderer.info.programs?.length ?? 0) - this.programCountAtStart,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        heapMb: heapBytes > 0 ? Number((heapBytes / 1048576).toFixed(2)) : null,
        heapDeltaMb,
        ...context
      });
    }
    if (renderer && (this.worstFrames.length < MAX_WORST_FRAMES || frameMs > this.minimumWorstFrameMs())) {
      const context = contextProvider?.() ?? EMPTY_FRAME_CONTEXT;
      const now = performance.now();
      const timestampMs = now - this.startedAt;
      let recentEvent = '';
      for (let index = this.events.length - 1; index >= 0; index -= 1) {
        if (this.events[index].timestampMs > timestampMs) continue;
        if (timestampMs - this.events[index].timestampMs > RECENT_EVENT_WINDOW_MS) break;
        recentEvent = this.events[index].name;
        break;
      }
      const candidate: WorstFrameMarker = {
        timestampMs: Number(timestampMs.toFixed(2)),
        durationMs: Number(frameMs.toFixed(2)),
        recentEvent,
        programs: renderer.info.programs?.length ?? 0,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        heapMb: heapBytes > 0 ? Number((heapBytes / 1048576).toFixed(2)) : null,
        ...context
      };
      if (this.worstFrames.length < MAX_WORST_FRAMES) {
        this.worstFrames.push(candidate);
      } else {
        let minimumIndex = 0;
        for (let index = 1; index < this.worstFrames.length; index += 1) {
          if (this.worstFrames[index].durationMs < this.worstFrames[minimumIndex].durationMs) minimumIndex = index;
        }
        this.worstFrames[minimumIndex] = candidate;
      }
    }
  }

  /** Records only discrete first-use events; never called by the normal hot path. */
  mark(
    name: string,
    renderer?: THREE.WebGLRenderer,
    contextProvider?: () => FrameContextSnapshot
  ): void {
    if (!this.recording || this.events.length >= MAX_TIMELINE_EVENTS) return;
    const occurrence = (this.eventOccurrences.get(name) ?? 0) + 1;
    this.eventOccurrences.set(name, occurrence);
    const context = contextProvider?.() ?? EMPTY_FRAME_CONTEXT;
    const heapBytes = this.readHeapBytes();
    this.events.push({
      name: occurrence === 1 ? `first-${name}` : `${name}-${occurrence}`,
      occurrence,
      timestampMs: Number((performance.now() - this.startedAt).toFixed(2)),
      programs: renderer?.info.programs?.length ?? 0,
      geometries: renderer?.info.memory.geometries ?? 0,
      textures: renderer?.info.memory.textures ?? 0,
      heapMb: heapBytes > 0 ? Number((heapBytes / 1048576).toFixed(2)) : null,
      ...context
    });
  }

  markOnce(
    name: string,
    renderer?: THREE.WebGLRenderer,
    contextProvider?: () => FrameContextSnapshot
  ): void {
    if (this.eventOccurrences.has(name)) return;
    this.mark(name, renderer, contextProvider);
  }

  stop(renderer: THREE.WebGLRenderer): ProfileResult {
    this.recording = false;
    return this.snapshot(renderer);
  }

  /** Reads the current window without interrupting it (used by the F9 overlay). */
  snapshot(renderer: THREE.WebGLRenderer): ProfileResult {
    const count = this.count;
    const frames = this.summarise(count);
    return {
      label: this.label,
      frames,
      renderer: this.readRenderer(renderer),
      device: this.readDevice(renderer),
      timeline: {
        events: this.events.map((event) => ({ ...event })),
        slowFrames: this.slowFrames.map((frame) => ({ ...frame, recentEvents: [...frame.recentEvents] })),
        worstFrames: this.worstFrames
          .map((frame) => ({ ...frame }))
          .sort((left, right) => right.durationMs - left.durationMs),
        programCountAtStart: this.programCountAtStart,
        programCountAtEnd: renderer.info.programs?.length ?? 0,
        gcCandidateFrames: this.gcCandidateFrames
      }
    };
  }

  /** Drops an overlay-owned window without allocating a summary. */
  cancel(): void {
    this.recording = false;
    this.count = 0;
    this.events.length = 0;
    this.slowFrames.length = 0;
    this.worstFrames.length = 0;
  }

  private minimumWorstFrameMs(): number {
    let minimum = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.worstFrames.length; index += 1) {
      if (this.worstFrames[index].durationMs < minimum) minimum = this.worstFrames[index].durationMs;
    }
    return minimum;
  }

  private readHeapBytes(): number {
    return (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
  }

  private summarise(count: number): FrameStats {
    if (count === 0) {
      return {
        frames: 0, seconds: 0, fpsAverage: 0, fpsOnePercentLow: 0,
        frameMs: { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 },
        over33ms: 0, over50ms: 0, longestRunOver33ms: 0
      };
    }
    let total = 0;
    let over33 = 0;
    let over50 = 0;
    let run = 0;
    let longestRun = 0;
    for (let i = 0; i < count; i += 1) {
      const value = this.samples[i];
      total += value;
      this.scratch[i] = value;
      if (value > 33) {
        over33 += 1;
        run += 1;
        if (run > longestRun) longestRun = run;
      } else {
        run = 0;
      }
      if (value > 50) over50 += 1;
    }
    const sorted = this.scratch.subarray(0, count);
    sorted.sort();

    // 1% low: mean of the slowest one percent, expressed as a frame rate.
    const lowCount = Math.max(1, Math.floor(count * 0.01));
    let lowTotal = 0;
    for (let i = count - lowCount; i < count; i += 1) lowTotal += sorted[i];
    const lowMean = lowTotal / lowCount;

    const mean = total / count;
    return {
      frames: count,
      seconds: Number((total / 1000).toFixed(2)),
      fpsAverage: Number((1000 / mean).toFixed(1)),
      fpsOnePercentLow: Number((1000 / lowMean).toFixed(1)),
      frameMs: {
        mean: Number(mean.toFixed(2)),
        p50: Number(percentile(sorted, count, 0.5).toFixed(2)),
        p95: Number(percentile(sorted, count, 0.95).toFixed(2)),
        p99: Number(percentile(sorted, count, 0.99).toFixed(2)),
        max: Number(sorted[count - 1].toFixed(2))
      },
      over33ms: over33,
      over50ms: over50,
      longestRunOver33ms: longestRun
    };
  }

  private readRenderer(renderer: THREE.WebGLRenderer): RendererSnapshot {
    const info = renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      lines: info.render.lines,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0
    };
  }

  private readDevice(renderer: THREE.WebGLRenderer): DeviceSnapshot {
    const context = renderer.getContext();
    const canvas = renderer.domElement;
    let glRenderer = 'unknown';
    let glVendor = 'unknown';
    // The unmasked strings are what distinguish a real GPU from SwiftShader,
    // which is the single most important fact about any of these numbers.
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      glRenderer = String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? 'unknown');
      glVendor = String(context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) ?? 'unknown');
    }
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return {
      glRenderer,
      glVendor,
      devicePixelRatio: Number(window.devicePixelRatio.toFixed(2)),
      rendererPixelRatio: Number(renderer.getPixelRatio().toFixed(2)),
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      drawingBufferWidth: context.drawingBufferWidth,
      drawingBufferHeight: context.drawingBufferHeight,
      drawingBufferPixels: context.drawingBufferWidth * context.drawingBufferHeight,
      jsHeapMb: memory ? Number((memory.usedJSHeapSize / 1048576).toFixed(1)) : null
    };
  }
}
