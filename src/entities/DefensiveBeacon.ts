import * as THREE from 'three';
import type { DefenseBeaconSiteDefinition } from '../assets/mission04Definitions';
import { freezeStaticChildren } from '../assets/materialCache';

/**
 * Defensive perimeter beacon deployed from Base Nereida: a bolted-down
 * foundation with a contact skirt, a braced sensor mast with cable conduit
 * and collar joints, dipole whips on the sensor bar, and a housed status
 * lamp. Field hardware in the Arca material language — no arcade pickup,
 * no hard neon.
 */
export class DefensiveBeacon {
  readonly group = new THREE.Group();

  readonly interactionPosition = new THREE.Vector3();

  private readonly mast = new THREE.Group();

  private readonly statusMaterial = new THREE.MeshStandardMaterial({
    color: 0xa9bed0,
    emissive: 0x17242e,
    emissiveIntensity: 0.45,
    roughness: 0.36,
    metalness: 0.5
  });

  private readonly pulseMaterial = new THREE.MeshBasicMaterial({
    color: 0x9ad9ee,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  private readonly pulse: THREE.Mesh;

  private deployed = false;

  constructor(readonly site: DefenseBeaconSiteDefinition) {
    this.group.name = site.name;
    this.group.visible = false;

    const foundationMaterial = new THREE.MeshStandardMaterial({
      color: 0x27333a,
      roughness: 0.68,
      metalness: 0.56
    });
    const mastMaterial = new THREE.MeshStandardMaterial({
      color: 0x758590,
      roughness: 0.34,
      metalness: 0.72
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x10191f,
      roughness: 0.5,
      metalness: 0.64
    });

    // Contact skirt: a flat dark ring seating the foundation into the
    // regolith instead of leaving a cylinder standing on grass.
    const skirt = new THREE.Mesh(
      new THREE.CircleGeometry(2.35, 18),
      new THREE.MeshStandardMaterial({ color: 0x1b2226, roughness: 0.95, metalness: 0.1 })
    );
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.y = 0.02;
    this.group.add(skirt);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.9, 0.44, 10), foundationMaterial);
    base.position.y = 0.22;
    base.receiveShadow = true;
    base.castShadow = true;
    this.group.add(base);

    // Hold-down feet with bolt studs: the foundation is fastened, not set.
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34), darkMaterial);
      foot.position.set(Math.cos(angle) * 1.85, 0.08, Math.sin(angle) * 1.85);
      foot.rotation.y = -angle;
      this.group.add(foot);
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 6), mastMaterial);
      bolt.position.set(Math.cos(angle) * 1.85, 0.18, Math.sin(angle) * 1.85);
      this.group.add(bolt);
    }

    // Bevel step and recessed panel seams around the foundation crown.
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.55, 0.16, 10), darkMaterial);
    crown.position.y = 0.52;
    this.group.add(crown);
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 + 0.35;
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.55), darkMaterial);
      seam.position.set(Math.cos(angle) * 1.68, 0.24, Math.sin(angle) * 1.68);
      seam.rotation.y = -angle;
      this.group.add(seam);
    }

    const anchor = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.05, 0.52, 8), darkMaterial);
    anchor.position.y = 0.63;
    anchor.receiveShadow = true;
    anchor.castShadow = true;
    this.group.add(anchor);

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 4.7, 8), mastMaterial);
    column.position.y = 2.9;
    column.castShadow = true;
    this.mast.add(column);

    // Bracing struts from the anchor shoulder to the lower mast, plus
    // collar joints and a cable conduit running up the column: the mast is
    // engineered onto its base, not inserted into it.
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2;
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.35, 6), mastMaterial);
      strut.position.set(Math.cos(angle) * 0.42, 1.35, Math.sin(angle) * 0.42);
      strut.rotation.z = Math.cos(angle) * 0.5;
      strut.rotation.x = -Math.sin(angle) * 0.5;
      this.mast.add(strut);
    }
    for (const y of [2.05, 3.6]) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 8), darkMaterial);
      collar.position.y = y;
      this.mast.add(collar);
    }
    const conduit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 4.3, 0.05), darkMaterial);
    conduit.position.set(0.24, 2.85, 0);
    this.mast.add(conduit);

    const sensorBar = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.22, 0.28), mastMaterial);
    sensorBar.position.y = 5.05;
    sensorBar.castShadow = true;
    this.mast.add(sensorBar);

    // Dipole whips at the bar tips: fine deployed-antenna silhouette.
    for (const side of [-1, 1]) {
      const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.85, 5), mastMaterial);
      whip.position.set(side * 1.32, 5.5, 0);
      whip.rotation.z = side * -0.22;
      this.mast.add(whip);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), darkMaterial);
      tip.position.set(side * (1.32 + 0.09), 5.9, 0);
      this.mast.add(tip);
    }

    const sensorHead = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), darkMaterial);
    sensorHead.rotation.x = Math.PI / 2;
    sensorHead.position.set(0, 5.05, 0.22);
    this.mast.add(sensorHead);

    // Status lamp seated in a shallow housing — a fixture, not a bare orb.
    const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.14, 10), darkMaterial);
    lampHousing.rotation.x = Math.PI / 2;
    lampHousing.position.set(0, 5.05, 0.42);
    this.mast.add(lampHousing);
    const statusLight = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), this.statusMaterial);
    statusLight.position.set(0, 5.05, 0.49);
    this.mast.add(statusLight);
    this.group.add(this.mast);

    this.pulse = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.22, 32), this.pulseMaterial);
    this.pulse.rotation.x = -Math.PI / 2;
    this.pulse.position.y = 0.08;
    this.pulse.visible = false;
    this.group.add(this.pulse);

    this.restore(false, false);
    // The group is placed by mission code and the members marked above
    // animate every frame; the rest of the hardware is bolted on and
    // never moves, so its local matrices are composed once here.
    this.group.userData.dynamic = true;
    this.mast.userData.dynamic = true;
    this.pulse.userData.dynamic = true;
    freezeStaticChildren(this.group);

  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.interactionPosition.set(x, y + 0.2, z);
  }

  setMissionVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  restore(deployed: boolean, synchronized: boolean): void {
    this.deployed = deployed;
    this.mast.visible = deployed;
    this.pulse.visible = deployed;
    this.statusMaterial.color.setHex(synchronized ? 0xbdefff : deployed ? 0x8fc8dd : 0xa9bed0);
    this.statusMaterial.emissive.setHex(synchronized ? 0x236f88 : deployed ? 0x163e52 : 0x17242e);
    this.statusMaterial.emissiveIntensity = synchronized ? 1 : deployed ? 0.7 : 0.35;
  }

  update(elapsed: number, activeTarget: boolean, synchronized: boolean): void {
    if (!this.group.visible) return;
    if (!this.deployed) {
      this.statusMaterial.emissiveIntensity = activeTarget ? 0.45 + Math.sin(elapsed * 3.2) * 0.12 : 0.25;
      return;
    }
    this.mast.rotation.y = elapsed * 0.12;
    const wave = (Math.sin(elapsed * 1.7) + 1) * 0.5;
    const scale = 0.92 + wave * 0.2;
    this.pulse.scale.setScalar(scale);
    this.pulseMaterial.opacity = synchronized ? 0.09 + wave * 0.06 : 0.05 + wave * 0.05;
    this.statusMaterial.emissiveIntensity = synchronized ? 0.9 + wave * 0.24 : 0.6 + wave * 0.18;
  }
}
