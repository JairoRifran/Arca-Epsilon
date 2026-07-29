import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

export type GpuParticleFieldOptions = {
  name: string;
  count: number;
  /** Half-extents of the volume the field wraps inside, world units. */
  bounds: THREE.Vector3;
  color: THREE.ColorRepresentation;
  /** Base point size in world units before per-particle variation. */
  size: number;
  sizeVariation?: number;
  opacity: number;
  /** Steady drift, world units per second. */
  wind?: THREE.Vector3;
  /** Amplitude of the swirling component. 0 disables it. */
  turbulence?: number;
  /** How strongly particles settle downward. Negative floats them up. */
  gravity?: number;
  /** Optional point that particles drift toward: xyz + strength in w. */
  attractor?: THREE.Vector4;
  /** Particles fade out past this distance from camera. */
  fadeDistance?: number;
  additive?: boolean;
  /** Bias the vertical distribution: 1 = uniform, >1 hugs the ground. */
  groundBias?: number;
};

/**
 * A self-contained particle field whose motion is computed entirely on the
 * GPU.
 *
 * Every particle carries a fixed random seed; the vertex shader turns that
 * seed plus elapsed time into a position, so the CPU never touches a single
 * particle. Per frame this costs one uniform write and one draw call, and it
 * allocates nothing — which is what makes it affordable to run several of
 * these over a scene that is already the heaviest in the game.
 *
 * The motion model is deliberately physical rather than decorative: steady
 * wind, a swirling turbulence term, gravity or buoyancy, and an optional
 * attractor so dust can drift toward water. Particles wrap inside a bounded
 * volume, so density stays constant no matter how long the field runs.
 *
 * This is the WebGL expression of the same technique class the WebGPU/TSL
 * showcases use (motion in shader, per-particle emission, additive glow).
 * When a TSL path becomes viable the field can be reimplemented behind this
 * same interface without callers changing.
 */
export class GpuParticleField {
  readonly points: THREE.Points;
  readonly count: number;

  private readonly material: THREE.ShaderMaterial;
  private readonly baseOpacity: number;
  private intensity = 1;

  constructor(options: GpuParticleFieldOptions) {
    this.count = options.count;
    const geometry = new THREE.BufferGeometry();

    // Seeds are the entire per-particle state. Positions are a dummy
    // attribute: the shader overwrites them from the seed every frame.
    const positions = new Float32Array(options.count * 3);
    const seeds = new Float32Array(options.count * 3);
    const extras = new Float32Array(options.count * 2); // size scale, phase
    const groundBias = options.groundBias ?? 1;
    for (let i = 0; i < options.count; i += 1) {
      // Deterministic pseudo-random so the field is identical every run.
      const r1 = hash(i * 1.13 + 0.7);
      const r2 = hash(i * 2.71 + 3.1);
      const r3 = hash(i * 4.37 + 9.4);
      const r4 = hash(i * 5.91 + 13.7);
      seeds[i * 3] = r1;
      // Bias toward the ground: most dust lives low, a little rides high.
      seeds[i * 3 + 1] = Math.pow(r2, groundBias);
      seeds[i * 3 + 2] = r3;
      extras[i * 2] = 0.6 + r4 * (options.sizeVariation ?? 0.8);
      extras[i * 2 + 1] = r4 * Math.PI * 2;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    geometry.setAttribute('aExtra', new THREE.BufferAttribute(extras, 2));
    // The shader places particles anywhere inside the bounds, so the sphere
    // must cover the whole volume or the field pops out at glancing angles.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), options.bounds.length() * 1.5);

    this.baseOpacity = options.opacity;
    const attractor = options.attractor ?? new THREE.Vector4(0, 0, 0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOrigin: { value: new THREE.Vector3() },
        uBounds: { value: options.bounds.clone() },
        uWind: { value: (options.wind ?? new THREE.Vector3()).clone() },
        uTurbulence: { value: options.turbulence ?? 0 },
        uGravity: { value: options.gravity ?? 0 },
        uAttractor: { value: attractor.clone() },
        uColor: { value: new THREE.Color(options.color) },
        uSize: { value: options.size },
        uOpacity: { value: options.opacity },
        uFadeDistance: { value: options.fadeDistance ?? 900 },
        uMap: { value: createSoftParticleTexture(32) },
        uGust: { value: 0 }
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.name = options.name;
    this.points.frustumCulled = false;
    this.points.visible = false;
    // Render after opaque geometry so the soft sprites composite correctly.
    this.points.renderOrder = 3;
  }

  /** Recentre the volume, typically on the area the field belongs to. */
  setOrigin(x: number, y: number, z: number): void {
    (this.material.uniforms.uOrigin.value as THREE.Vector3).set(x, y, z);
  }

  setWind(x: number, y: number, z: number): void {
    (this.material.uniforms.uWind.value as THREE.Vector3).set(x, y, z);
  }

  setAttractor(x: number, y: number, z: number, strength: number): void {
    (this.material.uniforms.uAttractor.value as THREE.Vector4).set(x, y, z, strength);
  }

  /**
   * Scales opacity and effective particle count together, so quality steps
   * and distance culling both read as the field thinning out rather than
   * snapping off.
   */
  setIntensity(intensity: number): void {
    this.intensity = THREE.MathUtils.clamp(intensity, 0, 1);
    this.material.uniforms.uOpacity.value = this.baseOpacity * this.intensity;
    // Drawing fewer particles is the part that actually saves time.
    this.points.geometry.setDrawRange(0, Math.round(this.count * this.intensity));
  }

  get activeCount(): number {
    return this.points.visible ? Math.round(this.count * this.intensity) : 0;
  }

  setVisible(visible: boolean): void {
    this.points.visible = visible;
  }

  /** One uniform write per frame; no allocation, no per-particle work. */
  update(elapsed: number, gust: number): void {
    if (!this.points.visible) return;
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uGust.value = gust;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
    (this.material.uniforms.uMap.value as THREE.Texture)?.dispose();
  }
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aSeed;
  attribute vec2 aExtra;

  uniform float uTime;
  uniform vec3 uOrigin;
  uniform vec3 uBounds;
  uniform vec3 uWind;
  uniform float uTurbulence;
  uniform float uGravity;
  uniform vec4 uAttractor;
  uniform float uSize;
  uniform float uFadeDistance;
  uniform float uGust;

  varying float vAlpha;

  // Wrap a coordinate into [-extent, extent] so the volume never empties.
  // NOTE: 'half' is a reserved word in GLSL ES — do not name anything that.
  float wrap(float value, float extent) {
    float span = extent * 2.0;
    return mod(value + extent, span) - extent;
  }

  void main() {
    float phase = aExtra.y;
    // Base position from the seed, spread across the field volume.
    vec3 base = (aSeed - 0.5) * 2.0 * uBounds;

    // Steady drift plus the gust envelope shared by the whole scene.
    vec3 drift = uWind * (1.0 + uGust * 0.6) * uTime;

    // Cheap divergence-free-ish swirl: three incommensurate sines so the
    // motion never visibly loops.
    vec3 swirl = vec3(
      sin(uTime * 0.31 + phase) + sin(uTime * 0.17 + aSeed.z * 6.2),
      sin(uTime * 0.23 + phase * 1.7) * 0.5,
      cos(uTime * 0.27 + phase * 1.3) + cos(uTime * 0.13 + aSeed.x * 5.1)
    ) * uTurbulence;

    // Settling or buoyancy, wrapped so particles recirculate.
    float fall = uGravity * uTime;

    vec3 pos = base + drift + swirl;
    pos.y -= fall;
    pos.x = wrap(pos.x, uBounds.x);
    pos.y = wrap(pos.y, uBounds.y);
    pos.z = wrap(pos.z, uBounds.z);
    pos += uOrigin;

    // Optional pull toward a point of interest (water, a beacon, a module).
    if (uAttractor.w > 0.0) {
      vec3 toTarget = uAttractor.xyz - pos;
      float dist = max(length(toTarget), 1.0);
      pos += normalize(toTarget) * uAttractor.w * (1.0 / dist) * 40.0;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float viewDistance = -mvPosition.z;

    // Fade with distance, and fade the nearest particles too so they never
    // smear across the lens.
    float far = 1.0 - smoothstep(uFadeDistance * 0.55, uFadeDistance, viewDistance);
    float near = smoothstep(1.5, 12.0, viewDistance);
    vAlpha = far * near;

    gl_Position = projectionMatrix * mvPosition;
    // Perspective-correct sizing, clamped so nothing becomes a screen blob.
    gl_PointSize = clamp(uSize * aExtra.x * (300.0 / max(viewDistance, 1.0)), 1.0, 42.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform sampler2D uMap;

  varying float vAlpha;

  void main() {
    if (vAlpha <= 0.001) discard;
    vec4 texel = texture2D(uMap, gl_PointCoord);
    float alpha = texel.a * vAlpha * uOpacity;
    if (alpha <= 0.003) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;
