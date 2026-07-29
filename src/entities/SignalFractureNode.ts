import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import type { SignalFractureFocusDefinition } from '../assets/mission08Definitions';
import { freezeStaticChildren } from '../assets/materialCache';

const UNSTABLE_CORE = new THREE.Color(0xd98d5a);
const STABLE_CORE = new THREE.Color(0x5fd0b2);

/**
 * A focus of the signal fracture: an emitter half-driven into scorched
 * ground that pulses an unstable amber while the fracture is torn open and
 * settles to a calm teal once the pilot stabilizes it. Field hardware in the
 * Arca material language — restrained, never neon.
 */
export class SignalFractureNode {
  readonly group = new THREE.Group();
  readonly interactionPosition = new THREE.Vector3();

  private readonly coreMaterial: THREE.MeshStandardMaterial;
  private readonly emitterMaterial: THREE.MeshStandardMaterial;
  private readonly pulseMaterial: THREE.MeshBasicMaterial;
  private readonly pulse: THREE.Mesh;
  private readonly core: THREE.Mesh;
  private stabilized = false;

  constructor(readonly definition: SignalFractureFocusDefinition) {
    this.group.name = definition.name;
    this.group.visible = false;

    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b2320,
      roughness: 0.94,
      metalness: 0.06
    });
    this.coreMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a2c22,
      emissive: UNSTABLE_CORE.clone(),
      emissiveIntensity: 0.1,
      roughness: 0.5,
      metalness: 0.45
    });
    this.emitterMaterial = new THREE.MeshStandardMaterial({
      color: 0x8a99a2,
      roughness: 0.36,
      metalness: 0.72
    });

    // Anchored base plate seating the emitter into the scorched ground.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.9, 0.34, 8), stoneMaterial);
    base.position.y = 0.17;
    this.group.add(base);

    // Contact shadow + dust skirt: the emitter is seated into the ground,
    // never floating on top of the map.
    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 16),
      new THREE.MeshBasicMaterial({
        map: createSoftParticleTexture(64),
        color: 0x000000,
        transparent: true,
        opacity: 0.3,
        depthWrite: false
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.02;
    this.group.add(contactShadow);
    const dustSkirt = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.35, 16),
      new THREE.MeshStandardMaterial({ color: 0x241d18, roughness: 0.98, metalness: 0, transparent: true, opacity: 0.55 })
    );
    dustSkirt.rotation.x = -Math.PI / 2;
    dustSkirt.position.y = 0.04;
    this.group.add(dustSkirt);

    // Thin signal cables running from the base toward the fracture field.
    const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.7, metalness: 0.5 });
    for (const angle of [0.4, 2.4]) {
      const cable = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.07), cableMaterial);
      cable.position.set(Math.cos(angle) * 1.4, 0.06, Math.sin(angle) * 1.4);
      cable.rotation.y = -angle;
      this.group.add(cable);
    }

    // Central faceted core carrying the fracture energy.
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 1.5, 6), this.coreMaterial);
    core.position.y = 0.95;
    core.rotation.z = 0.1;
    this.core = core;
    this.group.add(core);

    // Three thin emitter fins around the core.
    for (let index = 0; index < 3; index += 1) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.18), this.emitterMaterial);
      const angle = index * ((Math.PI * 2) / 3) + 0.3;
      fin.position.set(Math.cos(angle) * 0.5, 0.9, Math.sin(angle) * 0.5);
      fin.rotation.y = -angle;
      fin.rotation.z = 0.16;
      this.group.add(fin);
    }

    // Scorch talus at the foot: fragments thrown by the fracture.
    for (let index = 0; index < 5; index += 1) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + index * 0.03, 0), stoneMaterial);
      const angle = index * 1.71;
      rock.position.set(Math.cos(angle) * (1.05 + index * 0.11), 0.06, Math.sin(angle) * (0.9 + index * 0.1));
      rock.scale.y = 0.42;
      this.group.add(rock);
    }

    this.pulseMaterial = new THREE.MeshBasicMaterial({
      color: UNSTABLE_CORE.clone(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.pulse = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.12, 28), this.pulseMaterial);
    this.pulse.rotation.x = -Math.PI / 2;
    this.pulse.position.y = 0.05;
    this.group.add(this.pulse);
    // The group is placed by mission code and the members marked above
    // animate every frame; the rest of the hardware is bolted on and
    // never moves, so its local matrices are composed once here.
    this.group.userData.dynamic = true;
    this.core.userData.dynamic = true;
    this.pulse.userData.dynamic = true;
    freezeStaticChildren(this.group);

  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.interactionPosition.set(x, y + 0.25, z);
  }

  restore(visible: boolean, stabilized: boolean): void {
    this.group.visible = visible;
    this.stabilized = stabilized;
    const color = stabilized ? STABLE_CORE : UNSTABLE_CORE;
    this.coreMaterial.emissive.copy(color);
    this.pulseMaterial.color.copy(color);
    this.coreMaterial.emissiveIntensity = stabilized ? 0.32 : 0.12;
  }

  markStabilized(): void {
    this.stabilized = true;
    this.coreMaterial.emissive.copy(STABLE_CORE);
    this.pulseMaterial.color.copy(STABLE_CORE);
    this.coreMaterial.emissiveIntensity = 0.4;
  }

  update(elapsed: number, active: boolean): void {
    if (!this.group.visible) return;
    // Unstable foci flicker on incommensurate sines; stabilized ones breathe
    // slow and calm.
    const flicker = this.stabilized
      ? 0.5 + Math.sin(elapsed * 1.4) * 0.5
      : 0.5 + Math.abs(Math.sin(elapsed * 4.3) * Math.sin(elapsed * 2.1)) * 0.5;
    this.group.rotation.y = Math.sin(elapsed * 0.2) * 0.03;
    // Unstable foci vibrate faintly; stabilized ones sit dead still.
    this.core.position.x = this.stabilized ? 0 : Math.sin(elapsed * 31) * 0.012 * flicker;
    this.core.position.z = this.stabilized ? 0 : Math.sin(elapsed * 27 + 1.3) * 0.01 * flicker;
    this.coreMaterial.emissiveIntensity = this.stabilized
      ? 0.3 + flicker * 0.12
      : active
        ? 0.16 + flicker * 0.14
        : 0.1 + flicker * 0.08;
    this.pulse.scale.setScalar(0.9 + flicker * 0.2);
    this.pulseMaterial.opacity = this.stabilized
      ? 0.07 + flicker * 0.03
      : active
        ? 0.05 + flicker * 0.05
        : 0.03 + flicker * 0.03;
  }
}
