import * as THREE from 'three';
import { createContactShadow } from '../assets/materialCache';
import { pleyadianNodeDefinitions, NODE_COUNT } from '../assets/mission16Definitions';

/** Per-node lifecycle for the sync step. */
export type PleyadianNodeState = 'dormant' | 'aligning' | 'synchronized';

/**
 * The three Pleyadian defence nodes ringed around Aurora in M16.
 *
 * Deliberately NOT the Coalition's language: clean authored geometry — a low
 * pedestal, a slim column, two harmonic rings and a soft emitter head — in
 * white, pale cyan and dim gold. Ancient-technological, never magical. One
 * point light per node, one shared geometry/material set, and nothing here
 * allocates geometry, materials or vectors during update.
 *
 * State drives only emissive intensity and ring spin: dormant reads cold, the
 * active node breathes as it is aligned, a synchronised node holds a steady
 * gold. Positions come from the shared settlement layout via `setLayout`, so
 * the nodes seat on the same ground everything else in Aurora does.
 */
export class PleyadianDefenseNodes {
  readonly group = new THREE.Group();
  readonly positions: THREE.Vector3[] = [];

  private readonly nodeGroups: THREE.Group[] = [];
  private readonly emitterMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly ringMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly rings: THREE.Mesh[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly shellMaterial: THREE.MeshStandardMaterial;
  private readonly goldMaterial: THREE.MeshStandardMaterial;

  /** Mirrored state so update never reads the mission object. */
  private readonly states: PleyadianNodeState[] = ['dormant', 'dormant', 'dormant'];
  private activeIndex = -1;

  constructor() {
    this.group.name = 'Nodos Pleyadianos de Defensa';
    this.group.visible = false;

    // Shared clean palette: bone-white shell, dim gold trim, pale cyan emitter.
    this.shellMaterial = new THREE.MeshStandardMaterial({
      color: 0xe9edf0,
      roughness: 0.42,
      metalness: 0.3
    });
    this.goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xb79a5e,
      emissive: 0x6f5a2c,
      emissiveIntensity: 0.12,
      roughness: 0.38,
      metalness: 0.62
    });

    const pedestalGeometry = new THREE.CylinderGeometry(0.62, 0.82, 0.4, 12);
    const collarGeometry = new THREE.CylinderGeometry(0.5, 0.62, 0.12, 12);
    const columnGeometry = new THREE.CylinderGeometry(0.16, 0.22, 1.55, 10);
    const emitterGeometry = new THREE.SphereGeometry(0.3, 14, 10);
    const ringGeometry = new THREE.TorusGeometry(0.55, 0.045, 8, 28);

    for (let i = 0; i < NODE_COUNT; i += 1) {
      const node = new THREE.Group();
      node.name = pleyadianNodeDefinitions[i].name;
      node.visible = false;

      node.add(createContactShadow(1.1, 0.3));

      const pedestal = new THREE.Mesh(pedestalGeometry, this.shellMaterial);
      pedestal.position.y = 0.2;
      node.add(pedestal);

      const collar = new THREE.Mesh(collarGeometry, this.goldMaterial);
      collar.position.y = 0.46;
      node.add(collar);

      const column = new THREE.Mesh(columnGeometry, this.shellMaterial);
      column.position.y = 1.3;
      node.add(column);

      // Pale-cyan emitter head, unique material per node so the active one can
      // brighten without touching the others.
      const emitterMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a2a30,
        emissive: 0x8fe4f2,
        emissiveIntensity: 0.14,
        roughness: 0.3,
        metalness: 0.2
      });
      this.emitterMaterials.push(emitterMaterial);
      const emitter = new THREE.Mesh(emitterGeometry, emitterMaterial);
      emitter.position.y = 2.15;
      node.add(emitter);

      // Two harmonic rings around the emitter, gently counter-rotating.
      const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x24333a,
        emissive: 0x74d6ec,
        emissiveIntensity: 0.1,
        roughness: 0.3,
        metalness: 0.3
      });
      this.ringMaterials.push(ringMaterial);
      for (let r = 0; r < 2; r += 1) {
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.y = 2.15;
        ring.rotation.x = r === 0 ? Math.PI / 2 : Math.PI / 2.4;
        ring.rotation.z = r === 0 ? 0 : Math.PI / 3;
        this.rings.push(ring);
        node.add(ring);
      }

      const light = new THREE.PointLight(0x9fe6f4, 0, 12, 2);
      light.position.y = 2.15;
      light.visible = false;
      this.lights.push(light);
      node.add(light);

      node.traverse((child) => {
        if (child instanceof THREE.Mesh) child.frustumCulled = false;
      });

      this.nodeGroups.push(node);
      this.positions.push(new THREE.Vector3());
      this.group.add(node);
    }
  }

  /** Seat each node on the terrain. Called on sync, never per frame. */
  setLayout(getGroundHeight: (x: number, z: number) => number): void {
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const [x, z] = pleyadianNodeDefinitions[i].position;
      const y = getGroundHeight(x, z);
      this.nodeGroups[i].position.set(x, y, z);
      // Interaction/marker point sits at the emitter head.
      this.positions[i].set(x, y + pleyadianNodeDefinitions[i].height, z);
    }
  }

  /**
   * Push mission state in. Called on sync and on every state change, never per
   * frame — `update` only animates what is set here.
   */
  restore(visible: boolean, states: readonly PleyadianNodeState[], activeIndex: number): void {
    this.group.visible = visible;
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const next = states[i] ?? 'dormant';
      this.states[i] = next;
      // Every node is visible once the sync step is live; before that the whole
      // group is hidden, so no node is ever shown out of context.
      this.nodeGroups[i].visible = visible;
      const synced = next === 'synchronized';
      const lit = visible && (synced || i === activeIndex);
      this.lights[i].visible = lit;
      this.lights[i].intensity = synced ? 0.5 : i === activeIndex ? 0.35 : 0;
    }
    this.activeIndex = activeIndex;
  }

  update(elapsed: number): void {
    if (!this.group.visible) return;
    // Rings spin slowly; the active node breathes, a synchronised one holds
    // steady gold. One shared clock, no allocation.
    const breathe = 0.5 + Math.sin(elapsed * 1.8) * 0.5;
    for (let r = 0; r < this.rings.length; r += 1) {
      this.rings[r].rotation.z += (r % 2 === 0 ? 0.006 : -0.004);
    }
    for (let i = 0; i < NODE_COUNT; i += 1) {
      if (!this.nodeGroups[i].visible) continue;
      const state = this.states[i];
      if (state === 'synchronized') {
        this.emitterMaterials[i].emissive.setHex(0xf2dca0);
        this.emitterMaterials[i].emissiveIntensity = 0.55 + Math.sin(elapsed * 0.9) * 0.05;
        this.ringMaterials[i].emissiveIntensity = 0.5;
        this.lights[i].color.setHex(0xf2d79a);
        this.lights[i].intensity = 0.5;
      } else if (i === this.activeIndex) {
        this.emitterMaterials[i].emissive.setHex(0x8fe4f2);
        this.emitterMaterials[i].emissiveIntensity = 0.3 + breathe * 0.6;
        this.ringMaterials[i].emissiveIntensity = 0.2 + breathe * 0.4;
        this.lights[i].color.setHex(0x9fe6f4);
        this.lights[i].intensity = 0.25 + breathe * 0.4;
      } else {
        this.emitterMaterials[i].emissive.setHex(0x8fe4f2);
        this.emitterMaterials[i].emissiveIntensity = 0.12;
        this.ringMaterials[i].emissiveIntensity = 0.08;
      }
    }
  }

  dispose(): void {
    for (const m of this.emitterMaterials) m.dispose();
    for (const m of this.ringMaterials) m.dispose();
    this.shellMaterial.dispose();
    this.goldMaterial.dispose();
  }
}
