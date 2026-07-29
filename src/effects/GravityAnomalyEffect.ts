import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import { createRockGeometry } from '../entities/AsteroidField';

type SwirlParticle = {
  angle: number;
  radius: number;
  height: number;
  speed: number;
};

/**
 * Gravity anomaly hazard: a dark lensing core with a particle vortex
 * spiralling inward, captured debris on fast orbits and a warning ring at
 * the pull boundary. The caller applies the actual velocity pull.
 */
export class GravityAnomalyEffect {
  readonly group = new THREE.Group();

  readonly radius: number;

  private readonly vortex: THREE.Points;

  private readonly swirl: SwirlParticle[] = [];

  private readonly lensRings: THREE.Mesh[] = [];

  private readonly capturedDebris: THREE.Group;

  private readonly boundaryMaterial: THREE.PointsMaterial;

  private boundaryBelt!: THREE.Points;

  constructor(position: THREE.Vector3, radius = 150) {
    this.group.name = 'Gravity Anomaly';
    this.group.position.copy(position);
    this.radius = radius;

    // Near-black core with a faint violet rim: light bends, it doesn't shine.
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(7, 32, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    this.group.add(core);

    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(7.7, 32, 20),
      new THREE.MeshBasicMaterial({
        color: 0x7a5cff,
        transparent: true,
        opacity: 0.22,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.group.add(rim);

    // Photon-ring style distortion rings.
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x9a7cff,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    for (const [ringRadius, tilt] of [
      [11, 0.2],
      [16, -0.55]
    ] as [number, number][]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.22, 8, 80), ringMaterial.clone());
      ring.rotation.x = Math.PI / 2 + tilt;
      this.group.add(ring);
      this.lensRings.push(ring);
    }

    // Vortex particles spiralling inward, respawning at the edge.
    const count = 520;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      this.swirl.push({
        angle: Math.random() * Math.PI * 2,
        radius: 14 + Math.pow(Math.random(), 0.7) * (radius - 14),
        height: (Math.random() - 0.5) * radius * 0.34,
        speed: 0.4 + Math.random() * 0.7
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.vortex = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xb59cff,
        size: 1.7,
        map: createSoftParticleTexture(48),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.group.add(this.vortex);

    // Rocks caught in fast decaying orbits.
    this.capturedDebris = new THREE.Group();
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a4550,
      roughness: 0.95,
      metalness: 0.05
    });
    for (let i = 0; i < 8; i += 1) {
      const rock = new THREE.Mesh(createRockGeometry(400 + i * 11, 1), rockMaterial);
      const angle = (i / 8) * Math.PI * 2;
      const orbitRadius = 24 + Math.random() * 34;
      rock.position.set(Math.cos(angle) * orbitRadius, (Math.random() - 0.5) * 14, Math.sin(angle) * orbitRadius);
      rock.scale.setScalar(1.2 + Math.random() * 2.6);
      this.capturedDebris.add(rock);
    }
    this.group.add(this.capturedDebris);

    // Pull boundary: a sparse belt of slow dust caught at the well's edge —
    // the point where matter starts falling, not a painted circle.
    this.boundaryMaterial = new THREE.PointsMaterial({
      color: 0xa88cff,
      size: 2.2,
      map: createSoftParticleTexture(48),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const beltCount = 110;
    const beltPositions = new Float32Array(beltCount * 3);
    for (let i = 0; i < beltCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const beltRadius = radius * (0.92 + Math.random() * 0.14);
      beltPositions[i * 3] = Math.cos(angle) * beltRadius;
      beltPositions[i * 3 + 1] = (Math.random() - 0.5) * radius * 0.18;
      beltPositions[i * 3 + 2] = Math.sin(angle) * beltRadius;
    }
    const beltGeometry = new THREE.BufferGeometry();
    beltGeometry.setAttribute('position', new THREE.BufferAttribute(beltPositions, 3));
    this.boundaryBelt = new THREE.Points(beltGeometry, this.boundaryMaterial);
    this.group.add(this.boundaryBelt);

    const light = new THREE.PointLight(0x8a6cff, 1.2, radius * 2, 1.8);
    this.group.add(light);
  }

  contains(position: THREE.Vector3): boolean {
    return position.distanceTo(this.group.position) <= this.radius;
  }

  /** Normalized pull strength at a world position (0 outside, 1 at core). */
  pullStrength(position: THREE.Vector3): number {
    const distance = position.distanceTo(this.group.position);
    if (distance > this.radius) return 0;
    return Math.pow(1 - distance / this.radius, 1.6);
  }

  update(delta: number, elapsed: number): void {
    const positions = this.vortex.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = positions.array as Float32Array;

    for (let i = 0; i < this.swirl.length; i += 1) {
      const particle = this.swirl[i];
      // Angular speed rises as radius shrinks: Keplerian feel.
      particle.angle += delta * particle.speed * (34 / Math.max(particle.radius, 10));
      particle.radius -= delta * (5.5 + (this.radius - particle.radius) * 0.03);
      particle.height *= 1 - delta * 0.25;

      if (particle.radius < 9) {
        particle.radius = this.radius * (0.75 + Math.random() * 0.25);
        particle.height = (Math.random() - 0.5) * this.radius * 0.34;
        particle.angle = Math.random() * Math.PI * 2;
      }

      array[i * 3] = Math.cos(particle.angle) * particle.radius;
      array[i * 3 + 1] = particle.height;
      array[i * 3 + 2] = Math.sin(particle.angle) * particle.radius;
    }
    positions.needsUpdate = true;

    this.capturedDebris.rotation.y += delta * 0.55;
    this.lensRings[0].rotation.z += delta * 0.9;
    this.lensRings[1].rotation.z -= delta * 0.6;
    this.boundaryBelt.rotation.y += delta * 0.06;
    this.boundaryMaterial.opacity = 0.24 + Math.sin(elapsed * 1.8) * 0.08;
  }
}
