import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export type PostPassId = 'render' | 'bloom' | 'output' | 'grade' | 'combined';

export type PostProcessingDiagnostics = {
  sizeCalls: number;
  sizeChanges: number;
  bloomResizes: number;
  sampleReconfigurations: number;
  composer: {
    width: number;
    height: number;
    pixelRatio: number;
    samples: number;
    type: string;
    format: string;
    targetCount: number;
  };
  passes: Array<{
    id: PostPassId;
    index: number;
    type: string;
    enabled: boolean;
    inputWidth: number;
    inputHeight: number;
    outputWidth: number;
    outputHeight: number;
    samples: number;
    estimatedPixelWrites: number;
  }>;
  bloom: {
    scale: number;
    strength: number;
    radius: number;
    threshold: number;
    mips: number;
    bright: { width: number; height: number; type: string; samples: number };
    horizontal: Array<{ width: number; height: number }>;
    vertical: Array<{ width: number; height: number }>;
    estimatedPixelWrites: number;
  };
  fusedOutputGrade: boolean;
  gpuTimerQueryAvailable: boolean;
};

type BloomInternals = UnrealBloomPass & {
  nMips: number;
  renderTargetBright: THREE.WebGLRenderTarget;
  renderTargetsHorizontal: THREE.WebGLRenderTarget[];
  renderTargetsVertical: THREE.WebGLRenderTarget[];
};

/**
 * Final cinematic grade applied after tone mapping: gentle vignette, very
 * light film grain and a whisper of chromatic aberration at the frame
 * edges. Values stay subtle so gameplay readability never suffers.
 */
const CinematicGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.02 },
    uAberration: { value: 0.00028 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    /** 0..1 heat-haze refraction, driven by the entry profile. */
    uHaze: { value: 0 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform vec3 uTint;
    uniform float uHaze;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7)) + uTime * 61.7) * 43758.5453);
    }

    // Smooth 2D value noise, used only for the heat shimmer.
    float snoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
      float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
      float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
      float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    void main() {
      vec2 center = vUv - 0.5;
      float edge = length(center);

      vec2 uv = vUv;
      // Heat haze: air of varying density in front of the camera bends the
      // image. Strongest low in the frame, where the shock layer sits, and
      // scrolling upward like rising hot air. Costs two noise taps and only
      // does anything while uHaze is non-zero.
      if (uHaze > 0.001) {
        float shimmer = snoise(vec2(vUv.x * 26.0, vUv.y * 14.0 - uTime * 2.4));
        float shimmer2 = snoise(vec2(vUv.x * 51.0 + 7.3, vUv.y * 29.0 - uTime * 4.1));
        float band = smoothstep(0.85, 0.1, vUv.y);
        vec2 offset = vec2(shimmer - 0.5, shimmer2 - 0.5);
        uv += offset * uHaze * band * 0.012;
      }

      // Chromatic aberration scales with distance from center, and widens
      // through the shock layer where the air itself disperses light.
      vec2 shift = center * (uAberration + uHaze * 0.0012) * edge * 24.0;
      float r = texture2D(tDiffuse, uv + shift).r;
      vec2 ga = texture2D(tDiffuse, uv).ga;
      float b = texture2D(tDiffuse, uv - shift).b;
      vec3 color = vec3(r, ga.x, b);

      // Soft cinematic vignette.
      float vignette = smoothstep(0.92, 0.28, edge * (1.0 + uVignette));
      color *= mix(1.0 - uVignette * 0.5, 1.0, vignette);

      // Fine animated grain lifts flat gradients.
      float grain = (hash(vUv * vec2(1920.0, 1080.0)) - 0.5) * uGrain;
      color += grain;

      // Per-phase color grade: warm during entry, earthy on the surface.
      color *= uTint;

      gl_FragColor = vec4(color, ga.y);
    }
  `
};

/**
 * The production path folds OutputPass and the display-space grade into one
 * fullscreen draw. ACES and sRGB are applied before vignette/grain/tint, so the
 * visual ordering remains the same while one full-resolution ping-pong pass is
 * removed.
 */
const CinematicOutputGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    toneMappingExposure: { value: 1 },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.02 },
    uAberration: { value: 0.00028 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uHaze: { value: 0 }
  },
  vertexShader: CinematicGradeShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform vec3 uTint;
    uniform float uHaze;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7)) + uTime * 61.7) * 43758.5453);
    }

    float snoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
      float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
      float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
      float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    vec3 displayColor(vec3 linearColor) {
      vec4 mapped = vec4(ACESFilmicToneMapping(linearColor), 1.0);
      return sRGBTransferOETF(mapped).rgb;
    }

    void main() {
      vec2 center = vUv - 0.5;
      float edge = length(center);
      vec2 uv = vUv;
      if (uHaze > 0.001) {
        float shimmer = snoise(vec2(vUv.x * 26.0, vUv.y * 14.0 - uTime * 2.4));
        float shimmer2 = snoise(vec2(vUv.x * 51.0 + 7.3, vUv.y * 29.0 - uTime * 4.1));
        float band = smoothstep(0.85, 0.1, vUv.y);
        uv += vec2(shimmer - 0.5, shimmer2 - 0.5) * uHaze * band * 0.012;
      }

      vec2 shift = center * (uAberration + uHaze * 0.0012) * edge * 24.0;
      vec4 centerSample = texture2D(tDiffuse, uv);
      vec3 linearColor = vec3(
        texture2D(tDiffuse, uv + shift).r,
        centerSample.g,
        texture2D(tDiffuse, uv - shift).b
      );
      vec3 color = displayColor(linearColor);
      float vignette = smoothstep(0.92, 0.28, edge * (1.0 + uVignette));
      color *= mix(1.0 - uVignette * 0.5, 1.0, vignette);
      color += (hash(vUv * vec2(1920.0, 1080.0)) - 0.5) * uGrain;
      color *= uTint;
      gl_FragColor = vec4(color, centerSample.a);
    }
  `
};

export class PostProcessing {
  readonly composer: EffectComposer;

  readonly renderPass: RenderPass;

  readonly bloomPass: UnrealBloomPass;

  readonly outputPass: OutputPass;

  private readonly gradePass: ShaderPass;

  private readonly combinedGradePass: ShaderPass;

  private readonly renderer: THREE.WebGLRenderer;

  private readonly tintTarget = new THREE.Vector3(1, 1, 1);

  /** Base bloom strength; entry adds on top of it and restores it after. */
  private baseBloomStrength = 0.46;

  private hazeTarget = 0;

  private bloomBoost = 0;

  private bloomScale = 1;

  private width = 0;

  private height = 0;

  private composerPixelRatio: number;

  private sizeCalls = 0;

  private sizeChanges = 0;

  private bloomResizes = 0;

  private sampleReconfigurations = 0;

  private fusedOutputGrade = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: { samples?: number; bloomScale?: number; fusedOutputGrade?: boolean } = {}
  ) {
    this.renderer = renderer;
    this.composerPixelRatio = renderer.getPixelRatio();
    // MSAA render target: keeps edges clean since the default framebuffer
    // antialiasing no longer applies once we render through the composer.
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const renderTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
      type: THREE.HalfFloatType,
      samples: options.samples ?? 4
    });

    this.composer = new EffectComposer(renderer, renderTarget);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.46,
      0.58,
      0.9
    );
    this.composer.addPass(this.bloomPass);

    // OutputPass performs tone mapping + sRGB conversion; the grade shader
    // then works in display space, which is what grain/vignette want.
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.gradePass = new ShaderPass(CinematicGradeShader);
    this.composer.addPass(this.gradePass);
    this.combinedGradePass = new ShaderPass(CinematicOutputGradeShader);
    this.composer.addPass(this.combinedGradePass);
    this.bloomScale = options.bloomScale ?? 1;
    this.setFusedOutputGrade(options.fusedOutputGrade ?? false);
    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(width: number, height: number): void {
    this.sizeCalls += 1;
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));
    const nextPixelRatio = this.renderer.getPixelRatio();
    const sizeChanged = nextWidth !== this.width || nextHeight !== this.height;
    const pixelRatioChanged = Math.abs(nextPixelRatio - this.composerPixelRatio) > 0.001;
    if (!sizeChanged && !pixelRatioChanged) return;

    this.sizeChanges += 1;
    if (pixelRatioChanged) {
      this.composer.setPixelRatio(nextPixelRatio);
      this.composerPixelRatio = nextPixelRatio;
    }
    if (sizeChanged) this.composer.setSize(nextWidth, nextHeight);
    this.width = nextWidth;
    this.height = nextHeight;
    this.applyBloomScale();
  }

  setPassEnabled(id: PostPassId, enabled: boolean): void {
    this.getPass(id).enabled = enabled;
  }

  setBloomScale(scale: number): void {
    const next = THREE.MathUtils.clamp(scale, 0.2, 1);
    if (Math.abs(next - this.bloomScale) < 0.001) return;
    this.bloomScale = next;
    this.applyBloomScale();
  }

  setComposerSamples(samples: number): void {
    const next = Math.max(0, Math.round(samples));
    if (this.composer.renderTarget1.samples === next && this.composer.renderTarget2.samples === next) return;
    this.composer.renderTarget1.samples = next;
    this.composer.renderTarget2.samples = next;
    // Debug-only reconfiguration. Disposal forces Three to rebuild the FBO on
    // the next render; it never occurs in the gameplay hot loop.
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.sampleReconfigurations += 1;
  }

  setFusedOutputGrade(enabled: boolean): void {
    this.fusedOutputGrade = enabled;
    this.outputPass.enabled = !enabled;
    this.gradePass.enabled = !enabled;
    this.combinedGradePass.enabled = enabled;
  }

  resetDiagnostics(options: {
    bloomScale: number;
    samples: number;
    bloomEnabled: boolean;
    fusedOutputGrade: boolean;
  }): void {
    this.renderPass.enabled = true;
    this.bloomPass.enabled = options.bloomEnabled;
    this.setFusedOutputGrade(options.fusedOutputGrade);
    this.setBloomScale(options.bloomScale);
    this.setComposerSamples(options.samples);
  }

  getDiagnostics(): PostProcessingDiagnostics {
    const context = this.renderer.getContext();
    const fullWidth = this.composer.renderTarget1.width;
    const fullHeight = this.composer.renderTarget1.height;
    const fullPixels = fullWidth * fullHeight;
    const bloom = this.bloomPass as BloomInternals;
    const horizontal = bloom.renderTargetsHorizontal.map((target) => ({
      width: target.width,
      height: target.height
    }));
    const vertical = bloom.renderTargetsVertical.map((target) => ({
      width: target.width,
      height: target.height
    }));
    const mipPixels = horizontal.reduce((total, target) => total + target.width * target.height, 0);
    const brightPixels = bloom.renderTargetBright.width * bloom.renderTargetBright.height;
    // Bright extraction + horizontal/vertical mips + composite + full-size add.
    const bloomPixelWrites = brightPixels + mipPixels * 2 + brightPixels + fullPixels;
    const samples = this.composer.renderTarget1.samples;
    const passValues: Array<[
      PostPassId,
      { enabled: boolean },
      string,
      number
    ]> = [
      ['render', this.renderPass, 'RenderPass', fullPixels * Math.max(1, samples)],
      ['bloom', this.bloomPass, 'UnrealBloomPass', bloomPixelWrites],
      ['output', this.outputPass, 'OutputPass', fullPixels],
      ['grade', this.gradePass, 'ShaderPass(CinematicGrade)', fullPixels],
      ['combined', this.combinedGradePass, 'ShaderPass(CinematicOutputGrade)', fullPixels]
    ];
    const targetType = textureTypeName(this.composer.renderTarget1.texture.type);
    return {
      sizeCalls: this.sizeCalls,
      sizeChanges: this.sizeChanges,
      bloomResizes: this.bloomResizes,
      sampleReconfigurations: this.sampleReconfigurations,
      composer: {
        width: fullWidth,
        height: fullHeight,
        pixelRatio: this.composerPixelRatio,
        samples,
        type: targetType,
        format: textureFormatName(this.composer.renderTarget1.texture.format),
        targetCount: 2
      },
      passes: passValues.map(([id, pass, type, estimatedPixelWrites], index) => ({
        id,
        index,
        type,
        enabled: pass.enabled,
        inputWidth: fullWidth,
        inputHeight: fullHeight,
        outputWidth: fullWidth,
        outputHeight: fullHeight,
        samples: id === 'render' ? samples : 0,
        estimatedPixelWrites
      })),
      bloom: {
        scale: this.bloomScale,
        strength: this.bloomPass.strength,
        radius: this.bloomPass.radius,
        threshold: this.bloomPass.threshold,
        mips: bloom.nMips,
        bright: {
          width: bloom.renderTargetBright.width,
          height: bloom.renderTargetBright.height,
          type: textureTypeName(bloom.renderTargetBright.texture.type),
          samples: bloom.renderTargetBright.samples
        },
        horizontal,
        vertical,
        estimatedPixelWrites: bloomPixelWrites
      },
      fusedOutputGrade: this.fusedOutputGrade,
      gpuTimerQueryAvailable: typeof WebGL2RenderingContext !== 'undefined' &&
        context instanceof WebGL2RenderingContext &&
        Boolean(context.getExtension('EXT_disjoint_timer_query_webgl2'))
    };
  }

  /** Target color grade for the current phase; eased over ~2 s in render. */
  setTintTarget(r: number, g: number, b: number): void {
    this.tintTarget.set(r, g, b);
  }

  /**
   * Atmospheric-entry grade: screen-space heat haze and extra bloom through
   * the shock layer. Both ease toward their targets so leaving the entry never
   * snaps, and both return to exactly the base values when the entry ends —
   * nothing else in the game ever sees these move.
   */
  setEntryGrade(haze: number, bloomBoost: number): void {
    this.hazeTarget = Math.min(1, Math.max(0, haze));
    this.bloomBoost = Math.max(0, bloomBoost);
  }

  render(delta: number, elapsed: number): void {
    this.updateGradeUniforms(this.gradePass, delta, elapsed);
    this.updateGradeUniforms(this.combinedGradePass, delta, elapsed);
    this.combinedGradePass.uniforms.toneMappingExposure.value = this.renderer.toneMappingExposure;
    const targetBloom = this.baseBloomStrength + this.bloomBoost;
    this.bloomPass.strength = THREE.MathUtils.lerp(
      this.bloomPass.strength,
      targetBloom,
      1 - Math.pow(0.08, delta)
    );

    this.composer.render(delta);
  }

  private getPass(id: PostPassId): { enabled: boolean } {
    if (id === 'render') return this.renderPass;
    if (id === 'bloom') return this.bloomPass;
    if (id === 'output') return this.outputPass;
    if (id === 'grade') return this.gradePass;
    return this.combinedGradePass;
  }

  private applyBloomScale(): void {
    if (this.width <= 0 || this.height <= 0) return;
    const effectiveWidth = Math.max(1, Math.round(this.width * this.composerPixelRatio * this.bloomScale));
    const effectiveHeight = Math.max(1, Math.round(this.height * this.composerPixelRatio * this.bloomScale));
    this.bloomPass.setSize(effectiveWidth, effectiveHeight);
    this.bloomResizes += 1;
  }

  private updateGradeUniforms(pass: ShaderPass, delta: number, elapsed: number): void {
    pass.uniforms.uTime.value = elapsed % 100;
    const tint = pass.uniforms.uTint.value as THREE.Vector3;
    tint.lerp(this.tintTarget, 1 - Math.pow(0.3, delta));
    const hazeUniform = pass.uniforms.uHaze;
    hazeUniform.value = THREE.MathUtils.lerp(
      hazeUniform.value as number,
      this.hazeTarget,
      1 - Math.pow(0.05, delta)
    );
  }
}

function textureTypeName(type: THREE.TextureDataType): string {
  if (type === THREE.HalfFloatType) return 'HalfFloatType';
  if (type === THREE.FloatType) return 'FloatType';
  if (type === THREE.UnsignedByteType) return 'UnsignedByteType';
  return String(type);
}

function textureFormatName(format: number): string {
  if (format === THREE.RGBAFormat) return 'RGBAFormat';
  if (format === THREE.RedFormat) return 'RedFormat';
  return String(format);
}
