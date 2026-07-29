import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

const CALM_TEAL = new THREE.Color(0x8fd4e2);
const SOFT_AMBER = new THREE.Color(0xdda368);

/**
 * Visual layer of the orbital defense mesh: hair-thin additive links from
 * each deployed beacon back to Base Nereida, with signal motes riding the
 * lines. Synchronizing runs busier; the completed network settles into a
 * calm slow pulse; losing synchronization range turns the mesh a muted
 * amber with irregular pulses. All buffers are preallocated — per-frame
 * work is writes only.
 */
export class DefenseNetworkLinks {
  readonly group = new THREE.Group();

  private readonly lineGeometry = new THREE.BufferGeometry();

  private readonly linePositions: THREE.BufferAttribute;

  private readonly lineMaterial: THREE.LineBasicMaterial;

  private readonly lines: THREE.LineSegments;

  private readonly moteGeometry = new THREE.BufferGeometry();

  private readonly motePositions: THREE.BufferAttribute;

  private readonly moteMaterial: THREE.PointsMaterial;

  private readonly endpoints: THREE.Vector3[] = [];

  private readonly hub = new THREE.Vector3();

  private readonly placed: boolean[] = [];

  private readonly capacity: number;

  private unstableState = false;

  private onlineState = false;

  constructor(beaconCount: number) {
    this.group.name = 'Defense Network Links';
    this.group.visible = false;
    this.capacity = Math.max(1, beaconCount);

    this.linePositions = new THREE.BufferAttribute(new Float32Array(this.capacity * 2 * 3), 3);
    this.lineGeometry.setAttribute('position', this.linePositions);
    this.lineMaterial = new THREE.LineBasicMaterial({
      color: CALM_TEAL,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.lines.frustumCulled = false;
    this.group.add(this.lines);

    const motesPerLink = 2;
    this.motePositions = new THREE.BufferAttribute(new Float32Array(this.capacity * motesPerLink * 3), 3);
    this.moteGeometry.setAttribute('position', this.motePositions);
    this.moteMaterial = new THREE.PointsMaterial({
      color: CALM_TEAL,
      size: 1.4,
      map: createSoftParticleTexture(32),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const motes = new THREE.Points(this.moteGeometry, this.moteMaterial);
    motes.frustumCulled = false;
    this.group.add(motes);

    for (let i = 0; i < this.capacity; i += 1) {
      this.endpoints.push(new THREE.Vector3());
      this.placed.push(false);
    }
  }

  get linksActive(): boolean {
    return this.group.visible && this.activeLinkCount > 0;
  }

  get unstable(): boolean {
    return this.linksActive && this.unstableState;
  }

  get online(): boolean {
    return this.linksActive && this.onlineState;
  }

  get networkVisible(): boolean {
    return this.group.visible;
  }

  get activeLinkCount(): number {
    return this.placed.filter(Boolean).length;
  }

  /** Refresh endpoints and deployment flags; writes into fixed buffers. */
  sync(beaconPositions: THREE.Vector3[], hubPosition: THREE.Vector3, placedFlags: boolean[], missionActive: boolean): void {
    this.group.visible = missionActive && placedFlags.some(Boolean);
    this.hub.copy(hubPosition);
    this.hub.y += 2.2;
    for (let i = 0; i < this.capacity; i += 1) {
      const source = beaconPositions[i];
      if (source) this.endpoints[i].set(source.x, source.y + 5.05, source.z);
      this.placed[i] = Boolean(placedFlags[i]);
      const offset = i * 6;
      const endpoint = this.placed[i] ? this.endpoints[i] : this.hub;
      this.linePositions.array[offset] = endpoint.x;
      this.linePositions.array[offset + 1] = endpoint.y;
      this.linePositions.array[offset + 2] = endpoint.z;
      this.linePositions.array[offset + 3] = this.hub.x;
      this.linePositions.array[offset + 4] = this.hub.y;
      this.linePositions.array[offset + 5] = this.hub.z;
    }
    this.linePositions.needsUpdate = true;
    this.lineGeometry.computeBoundingSphere();
  }

  update(elapsed: number, synchronizing: boolean, online: boolean, unstable: boolean): void {
    this.unstableState = unstable;
    this.onlineState = online;
    if (!this.group.visible) return;
    const pulse = (Math.sin(elapsed * (online ? 1.1 : 2.3)) + 1) * 0.5;
    // Unstable link: irregular beat from incommensurate sines.
    const irregular = 0.35 + Math.abs(Math.sin(elapsed * 5.1) * Math.sin(elapsed * 2.17)) * 0.65;

    const color = unstable ? SOFT_AMBER : CALM_TEAL;
    this.lineMaterial.color.copy(color);
    this.moteMaterial.color.copy(color);
    this.lineMaterial.opacity = unstable
      ? 0.05 + irregular * 0.09
      : online
        ? 0.06 + pulse * 0.035
        : synchronizing
          ? 0.1 + pulse * 0.05
          : 0.05;

    // Motes ride each active link hub-ward; parked underground otherwise.
    const speed = unstable ? 0.1 : online ? 0.07 : 0.16;
    for (let i = 0; i < this.capacity; i += 1) {
      for (let m = 0; m < 2; m += 1) {
        const index = (i * 2 + m) * 3;
        if (!this.placed[i]) {
          this.motePositions.array[index + 1] = -50;
          continue;
        }
        const t = (elapsed * speed + i * 0.31 + m * 0.5) % 1;
        const from = this.endpoints[i];
        this.motePositions.array[index] = THREE.MathUtils.lerp(from.x, this.hub.x, t);
        this.motePositions.array[index + 1] = THREE.MathUtils.lerp(from.y, this.hub.y, t) + Math.sin(t * Math.PI) * 2.4;
        this.motePositions.array[index + 2] = THREE.MathUtils.lerp(from.z, this.hub.z, t);
      }
    }
    this.motePositions.needsUpdate = true;
    this.moteMaterial.opacity = unstable ? irregular * 0.3 : online ? 0.16 + pulse * 0.08 : 0.3;
  }
}
