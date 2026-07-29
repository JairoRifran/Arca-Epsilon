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
uniform float uImpact;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;

void main() {
  // Energy shell: visible only at grazing angles, like a soap-bubble field.
  float fresnel = pow(1.0 - abs(dot(vView, normalize(vNormal))), 2.6);

  // Slow interference bands crawling over the surface sell "contained energy".
  float bands = 0.5 + 0.5 * sin(vLocal.y * 9.0 + uTime * 2.1) * sin(vLocal.x * 7.0 - uTime * 1.7);
  float energy = fresnel * (0.7 + bands * 0.3);

  // Impact flash: the whole shell lights up briefly, strongest at the rim.
  energy += uImpact * (0.35 + fresnel * 0.9);

  gl_FragColor = vec4(uColor * energy * uIntensity, energy * uIntensity);
}
`;

/**
 * Player shield: a fresnel energy shell that is almost invisible in calm
 * flight, ripples with slow interference bands, flashes on impact and
 * flickers red when energy runs critical.
 */
export class ShieldEffect {
  readonly mesh: THREE.Mesh;

  private readonly material: THREE.ShaderMaterial;

  private readonly baseColor = new THREE.Color(0x6fd8ff);

  private readonly dangerColor = new THREE.Color(0xff6a5e);

  private impactEnergy = 0;

  constructor(parent: THREE.Object3D) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this.baseColor.clone() },
        uIntensity: { value: 0.5 },
        uImpact: { value: 0 },
        uTime: { value: 0 }
      },
      vertexShader: SHIELD_VERTEX,
      fragmentShader: SHIELD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(7.4, 48, 24), this.material);
    this.mesh.scale.set(1, 0.62, 1.05);
    this.mesh.name = 'Player Shield Shell';
    parent.add(this.mesh);
  }

  registerImpact(): void {
    this.impactEnergy = 1;
  }

  update(delta: number, hull: number, energy: number, elapsed: number): void {
    this.impactEnergy = Math.max(0, this.impactEnergy - delta * 1.9);

    const lowEnergy = energy < 24;
    const flicker = lowEnergy ? (Math.sin(elapsed * 30) > 0.4 ? 0.4 : 1) : 1;
    const hullStress = hull < 38 ? 0.25 : 0;

    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uImpact.value = this.impactEnergy;
    this.material.uniforms.uIntensity.value = (0.26 + hullStress + this.impactEnergy * 0.9) * flicker;

    const color = this.material.uniforms.uColor.value as THREE.Color;
    color.copy(this.baseColor).lerp(this.dangerColor, energy < 16 ? 1 : hullStress > 0 ? 0.4 : 0);

    const pulse = 1 + this.impactEnergy * 0.1 + Math.sin(elapsed * 2.4) * 0.012;
    this.mesh.scale.set(pulse, 0.62 * pulse, 1.05 * pulse);
  }
}
