import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

/**
 * Sentinel anomaly: the game's occasional territorial threat. A dark core
 * with a wound of light inside, twin counter-rotating lens rings, an
 * orbiting particle swarm and a danger aura that only ignites when the
 * player strays close.
 */
export class AnomalyEffect {
  readonly group = new THREE.Group();

  private readonly coreMaterial: THREE.MeshStandardMaterial;

  private readonly innerMaterial: THREE.MeshBasicMaterial;

  private readonly rings: THREE.Mesh[] = [];

  private readonly swarm: THREE.Points;

  private readonly auraMaterial: THREE.SpriteMaterial;

  private readonly light: THREE.PointLight;

  private menace = 0;

  constructor(position: THREE.Vector3) {
    this.group.name = 'Sentinel Anomaly';
    this.group.position.copy(position);

    this.coreMaterial = new THREE.MeshStandardMaterial({
      color: 0x11151c,
      emissive: 0xff274e,
      emissiveIntensity: 0.7,
      metalness: 0.72,
      roughness: 0.3,
      flatShading: true
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 1), this.coreMaterial);
    this.group.add(core);

    // Exposed energy wound inside the shell.
    this.innerMaterial = new THREE.MeshBasicMaterial({
      color: 0xff5f7d,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 1), this.innerMaterial);
    this.group.add(inner);

    // Counter-rotating lens fragments: broken arcs, never full circles, so
    // the anomaly reads as torn spacetime rather than an editor helper.
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xff3b60,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    for (const [tilt, span] of [
      [0.5, 3.9],
      [-0.9, 2.7]
    ] as [number, number][]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.16, 6, 44, span), ringMaterial.clone());
      ring.rotation.x = Math.PI / 2 + tilt;
      ring.rotation.z = Math.random() * Math.PI * 2;
      this.group.add(ring);
      this.rings.push(ring);
    }

    // Orbiting particle swarm.
    const count = 70;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 4.5 + Math.random() * 4;
      const y = (Math.random() - 0.5) * 3;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const swarmGeometry = new THREE.BufferGeometry();
    swarmGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.swarm = new THREE.Points(
      swarmGeometry,
      new THREE.PointsMaterial({
        color: 0xff7089,
        size: 0.85,
        map: createSoftParticleTexture(48),
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.group.add(this.swarm);

    // Danger aura, dormant until the player is near.
    this.auraMaterial = new THREE.SpriteMaterial({
      map: createSoftParticleTexture(96),
      color: 0xff2040,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const aura = new THREE.Sprite(this.auraMaterial);
    aura.scale.setScalar(34);
    this.group.add(aura);

    this.light = new THREE.PointLight(0xff2f55, 1.1, 120, 1.9);
    this.group.add(this.light);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  update(delta: number, elapsed: number, distanceToPlayer: number): void {
    // Menace ramps up smoothly as the player closes in.
    const targetMenace = THREE.MathUtils.clamp(1 - distanceToPlayer / 220, 0, 1);
    this.menace = THREE.MathUtils.lerp(this.menace, targetMenace, 1 - Math.pow(0.05, delta));

    const pulse = Math.sin(elapsed * (2.2 + this.menace * 5)) * 0.5 + 0.5;
    this.coreMaterial.emissiveIntensity = 0.55 + pulse * (0.5 + this.menace * 1.7);
    this.innerMaterial.opacity = 0.5 + pulse * 0.4;
    this.light.intensity = 0.8 + this.menace * 3 + pulse * this.menace * 1.4;
    this.auraMaterial.opacity = this.menace * 0.34;

    this.group.rotation.y += delta * (0.5 + this.menace * 1.3);
    this.rings[0].rotation.z += delta * (0.8 + this.menace * 2);
    this.rings[1].rotation.z -= delta * (1.1 + this.menace * 2.4);
    this.swarm.rotation.y -= delta * (0.9 + this.menace * 2.2);

    // Color shifts colder->hotter with proximity.
    this.coreMaterial.emissive.setHSL(0.97 - this.menace * 0.04, 0.85, 0.5 + this.menace * 0.1);
  }
}
