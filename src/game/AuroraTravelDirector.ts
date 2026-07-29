import * as THREE from 'three';
import { auroraSectorDefinitions, type Mission09StepId } from '../assets/mission09Definitions';
import type { AuroraTravelSegment, SfxCue } from '../audio/audioDefinitions';

export type AuroraEnvironmentalEvent =
  | 'none'
  | 'dustGust'
  | 'canyonEcho'
  | 'stormSurge'
  | 'fogVeil';

export interface AuroraTravelState {
  segment: AuroraTravelSegment;
  segmentIndex: number;
  /** 0 → still air, 1 → the plateau at full storm. */
  stormIntensity: number;
  /** Lateral wind pushing dust across the route. */
  windIntensity: number;
  /** Visibility loss: ash haze on the plains, dense veil before the Umbral. */
  fogIntensity: number;
  event: AuroraEnvironmentalEvent;
  eventActive: boolean;
  /** True while the journey is staged cinematically (wider FOV, weather). */
  cinematicActive: boolean;
}

type CueEmitter = (cue: SfxCue, volume: number, cooldownSeconds: number) => void;

const SEGMENT_ORDER: readonly AuroraTravelSegment[] = [
  'departure',
  'ashPlains',
  'atlasCanyons',
  'stormPlateau',
  'preReveal',
  'reveal',
  'completion'
];

/**
 * Stages the Aurora expedition as a journey rather than a waypoint run.
 *
 * It reads only what already exists — the pilot's position, the mission step
 * and the Base Nereida signal — and derives from it the current leg, the
 * weather intensities that the sector visuals and the fog ride on, and a
 * discrete environmental event. Sound is emitted through a callback with
 * per-cue cooldowns so the director never touches the audio stack directly,
 * and nothing here is authoritative game state: every value is recomputed
 * from position each frame, so there is nothing new to persist in a save.
 *
 * Deterministic (all motion derives from `elapsed`), allocation-free per
 * frame, and it never takes control away from the player.
 */
export class AuroraTravelDirector {
  private readonly sectorCenters: THREE.Vector3[] = [];
  private readonly current: AuroraTravelState = {
    segment: 'departure',
    segmentIndex: 0,
    stormIntensity: 0,
    windIntensity: 0,
    fogIntensity: 0,
    event: 'none',
    eventActive: false,
    cinematicActive: false
  };
  private revealAt = -Infinity;
  private lastSegment: AuroraTravelSegment | null = null;
  private forcedSegment: AuroraTravelSegment | null = null;
  private forcedUntil = -Infinity;

  constructor(private readonly emitCue: CueEmitter) {
    for (const definition of auroraSectorDefinitions) {
      this.sectorCenters.push(new THREE.Vector3(definition.center[0], 0, definition.center[1]));
    }
  }

  get state(): Readonly<AuroraTravelState> {
    return this.current;
  }

  /** Debug/probe hook: hold a leg for a few seconds regardless of position. */
  forceSegment(segment: AuroraTravelSegment, elapsed: number, holdSeconds = 12): void {
    this.forcedSegment = segment;
    this.forcedUntil = elapsed + holdSeconds;
  }

  reset(): void {
    this.current.segment = 'departure';
    this.current.segmentIndex = 0;
    this.current.stormIntensity = 0;
    this.current.windIntensity = 0;
    this.current.fogIntensity = 0;
    this.current.event = 'none';
    this.current.eventActive = false;
    this.current.cinematicActive = false;
    this.revealAt = -Infinity;
    this.lastSegment = null;
    this.forcedSegment = null;
    this.forcedUntil = -Infinity;
  }

  update(input: {
    started: boolean;
    step: Mission09StepId;
    discovered: boolean;
    completed: boolean;
    position: THREE.Vector3;
    elapsed: number;
  }): Readonly<AuroraTravelState> {
    const { started, step, discovered, position, elapsed } = input;
    if (!started) {
      if (this.current.cinematicActive) this.reset();
      return this.current;
    }

    const segment = this.resolveSegment(step, discovered, position, elapsed);
    this.current.segment = segment;
    this.current.segmentIndex = SEGMENT_ORDER.indexOf(segment);
    this.current.cinematicActive = segment !== 'departure' && !discovered;

    // Proximity to the storm plateau centre drives the weather ramp, so the
    // tension rises as the pilot flies into it instead of snapping on.
    const plateauDistance = position.distanceTo(this.sectorCenters[3] ?? position);
    const plateauNearness = THREE.MathUtils.clamp(1 - plateauDistance / 900, 0, 1);

    switch (segment) {
      case 'departure':
        this.current.windIntensity = 0.12;
        this.current.stormIntensity = 0;
        this.current.fogIntensity = 0.05;
        break;
      case 'ashPlains': {
        // Lateral gusts on a ~9 s cycle: they build, sweep, and release.
        const gust = Math.max(0, Math.sin(elapsed * 0.7) * Math.sin(elapsed * 0.23));
        this.current.windIntensity = 0.35 + gust * 0.5;
        this.current.stormIntensity = 0.12;
        this.current.fogIntensity = 0.22 + gust * 0.24;
        break;
      }
      case 'atlasCanyons': {
        const echo = 0.5 + Math.sin(elapsed * 0.42) * 0.5;
        this.current.windIntensity = 0.2 + echo * 0.12;
        this.current.stormIntensity = 0.08;
        this.current.fogIntensity = 0.14;
        break;
      }
      case 'stormPlateau':
        this.current.windIntensity = 0.55 + plateauNearness * 0.35;
        this.current.stormIntensity = 0.35 + plateauNearness * 0.65;
        this.current.fogIntensity = 0.3 + plateauNearness * 0.2;
        break;
      case 'preReveal': {
        // The storm falls away and a dense, quiet veil takes its place.
        this.current.windIntensity = 0.18;
        this.current.stormIntensity = Math.max(0, this.current.stormIntensity - 0.006);
        this.current.fogIntensity = 0.85;
        break;
      }
      case 'reveal':
      case 'completion':
        this.current.windIntensity = 0.1;
        this.current.stormIntensity = 0;
        this.current.fogIntensity = Math.max(0.08, this.current.fogIntensity - 0.01);
        break;
    }

    this.updateEvents(segment, elapsed);
    this.announceSegmentChange(segment);
    return this.current;
  }

  private resolveSegment(
    step: Mission09StepId,
    discovered: boolean,
    position: THREE.Vector3,
    elapsed: number
  ): AuroraTravelSegment {
    if (this.forcedSegment && elapsed < this.forcedUntil) return this.forcedSegment;
    if (discovered) {
      if (this.revealAt === -Infinity) this.revealAt = elapsed;
      // The reveal bed holds for a while, then settles into the closing one.
      return elapsed - this.revealAt > 26 ? 'completion' : 'reveal';
    }
    this.revealAt = -Infinity;
    if (step === 'inactive' || step === 'analyzeResidual') return 'departure';

    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.sectorCenters.length; i += 1) {
      const distance = position.distanceTo(this.sectorCenters[i]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = i;
      }
    }
    return SEGMENT_ORDER[Math.min(nearest, 4)];
  }

  /**
   * One discrete environmental beat at a time, on long deterministic cycles.
   * Cooldowns live in the emitter, so a lingering player hears the weather
   * breathe rather than machine-gun.
   */
  private updateEvents(segment: AuroraTravelSegment, elapsed: number): void {
    let event: AuroraEnvironmentalEvent = 'none';
    switch (segment) {
      case 'ashPlains': {
        const cycle = (elapsed * 0.11) % 1;
        if (cycle < 0.3) {
          event = 'dustGust';
          this.emitCue('auroraDustSweep', 0.4 + this.current.windIntensity * 0.25, 9);
          if (this.current.windIntensity > 0.7) this.emitCue('auroraWindGust', 0.42, 13);
        }
        break;
      }
      case 'atlasCanyons': {
        const cycle = (elapsed * 0.08) % 1;
        if (cycle < 0.16) {
          event = 'canyonEcho';
          this.emitCue('atlasRouteLock', 0.34, 14);
        }
        break;
      }
      case 'stormPlateau': {
        const cycle = (elapsed * 0.075) % 1;
        if (cycle < 0.2) {
          event = 'stormSurge';
          this.emitCue('farThunder', 0.32 + this.current.stormIntensity * 0.24, 11);
          if (this.current.stormIntensity > 0.75) this.emitCue('shipTurbulence', 0.3, 8);
        }
        break;
      }
      case 'preReveal':
        event = 'fogVeil';
        break;
      default:
        break;
    }
    this.current.event = event;
    this.current.eventActive = event !== 'none';
  }

  /** One-shot accents at the exact moment a leg changes. */
  private announceSegmentChange(segment: AuroraTravelSegment): void {
    if (this.lastSegment === segment) return;
    const previous = this.lastSegment;
    this.lastSegment = segment;
    if (previous === null) return;
    if (segment === 'stormPlateau') this.emitCue('baseSignalDrop', 0.5, 20);
    if (segment === 'preReveal') this.emitCue('auroraFogOpen', 0.45, 20);
    if (segment === 'reveal') this.emitCue('auroraRevealSwell', 0.7, 20);
  }
}
