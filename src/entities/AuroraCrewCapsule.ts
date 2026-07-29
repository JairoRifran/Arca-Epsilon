import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

const DESCENT_HEIGHT = 190;

/**
 * The capsule that brings the first three people down to Aurora.
 *
 * A blunt-nosed crew can on four sprung legs: ablative underside scorched by
 * reentry, a ring of thermal panels, a simple side hatch with a fold-down
 * step, four descent lamps and a short comms whip. It is small on purpose —
 * a taxi, not a warship — and it is the only thing in the valley that looks
 * like it was built to carry people rather than equipment.
 *
 * Descent is a pure visual event driven by `setDescentProgress`: the hull
 * eases down from altitude, the lamps brighten as it nears the pad, the
 * retro glow flares on final, and a dust ring blooms at touchdown and then
 * settles. Nothing here touches mission state; the mission asks the capsule
 * how far along it is, not the other way round.
 */
export class AuroraCrewCapsule {
  readonly group = new THREE.Group();
  readonly interactionPosition = new THREE.Vector3();

  private readonly hull: THREE.Group;
  private readonly legs: THREE.Mesh[] = [];
  private readonly lampMaterial: THREE.MeshStandardMaterial;
  private readonly retroMaterial: THREE.MeshBasicMaterial;
  private readonly hatchMaterial: THREE.MeshStandardMaterial;
  private readonly descentLight: THREE.PointLight;
  private readonly dustRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly contactShadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly scorchRing: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private descentProgress = 0;
  private settleAge = -1;
  private groundY = 0;

  constructor() {
    this.group.name = 'Cápsula Aurora';
    this.group.visible = false;
    const instanceMatrix = new THREE.Matrix4();

    const shell = new THREE.MeshStandardMaterial({ color: 0xcfcabb, roughness: 0.58, metalness: 0.38 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2f3438, roughness: 0.52, metalness: 0.72 });
    // Ablative heat shield: darkened and streaked from the way down.
    const ablative = new THREE.MeshStandardMaterial({ color: 0x3a322c, roughness: 0.92, metalness: 0.12 });
    const thermal = new THREE.MeshStandardMaterial({ color: 0x8f7f63, roughness: 0.8, metalness: 0.22 });
    this.lampMaterial = new THREE.MeshStandardMaterial({
      color: 0x24292b,
      emissive: 0xfff0cf,
      emissiveIntensity: 0,
      roughness: 0.3,
      metalness: 0.3
    });
    this.hatchMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d454a,
      emissive: 0xffc98a,
      emissiveIntensity: 0,
      roughness: 0.45,
      metalness: 0.45
    });

    // Ground marks stay on the pad; the hull rides above them.
    this.contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 18),
      new THREE.MeshBasicMaterial({
        map: createSoftParticleTexture(64),
        color: 0x000000,
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.03;
    this.group.add(this.contactShadow);
    // Scorched pad under the retros, appearing only once it has landed.
    this.scorchRing = new THREE.Mesh(
      new THREE.CircleGeometry(4.4, 18),
      new THREE.MeshBasicMaterial({
        map: createSoftParticleTexture(64),
        color: 0x2b241d,
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    this.scorchRing.rotation.x = -Math.PI / 2;
    this.scorchRing.position.y = 0.04;
    this.group.add(this.scorchRing);
    // Dust thrown out at touchdown, then settling.
    this.dustRing = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1, 24),
      new THREE.MeshBasicMaterial({
        map: createSoftParticleTexture(64),
        color: 0xa9997a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    this.dustRing.rotation.x = -Math.PI / 2;
    this.dustRing.position.y = 0.09;
    this.group.add(this.dustRing);

    // Everything that flies is parented to the hull group.
    this.hull = new THREE.Group();
    this.group.add(this.hull);

    // Crew can: tapered drum with a blunt ablative base.
    const can = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 2.3, 12), shell);
    can.position.y = 2.5;
    this.hull.add(can);
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.55, 0.55, 12), ablative);
    shield.position.y = 1.1;
    this.hull.add(shield);
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.5, 0.7, 12), shell);
    nose.position.y = 3.95;
    this.hull.add(nose);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.56, 1.56, 0.22, 12), darkMetal);
    collar.position.y = 3.5;
    this.hull.add(collar);

    // Thermal panel ring around the waist.
    const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 1.15, 0.1), thermal, 10);
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2;
      instanceMatrix.makeRotationY(-angle);
      instanceMatrix.setPosition(Math.cos(angle) * 1.72, 2.5, Math.sin(angle) * 1.72);
      panels.setMatrixAt(i, instanceMatrix);
    }
    panels.instanceMatrix.needsUpdate = true;
    this.hull.add(panels);

    // Reentry streaks running up from the shield.
    const streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.9, 0.05), ablative, 8);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + 0.4;
      instanceMatrix.makeRotationY(-angle);
      instanceMatrix.setPosition(Math.cos(angle) * 1.82, 1.72, Math.sin(angle) * 1.82);
      streaks.setMatrixAt(i, instanceMatrix);
    }
    streaks.instanceMatrix.needsUpdate = true;
    this.hull.add(streaks);

    // Side hatch with a fold-down step.
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 1.05), this.hatchMaterial);
    hatch.position.set(1.52, 2.5, 0);
    this.hull.add(hatch);
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.8), darkMetal);
    step.position.set(2.05, 1.35, 0);
    this.hull.add(step);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), darkMetal);
    rail.position.set(1.95, 2.05, 0.5);
    this.hull.add(rail);

    // Four sprung legs with footpads.
    for (let i = 0; i < 4; i += 1) {
      const angle = i * (Math.PI / 2) + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.9, 6), darkMetal);
      leg.position.set(Math.cos(angle) * 1.55, 0.95, Math.sin(angle) * 1.55);
      leg.rotation.z = -Math.cos(angle) * 0.32;
      leg.rotation.x = Math.sin(angle) * 0.32;
      leg.userData.angle = angle;
      this.legs.push(leg);
      this.hull.add(leg);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.14, 8), darkMetal);
      pad.position.set(Math.cos(angle) * 2.15, 0.1, Math.sin(angle) * 2.15);
      this.hull.add(pad);
      // Shock strut running back up to the hull.
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 4), darkMetal);
      strut.position.set(Math.cos(angle) * 1.82, 1.35, Math.sin(angle) * 1.82);
      strut.rotation.z = -Math.cos(angle) * 0.75;
      strut.rotation.x = Math.sin(angle) * 0.75;
      this.hull.add(strut);
    }

    // Four descent lamps under the collar.
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 5), this.lampMaterial, 4);
    for (let i = 0; i < 4; i += 1) {
      const angle = i * (Math.PI / 2);
      instanceMatrix.identity();
      instanceMatrix.setPosition(Math.cos(angle) * 1.6, 1.62, Math.sin(angle) * 1.6);
      lamps.setMatrixAt(i, instanceMatrix);
    }
    lamps.instanceMatrix.needsUpdate = true;
    this.hull.add(lamps);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.1, 5), darkMetal);
    antenna.position.set(-0.6, 4.75, 0.35);
    this.hull.add(antenna);

    // Retro glow under the shield during final approach only.
    this.retroMaterial = new THREE.MeshBasicMaterial({
      map: createSoftParticleTexture(64),
      color: 0xffb066,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const retro = new THREE.Mesh(new THREE.CircleGeometry(2.1, 16), this.retroMaterial);
    retro.rotation.x = Math.PI / 2;
    retro.position.y = 0.75;
    this.hull.add(retro);

    this.descentLight = new THREE.PointLight(0xffd9a8, 0, 26, 1.9);
    this.descentLight.position.y = 1.6;
    this.hull.add(this.descentLight);

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.groundY = y;
    // Boarding happens at the hatch side, not inside the hull.
    this.interactionPosition.set(x + 2.2, y + 1, z);
  }

  /** 0 = high above the pad, 1 = settled on the legs. */
  setDescentProgress(progress: number): void {
    this.descentProgress = THREE.MathUtils.clamp(progress, 0, 1);
    this.applyDescent();
  }

  get landed(): boolean {
    return this.descentProgress > 0.999;
  }

  restore(visible: boolean, landed: boolean): void {
    this.group.visible = visible;
    this.descentProgress = landed ? 1 : 0;
    this.settleAge = landed ? 99 : -1;
    this.applyDescent();
  }

  /** Called the frame the descent begins, so dust and glow start clean. */
  beginDescent(): void {
    this.group.visible = true;
    this.descentProgress = 0;
    this.settleAge = -1;
    this.applyDescent();
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible) return;

    if (this.landed && this.settleAge >= 0 && this.settleAge < 6) {
      this.settleAge += delta;
      // Touchdown dust blooms outward and fades as it settles.
      const t = Math.min(1, this.settleAge / 6);
      const radius = 2.6 + t * 9;
      this.dustRing.scale.set(radius, radius, 1);
      this.dustRing.material.opacity = (1 - t) * 0.42;
      this.scorchRing.material.opacity = Math.min(0.34, t * 0.5);
    } else if (this.landed) {
      this.dustRing.material.opacity = 0;
      this.scorchRing.material.opacity = 0.34;
    }

    if (!this.landed) {
      // Slow yaw drift and a touch of sway on the way down.
      this.hull.rotation.y = Math.sin(elapsed * 0.22) * 0.06;
      this.hull.rotation.z = Math.sin(elapsed * 0.9) * 0.012 * (1 - this.descentProgress);
      this.hull.rotation.x = Math.cos(elapsed * 0.75) * 0.012 * (1 - this.descentProgress);
      const flicker = 0.82 + Math.sin(elapsed * 11) * 0.18;
      this.retroMaterial.opacity = Math.pow(this.descentProgress, 2.2) * 0.55 * flicker;
    } else {
      // Settled: hull square on its legs, systems on standby.
      this.hull.rotation.set(0, this.hull.rotation.y, 0);
      this.retroMaterial.opacity = 0;
      const pulse = 0.5 + Math.sin(elapsed * 1.3) * 0.5;
      this.hatchMaterial.emissiveIntensity = 0.24 + pulse * 0.16;
      this.lampMaterial.emissiveIntensity = 0.2 + pulse * 0.1;
      this.descentLight.intensity = 0.28 + pulse * 0.12;
    }
  }

  private applyDescent(): void {
    const eased = 1 - Math.pow(1 - this.descentProgress, 2.6);
    this.hull.position.y = DESCENT_HEIGHT * (1 - eased);
    // Legs compress on the last stretch of the approach.
    const compression = Math.max(0, (this.descentProgress - 0.86) / 0.14);
    for (const leg of this.legs) {
      leg.scale.y = 1 - compression * 0.14;
    }
    if (!this.landed) {
      this.lampMaterial.emissiveIntensity = 0.35 + this.descentProgress * 0.9;
      this.descentLight.intensity = 0.4 + this.descentProgress * 1.5;
      this.hatchMaterial.emissiveIntensity = 0;
      // The shadow tightens and darkens as the hull comes down.
      this.contactShadow.material.opacity = this.descentProgress * 0.34;
      const shadowScale = 0.5 + this.descentProgress * 0.5;
      this.contactShadow.scale.set(shadowScale, shadowScale, 1);
      if (this.descentProgress > 0 && this.settleAge < 0) this.settleAge = -1;
    } else {
      this.contactShadow.material.opacity = 0.36;
      this.contactShadow.scale.set(1, 1, 1);
      if (this.settleAge < 0) this.settleAge = 0;
    }
  }
}
