import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

/**
 * Radiation storm hazard zone: a drifting cloud of charged particles with
 * an amber haze, a readable boundary ring and intermittent static arcs.
 * Gameplay effects (energy drain, HUD warning) are applied by the caller;
 * this class owns only the visuals.
 */
export class RadiationStormEffect {
  readonly group = new THREE.Group();

  readonly radius: number;

  private readonly particles: THREE.Points;

  private readonly particleVelocities: Float32Array;

  private readonly hazeMaterial: THREE.SpriteMaterial;

  private readonly boundary: THREE.Group;

  private readonly arcs: THREE.LineSegments;

  private readonly arcMaterial: THREE.LineBasicMaterial;

  private arcTimer = 0;

  private arcLife = 0;

  constructor(position: THREE.Vector3, radius = 130) {
    this.group.name = 'Radiation Storm';
    this.group.position.copy(position);
    this.radius = radius;

    // Charged particles drifting inside the zone.
    const count = 420;
    const positions = new Float32Array(count * 3);
    this.particleVelocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const direction = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      const distance = Math.pow(Math.random(), 0.6) * radius;
      positions[i * 3] = direction.x * distance;
      positions[i * 3 + 1] = direction.y * distance;
      positions[i * 3 + 2] = direction.z * distance;
      this.particleVelocities[i * 3] = (Math.random() - 0.5) * 6;
      this.particleVelocities[i * 3 + 1] = (Math.random() - 0.5) * 6;
      this.particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particles = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xffa04a,
        size: 2.1,
        map: createSoftParticleTexture(48),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.group.add(this.particles);

    // Amber haze core.
    this.hazeMaterial = new THREE.SpriteMaterial({
      map: createSoftParticleTexture(128),
      color: 0xb84a18,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const haze = new THREE.Sprite(this.hazeMaterial);
    haze.scale.setScalar(radius * 2.4);
    this.group.add(haze);

    // Edge wisps: ragged gas shreds drifting around the storm boundary make
    // the hazard edge readable without drawing a debug circle.
    this.boundary = new THREE.Group();
    for (let i = 0; i < 6; i += 1) {
      const wisp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: createSoftParticleTexture(96),
          color: 0xc75a20,
          transparent: true,
          opacity: 0.1 + Math.random() * 0.08,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          rotation: Math.random() * Math.PI * 2
        })
      );
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.6;
      wisp.position.set(
        Math.cos(angle) * radius * (0.9 + Math.random() * 0.2),
        (Math.random() - 0.5) * radius * 0.5,
        Math.sin(angle) * radius * (0.9 + Math.random() * 0.2)
      );
      wisp.scale.setScalar(radius * (0.5 + Math.random() * 0.35));
      this.boundary.add(wisp);
    }
    this.group.add(this.boundary);

    // Static arcs: jittering line bundle regenerated in bursts.
    const arcSegments = 22;
    const arcPositions = new Float32Array(arcSegments * 2 * 3);
    const arcGeometry = new THREE.BufferGeometry();
    arcGeometry.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
    this.arcMaterial = new THREE.LineBasicMaterial({
      color: 0xffd9b0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.arcs = new THREE.LineSegments(arcGeometry, this.arcMaterial);
    this.group.add(this.arcs);

    const light = new THREE.PointLight(0xff7a30, 1.6, radius * 2.4, 1.6);
    this.group.add(light);
  }

  /** True when a world-space position sits inside the storm. */
  contains(position: THREE.Vector3): boolean {
    return position.distanceTo(this.group.position) <= this.radius;
  }

  update(delta: number, elapsed: number): void {
    // Drift particles, wrapping any that leave the sphere back inside.
    const positions = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = positions.array as Float32Array;
    const limit = this.radius * this.radius;
    for (let i = 0; i < array.length; i += 3) {
      array[i] += this.particleVelocities[i] * delta;
      array[i + 1] += this.particleVelocities[i + 1] * delta;
      array[i + 2] += this.particleVelocities[i + 2] * delta;
      const distSq = array[i] * array[i] + array[i + 1] * array[i + 1] + array[i + 2] * array[i + 2];
      if (distSq > limit) {
        array[i] *= -0.92;
        array[i + 1] *= -0.92;
        array[i + 2] *= -0.92;
      }
    }
    positions.needsUpdate = true;

    this.hazeMaterial.opacity = 0.24 + Math.sin(elapsed * 0.7) * 0.06;
    this.boundary.rotation.y += delta * 0.03;

    // Fire a static arc burst every few seconds.
    this.arcTimer -= delta;
    if (this.arcTimer <= 0) {
      this.regenerateArcs();
      this.arcLife = 0.22;
      this.arcTimer = 1.4 + Math.random() * 3.2;
    }
    if (this.arcLife > 0) {
      this.arcLife -= delta;
      this.arcMaterial.opacity = Math.max(0, this.arcLife / 0.22) * 0.85;
    }
  }

  private regenerateArcs(): void {
    const positions = this.arcs.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = positions.array as Float32Array;
    // Random jagged polyline pairs radiating through the cloud.
    const origin = new THREE.Vector3(
      (Math.random() - 0.5) * this.radius,
      (Math.random() - 0.5) * this.radius,
      (Math.random() - 0.5) * this.radius
    ).multiplyScalar(0.6);

    let cursor = origin.clone();
    for (let i = 0; i < array.length; i += 6) {
      array[i] = cursor.x;
      array[i + 1] = cursor.y;
      array[i + 2] = cursor.z;
      cursor = cursor.clone().add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 26,
          (Math.random() - 0.5) * 26,
          (Math.random() - 0.5) * 26
        )
      );
      array[i + 3] = cursor.x;
      array[i + 4] = cursor.y;
      array[i + 5] = cursor.z;
    }
    positions.needsUpdate = true;
  }
}
