export type GroundResolutionProfile = 'performance' | 'high' | 'ultra';

export type GroundResolutionState = {
  active: boolean;
  profile: GroundResolutionProfile;
  scale: number;
  minimumScale: number;
  smoothedFrameMs: number;
  overloadSeconds: number;
  headroomSeconds: number;
};

type GroundResolutionControllerOptions = {
  getBasePixelRatio: (profile: GroundResolutionProfile) => number;
  getActualPixelRatio: () => number;
  applyPixelRatio: (pixelRatio: number) => void;
};

const MINIMUM_SCALE: Record<GroundResolutionProfile, number> = {
  performance: 0.7,
  high: 0.75,
  ultra: 0.9
};

/** Conservative surface-only scaler. It changes resolution at most once per second. */
export class GroundResolutionController {
  private profile: GroundResolutionProfile = 'high';
  private active = false;
  private scale = 1;
  private smoothedFrameMs = 16.7;
  private overloadSeconds = 0;
  private headroomSeconds = 0;
  private cooldownSeconds = 0;

  constructor(private readonly options: GroundResolutionControllerOptions) {}

  setProfile(profile: GroundResolutionProfile): void {
    if (profile === this.profile) return;
    this.profile = profile;
    this.scale = Math.max(this.scale, MINIMUM_SCALE[profile]);
    this.cooldownSeconds = 0;
  }

  update(delta: number, active: boolean): void {
    if (active !== this.active) {
      this.active = active;
      this.overloadSeconds = 0;
      this.headroomSeconds = 0;
      this.cooldownSeconds = 0;
      if (!active) this.scale = 1;
      this.applyCurrentScale();
    }
    if (!active || delta <= 0 || delta > 0.2) return;

    const response = 1 - Math.exp(-delta * 2.2);
    this.smoothedFrameMs += (delta * 1000 - this.smoothedFrameMs) * response;
    this.cooldownSeconds = Math.max(0, this.cooldownSeconds - delta);
    const minimum = MINIMUM_SCALE[this.profile];

    if (this.smoothedFrameMs > 21.5) {
      this.overloadSeconds += delta;
      this.headroomSeconds = Math.max(0, this.headroomSeconds - delta * 2);
    } else if (this.smoothedFrameMs < 16.9) {
      this.headroomSeconds += delta;
      this.overloadSeconds = Math.max(0, this.overloadSeconds - delta * 2);
    } else {
      this.overloadSeconds = Math.max(0, this.overloadSeconds - delta);
      this.headroomSeconds = Math.max(0, this.headroomSeconds - delta);
    }

    if (this.cooldownSeconds <= 0 && this.overloadSeconds >= 1.8 && this.scale > minimum) {
      this.scale = Math.max(minimum, this.scale - 0.05);
      this.overloadSeconds = 0;
      this.cooldownSeconds = 1;
      this.applyCurrentScale();
    } else if (this.cooldownSeconds <= 0 && this.headroomSeconds >= 6 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.025);
      this.headroomSeconds = 0;
      this.cooldownSeconds = 2;
      this.applyCurrentScale();
    } else {
      this.ensureAppliedScale();
    }
  }

  get state(): GroundResolutionState {
    return {
      active: this.active,
      profile: this.profile,
      scale: Number(this.scale.toFixed(3)),
      minimumScale: MINIMUM_SCALE[this.profile],
      smoothedFrameMs: Number(this.smoothedFrameMs.toFixed(2)),
      overloadSeconds: Number(this.overloadSeconds.toFixed(2)),
      headroomSeconds: Number(this.headroomSeconds.toFixed(2))
    };
  }

  private ensureAppliedScale(): void {
    const expected = this.options.getBasePixelRatio(this.profile) * this.scale;
    if (Math.abs(this.options.getActualPixelRatio() - expected) > 0.005) this.applyCurrentScale();
  }

  private applyCurrentScale(): void {
    this.options.applyPixelRatio(this.options.getBasePixelRatio(this.profile) * this.scale);
  }
}
