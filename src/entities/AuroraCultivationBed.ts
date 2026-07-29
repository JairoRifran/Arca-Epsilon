import * as THREE from 'three';
import { createContactShadow, sharedStandardMaterial } from '../assets/materialCache';
import { auroraGreebleField, boltGeometry, paintedHull, polymer, rubber, seamGeometry, structuralMetal } from '../assets/auroraDetailKit';
import { createSoftParticleTexture } from '../assets/materials';

/**
 * The first cultivation bed: a contained tray of Aurora sediment inside a
 * low frame, covered by a shallow transparent hoop, with two sensor stakes
 * and a soft grow strip underneath. Nothing is harvested here — once the
 * bio-trial starts, a handful of tiny shoots appear and the cover glows
 * faintly. It is an experiment, and it is meant to look like one.
 *
 * The surrounding protoflora is deliberately untouched: the bed brings its
 * own soil rather than clearing the valley's.
 */
export class AuroraCultivationBed {
  readonly group = new THREE.Group();
  readonly interactionPosition = new THREE.Vector3();

  private readonly coverMaterial: THREE.MeshStandardMaterial;
  private readonly growMaterial: THREE.MeshStandardMaterial;
  private readonly sensorMaterial: THREE.MeshStandardMaterial;
  private readonly shoots: THREE.Mesh[] = [];
  private readonly light: THREE.PointLight;
  private readonly bracketMaterial: THREE.MeshStandardMaterial;
  private readonly hoseMaterial: THREE.MeshStandardMaterial;
  private readonly capMaterial: THREE.MeshStandardMaterial;
  private trialActive = false;

  constructor() {
    this.group.name = 'Cama de Cultivo Aurora';
    this.group.visible = false;

    const frame = paintedHull(0x6c7175, 0.6);
    const bracket = structuralMetal(0x4a5158);
    const hose = rubber();
    const cap = polymer(0x2f3538);
    const soil = new THREE.MeshStandardMaterial({ color: 0x4b4034, roughness: 0.96, metalness: 0.02 });
    this.coverMaterial = new THREE.MeshStandardMaterial({
      color: 0xbdd8dc,
      emissive: 0x2f6b62,
      emissiveIntensity: 0.04,
      roughness: 0.22,
      metalness: 0.08,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide
    });
    this.growMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2f2c,
      emissive: 0xffb27a,
      emissiveIntensity: 0,
      roughness: 0.5,
      metalness: 0.2
    });
    this.sensorMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b3336,
      emissive: 0x74d9b0,
      emissiveIntensity: 0.06,
      roughness: 0.4,
      metalness: 0.45
    });

    this.group.add(createContactShadow(2, 0.28));

    // Contained tray: four frame walls around the sediment rather than one
    // solid block, so the bed reads as a container that was brought here.
    const wallSpecs: [number, number, number, number][] = [
      [2.5, 0.08, 0, 0.75],
      [2.5, 0.08, 0, -0.75],
      [0.08, 1.5, 1.25, 0],
      [0.08, 1.5, -1.25, 0]
    ];
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.34, 1), frame, wallSpecs.length);
    const wallMatrix = new THREE.Matrix4();
    const wallScale = new THREE.Vector3();
    for (let i = 0; i < wallSpecs.length; i += 1) {
      const [w, d, x, z] = wallSpecs[i];
      wallMatrix.identity();
      wallMatrix.scale(wallScale.set(w, 1, d));
      wallMatrix.setPosition(x, 0.19, z);
      walls.setMatrixAt(i, wallMatrix);
    }
    walls.instanceMatrix.needsUpdate = true;
    this.group.add(walls);

    this.bracketMaterial = bracket;
    this.hoseMaterial = hose;
    this.capMaterial = cap;
    const trayFloor = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.07, 1.5), frame);
    trayFloor.position.y = 0.05;
    this.group.add(trayFloor);
    const bedSoil = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.2, 1.34), soil);
    bedSoil.position.y = 0.19;
    this.group.add(bedSoil);
    // Four short legs lifting the tray clear of the valley soil: the bed
    // never touches the ground it is testing.
    const legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 5), frame, 4);
    const legMatrix = new THREE.Matrix4();
    for (let i = 0; i < 4; i += 1) {
      legMatrix.identity();
      legMatrix.setPosition(i < 2 ? -1.1 : 1.1, 0.05, i % 2 === 0 ? -0.6 : 0.6);
      legs.setMatrixAt(i, legMatrix);
    }
    legs.instanceMatrix.needsUpdate = true;
    this.group.add(legs);
    // Small identification plate on the near wall.
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.13), this.sensorMaterial);
    plate.position.set(0.6, 0.24, 0.8);
    this.group.add(plate);

    // Low protective hoop: three ribs plus a shallow shell.
    for (let i = 0; i < 3; i += 1) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.03, 5, 12, Math.PI), frame);
      rib.position.set(-0.8 + i * 0.8, 0.36, 0);
      rib.rotation.y = Math.PI / 2;
      this.group.add(rib);
    }
    const cover = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 2.3, 12, 1, true, 0, Math.PI),
      this.coverMaterial
    );
    cover.rotation.z = Math.PI / 2;
    cover.position.y = 0.36;
    this.group.add(cover);

    // Grow strip under the hoop, with three small monitoring lamps below it.
    const growStrip = new THREE.Mesh(new THREE.BoxGeometry(2, 0.05, 0.12), this.growMaterial);
    growStrip.position.set(0, 0.92, 0);
    this.group.add(growStrip);
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), this.growMaterial, 3);
    const lampMatrix = new THREE.Matrix4();
    for (let i = 0; i < 3; i += 1) {
      lampMatrix.identity();
      lampMatrix.setPosition(-0.7 + i * 0.7, 0.86, 0);
      lamps.setMatrixAt(i, lampMatrix);
    }
    lamps.instanceMatrix.needsUpdate = true;
    this.group.add(lamps);

    // Fine probe wires dipping from the hoop into the sediment.
    const probes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), frame, 4);
    const probeMatrix = new THREE.Matrix4();
    for (let i = 0; i < 4; i += 1) {
      probeMatrix.makeRotationZ(((i % 2) - 0.5) * 0.16);
      probeMatrix.setPosition(-0.75 + i * 0.5, 0.5, i % 2 === 0 ? 0.22 : -0.24);
      probes.setMatrixAt(i, probeMatrix);
    }
    probes.instanceMatrix.needsUpdate = true;
    this.group.add(probes);

    // Two sensor stakes at the corners.
    for (const side of [-1, 1]) {
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 5), frame);
      stake.position.set(side * 1.35, 0.45, 0.62);
      this.group.add(stake);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.1), this.sensorMaterial);
      head.position.set(side * 1.35, 0.96, 0.62);
      this.group.add(head);
    }

    // Shoots stay hidden until the trial starts; scaled up on activation.
    // One shared material and one shared geometry for all seven shoots: they
    // are identical, and seven copies cost seven uniform uploads for nothing.
    const shootMaterial = sharedStandardMaterial({ color: 0x7fbf74, roughness: 0.82, metalness: 0.02 });
    const shootGeometry = new THREE.ConeGeometry(0.05, 0.24, 4);
    for (let i = 0; i < 7; i += 1) {
      const shoot = new THREE.Mesh(shootGeometry, shootMaterial);
      // Seated on the sediment surface (tray floor 0.05 + soil to y≈0.29).
      shoot.position.set(-0.85 + (i % 4) * 0.55, 0.4, -0.28 + Math.floor(i / 4) * 0.42);
      shoot.scale.setScalar(0.001);
      this.shoots.push(shoot);
      this.group.add(shoot);
    }

    this.light = new THREE.PointLight(0xffc79a, 0, 7, 2);
    this.light.position.y = 0.85;
    this.group.add(this.light);

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
  }

  /** Hardware detail into the colony pool; placement-time only. */
  private emitDetail(): void {
    this.group.updateMatrixWorld(true);
    const bracket = this.bracketMaterial;
    const hose = this.hoseMaterial;
    const cap = this.capMaterial;
    auroraGreebleField.emit('bed:aurora', this.group.matrixWorld, (b) => {
      // Corner brackets change the silhouette, so they stay geometry. The
      // bolted rails and panel seams do not, and are carried by the grain map.
      for (const [cx, cz] of [[1.25, 0.75], [-1.25, 0.75], [1.25, -0.75], [-1.25, -0.75]] as const) {
        b.add('bracket|metal', seamGeometry(), bracket, { x: cx, y: 0.2, z: cz }, { x: 0.12, y: 0.4, z: 0.12 });
        b.add('bolt|bracket', boltGeometry(), bracket,
          { x: cx * 0.92, y: 0.36, z: cz * 0.9 }, { x: 0.05, y: 0.04, z: 0.05 });
      }
      // Drain fitting and hose: a visible connector run.
      b.add('drain|cap', boltGeometry(), cap,
        { x: -1.3, y: 0.14, z: 0.4 }, { x: 0.07, y: 0.14, z: 0.07 }, { x: 0, y: 0, z: Math.PI / 2 });
      b.cable({ x: -1.42, y: 0.14, z: 0.4 }, { x: -1.95, y: 0.05, z: 0.95 }, 0.14, 5, 0.022, hose);
    });
    auroraGreebleField.commit();
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.interactionPosition.set(x, y + 0.5, z);
    this.emitDetail();
  }

  restore(prepared: boolean, trialActive: boolean): void {
    this.group.visible = prepared;
    this.trialActive = trialActive;
    const scale = trialActive ? 1 : 0.001;
    for (const shoot of this.shoots) shoot.scale.setScalar(scale);
    this.growMaterial.emissiveIntensity = trialActive ? 0.5 : 0;
    this.light.intensity = trialActive ? 0.3 : 0;
    this.coverMaterial.emissiveIntensity = trialActive ? 0.12 : 0.04;
  }

  startTrial(): void {
    this.trialActive = true;
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible) return;
    const pulse = 0.5 + Math.sin(elapsed * 1.1) * 0.5;
    this.sensorMaterial.emissiveIntensity = 0.06 + pulse * 0.1;
    if (!this.trialActive) return;
    // Shoots ease up over a few seconds — a trial, not a harvest.
    for (let i = 0; i < this.shoots.length; i += 1) {
      const shoot = this.shoots[i];
      const target = 0.7 + ((i * 37) % 11) / 22;
      shoot.scale.setScalar(THREE.MathUtils.lerp(shoot.scale.x, target, 1 - Math.pow(0.35, delta)));
      shoot.rotation.z = Math.sin(elapsed * 0.6 + i) * 0.06;
    }
    this.growMaterial.emissiveIntensity = 0.36 + pulse * 0.2;
    this.coverMaterial.emissiveIntensity = 0.08 + pulse * 0.06;
    this.light.intensity = 0.22 + pulse * 0.14;
  }
}
