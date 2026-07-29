import * as THREE from 'three';
import type { AtlasEchoNodeDefinition } from '../assets/mission07Definitions';
import { freezeStaticChildren } from '../assets/materialCache';

export class AtlasEchoNode {
  readonly group = new THREE.Group();
  readonly interactionPosition = new THREE.Vector3();

  private readonly glyphMaterial: THREE.MeshStandardMaterial;
  private readonly coreMaterial: THREE.MeshStandardMaterial;
  private readonly pulseMaterial: THREE.MeshBasicMaterial;
  private readonly pulse: THREE.Mesh;
  private scanned = false;

  constructor(readonly definition: AtlasEchoNodeDefinition) {
    this.group.name = definition.name;
    this.group.visible = false;

    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x27302d,
      roughness: 0.92,
      metalness: 0.08
    });
    this.coreMaterial = new THREE.MeshStandardMaterial({
      color: 0x345e59,
      emissive: 0x194a45,
      emissiveIntensity: 0.08,
      roughness: 0.52,
      metalness: 0.4
    });
    this.glyphMaterial = new THREE.MeshStandardMaterial({
      color: 0x74cfc1,
      emissive: 0x3fc8b8,
      emissiveIntensity: 0.05,
      roughness: 0.35,
      metalness: 0.35
    });

    const halfBuriedCore = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.85, 1.6, 6), this.coreMaterial);
    halfBuriedCore.position.y = 0.58;
    halfBuriedCore.rotation.z = 0.12;
    this.group.add(halfBuriedCore);

    for (let index = 0; index < 3; index += 1) {
      const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.64, 0.018), this.glyphMaterial);
      const angle = index * (Math.PI * 2 / 3) + 0.22;
      glyph.position.set(Math.cos(angle) * 0.62, 0.72 + index * 0.05, Math.sin(angle) * 0.62);
      glyph.rotation.y = -angle + Math.PI / 2;
      this.group.add(glyph);
    }

    for (let index = 0; index < 5; index += 1) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + index * 0.035, 0), stoneMaterial);
      const angle = index * 1.71;
      rock.position.set(Math.cos(angle) * (1.1 + index * 0.12), 0.08, Math.sin(angle) * (0.9 + index * 0.1));
      rock.scale.y = 0.42;
      this.group.add(rock);
    }

    this.pulseMaterial = new THREE.MeshBasicMaterial({
      color: 0x76d8c8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.pulse = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.16, 28), this.pulseMaterial);
    this.pulse.rotation.x = -Math.PI / 2;
    this.pulse.position.y = 0.06;
    this.group.add(this.pulse);
    // The group is placed by mission code and the members marked above
    // animate every frame; the rest of the hardware is bolted on and
    // never moves, so its local matrices are composed once here.
    this.group.userData.dynamic = true;
    this.pulse.userData.dynamic = true;
    freezeStaticChildren(this.group);

  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.interactionPosition.set(x, y + 0.25, z);
  }

  restore(visible: boolean, scanned: boolean): void {
    this.group.visible = visible;
    this.scanned = scanned;
    this.coreMaterial.emissiveIntensity = scanned ? 0.34 : 0.08;
    this.glyphMaterial.emissiveIntensity = scanned ? 0.42 : 0.05;
  }

  markScanned(): void {
    this.scanned = true;
    this.coreMaterial.emissiveIntensity = 0.42;
    this.glyphMaterial.emissiveIntensity = 0.58;
  }

  update(elapsed: number, active: boolean): void {
    if (!this.group.visible) return;
    const pulse = 0.5 + Math.sin(elapsed * (active ? 2.8 : 1.2)) * 0.5;
    this.group.rotation.y = Math.sin(elapsed * 0.18) * 0.03;
    this.coreMaterial.emissiveIntensity = this.scanned ? 0.32 + pulse * 0.14 : active ? 0.12 + pulse * 0.1 : 0.055;
    this.glyphMaterial.emissiveIntensity = this.scanned ? 0.42 + pulse * 0.12 : active ? 0.12 + pulse * 0.08 : 0.04;
    this.pulse.scale.setScalar(0.92 + pulse * 0.18);
    this.pulseMaterial.opacity = this.scanned ? 0.08 + pulse * 0.035 : active ? 0.05 + pulse * 0.035 : 0.018;
  }
}
