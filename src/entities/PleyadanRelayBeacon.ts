import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

const RELAY_HEAD_LOCAL = new THREE.Vector3(2.4, 3.3, 0.8);
const CRYSTAL_LOCAL = new THREE.Vector3(0, 5.7, 0);

/**
 * Resonador Atlas + relay beacon. The resonator is ancient non-human
 * hardware: a faceted core carrying dormant glyph seams, three canted fins
 * with energy veins and a slowly turning crystal. The relay is human
 * equipment installed by the pilot: clamped base, folded mast, status lamp,
 * and — once synchronizing — a thin stream of signal motes climbing from
 * the relay head to the crystal. Losing range turns the link amber and
 * irregular.
 */
export class PleyadanRelayBeacon {
  readonly group = new THREE.Group();

  readonly interactionPosition = new THREE.Vector3();

  private readonly resonatorMaterial: THREE.MeshStandardMaterial;

  private readonly glyphMaterial: THREE.MeshStandardMaterial;

  private readonly veinMaterial: THREE.MeshStandardMaterial;

  private readonly relayMaterial: THREE.MeshStandardMaterial;

  private readonly lampMaterial: THREE.MeshStandardMaterial;

  private readonly relayAssembly = new THREE.Group();

  private readonly crystal: THREE.Mesh;

  private readonly statusLight: THREE.PointLight;

  private readonly streamPoints: THREE.Points;

  private readonly streamMaterial: THREE.PointsMaterial;

  private readonly streamSeeds: Float32Array;

  private lastStability = 0;

  private revealed = false;

  private placed = false;

  constructor() {
    this.group.name = 'Resonador Atlas';
    this.group.visible = false;

    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x263238,
      roughness: 0.58,
      metalness: 0.82
    });
    this.resonatorMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b6a68,
      emissive: 0x1a8b84,
      emissiveIntensity: 0.22,
      roughness: 0.4,
      metalness: 0.72
    });
    this.glyphMaterial = new THREE.MeshStandardMaterial({
      color: 0x14322f,
      emissive: 0x2fe8d4,
      emissiveIntensity: 0.12,
      roughness: 0.3,
      metalness: 0.5
    });
    this.veinMaterial = this.glyphMaterial.clone();
    this.relayMaterial = new THREE.MeshStandardMaterial({
      color: 0x8dcac3,
      emissive: 0x32e3cf,
      emissiveIntensity: 0.2,
      roughness: 0.28,
      metalness: 0.64
    });
    this.lampMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a3b39,
      emissive: 0x57e7d2,
      emissiveIntensity: 0,
      roughness: 0.3,
      metalness: 0.4
    });

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.5, 0.9, 8), darkMetal);
    plinth.position.y = 0.45;
    this.group.add(plinth);
    // Stepped plinth crown and a recessed channel ring: layered ancient
    // masonry instead of a single extruded block.
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.5, 0.34, 8), darkMetal);
    crown.position.y = 1.05;
    this.group.add(crown);
    const channelMetal = new THREE.MeshStandardMaterial({ color: 0x121a1c, roughness: 0.7, metalness: 0.6 });
    const channel = new THREE.Mesh(new THREE.CylinderGeometry(2.52, 2.52, 0.06, 8), channelMetal);
    channel.position.y = 0.92;
    this.group.add(channel);

    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.1, 4.8, 6), this.resonatorMaterial);
    core.position.y = 2.8;
    this.group.add(core);
    // Horizontal groove bands around the core: fine carved relief that
    // catches light along the faceted column.
    for (const [y, radius] of [
      [1.6, 0.98],
      [2.9, 0.83],
      [4.2, 0.68]
    ] as [number, number][]) {
      const groove = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.05, 6), channelMetal);
      groove.position.y = y;
      this.group.add(groove);
    }

    // Dormant glyph seams on alternating core facets: the Atlas language,
    // barely lit until the relay wakes the structure.
    for (let index = 0; index < 3; index += 1) {
      const angle = (index / 3) * Math.PI * 2 + Math.PI / 6;
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.045, 2.9, 0.025), this.glyphMaterial);
      seam.position.set(Math.cos(angle) * 0.82, 2.6, Math.sin(angle) * 0.82);
      seam.rotation.y = -angle + Math.PI / 2;
      seam.rotation.z = 0.055;
      this.group.add(seam);
    }

    for (let index = 0; index < 3; index += 1) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.7, 1.8), darkMetal);
      const angle = (index / 3) * Math.PI * 2;
      fin.position.set(Math.cos(angle) * 1.3, 2.25, Math.sin(angle) * 1.3);
      fin.rotation.y = -angle;
      fin.rotation.z = 0.18;
      this.group.add(fin);

      // Energy vein tracing each fin's outer edge.
      const vein = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.3, 0.07), this.veinMaterial);
      vein.position.set(Math.cos(angle) * 1.46, 2.3, Math.sin(angle) * 1.46);
      vein.rotation.y = -angle;
      vein.rotation.z = 0.18;
      this.group.add(vein);
    }

    this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), this.resonatorMaterial);
    this.crystal.position.y = 5.7;
    this.group.add(this.crystal);

    // --- Relay beacon: pilot-installed hardware ---
    this.relayAssembly.name = 'Baliza de Enlace Atlas-Pleyadana';
    this.relayAssembly.visible = false;
    const relayBase = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.95, 0.45, 8), darkMetal);
    relayBase.position.set(2.4, 0.24, 0.8);
    this.relayAssembly.add(relayBase);
    // Slim deployment struts with ground pads: field-deployed tripod feel.
    for (let index = 0; index < 3; index += 1) {
      const angle = (index / 3) * Math.PI * 2 + 0.5;
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.52, 0.2), darkMetal);
      strut.position.set(2.4 + Math.cos(angle) * 0.98, 0.2, 0.8 + Math.sin(angle) * 0.98);
      strut.rotation.y = -angle;
      strut.rotation.z = 0.42;
      this.relayAssembly.add(strut);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.05, 8), darkMetal);
      pad.position.set(2.4 + Math.cos(angle) * 1.18, 0.03, 0.8 + Math.sin(angle) * 1.18);
      this.relayAssembly.add(pad);
    }
    const relayMast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 2.8, 8), this.relayMaterial);
    relayMast.position.set(2.4, 1.75, 0.8);
    this.relayAssembly.add(relayMast);
    const relayHead = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.32, 0.28), this.relayMaterial);
    relayHead.position.set(2.4, 3.2, 0.8);
    relayHead.rotation.y = 0.45;
    this.relayAssembly.add(relayHead);
    // Small dish aimed at the resonator crystal plus a blinking status lamp.
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, 0.9), darkMetal);
    dish.position.set(2.18, 3.32, 0.62);
    dish.rotation.set(-0.9, 0.6, 0);
    this.relayAssembly.add(dish);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), this.lampMaterial);
    lamp.position.set(2.4, 3.44, 0.8);
    this.relayAssembly.add(lamp);
    // Fine dipole antennas flanking the head: delicate deployed hardware.
    for (const side of [-1, 1]) {
      const dipole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5), this.relayMaterial);
      dipole.position.set(2.4 + side * 0.3, 3.5, 0.8 - side * 0.14);
      dipole.rotation.z = side * 0.5;
      this.relayAssembly.add(dipole);
    }
    this.group.add(this.relayAssembly);

    this.statusLight = new THREE.PointLight(0x57e7d2, 0, 42, 1.8);
    this.statusLight.position.set(2.4, 3.3, 0.8);
    this.group.add(this.statusLight);

    // --- Signal stream: motes climbing from relay head to the crystal ---
    const streamCount = 8;
    const streamPositions = new Float32Array(streamCount * 3);
    this.streamSeeds = new Float32Array(streamCount);
    for (let i = 0; i < streamCount; i += 1) {
      this.streamSeeds[i] = i / streamCount;
      streamPositions[i * 3 + 1] = -4;
    }
    const streamGeometry = new THREE.BufferGeometry();
    streamGeometry.setAttribute('position', new THREE.BufferAttribute(streamPositions, 3));
    streamGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(1.2, 4.4, 0.4), 6);
    this.streamMaterial = new THREE.PointsMaterial({
      color: 0x8ce4d6,
      size: 0.12,
      map: createSoftParticleTexture(32),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.streamPoints = new THREE.Points(streamGeometry, this.streamMaterial);
    this.group.add(this.streamPoints);

    for (let index = 0; index < 7; index += 1) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.45 + (index % 3) * 0.18, 0),
        darkMetal
      );
      const angle = index * 2.31;
      rock.position.set(Math.cos(angle) * (4.5 + index * 0.35), 0.28, Math.sin(angle) * (4 + index * 0.42));
      rock.scale.y = 0.55;
      this.group.add(rock);
    }
  }

  setPosition(x: number, groundY: number, z: number): void {
    this.group.position.set(x, groundY, z);
    this.interactionPosition.set(x + 2.4, groundY + 0.1, z + 0.8);
  }

  reveal(): void {
    this.revealed = true;
    this.group.visible = true;
  }

  placeRelay(): void {
    this.reveal();
    this.placed = true;
    this.relayAssembly.visible = true;
  }

  restore(revealed: boolean, relayPlaced: boolean): void {
    this.revealed = revealed;
    this.placed = relayPlaced;
    this.group.visible = revealed;
    this.relayAssembly.visible = relayPlaced;
  }

  update(elapsed: number, signalStability: number): void {
    if (!this.revealed) return;
    const stability = THREE.MathUtils.clamp(signalStability, 0, 100);
    const syncing = this.placed && stability > 0 && stability < 100;
    const declining = syncing && stability < this.lastStability - 0.0001;
    this.lastStability = stability;

    const pulse = 0.5 + Math.sin(elapsed * 2.4) * 0.5;
    // Unstable link: irregular pulses from incommensurate sines.
    const irregular = 0.45 + Math.abs(Math.sin(elapsed * 5.7) * Math.sin(elapsed * 2.3)) * 0.55;

    this.resonatorMaterial.emissiveIntensity = 0.16 + pulse * 0.13 + (stability / 100) * 0.18;
    // Glyphs and veins wake with the link and settle when synchronized —
    // restrained energy, never neon.
    const wake = this.placed ? 0.16 + (stability / 100) * 0.55 : 0.1;
    this.glyphMaterial.emissiveIntensity = wake * (declining ? irregular : 0.8 + pulse * 0.2);
    this.veinMaterial.emissiveIntensity = this.glyphMaterial.emissiveIntensity * 0.75;

    // Crystal turns slowly and lifts almost imperceptibly while charged.
    this.crystal.rotation.y = elapsed * 0.35;
    this.crystal.position.y = 5.7 + Math.sin(elapsed * 1.3) * 0.04 * (0.4 + stability / 100);

    this.relayMaterial.emissiveIntensity = this.placed ? 0.22 + (stability / 100) * 0.9 + pulse * 0.12 : 0.08;
    this.lampMaterial.emissiveIntensity = this.placed
      ? (declining ? irregular * 1.1 : (elapsed % 1.4 < 0.12 ? 1.15 : 0.28))
      : 0;
    this.lampMaterial.emissive.setHex(declining ? 0xffb36a : 0x57e7d2);
    this.statusLight.color.setHex(declining ? 0xffb36a : 0x57e7d2);
    this.statusLight.intensity = this.placed
      ? (declining ? 0.35 + irregular * 0.9 : 0.45 + (stability / 100) * 1.5)
      : 0;

    // Signal motes ride the relay→crystal line while the link is alive;
    // synchronizing runs fast, the completed link idles slow and calm.
    const streamPositions = this.streamPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const complete = this.placed && stability >= 100;
    const streamAlive = this.placed && stability > 2;
    if (streamAlive) {
      const speed = complete ? 0.12 : 0.34;
      for (let i = 0; i < streamPositions.count; i += 1) {
        const t = (elapsed * speed + this.streamSeeds[i]) % 1;
        streamPositions.setXYZ(
          i,
          THREE.MathUtils.lerp(RELAY_HEAD_LOCAL.x, CRYSTAL_LOCAL.x, t),
          THREE.MathUtils.lerp(RELAY_HEAD_LOCAL.y, CRYSTAL_LOCAL.y, t) + Math.sin(t * Math.PI) * 0.3,
          THREE.MathUtils.lerp(RELAY_HEAD_LOCAL.z, CRYSTAL_LOCAL.z, t)
        );
      }
      streamPositions.needsUpdate = true;
    }
    this.streamMaterial.opacity = !streamAlive
      ? 0
      : complete
        ? 0.11 + pulse * 0.05
        : declining
          ? irregular * 0.24
          : 0.14 + (stability / 100) * 0.26;
  }

  get relaySignalFlowActive(): boolean {
    return this.group.visible && this.placed && this.streamMaterial.opacity > 0.01;
  }
}
