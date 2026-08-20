export type GroundPerformanceStage =
  | 'surfacePlayer'
  | 'planetaryWorld'
  | 'missionSystems'
  | 'hud'
  | 'sceneMotion'
  | 'camera'
  | 'characterShadow'
  | 'render'
  | 'diagnostics';

export type GroundPerformanceSnapshot = {
  frames: number;
  surfaceHeightQueriesPerFrame: number;
  surfaceHeightTimeMsPerFrame: number;
  auroraRaycastsPerFrame: number;
  cameraCollisionQueriesPerFrame: number;
  collisionQueriesPerFrame: number;
  collisionCandidatesPerFrame: number;
  collisionTimeMsPerFrame: number;
  stagesMsPerFrame: Record<GroundPerformanceStage, number>;
  maxima: {
    surfaceHeightQueries: number;
    auroraRaycasts: number;
    collisionQueries: number;
    collisionCandidates: number;
    collisionTimeMs: number;
  };
};

type CollisionFrame = {
  queriesThisFrame: number;
  queryCandidates: number;
  collisionTimeMs: number;
};

const STAGES: readonly GroundPerformanceStage[] = [
  'surfacePlayer',
  'planetaryWorld',
  'missionSystems',
  'hud',
  'sceneMotion',
  'camera',
  'characterShadow',
  'render',
  'diagnostics'
];

/** Debug-only fixed-counter telemetry. No arrays or snapshots are created in the hot loop. */
export class GroundPerformanceTelemetry {
  enabled = false;

  private frameSurfaceHeightQueries = 0;
  private frameSurfaceHeightTimeMs = 0;
  private frameAuroraRaycasts = 0;
  private frameCameraCollisionQueries = 0;
  private readonly frameStages = new Float64Array(STAGES.length);

  private frames = 0;
  private totalSurfaceHeightQueries = 0;
  private totalSurfaceHeightTimeMs = 0;
  private totalAuroraRaycasts = 0;
  private totalCameraCollisionQueries = 0;
  private totalCollisionQueries = 0;
  private totalCollisionCandidates = 0;
  private totalCollisionTimeMs = 0;
  private readonly totalStages = new Float64Array(STAGES.length);

  private maxSurfaceHeightQueries = 0;
  private maxAuroraRaycasts = 0;
  private maxCollisionQueries = 0;
  private maxCollisionCandidates = 0;
  private maxCollisionTimeMs = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.resetWindow();
  }

  beginFrame(): void {
    if (!this.enabled) return;
    this.frameSurfaceHeightQueries = 0;
    this.frameSurfaceHeightTimeMs = 0;
    this.frameAuroraRaycasts = 0;
    this.frameCameraCollisionQueries = 0;
    this.frameStages.fill(0);
  }

  beginStage(): number {
    return this.enabled ? performance.now() : 0;
  }

  endStage(stage: GroundPerformanceStage, startedAt: number): void {
    if (!this.enabled || startedAt <= 0) return;
    this.frameStages[STAGES.indexOf(stage)] += performance.now() - startedAt;
  }

  recordSurfaceHeight(durationMs: number, auroraRaycast: boolean): void {
    if (!this.enabled) return;
    this.frameSurfaceHeightQueries += 1;
    this.frameSurfaceHeightTimeMs += durationMs;
    if (auroraRaycast) this.frameAuroraRaycasts += 1;
  }

  recordCameraCollisionQuery(): void {
    if (this.enabled) this.frameCameraCollisionQueries += 1;
  }

  endFrame(collision: CollisionFrame): void {
    if (!this.enabled) return;
    this.frames += 1;
    this.totalSurfaceHeightQueries += this.frameSurfaceHeightQueries;
    this.totalSurfaceHeightTimeMs += this.frameSurfaceHeightTimeMs;
    this.totalAuroraRaycasts += this.frameAuroraRaycasts;
    this.totalCameraCollisionQueries += this.frameCameraCollisionQueries;
    this.totalCollisionQueries += collision.queriesThisFrame;
    this.totalCollisionCandidates += collision.queryCandidates;
    this.totalCollisionTimeMs += collision.collisionTimeMs;
    for (let index = 0; index < STAGES.length; index += 1) {
      this.totalStages[index] += this.frameStages[index];
    }
    this.maxSurfaceHeightQueries = Math.max(this.maxSurfaceHeightQueries, this.frameSurfaceHeightQueries);
    this.maxAuroraRaycasts = Math.max(this.maxAuroraRaycasts, this.frameAuroraRaycasts);
    this.maxCollisionQueries = Math.max(this.maxCollisionQueries, collision.queriesThisFrame);
    this.maxCollisionCandidates = Math.max(this.maxCollisionCandidates, collision.queryCandidates);
    this.maxCollisionTimeMs = Math.max(this.maxCollisionTimeMs, collision.collisionTimeMs);
  }

  resetWindow(): void {
    this.frames = 0;
    this.totalSurfaceHeightQueries = 0;
    this.totalSurfaceHeightTimeMs = 0;
    this.totalAuroraRaycasts = 0;
    this.totalCameraCollisionQueries = 0;
    this.totalCollisionQueries = 0;
    this.totalCollisionCandidates = 0;
    this.totalCollisionTimeMs = 0;
    this.totalStages.fill(0);
    this.maxSurfaceHeightQueries = 0;
    this.maxAuroraRaycasts = 0;
    this.maxCollisionQueries = 0;
    this.maxCollisionCandidates = 0;
    this.maxCollisionTimeMs = 0;
  }

  snapshot(): GroundPerformanceSnapshot {
    const divisor = Math.max(1, this.frames);
    const stagesMsPerFrame = {} as Record<GroundPerformanceStage, number>;
    for (let index = 0; index < STAGES.length; index += 1) {
      stagesMsPerFrame[STAGES[index]] = Number((this.totalStages[index] / divisor).toFixed(3));
    }
    return {
      frames: this.frames,
      surfaceHeightQueriesPerFrame: Number((this.totalSurfaceHeightQueries / divisor).toFixed(2)),
      surfaceHeightTimeMsPerFrame: Number((this.totalSurfaceHeightTimeMs / divisor).toFixed(3)),
      auroraRaycastsPerFrame: Number((this.totalAuroraRaycasts / divisor).toFixed(2)),
      cameraCollisionQueriesPerFrame: Number((this.totalCameraCollisionQueries / divisor).toFixed(2)),
      collisionQueriesPerFrame: Number((this.totalCollisionQueries / divisor).toFixed(2)),
      collisionCandidatesPerFrame: Number((this.totalCollisionCandidates / divisor).toFixed(2)),
      collisionTimeMsPerFrame: Number((this.totalCollisionTimeMs / divisor).toFixed(3)),
      stagesMsPerFrame,
      maxima: {
        surfaceHeightQueries: this.maxSurfaceHeightQueries,
        auroraRaycasts: this.maxAuroraRaycasts,
        collisionQueries: this.maxCollisionQueries,
        collisionCandidates: this.maxCollisionCandidates,
        collisionTimeMs: Number(this.maxCollisionTimeMs.toFixed(3))
      }
    };
  }

  get currentFrameContext(): {
    groundQueries: number;
    raycasts: number;
    collisionQueries: number;
    groundUpdateMs: number;
  } {
    return {
      groundQueries: this.frameSurfaceHeightQueries,
      raycasts: this.frameAuroraRaycasts,
      collisionQueries: 0,
      groundUpdateMs: Number((this.frameStages[0] + this.frameStages[1]).toFixed(3))
    };
  }
}
