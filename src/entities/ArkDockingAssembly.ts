import * as THREE from 'three';
import { materialLibrary } from '../assets/materials';
import { arkDepartureTuning } from '../assets/arkDepartureDefinitions';

/**
 * The parts of the docking interface that `Mothership` does not already build.
 *
 * The launch platform Epsilon-3 already provides the pad, the guide-light
 * rails, the two clamp arms and the work light, and it animates them through
 * `setPlatformPower` / `setClampOpen`. This class adds only what a docked ship
 * needs on top of that: the umbilical conduit feeding the hull, the status
 * lights that walk red → amber → green as the release runs, and the beacons
 * marking the exit corridor.
 *
 * Built lazily on the first frame of the prologue and disposed the moment the
 * corridor is cleared, so a save that starts anywhere past the departure — and
 * every mission from M02 on — pays nothing for it.
 *
 * One instance, shared geometries and materials, no per-frame allocation and
 * no dynamic lights: everything animates through emissive intensity on a
 * handful of materials.
 */
export class ArkDockingAssembly {
  readonly group = new THREE.Group();

  private built = false;
  private disposed = false;

  /** Geometries and materials owned by this assembly, for a clean dispose. */
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];

  private statusMaterial?: THREE.MeshStandardMaterial;
  private umbilical?: THREE.Object3D;
  private umbilicalBase = new THREE.Vector3();
  private readonly corridorMaterials: THREE.MeshBasicMaterial[] = [];

  constructor() {
    this.group.name = 'Ark Docking Assembly';
    this.group.visible = false;
  }

  get isBuilt(): boolean {
    return this.built;
  }

  /**
   * Builds once, parented to the Ark's launch cradle so the whole assembly
   * inherits the Mothership transform and needs no per-frame syncing.
   */
  ensureBuilt(anchor: THREE.Object3D): void {
    if (this.built || this.disposed) return;
    this.built = true;

    const strutMetal = materialLibrary.darkMetal;

    // --- Umbilical conduit: a segmented duct from the pad into the hull. ----
    const umbilical = new THREE.Group();
    umbilical.name = 'Ark Umbilical Conduit';
    const segmentGeometry = new THREE.CylinderGeometry(0.34, 0.34, 1.1, 8);
    this.ownedGeometries.push(segmentGeometry);
    for (let i = 0; i < 6; i += 1) {
      const segment = new THREE.Mesh(segmentGeometry, strutMetal);
      segment.position.set(-2.4 + i * 0.02, 0.6, -1.2 + i * 1.05);
      segment.rotation.x = Math.PI / 2;
      umbilical.add(segment);
    }
    this.umbilical = umbilical;
    this.umbilicalBase.copy(umbilical.position);
    this.group.add(umbilical);

    // --- Status lights: one shared emissive material, colour-shifted. -------
    const statusMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a0f0f,
      emissive: new THREE.Color(0xff3320),
      emissiveIntensity: 1.4,
      roughness: 0.5,
      metalness: 0.1
    });
    this.statusMaterial = statusMaterial;
    this.ownedMaterials.push(statusMaterial);
    const statusGeometry = new THREE.SphereGeometry(0.28, 8, 6);
    this.ownedGeometries.push(statusGeometry);
    for (const x of [-5.4, 5.4]) {
      for (const z of [-3.2, 3.2]) {
        const light = new THREE.Mesh(statusGeometry, statusMaterial);
        light.position.set(x, 0.4, z);
        this.group.add(light);
      }
    }

    // --- Exit corridor: sparse beacon gates receding along +Z (outward). ----
    const gateGeometry = new THREE.TorusGeometry(9, 0.18, 4, 16);
    this.ownedGeometries.push(gateGeometry);
    for (let i = 0; i < 5; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x8fdcff,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      this.corridorMaterials.push(material);
      this.ownedMaterials.push(material);
      const gate = new THREE.Mesh(gateGeometry, material);
      gate.position.set(0, 1.4, 14 + i * (arkDepartureTuning.corridorLength / 6));
      this.group.add(gate);
    }

    anchor.add(this.group);
    this.group.visible = true;
  }

  /**
   * Cheap per-frame update: a handful of scalar writes, no allocation.
   *
   * @param clampOpen 0..1 release progress
   * @param corridorVisible whether the exit gates should still be shown
   * @param elapsed shared clock, for the beacon pulse
   */
  update(clampOpen: number, corridorVisible: boolean, elapsed: number): void {
    if (!this.built || this.disposed || !this.group.visible) return;

    if (this.statusMaterial) {
      // Red while locked, amber through the release, green once free.
      const hue = clampOpen <= 0 ? 0.02 : clampOpen >= 1 ? 0.32 : 0.02 + clampOpen * 0.09;
      this.statusMaterial.emissive.setHSL(hue, 0.95, 0.5);
      this.statusMaterial.emissiveIntensity = 1.1 + Math.sin(elapsed * 3.4) * 0.35;
    }

    // The conduit retracts into the pad as the clamps swing open, then the
    // whole duct is hidden once it has fully withdrawn.
    if (this.umbilical) {
      this.umbilical.position.z = this.umbilicalBase.z - clampOpen * 4.2;
      this.umbilical.visible = clampOpen < 0.98;
    }

    for (const [index, material] of this.corridorMaterials.entries()) {
      material.opacity = corridorVisible
        ? 0.1 + Math.max(0, Math.sin(elapsed * 2.2 - index * 0.7)) * 0.16
        : 0;
    }
  }

  setVisible(visible: boolean): void {
    if (!this.built || this.disposed) return;
    this.group.visible = visible;
  }

  /**
   * Full teardown: detaches from the Ark and releases every geometry and
   * material this assembly created. Materials borrowed from `materialLibrary`
   * are shared with the rest of the game and deliberately left alone.
   */
  dispose(): void {
    if (!this.built) {
      this.disposed = true;
      return;
    }
    this.group.removeFromParent();
    this.group.clear();
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
    this.corridorMaterials.length = 0;
    this.statusMaterial = undefined;
    this.umbilical = undefined;
    this.built = false;
    this.disposed = true;
  }

  /** Allows a fresh build after a reload/new game following a dispose. */
  resetForRebuild(): void {
    this.dispose();
    this.disposed = false;
    this.group.visible = false;
  }
}
