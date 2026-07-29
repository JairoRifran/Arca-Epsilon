import * as THREE from 'three';

const SIGNATURE_COUNT = 5;
/** Pooled battery tracers and shield impacts for M18. Never grows. */
const TRACER_POOL = 12;
const IMPACT_POOL = 10;

/**
 * The visual layer of Aurora's M17 defences.
 *
 * Three separable pieces, each dark unless its own phase is live:
 *  - the reinforced shield dome, shown ONLY while a load test or the drill is
 *    running (never as permanent scenery);
 *  - alert-network pulses running out from the settlement, for the tri-anchor
 *    channel checks and the drill;
 *  - the incoming-signature streaks that drop out of the high atmosphere at the
 *    very end of the mission — the first time anything real is on the readout.
 *
 * Human-industrial with a Pleyadian tint: pale cyan and dim gold, ordered and
 * legible. Every mesh is built once; nothing here allocates geometry, materials
 * or vectors during update, and there is no postprocessing.
 */
export class AuroraDefenseEffect {
  readonly group = new THREE.Group();

  private readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly alertRings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly signatures: THREE.Line[] = [];
  private readonly signatureMaterial: THREE.LineBasicMaterial;

  // --- M18 pools: battery tracers and shield impact flashes ----------------
  private readonly tracers: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly tracerAges: number[] = [];
  private tracerCursor = 0;
  private readonly impacts: THREE.Sprite[] = [];
  private readonly impactMaterials: THREE.SpriteMaterial[] = [];
  private readonly impactAges: number[] = [];
  private impactCursor = 0;
  private readonly tracerUp = new THREE.Vector3(0, 1, 0);
  private readonly tracerDir = new THREE.Vector3();
  private readonly tracerMid = new THREE.Vector3();
  private readonly tracerQuat = new THREE.Quaternion();

  private shieldLevel = 0;
  private shieldTarget = 0;
  private alertLevel = 0;
  private alertTarget = 0;
  private signatureLevel = 0;
  private signatureTarget = 0;

  constructor() {
    this.group.name = 'Defensas Aurora';
    this.group.visible = false;

    // Reinforced shield: one low-opacity hemisphere, no stacked shells.
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(34, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 0x9fd8e8,
        emissive: 0x4a86a0,
        emissiveIntensity: 0.3,
        roughness: 0.22,
        metalness: 0.1,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    this.dome.visible = false;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // Alert pulses: flat rings expanding from the settlement centre.
    const ringGeometry = new THREE.RingGeometry(0.9, 1, 44);
    for (let i = 0; i < 3; i += 1) {
      const ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          color: i === 1 ? 0xd8c089 : 0x8fd4e8,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      ring.frustumCulled = false;
      this.alertRings.push(ring);
      this.group.add(ring);
    }

    // Incoming signatures: steep descent traces from the high atmosphere.
    this.signatureMaterial = new THREE.LineBasicMaterial({
      color: 0xe4b98a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    for (let i = 0; i < SIGNATURE_COUNT; i += 1) {
      const angle = (i / SIGNATURE_COUNT) * Math.PI * 2 + 0.6;
      const radius = 120 + (i % 3) * 40;
      const points = [
        new THREE.Vector3(Math.cos(angle) * radius, 260 + (i % 2) * 40, Math.sin(angle) * radius),
        new THREE.Vector3(Math.cos(angle) * radius * 0.7, 150, Math.sin(angle) * radius * 0.7),
        new THREE.Vector3(Math.cos(angle) * radius * 0.5, 74 + (i % 3) * 10, Math.sin(angle) * radius * 0.5)
      ];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), this.signatureMaterial);
      line.frustumCulled = false;
      line.visible = false;
      this.signatures.push(line);
      this.group.add(line);
    }
  }

  /** Centre everything on the settlement. Called on sync, never per frame. */
  setOrigin(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  /** Lazily build the M18 pools once, on the first shot fired. */
  private ensureCombatPools(): void {
    if (this.tracers.length > 0) return;
    const tracerGeometry = new THREE.CylinderGeometry(0.16, 0.16, 1, 5, 1, true);
    for (let i = 0; i < TRACER_POOL; i += 1) {
      const mesh = new THREE.Mesh(
        tracerGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xbfe6f4,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.tracers.push(mesh);
      this.tracerAges.push(Infinity);
      this.group.add(mesh);
    }
    for (let i = 0; i < IMPACT_POOL; i += 1) {
      const material = new THREE.SpriteMaterial({
        color: 0x9fd8e8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.frustumCulled = false;
      this.impacts.push(sprite);
      this.impactMaterials.push(material);
      this.impactAges.push(Infinity);
      this.group.add(sprite);
    }
  }

  /**
   * One battery tracer, taken from the pool. Group-local, so it follows the
   * settlement origin. No light and no allocation per shot.
   */
  fireTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    this.ensureCombatPools();
    const mesh = this.tracers[this.tracerCursor];
    this.tracerAges[this.tracerCursor] = 0;
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;
    this.tracerDir.subVectors(to, from);
    const length = this.tracerDir.length();
    if (length < 0.001) return;
    this.tracerMid.copy(from).addScaledVector(this.tracerDir, 0.5).sub(this.group.position);
    this.tracerQuat.setFromUnitVectors(this.tracerUp, this.tracerDir.normalize());
    mesh.position.copy(this.tracerMid);
    mesh.quaternion.copy(this.tracerQuat);
    mesh.scale.set(1, length, 1);
    mesh.visible = true;
    mesh.material.opacity = 0.85;
  }

  /** A drone strike landing on the dome, from the pool. */
  registerShieldImpact(position: THREE.Vector3): void {
    this.ensureCombatPools();
    const index = this.impactCursor;
    this.impactCursor = (this.impactCursor + 1) % this.impacts.length;
    const sprite = this.impacts[index];
    this.impactAges[index] = 0;
    sprite.position.copy(position).sub(this.group.position);
    sprite.scale.setScalar(7);
    sprite.visible = true;
    this.impactMaterials[index].opacity = 0.85;
  }

  /** 0 = shield idle, 1 = full load test. The dome only exists above zero. */
  setShieldTest(level: number): void {
    this.shieldTarget = THREE.MathUtils.clamp(level, 0, 1);
  }

  /** 0 = alert network quiet, 1 = propagating. */
  setAlertLevel(level: number): void {
    this.alertTarget = THREE.MathUtils.clamp(level, 0, 1);
  }

  /** 0 = nothing on the readout, 1 = real signatures descending. */
  setSignatureLevel(level: number): void {
    this.signatureTarget = THREE.MathUtils.clamp(level, 0, 1);
  }

  get shieldVisible(): boolean {
    return this.shieldLevel > 0.02;
  }

  update(delta: number, elapsed: number): void {
    // Pooled combat VFX age out independently of the ambient layers, so a
    // tracer fired on the last frame of a wave still finishes cleanly.
    for (let i = 0; i < this.tracers.length; i += 1) {
      if (this.tracerAges[i] === Infinity) continue;
      this.tracerAges[i] += delta;
      const life = 1 - this.tracerAges[i] / 0.12;
      if (life <= 0) {
        this.tracers[i].visible = false;
        this.tracerAges[i] = Infinity;
      } else {
        this.tracers[i].material.opacity = life * 0.85;
      }
    }
    for (let i = 0; i < this.impacts.length; i += 1) {
      if (this.impactAges[i] === Infinity) continue;
      this.impactAges[i] += delta;
      const life = 1 - this.impactAges[i] / 0.45;
      if (life <= 0) {
        this.impacts[i].visible = false;
        this.impactAges[i] = Infinity;
      } else {
        this.impactMaterials[i].opacity = life * 0.85;
        this.impacts[i].scale.setScalar(7 + (1 - life) * 12);
      }
    }

    const ease = Math.min(1, delta * 2.4);
    this.shieldLevel += (this.shieldTarget - this.shieldLevel) * ease;
    this.alertLevel += (this.alertTarget - this.alertLevel) * ease;
    this.signatureLevel += (this.signatureTarget - this.signatureLevel) * ease;

    const visible = this.shieldLevel > 0.02 || this.alertLevel > 0.02 || this.signatureLevel > 0.02;
    this.group.visible = visible;
    if (!visible) return;

    // Shield: only present while genuinely under test.
    const domeShown = this.shieldLevel > 0.02;
    this.dome.visible = domeShown;
    if (domeShown) {
      const shimmer = Math.sin(elapsed * 1.3) * 0.012;
      this.dome.material.opacity = this.shieldLevel * 0.15 + shimmer * this.shieldLevel;
      this.dome.material.emissiveIntensity = 0.22 + this.shieldLevel * 0.34;
    }

    // Alert pulses: ordered, one behind the other.
    for (let i = 0; i < this.alertRings.length; i += 1) {
      const ring = this.alertRings[i];
      const shown = this.alertLevel > 0.02;
      ring.visible = shown;
      if (!shown) continue;
      const phase = (elapsed * 0.45 + i / this.alertRings.length) % 1;
      const radius = 4 + phase * 46;
      ring.scale.setScalar(radius);
      ring.material.opacity = (1 - phase) * 0.42 * this.alertLevel;
    }

    // Signatures: dim, steady, unmistakably not a simulation.
    const sigShown = this.signatureLevel > 0.02;
    this.signatureMaterial.opacity = this.signatureLevel * (0.5 + Math.sin(elapsed * 2.1) * 0.16);
    for (const line of this.signatures) line.visible = sigShown;
  }

  dispose(): void {
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    for (const ring of this.alertRings) {
      ring.geometry.dispose();
      ring.material.dispose();
    }
    for (const line of this.signatures) line.geometry.dispose();
    this.signatureMaterial.dispose();
    for (const tracer of this.tracers) {
      tracer.geometry.dispose();
      tracer.material.dispose();
    }
    for (const material of this.impactMaterials) material.dispose();
  }
}
