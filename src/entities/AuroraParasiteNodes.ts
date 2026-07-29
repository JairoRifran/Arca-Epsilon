import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import { createContactShadow } from '../assets/materialCache';
import { parasiteNodeDefinitions } from '../assets/mission15Definitions';
import type { ParasiteState } from '../game/Mission15AuroraSabotage';

const NODE_COUNT = parasiteNodeDefinitions.length;
/** Filament segments per device, drawn as one instanced mesh for all three. */
const FILAMENTS_PER_NODE = 5;

/**
 * The three devices the Coalition clamped onto Aurora's own hardware.
 *
 * Deliberately small and unglamorous: a dark casing, a clamp, a few filaments
 * spliced into whatever they are stealing from, and one amber eye. They read
 * as something bolted on in a hurry by someone who never intended to be seen —
 * not as a probe, not as a weapon, and with nothing resembling a face.
 *
 * All three share one geometry set and four materials, and every filament in
 * the mission lives in a single `InstancedMesh`. Nothing here allocates
 * geometry, materials or vectors during update, and no value comes from
 * `Math.random` after construction.
 */
export class AuroraParasiteNodes {
  readonly group = new THREE.Group();
  readonly positions: THREE.Vector3[] = [];

  private readonly nodeGroups: THREE.Group[] = [];
  private readonly eyes: THREE.Mesh[] = [];
  private readonly casingMaterial: THREE.MeshStandardMaterial;
  private readonly clampMaterial: THREE.MeshStandardMaterial;
  private readonly eyeMaterial: THREE.MeshStandardMaterial;
  private readonly filamentMaterial: THREE.MeshBasicMaterial;
  private readonly haloMaterial: THREE.SpriteMaterial;
  private readonly halos: THREE.Sprite[] = [];
  private readonly filaments: THREE.InstancedMesh;
  private readonly sharedTexture: THREE.Texture;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scratch = new THREE.Vector3();
  private readonly unitScale = new THREE.Vector3(1, 1, 1);
  private readonly axis = new THREE.Vector3(0, 0, 1);

  /** Mirrored state so update never reads mission objects. */
  private readonly states: ParasiteState[] = ['hidden', 'hidden', 'hidden'];
  private revealedIndex = -1;

  constructor() {
    this.group.name = 'Nodos Parásitos de la Coalición';
    this.group.visible = false;
    this.sharedTexture = createSoftParticleTexture(48);

    this.casingMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b1a1d,
      roughness: 0.72,
      metalness: 0.55
    });
    this.clampMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2b2f,
      roughness: 0.5,
      metalness: 0.78
    });
    // The one lit part: a dull amber that never brightens into a beacon.
    this.eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a120a,
      emissive: 0xb4571a,
      emissiveIntensity: 0,
      roughness: 0.36,
      metalness: 0.3
    });
    this.filamentMaterial = new THREE.MeshBasicMaterial({
      color: 0x8f3a12,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.haloMaterial = new THREE.SpriteMaterial({
      map: this.sharedTexture,
      color: 0x9c4517,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    // Shared geometry: one casing, one clamp, one eye for all three devices.
    const casingGeometry = new THREE.BoxGeometry(0.34, 0.22, 0.16);
    const clampGeometry = new THREE.TorusGeometry(0.15, 0.035, 6, 12, Math.PI);
    const eyeGeometry = new THREE.SphereGeometry(0.045, 8, 6);

    for (let i = 0; i < NODE_COUNT; i += 1) {
      const node = new THREE.Group();
      node.name = parasiteNodeDefinitions[i].name;

      const casing = new THREE.Mesh(casingGeometry, this.casingMaterial);
      node.add(casing);

      const clamp = new THREE.Mesh(clampGeometry, this.clampMaterial);
      clamp.rotation.x = Math.PI / 2;
      clamp.position.y = -0.1;
      node.add(clamp);

      const eye = new THREE.Mesh(eyeGeometry, this.eyeMaterial);
      eye.position.set(0.1, 0.05, 0.09);
      node.add(eye);
      this.eyes.push(eye);

      const halo = new THREE.Sprite(this.haloMaterial);
      halo.scale.setScalar(1.6);
      node.add(halo);
      this.halos.push(halo);

      // A small dark disc so the device sits on its host instead of floating.
      node.add(createContactShadow(0.4, 0.24, this.sharedTexture));

      node.visible = false;
      this.nodeGroups.push(node);
      this.positions.push(new THREE.Vector3());
      this.group.add(node);
    }

    // Every filament of every device in one draw call. Instances belonging to
    // a device that is not revealed are collapsed to zero scale.
    this.filaments = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.012, 0.012, 1),
      this.filamentMaterial,
      NODE_COUNT * FILAMENTS_PER_NODE
    );
    this.filaments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.filaments.name = 'Filamentos Parásitos';
    this.filaments.frustumCulled = false;
    this.group.add(this.filaments);
    this.collapseAllFilaments();
  }

  private collapseAllFilaments(): void {
    this.matrix.makeScale(0, 0, 0);
    for (let i = 0; i < NODE_COUNT * FILAMENTS_PER_NODE; i += 1) this.filaments.setMatrixAt(i, this.matrix);
    this.filaments.instanceMatrix.needsUpdate = true;
  }

  /** Seat each device on the terrain. Called on sync, never per frame. */
  setLayout(getGroundHeight: (x: number, z: number) => number): void {
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const definition = parasiteNodeDefinitions[i];
      const [x, z] = definition.position;
      const y = getGroundHeight(x, z) + definition.height;
      this.nodeGroups[i].position.set(x, y, z);
      this.positions[i].set(x, y, z);
    }
    this.rebuildFilaments();
  }

  /**
   * Splice the filaments into the ground around each device. Deterministic
   * from the node index, and rebuilt only when the layout changes.
   */
  private rebuildFilaments(): void {
    for (let n = 0; n < NODE_COUNT; n += 1) {
      const origin = this.positions[n];
      const visible = this.states[n] !== 'hidden' || this.revealedIndex === n;
      for (let f = 0; f < FILAMENTS_PER_NODE; f += 1) {
        const index = n * FILAMENTS_PER_NODE + f;
        if (!visible) {
          this.matrix.makeScale(0, 0, 0);
          this.filaments.setMatrixAt(index, this.matrix);
          continue;
        }
        const angle = hash(n * 7.3 + f * 2.1) * Math.PI * 2;
        const length = 0.5 + hash(n * 3.7 + f * 5.9) * 0.9;
        const drop = 0.25 + hash(n * 11.3 + f) * 0.5;
        this.scratch.set(
          origin.x + Math.cos(angle) * length * 0.5,
          origin.y - drop * 0.5,
          origin.z + Math.sin(angle) * length * 0.5
        );
        this.quaternion.setFromAxisAngle(this.axis, angle);
        this.unitScale.set(1, 1, length);
        this.matrix.compose(this.scratch, this.quaternion, this.unitScale);
        this.filaments.setMatrixAt(index, this.matrix);
      }
    }
    this.unitScale.set(1, 1, 1);
    this.filaments.instanceMatrix.needsUpdate = true;
  }

  /**
   * Push mission state in. Called on sync and on every state change, never per
   * frame — `update` only animates what is set here.
   */
  restore(visible: boolean, states: readonly ParasiteState[], revealedIndex: number): void {
    this.group.visible = visible;
    let changed = false;
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const next = states[i] ?? 'hidden';
      if (this.states[i] !== next) changed = true;
      this.states[i] = next;
      // A device the pilot has not closed on stays invisible: the hunt is not
      // solved by a silhouette on the horizon.
      const shown = visible && (next !== 'hidden' || revealedIndex === i);
      this.nodeGroups[i].visible = shown;
    }
    if (revealedIndex !== this.revealedIndex) changed = true;
    this.revealedIndex = revealedIndex;
    if (changed) this.rebuildFilaments();
  }

  update(elapsed: number): void {
    if (!this.group.visible) return;

    // One shared pulse for every live device: dark amber, slow, out of phase
    // with anything the colony itself does.
    const pulse = 0.5 + Math.sin(elapsed * 2.3) * 0.5;
    let anyLive = false;
    for (let i = 0; i < NODE_COUNT; i += 1) {
      if (!this.nodeGroups[i].visible) continue;
      const state = this.states[i];
      if (state === 'disabled') continue;
      anyLive = true;
      // Offsetting each device stops the three reading as one system.
      const local = 0.5 + Math.sin(elapsed * 2.3 + i * 2.1) * 0.5;
      this.halos[i].scale.setScalar(1.4 + local * 0.5);
    }

    // Shared materials carry the state of whichever devices are still live.
    this.eyeMaterial.emissiveIntensity = anyLive ? 0.35 + pulse * 0.75 : 0.02;
    this.filamentMaterial.opacity = anyLive ? 0.22 + pulse * 0.3 : 0;
    this.haloMaterial.opacity = anyLive ? 0.12 + pulse * 0.22 : 0;
  }

  dispose(): void {
    this.casingMaterial.dispose();
    this.clampMaterial.dispose();
    this.eyeMaterial.dispose();
    this.filamentMaterial.dispose();
    this.haloMaterial.dispose();
    this.filaments.geometry.dispose();
    // The soft sprite texture is shared application-wide; freeing it here
    // would pull it out from under every other effect using the same size.
  }
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
