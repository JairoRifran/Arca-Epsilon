import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import { freezeStaticChildren } from '../assets/materialCache';

/**
 * Módulo Aurora-01: the first human structure outside Base Nereida. A single
 * folded shelter — hull drum, four ground anchors, a life-support unit, two
 * solar wings, a short antenna, an access port and vent strips — that unfolds
 * over a few seconds and then brings its systems up one at a time.
 *
 * It is intentionally small and a little fragile-looking: an outpost module,
 * not a base. Deploy progress drives the wings, the legs and the height of
 * the hull; stabilization progress drives the lights, the vent glow and a
 * settling ring of displaced dust.
 *
 * The exterior detailing — panel seams, hatches, bolt rows, the dust band at
 * the skirt and the soil pushed up around each foot — is carried by a handful
 * of InstancedMeshes parented to the hull, so the module reads as a built
 * object at close range while costing a near-constant number of draw calls.
 */
export class AuroraHabitatModule {
  readonly group = new THREE.Group();
  readonly interactionPosition = new THREE.Vector3();

  private readonly wings: THREE.Mesh[] = [];
  private readonly legs: THREE.Mesh[] = [];
  private readonly hull: THREE.Mesh;
  private readonly ventMaterial: THREE.MeshStandardMaterial;
  private readonly statusMaterial: THREE.MeshStandardMaterial;
  private readonly portMaterial: THREE.MeshStandardMaterial;
  private readonly light: THREE.PointLight;
  private readonly dustSkirt: THREE.Mesh<THREE.RingGeometry, THREE.MeshStandardMaterial>;
  private deployProgress = 0;
  private stabilization = 0;
  /** People live here now: the module holds its warm lights up. */
  private inhabited = false;

  constructor() {
    this.group.name = 'Módulo Aurora-01';
    this.group.visible = false;
    // Scratch matrix reused for every instanced-detail placement below; no
    // allocation survives the constructor.
    const instanceMatrix = new THREE.Matrix4();

    const shell = new THREE.MeshStandardMaterial({ color: 0xb6b3a8, roughness: 0.62, metalness: 0.34 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x35393d, roughness: 0.54, metalness: 0.7 });
    // Recessed seam/hatch tone: slightly darker and rougher than the shell so
    // panelling reads as depth rather than as painted lines.
    const seamMetal = new THREE.MeshStandardMaterial({ color: 0x8d8b83, roughness: 0.74, metalness: 0.4 });
    const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x7d7157, roughness: 0.99, metalness: 0 });
    // Dust that has settled on every upward-facing ledge since touchdown.
    const dustMaterial = new THREE.MeshStandardMaterial({
      color: 0x9a8e70,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.55
    });
    this.ventMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a3230,
      emissive: 0x3f8f7c,
      emissiveIntensity: 0,
      roughness: 0.5,
      metalness: 0.35
    });
    this.statusMaterial = new THREE.MeshStandardMaterial({
      color: 0x1d2426,
      emissive: 0x74d9b0,
      emissiveIntensity: 0,
      roughness: 0.3,
      metalness: 0.4
    });
    this.portMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b3336,
      emissive: 0xffb977,
      emissiveIntensity: 0,
      roughness: 0.45,
      metalness: 0.4
    });

    // Contact shadow + displaced-dust skirt: the module sits in the clearing.
    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.9, 16),
      new THREE.MeshBasicMaterial({
        map: createSoftParticleTexture(64),
        color: 0x000000,
        transparent: true,
        opacity: 0.34,
        depthWrite: false
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.02;
    this.group.add(contactShadow);
    // A tighter, darker core under the hull: the wide soft disc alone reads
    // as haze, this one gives the module its weight on the ground.
    const coreShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.9, 16),
      new THREE.MeshBasicMaterial({
        map: createSoftParticleTexture(64),
        color: 0x000000,
        transparent: true,
        opacity: 0.4,
        depthWrite: false
      })
    );
    coreShadow.rotation.x = -Math.PI / 2;
    coreShadow.position.y = 0.03;
    this.group.add(coreShadow);

    this.dustSkirt = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 4.1, 22),
      new THREE.MeshStandardMaterial({
        color: 0x8b7f63,
        roughness: 0.98,
        metalness: 0,
        transparent: true,
        opacity: 0.28
      })
    );
    this.dustSkirt.rotation.x = -Math.PI / 2;
    this.dustSkirt.position.y = 0.05;
    this.group.add(this.dustSkirt);

    // Four ground anchors, splayed outward as the module unfolds.
    for (let i = 0; i < 4; i += 1) {
      const angle = i * (Math.PI / 2) + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 1.5, 6), darkMetal);
      leg.position.set(Math.cos(angle) * 1.5, 0.62, Math.sin(angle) * 1.5);
      leg.userData.angle = angle;
      this.legs.push(leg);
      this.group.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.14, 8), darkMetal);
      foot.position.set(Math.cos(angle) * 1.8, 0.07, Math.sin(angle) * 1.8);
      this.group.add(foot);
    }
    // Soil pushed up where each anchor bit into the ground, one draw call.
    const mounds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.62, 0.16, 8), soilMaterial, 4);
    for (let i = 0; i < 4; i += 1) {
      const angle = i * (Math.PI / 2) + Math.PI / 4;
      instanceMatrix.identity();
      instanceMatrix.setPosition(Math.cos(angle) * 1.8, 0.05, Math.sin(angle) * 1.8);
      mounds.setMatrixAt(i, instanceMatrix);
    }
    mounds.instanceMatrix.needsUpdate = true;
    this.group.add(mounds);

    // Hull drum with a technical band.
    this.hull = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.8, 1.9, 12), shell);
    this.hull.position.y = 1.55;
    this.group.add(this.hull);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.72, 0.28, 12), darkMetal);
    band.position.y = 1.95;
    this.group.add(band);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.68, 0.5, 12), shell);
    roof.position.y = 2.72;
    this.group.add(roof);

    // --- Exterior panelling, parented to the hull so it folds with it ---
    // Ten vertical seams dividing the drum into readable plates.
    const seams = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 1.78, 0.06), seamMetal, 10);
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2;
      instanceMatrix.makeRotationY(-angle);
      instanceMatrix.setPosition(Math.cos(angle) * 1.73, 0, Math.sin(angle) * 1.73);
      seams.setMatrixAt(i, instanceMatrix);
    }
    seams.instanceMatrix.needsUpdate = true;
    this.hull.add(seams);

    // Two horizontal plate joins around the drum.
    const joins = new THREE.InstancedMesh(new THREE.TorusGeometry(1.74, 0.028, 4, 14), seamMetal, 2);
    for (let i = 0; i < 2; i += 1) {
      instanceMatrix.makeRotationX(Math.PI / 2);
      instanceMatrix.setPosition(0, -0.42 + i * 0.84, 0);
      joins.setMatrixAt(i, instanceMatrix);
    }
    joins.instanceMatrix.needsUpdate = true;
    this.hull.add(joins);

    // Small technical hatches and inspection plates spread over the shell.
    const hatchSpecs: [number, number, number, number][] = [
      [0.6, 0.45, 0.5, 0.42],
      [2.15, -0.25, 0.42, 0.34],
      [3.5, 0.3, 0.55, 0.3],
      [4.4, -0.4, 0.36, 0.36],
      [5.4, 0.15, 0.46, 0.4]
    ];
    const hatches = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.05), seamMetal, hatchSpecs.length);
    for (let i = 0; i < hatchSpecs.length; i += 1) {
      const [angle, height, width, tall] = hatchSpecs[i];
      instanceMatrix.makeRotationY(-angle);
      instanceMatrix.scale(new THREE.Vector3(width, tall, 1));
      instanceMatrix.setPosition(Math.cos(angle) * 1.72, height, Math.sin(angle) * 1.72);
      hatches.setMatrixAt(i, instanceMatrix);
    }
    hatches.instanceMatrix.needsUpdate = true;
    this.hull.add(hatches);

    // Bolt rows around the lower rim: the detail the eye reads as "built".
    const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 5), darkMetal, 16);
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      instanceMatrix.makeRotationZ(Math.PI / 2);
      instanceMatrix.premultiply(new THREE.Matrix4().makeRotationY(-angle));
      instanceMatrix.setPosition(Math.cos(angle) * 1.78, -0.78, Math.sin(angle) * 1.78);
      bolts.setMatrixAt(i, instanceMatrix);
    }
    bolts.instanceMatrix.needsUpdate = true;
    this.hull.add(bolts);

    // Dust band where the hull meets the skirt, plus dust settled on the roof.
    const hullDust = new THREE.Mesh(new THREE.CylinderGeometry(1.83, 1.86, 0.42, 12, 1, true), dustMaterial);
    hullDust.position.y = -0.72;
    this.hull.add(hullDust);
    const roofDust = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.02, 12), dustMaterial);
    roofDust.position.y = 2.98;
    this.group.add(roofDust);

    // Life-support unit bolted to the flank.
    const lifeSupport = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.05, 0.7), darkMetal);
    lifeSupport.position.set(-1.85, 1.2, 0.35);
    this.group.add(lifeSupport);
    for (let i = 0; i < 3; i += 1) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.09, 0.06), this.ventMaterial);
      vent.position.set(-2.22, 0.95 + i * 0.26, 0.35);
      this.group.add(vent);
    }

    // Access port and two status strips.
    const port = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.78), this.portMaterial);
    port.position.set(1.66, 1.2, 0);
    this.group.add(port);
    for (let i = 0; i < 2; i += 1) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.6), this.statusMaterial);
      strip.position.set(1.6, 2.1, -0.85 + i * 1.7);
      this.group.add(strip);
    }

    // Two solar wings that fold out of the roof.
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 1.15), darkMetal);
      wing.position.set(side * 1.9, 2.85, 0);
      wing.userData.side = side;
      this.wings.push(wing);
      this.group.add(wing);
    }

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.5, 5), darkMetal);
    antenna.position.set(0.6, 3.6, -0.7);
    this.group.add(antenna);

    this.light = new THREE.PointLight(0xffcf9a, 0, 16, 1.9);
    this.light.position.set(0, 2.2, 0);
    this.group.add(this.light);

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
    this.applyDeployProgress(0);
    // The group is placed by mission code and the members marked above
    // animate every frame; the rest of the hardware is bolted on and
    // never moves, so its local matrices are composed once here.
    this.group.userData.dynamic = true;
    freezeStaticChildren(this.group);

  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.interactionPosition.set(x, y + 1, z);
  }

  restore(deployed: boolean, operational: boolean, stabilization: number): void {
    this.group.visible = deployed;
    this.deployProgress = deployed ? 1 : 0;
    this.stabilization = operational ? 1 : Math.min(1, Math.max(0, stabilization / 100));
    this.applyDeployProgress(this.deployProgress);
    this.applyStabilization(this.stabilization);
  }

  /**
   * Once the first crew moves in, the module stops reading as equipment on
   * standby: the interior lamps stay lit, the port glows steadily and the
   * fill light warms up. Subtle on purpose — occupancy, not a light show.
   */
  setInhabited(inhabited: boolean): void {
    this.inhabited = inhabited;
  }

  /** Called on deployment: starts the unfolding from a folded drum. */
  beginDeploy(): void {
    this.group.visible = true;
    this.deployProgress = 0;
    this.stabilization = 0;
    this.applyDeployProgress(0);
    this.applyStabilization(0);
  }

  get deployed(): boolean {
    return this.deployProgress > 0.999;
  }

  update(delta: number, elapsed: number, stabilizationPercent: number): void {
    if (!this.group.visible) return;
    if (this.deployProgress < 1) {
      // ~3.4 s to unfold, matching mission10Tuning.deploySeconds.
      this.deployProgress = Math.min(1, this.deployProgress + delta / 3.4);
      this.applyDeployProgress(this.deployProgress);
    }
    const target = Math.min(1, Math.max(0, stabilizationPercent / 100));
    this.stabilization = target;
    this.applyStabilization(target);
    // Systems breathing once there is power in the module.
    if (target > 0.01) {
      const pulse = 0.5 + Math.sin(elapsed * 1.6) * 0.5;
      this.statusMaterial.emissiveIntensity = target * (0.5 + pulse * 0.35);
      this.ventMaterial.emissiveIntensity = target * (0.22 + Math.sin(elapsed * 0.9) * 0.08);
      this.light.intensity = target * (0.55 + pulse * 0.2);
    }
    if (this.inhabited) {
      // Interior lamps burning steadily behind the port, plus a warmer fill.
      this.portMaterial.emissiveIntensity = 0.55 + Math.sin(elapsed * 0.7) * 0.06;
      this.light.intensity = Math.max(this.light.intensity, 0.85 + Math.sin(elapsed * 0.5) * 0.08);
    }
    // The dust thrown up by the deployment settles as the module comes up.
    this.dustSkirt.material.opacity = 0.28 * (1 - target * 0.55);
  }

  private applyDeployProgress(progress: number): void {
    const eased = progress * progress * (3 - 2 * progress);
    this.hull.scale.y = 0.34 + eased * 0.66;
    this.hull.position.y = 0.6 + eased * 0.95;
    for (const wing of this.wings) {
      const side = wing.userData.side as number;
      wing.scale.x = 0.12 + eased * 0.88;
      wing.position.x = side * (0.9 + eased * 1.0);
      wing.rotation.z = side * (1.15 - eased * 1.15);
    }
    for (const leg of this.legs) {
      const angle = leg.userData.angle as number;
      const spread = 0.7 + eased * 0.8;
      leg.position.set(Math.cos(angle) * spread, 0.62, Math.sin(angle) * spread);
      leg.rotation.z = Math.cos(angle) * eased * 0.2;
      leg.rotation.x = -Math.sin(angle) * eased * 0.2;
    }
  }

  private applyStabilization(value: number): void {
    this.statusMaterial.emissiveIntensity = value * 0.6;
    this.ventMaterial.emissiveIntensity = value * 0.24;
    this.portMaterial.emissiveIntensity = value * 0.4;
    this.light.intensity = value * 0.6;
  }
}
