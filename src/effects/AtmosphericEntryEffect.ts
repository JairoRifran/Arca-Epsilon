import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import type { DescentState } from '../game/DescentSystem';
import type { EntryProfile } from '../game/entryProfile';

// Shared colour stops, mutated into materials in place so the per-frame
// update never allocates a Color.
const STREAK_EMBER = new THREE.Color(0xff8a3c);
const STREAK_HOT = new THREE.Color(0xffd9a8);
const STREAK_IONISED = new THREE.Color(0xbfd8ff);
const GLOW_EMBER = new THREE.Color(0xff6a2a);
const GLOW_IONISED = new THREE.Color(0x9ec4ff);

const PLASMA_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mvPosition.xyz);
  vLocal = position;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const PLASMA_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uHeat;
uniform float uIonization;
uniform float uAir;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;

// Cheap value noise. Three octaves is enough to break up the shock layer
// into filaments without the banding a single sine wave produces.
float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i);
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}
float turbulence(vec3 p) {
  return vnoise(p) * 0.6 + vnoise(p * 2.1) * 0.28 + vnoise(p * 4.3) * 0.12;
}

void main() {
  vec3 unit = normalize(vLocal);
  vec3 n = normalize(vNormal);

  // Bow shock: a stand-off front ahead of the hull rather than a smooth
  // falloff. The narrow rim is what gives the entry a readable shape.
  float leading = smoothstep(0.35, -0.9, unit.z);
  float rim = pow(leading, 3.5);
  float fresnel = pow(1.0 - abs(dot(vView, n)), 1.7);

  // Filaments stream aft; they tighten and speed up as the air thickens.
  vec3 flow = vec3(vLocal.x * 0.7, vLocal.y * 1.1, vLocal.z * 0.35 - uTime * (7.0 + uAir * 9.0));
  float filaments = turbulence(flow * (1.1 + uAir * 0.7));
  filaments = mix(0.55, 1.35, filaments);

  // Two flicker rates: a slow boil plus a fast crackle that only shows up
  // once the layer is genuinely ionised.
  float boil = 0.9 + 0.1 * sin(uTime * 6.0 + vLocal.z * 1.3);
  float crackle = 1.0 + uIonization * 0.22 * sin(uTime * 43.0 + vLocal.x * 11.0);

  // Blackbody-ish ramp: dull red -> orange -> white-hot -> ionised blue.
  vec3 dull   = vec3(0.72, 0.10, 0.03);
  vec3 ember  = vec3(1.00, 0.36, 0.09);
  vec3 white  = vec3(1.00, 0.90, 0.74);
  vec3 ionised = vec3(0.68, 0.84, 1.00);
  float t = clamp(uHeat, 0.0, 1.0);
  vec3 color = mix(dull, ember, smoothstep(0.0, 0.45, t));
  color = mix(color, white, smoothstep(0.45, 0.9, t) * leading);
  // Ionisation shows on the shock front first, which is where it is hottest.
  color = mix(color, ionised, uIonization * rim * 0.85);

  float energy = (leading * 0.8 + rim * 0.55 + fresnel * 0.3)
    * filaments * boil * crackle * uIntensity;
  // The wake keeps a little energy behind the hull as the air thickens.
  energy += uAir * uIntensity * 0.05 * smoothstep(-0.2, 1.0, unit.z) * filaments;

  gl_FragColor = vec4(color * energy, energy);
}
`;

function createCompressionShellGeometry(): THREE.BufferGeometry {
  const radialSegments = 30;
  const longitudinalSegments = 9;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= longitudinalSegments; ring += 1) {
    const t = ring / longitudinalSegments;
    const z = THREE.MathUtils.lerp(-7.2, 4.2, t);
    const radius = 0.72 + Math.pow(t, 0.62) * 5.8;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.54, z);
    }
  }

  for (let ring = 0; ring < longitudinalSegments; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const a = ring * radialSegments + segment;
      const b = ring * radialSegments + next;
      const c = (ring + 1) * radialSegments + segment;
      const d = (ring + 1) * radialSegments + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Atmospheric entry stress: a compression-shock plasma sheath around the
 * hull, backward-streaking spark trails and a hot glow light. Everything is
 * driven by the DescentSystem heat/stress state and disappears completely
 * outside the entry phase.
 */
export class AtmosphericEntryEffect {
  private readonly group = new THREE.Group();

  private readonly sheathMaterial: THREE.ShaderMaterial;

  private readonly streaks: THREE.LineSegments;

  private readonly streakMaterial: THREE.LineBasicMaterial;

  private readonly streakSeeds: Float32Array;

  private readonly glow: THREE.PointLight;

  private readonly cloudRush: { sprite: THREE.Sprite; material: THREE.SpriteMaterial; seed: number }[] = [];

  private readonly condensation: { sprite: THREE.Sprite; material: THREE.SpriteMaterial; seed: number }[] = [];

  private intensity = 0;

  private turbulence = 0;

  constructor(parent: THREE.Object3D) {
    this.group.name = 'Atmospheric Entry Plasma';
    this.group.visible = false;

    this.sheathMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uHeat: { value: 0 },
        uIonization: { value: 0 },
        uAir: { value: 0 }
      },
      vertexShader: PLASMA_VERTEX,
      fragmentShader: PLASMA_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending
    });
    const sheath = new THREE.Mesh(createCompressionShellGeometry(), this.sheathMaterial);
    this.group.add(sheath);

    // Thin wind/ember trails read as directional flow without particle fog.
    const count = 48;
    const positions = new Float32Array(count * 6);
    this.streakSeeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      this.streakSeeds[i * 3] = (Math.random() - 0.5) * 16;
      this.streakSeeds[i * 3 + 1] = (Math.random() - 0.5) * 9;
      this.streakSeeds[i * 3 + 2] = Math.random() * 46;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.streakMaterial = new THREE.LineBasicMaterial({
      color: 0xffb47a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.streaks = new THREE.LineSegments(geometry, this.streakMaterial);
    this.streaks.frustumCulled = false;
    this.group.add(this.streaks);

    this.glow = new THREE.PointLight(0xff6a2a, 0, 60, 1.7);
    this.glow.position.set(0, -1.4, -4.5);
    this.group.add(this.glow);

    // Cloud punch-through: big soft masses that whip past the hull once the
    // ship reaches the deck, selling the transition from orbit to weather.
    for (let i = 0; i < 10; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: createSoftParticleTexture(96),
        color: 0xcfe0da,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        rotation: Math.random() * Math.PI * 2,
        fog: false
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.setScalar(16 + Math.random() * 14);
      this.group.add(sprite);
      this.cloudRush.push({ sprite, material, seed: Math.random() * 100 });
    }

    // Short-lived condensation sheets form near the lateral compression
    // zones and stream aft as the atmosphere thickens.
    for (let i = 0; i < 6; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: createSoftParticleTexture(64),
        color: 0xe4ede8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const sprite = new THREE.Sprite(material);
      this.group.add(sprite);
      this.condensation.push({ sprite, material, seed: i * 1.73 + Math.random() });
    }

    parent.add(this.group);
  }

  get activeParticleCount(): number {
    if (!this.group.visible) return 0;
    return 48 +
      this.cloudRush.filter((cloud) => cloud.material.opacity > 0.01).length +
      this.condensation.filter((sheet) => sheet.material.opacity > 0.01).length;
  }

  get entryFxIntensity(): number {
    return this.intensity;
  }

  get turbulenceLevel(): number {
    return this.turbulence;
  }

  update(delta: number, elapsed: number, descent: DescentState, profile: EntryProfile): void {
    const active = profile.active;
    // Intensity now follows the staged thermal curve rather than raw progress,
    // so the sheath peaks mid-entry and fades as the ship slows.
    const targetIntensity = active
      ? profile.stage === 'approach'
        ? 0.18 * (1 - profile.airDensity * 0.5)
        // Tied straight to the thermal curve with no constant floor, so the
        // sheath genuinely goes out as the ship cools instead of leaving a
        // permanent glow hanging off the hull all the way to the clouds.
        : Math.min(1, profile.heat * 1.15)
      : 0;
    this.intensity = THREE.MathUtils.lerp(this.intensity, targetIntensity, 1 - Math.pow(0.04, delta));
    // Buffet is its own curve: the airframe shakes hardest before the glow
    // peaks, which is what sells dynamic pressure instead of "more effect".
    this.turbulence = THREE.MathUtils.lerp(this.turbulence, profile.buffet, 1 - Math.exp(-delta * 5));

    this.group.visible = this.intensity > 0.02;
    if (!this.group.visible) return;

    this.sheathMaterial.uniforms.uTime.value = elapsed;
    this.sheathMaterial.uniforms.uIntensity.value = this.intensity;
    this.sheathMaterial.uniforms.uHeat.value = profile.heat;
    this.sheathMaterial.uniforms.uIonization.value = profile.ionization;
    this.sheathMaterial.uniforms.uAir.value = profile.airDensity;

    // Streaks race backwards; speed scales with entry stress.
    const speed = 30 + descent.stress * 0.5 + descent.heat * 0.4;
    const positions = this.streaks.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.streakSeeds.length / 3; i += 1) {
      const cycle = 46;
      const z = ((this.streakSeeds[i * 3 + 2] + elapsed * speed) % cycle) - cycle * 0.4;
      const length = 2.2 + this.intensity * 5.8 + (i % 5) * 0.34;
      positions.setXYZ(i * 2, this.streakSeeds[i * 3], this.streakSeeds[i * 3 + 1], z);
      positions.setXYZ(i * 2 + 1, this.streakSeeds[i * 3], this.streakSeeds[i * 3 + 1], z + length);
    }
    positions.needsUpdate = true;
    // Streaks are the ablation trail: they need air, so they thin out in the
    // exosphere and are strongest once the atmosphere has real density.
    this.streakMaterial.opacity = this.intensity * (0.25 + profile.airDensity * 0.6);
    // Trail colour tracks the shock layer, cooling from white-hot back to
    // ember as the entry ends. Written into the shared colour in place.
    this.streakMaterial.color
      .copy(STREAK_EMBER)
      .lerp(STREAK_HOT, profile.heat)
      .lerp(STREAK_IONISED, profile.ionization * 0.7);

    // Two flicker rates so the glow reads as combustion, not a sine wave.
    const flicker = 0.85 + Math.sin(elapsed * 27) * 0.1 + Math.sin(elapsed * 6.3) * 0.05;
    this.glow.intensity = this.intensity * 7 * flicker;
    this.glow.color.copy(GLOW_EMBER).lerp(GLOW_IONISED, profile.ionization);
    // The light source sits at the shock front and creeps closer as the
    // stand-off distance collapses with density.
    this.glow.position.z = -4.5 - profile.heat * 1.6;

    // Cloud masses belong to the last two stages only: while the plasma is
    // still burning there is nothing but ionised air outside. Gating them by
    // stage rather than by a progress number is what stops the entry from
    // looking like every effect running at once.
    const cloudPhase = profile.stage === 'approach'
      ? 1
      : profile.stage === 'descent'
        ? THREE.MathUtils.smoothstep(profile.progress, 0.66, 0.9)
        : 0;
    for (const cloud of this.cloudRush) {
      if (cloudPhase <= 0.01) {
        cloud.material.opacity = 0;
        continue;
      }
      const cycle = 90;
      const z = ((cloud.seed * 13 + elapsed * (85 + cloud.seed)) % cycle) - cycle * 0.72;
      cloud.sprite.position.set(
        Math.sin(cloud.seed * 7.7) * 24,
        Math.cos(cloud.seed * 5.3) * 14 - 4,
        z
      );
      // Fade in ahead, streak past, gone behind.
      const along = 1 - Math.abs(z + cycle * 0.22) / (cycle * 0.5);
      cloud.material.opacity = THREE.MathUtils.clamp(along, 0, 1) * 0.14 * cloudPhase;
    }

    // Condensation needs moist, dense air: it belongs to the cooling half of
    // the entry, after the peak, not to the hottest moment.
    const condensationPhase = profile.stage === 'approach'
      ? 0.45
      : profile.airDensity * (1 - profile.ionization) * 0.9;
    for (const [index, sheet] of this.condensation.entries()) {
      const side = index % 2 === 0 ? -1 : 1;
      const cycle = 18;
      const z = ((sheet.seed * 9 + elapsed * (20 + this.intensity * 26)) % cycle) - 8;
      sheet.sprite.position.set(side * (3.4 + (index % 3) * 0.46), -0.5 + (index % 3) * 0.42, z);
      sheet.sprite.scale.set(5.8 + this.intensity * 4.5, 1.2 + this.intensity * 0.8, 1);
      const pulse = 0.55 + Math.sin(elapsed * 11 + sheet.seed) * 0.25;
      sheet.material.opacity = condensationPhase * this.intensity * pulse * 0.1;
    }
  }
}
