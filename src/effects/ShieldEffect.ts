import * as THREE from 'three';

const SHIELD_VERTEX = /* glsl */ `
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

const SHIELD_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform vec3 uImpactDir[4];
uniform float uImpactEnergy[4];
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;

void main() {
  // Energy shell: visible only at grazing angles, like a soap-bubble field.
  float fresnel = pow(1.0 - abs(dot(vView, normalize(vNormal))), 2.6);

  // Slow interference bands crawling over the surface sell "contained energy".
  float bands = 0.5 + 0.5 * sin(vLocal.y * 9.0 + uTime * 2.1) * sin(vLocal.x * 7.0 - uTime * 1.7);
  float energy = fresnel * (0.7 + bands * 0.3);

  // Four bounded impact ripples follow the curved shell. Angular distance is
  // used instead of a screen-space sprite, so hits stay attached to volume.
  vec3 shellDirection = normalize(vLocal);
  float impact = 0.0;
  for (int i = 0; i < 4; i++) {
    float angularDistance = acos(clamp(dot(shellDirection, normalize(uImpactDir[i])), -1.0, 1.0));
    float radius = (1.0 - uImpactEnergy[i]) * 0.72;
    float wave = exp(-pow((angularDistance - radius) * 17.0, 2.0));
    float core = exp(-angularDistance * angularDistance * 110.0) * uImpactEnergy[i];
    impact += (wave * 0.72 + core * 0.5) * uImpactEnergy[i];
  }
  // Keep the calm shell restrained while a local hit remains readable. The
  // impact contribution is intentionally decoupled from the low idle level;
  // this brightens only the curved contact patch, never the whole sphere.
  float visibleEnergy = energy * uIntensity + impact * 0.62;
  gl_FragColor = vec4(uColor * visibleEnergy, visibleEnergy);
}
`;

/**
 * Player shield: a fresnel energy shell that is almost invisible in calm
 * flight, ripples with slow interference bands, reacts locally on impact and
 * flickers red when energy runs critical.
 */
export class ShieldEffect {
  readonly mesh: THREE.Mesh;

  private readonly material: THREE.ShaderMaterial;

  private readonly baseColor = new THREE.Color(0x6fd8ff);

  private readonly dangerColor = new THREE.Color(0xff6a5e);

  private readonly impactDirections = [
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0.7, 0.2, -0.68).normalize(),
    new THREE.Vector3(-0.6, 0.35, -0.72).normalize(),
    new THREE.Vector3(0.2, -0.7, 0.68).normalize()
  ];

  private readonly impactEnergies = [0, 0, 0, 0];

  private readonly localImpact = new THREE.Vector3();

  private impactCursor = 0;

  constructor(parent: THREE.Object3D, radius = 7.4) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this.baseColor.clone() },
        uIntensity: { value: 0.5 },
        uImpactDir: { value: this.impactDirections },
        uImpactEnergy: { value: this.impactEnergies },
        uTime: { value: 0 }
      },
      vertexShader: SHIELD_VERTEX,
      fragmentShader: SHIELD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending
    });

    // Radius was a hardcoded 7.4, which with the (1, 0.62, 1.05) scale gave a
    // 7.77 half-extent along Z against a hull half-depth of ~7.80 — after the
    // hull was scaled x1.7 the nose and tail poked through the shell. Derived
    // from the hull now, so it cannot drift out of step again.
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), this.material);
    this.mesh.scale.set(1, 0.62, 1.05);
    this.mesh.name = 'Player Shield Shell';
    parent.add(this.mesh);
  }

  registerImpact(worldPosition?: THREE.Vector3): void {
    const index = this.impactCursor;
    this.impactCursor = (this.impactCursor + 1) % this.impactEnergies.length;
    if (worldPosition) {
      this.localImpact.copy(worldPosition);
      this.mesh.worldToLocal(this.localImpact);
      if (this.localImpact.lengthSq() > 0.0001) this.impactDirections[index].copy(this.localImpact).normalize();
    }
    this.impactEnergies[index] = 1;
  }

  update(delta: number, hull: number, energy: number, elapsed: number): void {
    let accumulatedImpact = 0;
    for (let index = 0; index < this.impactEnergies.length; index += 1) {
      this.impactEnergies[index] = Math.max(0, this.impactEnergies[index] - delta * 1.75);
      accumulatedImpact += this.impactEnergies[index];
    }

    const lowEnergy = energy < 24;
    const flicker = lowEnergy ? (Math.sin(elapsed * 30) > 0.4 ? 0.4 : 1) : 1;
    const hullStress = hull < 38 ? 0.25 : 0;

    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uIntensity.value = (0.26 + hullStress + Math.min(0.18, accumulatedImpact * 0.045)) * flicker;

    const color = this.material.uniforms.uColor.value as THREE.Color;
    color.copy(this.baseColor).lerp(this.dangerColor, energy < 16 ? 1 : hullStress > 0 ? 0.4 : 0);

    const pulse = 1 + Math.sin(elapsed * 2.4) * 0.012;
    this.mesh.scale.set(pulse, 0.62 * pulse, 1.05 * pulse);
  }

  getDiagnostics(): { activeImpacts: number; maximumImpacts: number; weakened: boolean } {
    let activeImpacts = 0;
    for (let index = 0; index < this.impactEnergies.length; index += 1) {
      if (this.impactEnergies[index] > 0.01) activeImpacts += 1;
    }
    return { activeImpacts, maximumImpacts: this.impactEnergies.length, weakened: this.material.uniforms.uIntensity.value > 0.5 };
  }
}
