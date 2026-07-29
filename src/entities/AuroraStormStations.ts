import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import { createContactShadow } from '../assets/materialCache';
import {
  auroraStormAntennaDefinition,
  auroraStormGeneratorDefinition,
  auroraStormShieldDefinition
} from '../assets/mission13Definitions';

const SPARK_COUNT = 18;

/**
 * The three pieces of colony hardware Mission 13 is fought over: the power
 * node, the comms mast with its two guy-anchors, and the habitat's emergency
 * shield emitter.
 *
 * Kept in one class because they share everything — the same four materials,
 * the same soft sprite texture, the same contact-shadow treatment — and
 * splitting them into three files would have duplicated all of it. Repeated
 * parts (vent fins, anchor stakes, mast rungs) are InstancedMesh; the spark
 * burst during generator repair is a single pooled Points object that is
 * never reallocated.
 *
 * Everything is built once in the constructor. Nothing here allocates
 * geometry, materials or vectors during update.
 */
export class AuroraStormStations {
  readonly group = new THREE.Group();
  readonly generatorPosition = new THREE.Vector3();
  readonly antennaPosition = new THREE.Vector3();
  readonly shieldPosition = new THREE.Vector3();
  readonly anchorPositions: THREE.Vector3[] = [];

  private readonly statusMaterial: THREE.MeshStandardMaterial;
  private readonly antennaMaterial: THREE.MeshStandardMaterial;
  private readonly anchorMaterial: THREE.MeshStandardMaterial;
  private readonly shieldMaterial: THREE.MeshStandardMaterial;
  private readonly sparkMaterial: THREE.PointsMaterial;
  private readonly sparks: THREE.Points;
  private readonly sparkSeeds: Float32Array;
  private readonly shieldDome: THREE.Mesh;
  private readonly generatorLight: THREE.PointLight;
  private readonly anchorMarkers: THREE.Mesh[] = [];
  private readonly scratch = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();

  private sparkAge = Infinity;
  private generatorSecured = false;
  private antennaOnline = false;
  private shieldLevel = 0;

  constructor() {
    this.group.name = 'Estaciones de Tormenta Aurora';
    this.group.visible = false;

    const shell = new THREE.MeshStandardMaterial({ color: 0xa9a89d, roughness: 0.68, metalness: 0.32 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x32383c, roughness: 0.54, metalness: 0.7 });
    this.statusMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e2628,
      emissive: 0xffb066,
      emissiveIntensity: 0.2,
      roughness: 0.34,
      metalness: 0.4
    });
    this.antennaMaterial = new THREE.MeshStandardMaterial({
      color: 0x272d31,
      emissive: 0x5fb8d8,
      emissiveIntensity: 0,
      roughness: 0.5,
      metalness: 0.66
    });
    this.anchorMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d444a,
      emissive: 0xffc07a,
      emissiveIntensity: 0.16,
      roughness: 0.6,
      metalness: 0.5
    });
    const shadowTexture = createSoftParticleTexture(64);

    // ----- Power node -----
    const generator = new THREE.Group();
    const skid = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 1.7), darkMetal);
    skid.position.y = 0.08;
    generator.add(skid);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.5, 1.25), shell);
    housing.position.y = 0.92;
    generator.add(housing);
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.2, 1.35), darkMetal);
    cowl.position.y = 1.72;
    generator.add(cowl);
    // Vent fins: one instanced mesh instead of six meshes.
    const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.9, 1.15), darkMetal, 6);
    for (let i = 0; i < 6; i += 1) {
      this.matrix.identity();
      this.matrix.setPosition(-0.5 + i * 0.2, 0.92, 0.68);
      fins.setMatrixAt(i, this.matrix);
    }
    fins.instanceMatrix.needsUpdate = true;
    generator.add(fins);
    // Access panel and status strip — the thing the pilot actually works on.
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.66, 0.06), darkMetal);
    panel.position.set(0, 0.95, -0.66);
    generator.add(panel);
    const statusStrip = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.04), this.statusMaterial);
    statusStrip.position.set(0, 1.32, -0.69);
    generator.add(statusStrip);
    const generatorShadow = createContactShadow(2.1, 0.32, shadowTexture);
    generatorShadow.rotation.x = -Math.PI / 2;
    generatorShadow.position.y = 0.03;
    generator.add(generatorShadow);
    this.generatorLight = new THREE.PointLight(0xffb066, 0.2, 14, 2);
    this.generatorLight.position.set(0, 1.4, -0.8);
    generator.add(this.generatorLight);
    this.generatorGroup = generator;
    this.group.add(generator);

    // Repair sparks: one pooled Points object, hidden until work starts.
    const sparkPositions = new Float32Array(SPARK_COUNT * 3);
    this.sparkSeeds = new Float32Array(SPARK_COUNT * 3);
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      const a = hash(i * 2.7 + 1.1) * Math.PI * 2;
      const r = 0.1 + hash(i * 4.3 + 2.9) * 0.45;
      this.sparkSeeds[i * 3] = Math.cos(a) * r;
      this.sparkSeeds[i * 3 + 1] = 0.9 + hash(i * 6.1 + 5.3) * 0.7;
      this.sparkSeeds[i * 3 + 2] = Math.sin(a) * r;
    }
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    sparkGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 4);
    this.sparkMaterial = new THREE.PointsMaterial({
      color: 0xffd08a,
      size: 0.13,
      map: createSoftParticleTexture(32),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.sparks = new THREE.Points(sparkGeometry, this.sparkMaterial);
    this.sparks.frustumCulled = false;
    generator.add(this.sparks);

    // ----- Comms mast -----
    const antenna = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.4, 8), darkMetal);
    base.position.y = 0.2;
    antenna.add(base);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 7.6, 8), shell);
    mast.position.y = 4.1;
    antenna.add(mast);
    // Rungs up the mast: instanced, irregular spacing so it is not a ladder.
    const rungs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), darkMetal, 7);
    for (let i = 0; i < 7; i += 1) {
      this.matrix.makeRotationY(i * 0.42);
      this.matrix.setPosition(0, 1.1 + i * 0.92 + hash(i * 3.7) * 0.2, 0);
      rungs.setMatrixAt(i, this.matrix);
    }
    rungs.instanceMatrix.needsUpdate = true;
    antenna.add(rungs);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.2, 0.32, 12), this.antennaMaterial);
    dish.position.y = 8.1;
    dish.rotation.z = 0.34;
    antenna.add(dish);
    const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), this.antennaMaterial);
    emitter.position.set(0, 8.55, 0);
    antenna.add(emitter);
    const antennaShadow = createContactShadow(1.7, 0.3, shadowTexture);
    antennaShadow.rotation.x = -Math.PI / 2;
    antennaShadow.position.y = 0.03;
    antenna.add(antennaShadow);
    this.antennaGroup = antenna;
    this.group.add(antenna);

    // ----- Guy-anchors: two stakes the pilot has to secure -----
    for (let i = 0; i < auroraStormAntennaDefinition.anchors.length; i += 1) {
      const marker = new THREE.Group();
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.15, 6), darkMetal);
      stake.position.y = 0.58;
      marker.add(stake);
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 12), this.anchorMaterial);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 1.05;
      marker.add(collar);
      this.anchorMarkers.push(collar);
      const anchorShadow = createContactShadow(0.7, 0.28, shadowTexture);
      anchorShadow.rotation.x = -Math.PI / 2;
      anchorShadow.position.y = 0.03;
      marker.add(anchorShadow);
      this.anchorGroups.push(marker);
      this.anchorPositions.push(new THREE.Vector3());
      this.group.add(marker);
    }

    // ----- Habitat shield emitter + dome -----
    const emitterBase = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, 0.24, 10), darkMetal);
    pad.position.y = 0.12;
    emitterBase.add(pad);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 1.5, 8), shell);
    column.position.y = 0.95;
    emitterBase.add(column);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), this.antennaMaterial);
    head.position.y = 1.85;
    emitterBase.add(head);
    const emitterPanel = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.06), this.statusMaterial);
    emitterPanel.position.set(0, 1.1, 0.34);
    emitterBase.add(emitterPanel);
    this.shieldGroup = emitterBase;
    this.group.add(emitterBase);

    // The protective field itself: a single low-opacity hemisphere. One
    // transparent surface, no stacked shells.
    this.shieldMaterial = new THREE.MeshStandardMaterial({
      color: 0x8fd2e8,
      emissive: 0x3d8ba8,
      emissiveIntensity: 0.3,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.shieldDome = new THREE.Mesh(
      new THREE.SphereGeometry(26, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      this.shieldMaterial
    );
    this.shieldDome.visible = false;
    this.group.add(this.shieldDome);

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
  }

  private readonly generatorGroup: THREE.Group;
  private readonly antennaGroup: THREE.Group;
  private readonly shieldGroup: THREE.Group;
  private readonly anchorGroups: THREE.Group[] = [];

  /** Seat every station on the terrain. Called on sync, not per frame. */
  setLayout(getGroundHeight: (x: number, z: number) => number, habitat: THREE.Vector3): void {
    const [gx, gz] = auroraStormGeneratorDefinition.position;
    const gy = getGroundHeight(gx, gz);
    this.generatorGroup.position.set(gx, gy, gz);
    this.generatorPosition.set(gx, gy + 1.1, gz);

    const [ax, az] = auroraStormAntennaDefinition.position;
    const ay = getGroundHeight(ax, az);
    this.antennaGroup.position.set(ax, ay, az);
    this.antennaPosition.set(ax, ay + 1.2, az);

    for (let i = 0; i < this.anchorGroups.length; i += 1) {
      const [px, pz] = auroraStormAntennaDefinition.anchors[i];
      const py = getGroundHeight(px, pz);
      this.anchorGroups[i].position.set(px, py, pz);
      this.anchorPositions[i].set(px, py + 0.8, pz);
    }

    const [sx, sz] = auroraStormShieldDefinition.position;
    const sy = getGroundHeight(sx, sz);
    this.shieldGroup.position.set(sx, sy, sz);
    this.shieldPosition.set(sx, sy + 1.1, sz);
    // The dome covers the habitat itself, not the emitter pedestal.
    this.shieldDome.position.set(habitat.x, getGroundHeight(habitat.x, habitat.z), habitat.z);
  }

  restore(visible: boolean, generatorSecured: boolean, anchors: boolean[], antennaOnline: boolean, shieldCharge: number, shieldOnline: boolean): void {
    this.group.visible = visible;
    this.generatorSecured = generatorSecured;
    this.antennaOnline = antennaOnline;
    this.shieldLevel = shieldOnline ? 1 : Math.min(1, Math.max(0, shieldCharge / 100));
    for (let i = 0; i < this.anchorMarkers.length; i += 1) {
      const secured = Boolean(anchors[i]);
      this.anchorMarkers[i].material = this.anchorMaterial;
      this.anchorMarkers[i].scale.setScalar(secured ? 1.15 : 1);
    }
    this.shieldDome.visible = this.shieldLevel > 0.01;
    this.shieldMaterial.opacity = this.shieldLevel * 0.16;
    this.sparkMaterial.opacity = 0;
    this.sparkAge = Infinity;
  }

  /** Fire the repair spark burst; called on interaction, not per frame. */
  triggerSparks(): void {
    this.sparkAge = 0;
  }

  update(delta: number, elapsed: number, working: boolean, shieldCharge: number, shieldOnline: boolean, anchors: boolean[]): void {
    if (!this.group.visible) return;

    // Generator status: unstable amber flicker until secured, then steady.
    const flicker = this.generatorSecured
      ? 0.55 + Math.sin(elapsed * 1.4) * 0.12
      : 0.2 + Math.abs(Math.sin(elapsed * 9.3) * Math.sin(elapsed * 3.1)) * 0.8;
    this.statusMaterial.emissiveIntensity = flicker;
    this.generatorLight.intensity = flicker * 0.5;

    // Sparks: a short pooled burst while the pilot is working the panel.
    if (working && this.sparkAge > 0.42) this.sparkAge = 0;
    if (this.sparkAge < 0.42) {
      this.sparkAge += delta;
      const t = Math.min(1, this.sparkAge / 0.42);
      const positions = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < SPARK_COUNT; i += 1) {
        const spread = 1 + t * 2.2;
        positions.setXYZ(
          i,
          this.sparkSeeds[i * 3] * spread,
          this.sparkSeeds[i * 3 + 1] + t * 0.5,
          this.sparkSeeds[i * 3 + 2] * spread - 0.7
        );
      }
      positions.needsUpdate = true;
      this.sparkMaterial.opacity = (1 - t) * 0.85;
    } else if (this.sparkMaterial.opacity !== 0) {
      this.sparkMaterial.opacity = 0;
    }

    // Anchors light up as they are secured.
    for (let i = 0; i < this.anchorMarkers.length; i += 1) {
      const secured = Boolean(anchors[i]);
      this.anchorMaterial.emissiveIntensity = 0.16;
      this.anchorMarkers[i].scale.setScalar(secured ? 1.15 : 1 + Math.sin(elapsed * 2.2 + i) * 0.05);
    }

    // Comms mast: dark until reactivated, then a slow confident pulse.
    this.antennaMaterial.emissiveIntensity = this.antennaOnline
      ? 0.34 + Math.sin(elapsed * 1.1) * 0.12
      : 0.02;

    // Shield: grows with the charge, settles into a slow shimmer when held.
    const target = shieldOnline ? 1 : Math.min(1, Math.max(0, shieldCharge / 100));
    this.shieldLevel += (target - this.shieldLevel) * Math.min(1, delta * 3);
    this.shieldDome.visible = this.shieldLevel > 0.01;
    if (this.shieldDome.visible) {
      const shimmer = shieldOnline ? 0.02 + Math.sin(elapsed * 0.9) * 0.012 : 0;
      this.shieldMaterial.opacity = this.shieldLevel * 0.14 + shimmer;
      this.shieldMaterial.emissiveIntensity = 0.2 + this.shieldLevel * 0.3;
    }
  }

  dispose(): void {
    this.sparks.geometry.dispose();
    this.sparkMaterial.dispose();
    this.shieldMaterial.dispose();
    this.statusMaterial.dispose();
    this.antennaMaterial.dispose();
    this.anchorMaterial.dispose();
  }
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
