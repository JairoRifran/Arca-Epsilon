import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

/** Particles drawn toward the contaminated nodes. One Points object total. */
const MOTE_COUNT = 240;
/** Concentric rings rising off each node. */
const RING_COUNT = 6;
/** Angular interference shards, one InstancedMesh. */
const SHARD_COUNT = 14;
/** Motes and rings only need ~20 Hz to read as continuous. */
const UPDATE_HZ = 20;

/**
 * The Coalition's residual mark, rendered as something technological rather
 * than atmospheric: dull amber, hard angles and exact periodicity, against a
 * valley whose own effects are all soft and irregular.
 *
 * Four layers, all sharing one sprite texture and four materials:
 *
 *  - a single Points cloud whose motes are pulled toward whichever node is
 *    nearest them, updated at 20 Hz from precomputed seeds;
 *  - concentric rings expanding off the nodes on one shared additive material;
 *  - angular shards on a single InstancedMesh, rotating in exact steps;
 *  - one reused PointLight that pulses with the contamination — a single
 *    dynamic light for the whole effect, never one per pulse.
 *
 * Nothing is allocated after construction, nothing calls Math.random during
 * update, and all motion derives from elapsed time so it is deterministic and
 * frame-rate independent. `setIntensity(0)` parks every layer and stops the
 * work entirely.
 */
export class CoalitionTraceEffect {
  readonly group = new THREE.Group();

  private readonly motes: THREE.Points;
  private readonly moteMaterial: THREE.PointsMaterial;
  /** Per mote: home x, y, z and the node index it is bound to. */
  private readonly moteSeeds: Float32Array;
  private readonly rings: THREE.Mesh[] = [];
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly ringSeeds: Float32Array;
  private readonly shards: THREE.InstancedMesh;
  private readonly shardMaterial: THREE.MeshBasicMaterial;
  private readonly shardSeeds: Float32Array;
  private readonly pulseLight: THREE.PointLight;
  private readonly sharedTexture: THREE.Texture;
  /** World positions of the three nodes the mark is riding. */
  private readonly nodes = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private readonly nodeActive = [false, false, false];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3(0, 1, 0);
  private readonly scratch = new THREE.Vector3();
  private readonly unitScale = new THREE.Vector3(1, 1, 1);

  private intensity = 0;
  private accumulator = 0;
  /** Set on the frame a discharge pulses, cleared by `consumePulse`. */
  private pendingPulse = false;

  constructor() {
    this.group.name = 'Contaminación de la Coalición';
    this.group.visible = false;
    this.sharedTexture = createSoftParticleTexture(48);

    // ----- Motes drawn toward the nodes -----
    const motePositions = new Float32Array(MOTE_COUNT * 3);
    this.moteSeeds = new Float32Array(MOTE_COUNT * 4);
    for (let i = 0; i < MOTE_COUNT; i += 1) {
      const angle = hash(i * 1.7 + 0.4) * Math.PI * 2;
      const radius = 6 + hash(i * 3.3 + 2.1) * 26;
      this.moteSeeds[i * 4] = Math.cos(angle) * radius;
      this.moteSeeds[i * 4 + 1] = 0.6 + hash(i * 5.9 + 7.3) * 9;
      this.moteSeeds[i * 4 + 2] = Math.sin(angle) * radius;
      // Spread evenly across the three nodes.
      this.moteSeeds[i * 4 + 3] = i % 3;
    }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
    // A generous fixed sphere: the cloud spans the whole clearing, so letting
    // three.js recompute bounds every frame would be pure waste.
    moteGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4000);
    this.moteMaterial = new THREE.PointsMaterial({
      color: 0xd07a2c,
      size: 0.34,
      map: this.sharedTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.motes = new THREE.Points(moteGeometry, this.moteMaterial);
    this.motes.frustumCulled = false;
    this.group.add(this.motes);

    // ----- Concentric rings -----
    this.ringMaterial = new THREE.MeshBasicMaterial({
      map: this.sharedTexture,
      color: 0xb4471c,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const ringGeometry = new THREE.RingGeometry(0.82, 1, 28);
    this.ringSeeds = new Float32Array(RING_COUNT * 2);
    for (let i = 0; i < RING_COUNT; i += 1) {
      // Two rings per node, offset half a cycle apart.
      this.ringSeeds[i * 2] = i % 3;
      this.ringSeeds[i * 2 + 1] = (i < 3 ? 0 : 0.5) + hash(i * 4.1 + 11.7) * 0.12;
      const ring = new THREE.Mesh(ringGeometry, this.ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.frustumCulled = false;
      this.rings.push(ring);
      this.group.add(ring);
    }

    // ----- Angular interference shards -----
    this.shardMaterial = new THREE.MeshBasicMaterial({
      color: 0xe08a3a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.shards = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.14, 0.14, 3.4),
      this.shardMaterial,
      SHARD_COUNT
    );
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shards.frustumCulled = false;
    this.shardSeeds = new Float32Array(SHARD_COUNT * 4);
    for (let i = 0; i < SHARD_COUNT; i += 1) {
      this.shardSeeds[i * 4] = i % 3;
      this.shardSeeds[i * 4 + 1] = hash(i * 2.9 + 3.7) * Math.PI * 2;
      this.shardSeeds[i * 4 + 2] = 3.5 + hash(i * 6.3 + 9.1) * 7;
      this.shardSeeds[i * 4 + 3] = 1.2 + hash(i * 8.7 + 1.9) * 5.5;
    }
    this.group.add(this.shards);

    // One reused light for the whole contamination layer.
    this.pulseLight = new THREE.PointLight(0xc46a24, 0, 90, 2);
    this.group.add(this.pulseLight);
  }

  /**
   * Pin the effect to the three contaminated nodes. `active` drops a node out
   * once it has been purged, so the mark visibly retreats node by node.
   */
  setNode(index: number, position: THREE.Vector3, active: boolean): void {
    if (index < 0 || index >= this.nodes.length) return;
    this.nodes[index].copy(position);
    this.nodeActive[index] = active;
  }

  /** 0 = clean network, 1 = fully contaminated. Drives every layer. */
  setIntensity(intensity: number): void {
    this.intensity = THREE.MathUtils.clamp(intensity, 0, 1);
    const active = this.intensity > 0.01;
    this.group.visible = active;
    if (!active) {
      this.pulseLight.intensity = 0;
      this.moteMaterial.opacity = 0;
      this.ringMaterial.opacity = 0;
      this.shardMaterial.opacity = 0;
      this.pendingPulse = false;
    }
  }

  get traceIntensity(): number {
    return this.intensity;
  }

  /**
   * Subtle HUD glitch amount, 0..1. Exactly periodic — the readouts stutter on
   * the mark's own clock, which is the tell that it is not weather.
   */
  hudGlitch(elapsed: number): number {
    if (!this.group.visible) return 0;
    const cycle = elapsed % 2.4;
    return cycle < 0.12 ? this.intensity * (1 - cycle / 0.12) : 0;
  }

  /**
   * True on the frame a contamination pulse fires, so the caller can answer it
   * with a sound. Cleared by reading it.
   */
  consumePulse(): boolean {
    const pulse = this.pendingPulse;
    this.pendingPulse = false;
    return pulse;
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible) return;

    // The light decays every frame so it falls off smoothly; the geometry
    // below only needs 20 Hz.
    const beat = elapsed % 1.6;
    const strike = beat < 0.1;
    if (strike) this.pendingPulse = true;
    this.pulseLight.intensity = (strike ? 1 - beat / 0.1 : 0) * this.intensity * 1.6;

    this.accumulator += delta;
    if (this.accumulator < 1 / UPDATE_HZ) return;
    this.accumulator = 0;

    // Counted with a loop rather than `filter().length`: this runs every tick
    // and the array a filter would allocate is pure garbage.
    let activeCount = 0;
    for (let i = 0; i < this.nodeActive.length; i += 1) {
      if (this.nodeActive[i]) activeCount += 1;
    }
    if (activeCount === 0) {
      this.moteMaterial.opacity = 0;
      this.ringMaterial.opacity = 0;
      this.shardMaterial.opacity = 0;
      return;
    }

    // ----- Motes: pulled inward on an exact cycle, then released -----
    const positions = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < MOTE_COUNT; i += 1) {
      const nodeIndex = this.moteSeeds[i * 4 + 3];
      const node = this.nodes[nodeIndex];
      if (!this.nodeActive[nodeIndex]) {
        // Park purged nodes' motes at the origin rather than drawing them.
        positions.setXYZ(i, 0, -1000, 0);
        continue;
      }
      // Each mote falls toward its node on a staggered cycle, so the cloud
      // reads as a continuous inward drift rather than a single pulse.
      const phase = (elapsed * 0.22 + hash(i * 9.1 + 4.3)) % 1;
      const pull = phase * phase;
      positions.setXYZ(
        i,
        node.x + this.moteSeeds[i * 4] * (1 - pull),
        node.y + this.moteSeeds[i * 4 + 1] * (1 - pull * 0.75),
        node.z + this.moteSeeds[i * 4 + 2] * (1 - pull)
      );
    }
    positions.needsUpdate = true;
    this.moteMaterial.opacity = 0.16 + this.intensity * 0.4;

    // ----- Rings: expand and fade off each active node -----
    let ringOpacity = 0;
    for (let i = 0; i < this.rings.length; i += 1) {
      const nodeIndex = this.ringSeeds[i * 2];
      const ring = this.rings[i];
      if (!this.nodeActive[nodeIndex]) {
        ring.visible = false;
        continue;
      }
      ring.visible = true;
      const node = this.nodes[nodeIndex];
      const cycle = (elapsed * 0.42 + this.ringSeeds[i * 2 + 1]) % 1;
      const radius = 2 + cycle * 16;
      // Starts just above the node's footing: any lower and the first half of
      // the cycle expands underground and is never seen.
      ring.position.set(node.x, node.y - 0.6 + cycle * 2.2, node.z);
      ring.scale.set(radius, radius, 1);
      ringOpacity = Math.max(ringOpacity, 1 - cycle);
    }
    this.ringMaterial.opacity = ringOpacity * 0.3 * this.intensity;

    // ----- Shards: hard angular slivers, stepping rather than sweeping -----
    for (let i = 0; i < SHARD_COUNT; i += 1) {
      const nodeIndex = this.shardSeeds[i * 4];
      if (!this.nodeActive[nodeIndex]) {
        // Collapse unused instances to nothing instead of hiding the mesh.
        this.matrix.makeScale(0, 0, 0);
        this.shards.setMatrixAt(i, this.matrix);
        continue;
      }
      const node = this.nodes[nodeIndex];
      const baseAngle = this.shardSeeds[i * 4 + 1];
      const radius = this.shardSeeds[i * 4 + 2];
      const height = this.shardSeeds[i * 4 + 3];
      // Quantised rotation: the shards jump between 16 fixed headings, which
      // is what makes the layer read as machine-made.
      const step = Math.floor((elapsed * 0.9 + i * 0.37) % 16) / 16;
      const angle = baseAngle + step * Math.PI * 2;
      this.scratch.set(node.x + Math.cos(angle) * radius, node.y + height, node.z + Math.sin(angle) * radius);
      this.quaternion.setFromAxisAngle(this.axis, -angle);
      this.matrix.compose(this.scratch, this.quaternion, this.unitScale);
      this.shards.setMatrixAt(i, this.matrix);
    }
    this.shards.instanceMatrix.needsUpdate = true;
    this.shardMaterial.opacity = 0.2 + this.intensity * 0.34;
  }

  dispose(): void {
    this.motes.geometry.dispose();
    this.moteMaterial.dispose();
    this.rings[0]?.geometry.dispose();
    this.ringMaterial.dispose();
    this.shards.geometry.dispose();
    this.shardMaterial.dispose();
    // The soft sprite texture is shared application-wide; freeing it here
    // would pull it out from under every other effect using the same size.
  }
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
