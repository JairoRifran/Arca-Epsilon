import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

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

export class PostProcessing {
  readonly composer: EffectComposer;

  readonly bloomPass: UnrealBloomPass;

  private readonly gradePass: ShaderPass;

  private readonly tintTarget = new THREE.Vector3(1, 1, 1);

  /** Base bloom strength; entry adds on top of it and restores it after. */
  private baseBloomStrength = 0.52;

  private hazeTarget = 0;

  private bloomBoost = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: { samples?: number } = {}
  ) {
    // MSAA render target: keeps edges clean since the default framebuffer
    // antialiasing no longer applies once we render through the composer.
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const renderTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
      type: THREE.HalfFloatType,
      samples: options.samples ?? 4
    });

    this.composer = new EffectComposer(renderer, renderTarget);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.52,
      0.72,
      0.82
    );
    this.composer.addPass(this.bloomPass);

    // OutputPass performs tone mapping + sRGB conversion; the grade shader
    // then works in display space, which is what grain/vignette want.
    this.composer.addPass(new OutputPass());

    this.gradePass = new ShaderPass(CinematicGradeShader);
    this.composer.addPass(this.gradePass);
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
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
    this.gradePass.uniforms.uTime.value = elapsed % 100;
    const tint = this.gradePass.uniforms.uTint.value as THREE.Vector3;
    tint.lerp(this.tintTarget, 1 - Math.pow(0.3, delta));

    const hazeUniform = this.gradePass.uniforms.uHaze;
    hazeUniform.value = THREE.MathUtils.lerp(
      hazeUniform.value as number,
      this.hazeTarget,
      1 - Math.pow(0.05, delta)
    );
    const targetBloom = this.baseBloomStrength + this.bloomBoost;
    this.bloomPass.strength = THREE.MathUtils.lerp(
      this.bloomPass.strength,
      targetBloom,
      1 - Math.pow(0.08, delta)
    );

    this.composer.render(delta);
  }
}
