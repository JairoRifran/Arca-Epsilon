import * as THREE from 'three';
import { materialLibrary } from '../assets/materials';
import { createSoftParticleTexture } from '../assets/materials';

/**
 * Broken human cargo freighter: hull torn in two, drifting plates, cargo
 * pods, one surviving nav beacon and intermittent electrical sparks near
 * the tear so the wreck still feels recently alive.
 */
export class DerelictWreck {
  readonly group = new THREE.Group();

  private readonly beaconMaterial: THREE.MeshStandardMaterial;

  private readonly beaconLight: THREE.PointLight;

  private readonly sparkMaterial: THREE.PointsMaterial;

  private readonly sparks: THREE.Points;

  private sparkTimer = 0;

  private sparkLife = 0;

  private highlightEnergy = 0;

  private readonly plates: THREE.InstancedMesh;

  constructor(position: THREE.Vector3, scale = 1) {
    this.group.name = 'Derelict Wreck';
    this.group.position.copy(position);
    this.group.scale.setScalar(scale);

    const hullMaterial = materialLibrary.wornMetal.clone();
    hullMaterial.color.setHex(0x59636b);
    const burntMaterial = new THREE.MeshStandardMaterial({
      color: 0x1d1b19,
      metalness: 0.62,
      roughness: 0.88,
      emissive: 0x2b0e04,
      emissiveIntensity: 0.16
    });

    // Two halves of the freighter, torn and offset.
    const bow = new THREE.Mesh(new THREE.CylinderGeometry(7, 8.5, 34, 12, 1, true), hullMaterial);
    bow.rotation.z = Math.PI / 2;
    bow.rotation.y = 0.2;
    bow.position.set(-16, 0, 0);
    this.group.add(bow);

    const bowCap = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hullMaterial);
    bowCap.rotation.z = Math.PI / 2;
    bowCap.position.set(-33, 0, 0);
    this.group.add(bowCap);

    const stern = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 7.5, 26, 12, 1, true), burntMaterial);
    stern.rotation.z = Math.PI / 2;
    stern.rotation.y = -0.3;
    stern.position.set(22, 4, 3);
    stern.rotation.x = 0.24;
    this.group.add(stern);

    // Exposed interior ribs at the tear.
    const ribMaterial = materialLibrary.darkMetal.clone();
    for (let i = 0; i < 5; i += 1) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.45, 6, 18, Math.PI * 1.3), ribMaterial);
      rib.position.set(-2 + i * 2.2, 1 + (Math.random() - 0.5) * 2, 1);
      rib.rotation.y = Math.PI / 2;
      rib.rotation.z = Math.random() * Math.PI;
      this.group.add(rib);
    }

    // Instanced field of torn hull plates and cargo fragments.
    const plateGeometry = new THREE.BoxGeometry(3.2, 0.35, 2.1);
    this.plates = new THREE.InstancedMesh(plateGeometry, materialLibrary.damagedPanel.clone(), 46);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const plateScale = new THREE.Vector3();
    for (let i = 0; i < 46; i += 1) {
      euler.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      quaternion.setFromEuler(euler);
      const s = 0.5 + Math.random() * 1.7;
      plateScale.setScalar(s);
      matrix.compose(
        new THREE.Vector3((Math.random() - 0.5) * 84, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 60),
        quaternion,
        plateScale
      );
      this.plates.setMatrixAt(i, matrix);
    }
    this.plates.instanceMatrix.needsUpdate = true;
    this.group.add(this.plates);

    // Cargo pods spilled from the hold.
    const cargoMaterial = new THREE.MeshStandardMaterial({
      color: 0x7a5c30,
      metalness: 0.4,
      roughness: 0.7
    });
    for (let i = 0; i < 6; i += 1) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 5), cargoMaterial);
      pod.position.set(10 + (Math.random() - 0.5) * 30, -6 + (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 26);
      pod.rotation.set(Math.random(), Math.random(), Math.random());
      this.group.add(pod);
    }

    // Surviving nav beacon.
    this.beaconMaterial = materialLibrary.warningRed.clone();
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), this.beaconMaterial);
    beacon.position.set(-33, 8, 0);
    this.group.add(beacon);
    this.beaconLight = new THREE.PointLight(0xff3344, 0, 130, 1.8);
    this.beaconLight.position.copy(beacon.position);
    this.group.add(this.beaconLight);

    // Spark burst points near the tear, mostly dormant.
    const sparkCount = 26;
    const sparkPositions = new Float32Array(sparkCount * 3);
    for (let i = 0; i < sparkCount; i += 1) {
      sparkPositions[i * 3] = (Math.random() - 0.5) * 10;
      sparkPositions[i * 3 + 1] = (Math.random() - 0.5) * 9;
      sparkPositions[i * 3 + 2] = (Math.random() - 0.5) * 9;
    }
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    this.sparkMaterial = new THREE.PointsMaterial({
      color: 0xffd9a0,
      size: 1.6,
      map: createSoftParticleTexture(48),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.sparks = new THREE.Points(sparkGeometry, this.sparkMaterial);
    this.sparks.position.set(2, 1, 1);
    this.group.add(this.sparks);

    this.group.rotation.set(0.12, 0.6, -0.08);
  }

  flashHighlight(): void {
    this.highlightEnergy = 1;
  }

  update(delta: number, elapsed: number): void {
    this.highlightEnergy = Math.max(0, this.highlightEnergy - delta * 0.6);

    // Slow double-blink beacon: blink, blink, long pause.
    const cycle = elapsed % 3.4;
    const blink = (cycle < 0.12 || (cycle > 0.36 && cycle < 0.48)) ? 1 : 0;
    this.beaconMaterial.emissiveIntensity = 0.25 + blink * 2.6 + this.highlightEnergy * 2;
    this.beaconLight.intensity = blink * 2.2;

    // Occasional spark burst.
    this.sparkTimer -= delta;
    if (this.sparkTimer <= 0) {
      this.sparkLife = 0.35;
      this.sparkTimer = 2.5 + Math.random() * 6;
    }
    if (this.sparkLife > 0) {
      this.sparkLife -= delta;
      this.sparkMaterial.opacity = Math.max(0, this.sparkLife / 0.35) * (0.4 + Math.random() * 0.5);
      this.sparks.rotation.y += delta * 3;
    } else {
      this.sparkMaterial.opacity = 0;
    }

    this.group.rotation.y += delta * 0.008;
  }
}
