import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

export type ShipAccessState = 'retracted' | 'deploying' | 'deployed' | 'boarding';

/**
 * Ventral access bay of the scout: a hatch collar seated against the hull,
 * a telescopic column that physically connects the belly to the platform at
 * every moment of the ride, and an egress ramp with directional chevrons.
 * Designed as one retractable system — no floating housings, no loose masts.
 */
export class ShipAccessLift {
  readonly group = new THREE.Group();

  readonly boardingAnchor = new THREE.Object3D();

  state: ShipAccessState = 'retracted';

  private readonly bayCollar: THREE.Group;

  private readonly bayThroat: THREE.Mesh;

  private readonly doorLeft: THREE.Mesh;

  private readonly doorRight: THREE.Mesh;

  private readonly columnSegments: THREE.Mesh[] = [];

  private readonly platform: THREE.Group;

  private readonly groundRamp: THREE.Group;

  private readonly bayGlow: THREE.Mesh;

  private readonly bayGlowMaterial: THREE.MeshBasicMaterial;

  private readonly throatMaterial: THREE.MeshStandardMaterial;

  private readonly edgeLightMaterial: THREE.MeshStandardMaterial;

  private lensMaterial!: THREE.MeshStandardMaterial;

  private safetyBandMaterial!: THREE.MeshStandardMaterial;

  private readonly sleeveLips: THREE.Mesh[] = [];

  private readonly chevronMaterials: THREE.MeshStandardMaterial[] = [];

  private readonly touchdownPuffs: THREE.Sprite[] = [];

  private readonly touchdownPuffMaterials: THREE.SpriteMaterial[] = [];

  private readonly contactShadow: THREE.Mesh;

  private readonly contactShadowMaterial: THREE.MeshBasicMaterial;

  private touchdownPuffAge = 99;

  private puffStrength = 0.26;

  private lockPulse = 0;

  private prevLiftDown = 0;

  private lastElapsed = 0;

  private deckHeight = 3.8;

  private readonly hatchLocal = new THREE.Vector3(3.65, 3.8, 1.05);

  private readonly liftBaseLocal = new THREE.Vector3(3.65, 0.18, 1.05);

  private readonly groundExitLocal = new THREE.Vector3(6.25, 0.05, 1.05);

  constructor() {
    this.group.name = 'Scout Ship Ventral Access Lift';
    this.group.visible = false;
    this.boardingAnchor.name = 'shipBoardingAnchor';
    this.boardingAnchor.position.copy(this.groundExitLocal);
    this.group.add(this.boardingAnchor);

    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x232b31, roughness: 0.52, metalness: 0.84 });
    const hull = new THREE.MeshStandardMaterial({ color: 0x7f8a91, roughness: 0.46, metalness: 0.74 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x11171b, roughness: 0.92, metalness: 0.3 });

    // Warm interior of the bay: reads as a lit compartment when the doors
    // part, exactly like an aircraft wheel well at night. Desaturated so the
    // spill feels like tungsten service light, not orange neon.
    this.throatMaterial = new THREE.MeshStandardMaterial({
      color: 0x261f19,
      emissive: 0xe0a873,
      emissiveIntensity: 0,
      roughness: 0.72,
      metalness: 0.2,
      side: THREE.BackSide
    });

    // Muted amber service lighting shared by platform edge and ramp chevrons.
    this.edgeLightMaterial = new THREE.MeshStandardMaterial({
      color: 0x4c3a28,
      emissive: 0xdda368,
      emissiveIntensity: 0,
      roughness: 0.34,
      metalness: 0.22
    });

    // --- Bay collar: hatch frame seated flush against the hull belly ---
    this.bayCollar = new THREE.Group();
    this.bayCollar.name = 'Access Bay Collar';

    const collarPlate = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 2.0), hull);
    collarPlate.position.y = 0.42;
    this.bayCollar.add(collarPlate);

    // Recessed panel seams across the collar plate: fine machined relief.
    const seamMetal = new THREE.MeshStandardMaterial({ color: 0x171d22, roughness: 0.6, metalness: 0.7 });
    for (const z of [-0.62, 0, 0.62]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.015, 0.035), seamMetal);
      seam.position.set(0, 0.325, z);
      this.bayCollar.add(seam);
    }

    // Frame moldings around the opening, each capped with a thin worn lip.
    for (const [width, depth, x, z] of [
      [2.5, 0.24, 0, -0.95],
      [2.5, 0.24, 0, 0.95],
      [0.26, 1.7, -1.15, 0],
      [0.26, 1.7, 1.15, 0]
    ] as [number, number, number, number][]) {
      const molding = new THREE.Mesh(new THREE.BoxGeometry(width, 0.34, depth), darkMetal);
      molding.position.set(x, 0.28, z);
      this.bayCollar.add(molding);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 0.03, depth * 0.9), hull);
      lip.position.set(x, 0.1, z);
      this.bayCollar.add(lip);
    }

    // Translucent service-light lenses along both long moldings: soft warm
    // strips that read as diffused fixtures, not bare emissive blocks.
    this.lensMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8b58c,
      emissive: 0xdba876,
      emissiveIntensity: 0,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.55
    });
    for (const z of [-0.95, 0.95]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.07), this.lensMaterial);
      lens.position.set(0, 0.13, z * 1.04);
      this.bayCollar.add(lens);
    }

    // Lit throat of the bay, visible through the parted doors.
    this.bayThroat = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.62, 1.5), this.throatMaterial);
    this.bayThroat.position.y = 0.28;
    this.bayCollar.add(this.bayThroat);

    // Iris doors sliding sideways inside the frame — they never protrude.
    this.doorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.09, 1.52), hull);
    this.doorRight = this.doorLeft.clone();
    this.doorLeft.position.set(-0.49, 0.02, 0);
    this.doorRight.position.set(0.49, 0.02, 0);
    this.bayCollar.add(this.doorLeft, this.doorRight);

    // Door servo housings and the guide rails the platform locks into —
    // small, purposeful mechanics visible through the parted doors.
    for (const side of [-1, 1]) {
      const servo = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.42), darkMetal);
      servo.position.set(side * 1.02, 0.14, side * 0.5);
      this.bayCollar.add(servo);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.09), darkMetal);
      rail.position.set(side * 0.78, 0.36, 0);
      this.bayCollar.add(rail);
    }

    this.group.add(this.bayCollar);

    // --- Telescopic column: three nested sleeves, collar to platform ---
    const sleeveProfiles = [0.66, 0.5, 0.36];
    for (const [index, side] of sleeveProfiles.entries()) {
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(side, 1, side), index === 0 ? darkMetal : hull);
      sleeve.name = `Access Lift Column Sleeve ${index}`;
      this.columnSegments.push(sleeve);
      this.group.add(sleeve);
      // Overlap lip at each sleeve mouth: the telescoping joint reads as a
      // machined collar instead of one box sliding through another.
      const lip = new THREE.Mesh(new THREE.BoxGeometry(side + 0.07, 0.07, side + 0.07), darkMetal);
      lip.name = `Access Lift Sleeve Lip ${index}`;
      this.sleeveLips.push(lip);
      this.group.add(lip);
    }

    // --- Platform: octagonal deck with amber safety edge ---
    this.platform = new THREE.Group();
    this.platform.name = 'Access Lift Platform';
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.08, 0.15, 8), darkMetal);
    this.platform.add(deck);
    const deckGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.05, 8), grip);
    deckGrip.position.y = 0.09;
    this.platform.add(deckGrip);
    // Beveled underskirt and the spindle hub that receives the telescopic
    // column: the deck reads as machined, not extruded.
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 0.9, 0.14, 8), hull);
    skirt.position.y = -0.13;
    this.platform.add(skirt);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.2, 8), darkMetal);
    hub.position.y = 0.16;
    this.platform.add(hub);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const edgeLamp = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.032, 0.05), this.edgeLightMaterial);
      edgeLamp.position.set(Math.cos(angle) * 0.99, 0.055, Math.sin(angle) * 0.99);
      edgeLamp.rotation.y = -angle + Math.PI / 2;
      this.platform.add(edgeLamp);
    }
    // Continuous translucent safety band wrapping the deck rim: a diffused
    // glow layer over the lamps instead of hard emissive blocks.
    this.safetyBandMaterial = new THREE.MeshStandardMaterial({
      color: 0xcaa87e,
      emissive: 0xd6a672,
      emissiveIntensity: 0,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide
    });
    const safetyBand = new THREE.Mesh(
      new THREE.CylinderGeometry(1.055, 1.055, 0.045, 8, 1, true),
      this.safetyBandMaterial
    );
    safetyBand.position.y = 0.055;
    this.platform.add(safetyBand);
    // Radial tread strips over the grip disc: machined anti-slip relief.
    const treadMetal = new THREE.MeshStandardMaterial({ color: 0x1d242a, roughness: 0.82, metalness: 0.42 });
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const tread = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.012, 0.05), treadMetal);
      tread.position.set(Math.cos(angle) * 0.45, 0.12, Math.sin(angle) * 0.45);
      tread.rotation.y = -angle;
      this.platform.add(tread);
    }
    // Corner gussets tying the skirt into the spindle hub.
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const gusset = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.045, 0.1), treadMetal);
      gusset.position.set(Math.cos(angle) * 0.55, -0.085, Math.sin(angle) * 0.55);
      gusset.rotation.y = -angle;
      this.platform.add(gusset);
    }
    // Subtle wear: dark scuff patches where boots land, barely above deck.
    const scuffMaterial = new THREE.MeshBasicMaterial({
      color: 0x0a0d10,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });
    for (const [sx, sz, sr] of [
      [0.22, -0.14, 0.16],
      [-0.18, 0.2, 0.12],
      [0.05, 0.32, 0.09]
    ] as [number, number, number][]) {
      const scuff = new THREE.Mesh(new THREE.CircleGeometry(sr, 10), scuffMaterial);
      scuff.rotation.x = -Math.PI / 2;
      scuff.position.set(sx, 0.128, sz);
      this.platform.add(scuff);
    }
    this.group.add(this.platform);

    // --- Egress ramp: tapered plate with directional chevrons ---
    this.groundRamp = new THREE.Group();
    this.groundRamp.name = 'Access Lift Ground Ramp';
    const rampPlate = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.09, 1.34), darkMetal);
    this.groundRamp.add(rampPlate);
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.14, 0.09), hull);
      curb.position.set(0, 0.05, side * 0.66);
      this.groundRamp.add(curb);
    }
    for (let i = 0; i < 3; i += 1) {
      const chevronMaterial = this.edgeLightMaterial.clone();
      this.chevronMaterials.push(chevronMaterial);
      for (const side of [-1, 1]) {
        const stroke = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.07), chevronMaterial);
        stroke.position.set(-0.7 + i * 0.7, 0.062, side * 0.14);
        stroke.rotation.y = side * 0.62;
        this.groundRamp.add(stroke);
      }
    }
    this.groundRamp.position.set(4.95, 0.1, 1.05);
    this.groundRamp.rotation.z = -0.045;
    this.group.add(this.groundRamp);

    // --- Soft bay light spilling to the ground while the lift is open ---
    this.bayGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xe3bc93,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.bayGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.15, 1, 12, 1, true), this.bayGlowMaterial);
    this.bayGlow.name = 'Access Bay Light Spill';
    this.group.add(this.bayGlow);

    // --- Contact shadow: soft dark blob on the ground under the platform.
    // It deepens as the deck approaches, selling the platform's weight ---
    this.contactShadowMaterial = new THREE.MeshBasicMaterial({
      map: createSoftParticleTexture(64),
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.contactShadow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 16), this.contactShadowMaterial);
    this.contactShadow.name = 'Access Lift Contact Shadow';
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.group.add(this.contactShadow);

    // --- Touchdown dust: three soft puffs kicked out when the platform
    // settles on the ground, then faded within a second ---
    const puffTexture = createSoftParticleTexture(64);
    for (let i = 0; i < 3; i += 1) {
      const puffMaterial = new THREE.SpriteMaterial({
        map: puffTexture,
        color: 0xb9a893,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const puff = new THREE.Sprite(puffMaterial);
      const angle = (i / 3) * Math.PI * 2 + 0.5;
      puff.position.set(
        this.liftBaseLocal.x + Math.cos(angle) * 0.9,
        0.32,
        this.liftBaseLocal.z + Math.sin(angle) * 0.9
      );
      puff.visible = false;
      this.touchdownPuffs.push(puff);
      this.touchdownPuffMaterials.push(puffMaterial);
      this.group.add(puff);
    }

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = true;
        child.frustumCulled = false;
      }
    });
  }

  updateAnchor(
    shipPosition: THREE.Vector3,
    shipYaw: number,
    groundHeight: number,
    openProgress: number,
    liftDownProgress: number,
    elapsed = 0
  ): void {
    const open = THREE.MathUtils.clamp(openProgress, 0, 1);
    const liftDown = THREE.MathUtils.clamp(liftDownProgress, 0, 1);
    this.group.visible = open > 0.01;
    this.group.position.set(shipPosition.x, groundHeight, shipPosition.z);
    this.group.rotation.y = shipYaw;

    this.deckHeight = Math.max(2.75, shipPosition.y - groundHeight - 1.18);
    this.hatchLocal.y = this.deckHeight;
    this.liftBaseLocal.y = 0.18;

    // Collar rides flush under the hull belly; no vertical group scaling —
    // the deployment reads through doors, column and platform instead.
    this.bayCollar.position.copy(this.hatchLocal);

    // Two-phase doors: they first drop clear of the frame (unlock), then
    // slide apart — real hatch kinematics instead of one linear glide.
    const doorDrop = THREE.MathUtils.smoothstep(open, 0.02, 0.14) * 0.055;
    const doorTravel = THREE.MathUtils.smoothstep(open, 0.14, 0.6) * 0.78;
    this.doorLeft.position.set(-0.49 - doorTravel, 0.02 - doorDrop, 0);
    this.doorRight.position.set(0.49 + doorTravel, 0.02 - doorDrop, 0);
    // Unlock flicker: the bay light stutters awake while the doors part,
    // then eases into a steady service glow — gentle, like a real fixture.
    const wake = open > 0.03 && open < 0.35 ? 0.84 + Math.sin(elapsed * 26) * 0.16 : 1;
    const serviceGlow = THREE.MathUtils.smoothstep(open, 0.2, 0.9);
    this.throatMaterial.emissiveIntensity = serviceGlow * 0.85 * wake;
    this.lensMaterial.emissiveIntensity = serviceGlow * 0.6 * wake;
    this.lensMaterial.opacity = 0.35 + serviceGlow * 0.2;

    const riding = liftDown > 0.03 && liftDown < 0.97;
    // Faint servo vibration while the column is driving the deck.
    const servo = riding ? Math.sin(elapsed * 41) * 0.011 : 0;
    const platformY = THREE.MathUtils.lerp(this.deckHeight - 0.72, this.liftBaseLocal.y, liftDown) + servo;
    this.platform.position.set(this.hatchLocal.x, platformY, this.hatchLocal.z);
    this.platform.visible = open > 0.3;

    // Contact shadow deepens as the deck closes on the ground.
    const proximity = THREE.MathUtils.clamp(1 - (platformY - this.liftBaseLocal.y) / 2.6, 0, 1);
    this.contactShadow.visible = this.platform.visible;
    this.contactShadow.position.set(this.hatchLocal.x, 0.06, this.hatchLocal.z);
    this.contactShadow.scale.setScalar(1.35 - proximity * 0.35);
    this.contactShadowMaterial.opacity = proximity * proximity * 0.34;

    // Telescopic sleeves: each covers a third of the collar-to-platform
    // span with a slight overlap, so hull and deck stay physically linked.
    const columnTop = this.deckHeight + 0.2;
    const span = Math.max(0.24, columnTop - platformY - 0.1);
    for (const [index, sleeve] of this.columnSegments.entries()) {
      const segment = span / this.columnSegments.length;
      const overlap = 1.16;
      sleeve.visible = open > 0.3;
      sleeve.scale.y = segment * overlap;
      sleeve.position.set(
        this.hatchLocal.x,
        columnTop - segment * index - (segment * overlap) * 0.5,
        this.hatchLocal.z
      );
      // Lip rides the mouth (bottom) of its sleeve, marking the joint.
      const lip = this.sleeveLips[index];
      lip.visible = sleeve.visible;
      lip.position.set(
        this.hatchLocal.x,
        sleeve.position.y - (segment * overlap) * 0.5 + 0.035,
        this.hatchLocal.z
      );
    }

    // Bay light cone stretches from collar to ground while open.
    const glowHeight = Math.max(0.3, this.deckHeight - 0.2);
    this.bayGlow.scale.set(1, glowHeight, 1);
    this.bayGlow.position.set(this.hatchLocal.x, glowHeight * 0.5, this.hatchLocal.z);
    this.bayGlowMaterial.opacity = THREE.MathUtils.smoothstep(open, 0.35, 1) * 0.042;

    // Ramp unfolds outward; chevrons chase toward the exit direction.
    this.groundRamp.scale.x = THREE.MathUtils.smoothstep(open, 0.28, 0.92);
    this.groundRamp.visible = open > 0.28;
    // Edge lighting breathes slowly instead of strobing; the translucent
    // safety band carries most of the glow at a fraction of the intensity.
    const breathe = Math.sin(elapsed * 2.4) * 0.5 + 0.5;
    this.edgeLightMaterial.emissiveIntensity = open * (0.5 + breathe * 0.34);
    this.safetyBandMaterial.emissiveIntensity = open * (0.22 + breathe * 0.14);
    for (const [index, material] of this.chevronMaterials.entries()) {
      material.emissiveIntensity = open * (0.32 + Math.max(0, Math.sin(elapsed * 2.7 - index * 1.05)) * 0.85);
    }

    // Ground dust: a firm puff when the platform settles (liftDown crossing
    // 0.97 downward) and a fainter stir when it lifts off the ground again.
    const dt = this.lastElapsed > 0 ? THREE.MathUtils.clamp(elapsed - this.lastElapsed, 0, 0.1) : 0;
    this.lastElapsed = elapsed;
    if (open > 0.5 && this.prevLiftDown < 0.97 && liftDown >= 0.97) {
      this.touchdownPuffAge = 0;
      this.puffStrength = 0.26;
    } else if (open > 0.5 && this.prevLiftDown >= 0.97 && liftDown < 0.97) {
      this.touchdownPuffAge = 0;
      this.puffStrength = 0.13;
    }
    // Lock pulse: the mechanism seats into the bay at the top of the ride —
    // one short mechanical shudder through the collar, then stillness.
    if (open > 0.5 && this.prevLiftDown > 0.03 && liftDown <= 0.03) {
      this.lockPulse = 1;
    }
    this.lockPulse = Math.max(0, this.lockPulse - dt * 3.2);
    this.bayCollar.position.y = this.hatchLocal.y + Math.sin(elapsed * 68) * 0.014 * this.lockPulse;
    this.prevLiftDown = liftDown;
    this.touchdownPuffAge += dt;
    const puffT = this.touchdownPuffAge / 0.9;
    for (const [index, puff] of this.touchdownPuffs.entries()) {
      if (puffT >= 1) {
        puff.visible = false;
        continue;
      }
      puff.visible = true;
      const spread = 0.7 + puffT * (1.6 + index * 0.25);
      puff.scale.setScalar(spread);
      puff.position.y = 0.32 + puffT * 0.42;
      this.touchdownPuffMaterials[index].opacity = (1 - puffT) * (1 - puffT) * this.puffStrength;
    }
  }

  /** 1→0 impulse emitted when the platform seats into the bay; used for a
   *  subtle camera tremor during boarding. */
  get lockImpulse(): number {
    return this.lockPulse;
  }

  getTransitPoint(exitProgress: number): THREE.Vector3 {
    const progress = THREE.MathUtils.clamp(exitProgress, 0, 1);
    let local: THREE.Vector3;
    if (progress < 0.76) {
      // The pilot's feet use the live platform transform. This keeps them
      // mechanically locked to the deck throughout the vertical ride.
      local = new THREE.Vector3(this.hatchLocal.x, this.platform.position.y + 0.14, this.hatchLocal.z);
    } else {
      const t = THREE.MathUtils.smoothstep(progress, 0.76, 1);
      local = new THREE.Vector3(this.hatchLocal.x, this.platform.position.y + 0.14, this.hatchLocal.z)
        .lerp(this.groundExitLocal, t);
    }
    return this.group.localToWorld(local);
  }

  getPlatformStandPosition(): THREE.Vector3 {
    return this.group.localToWorld(
      new THREE.Vector3(this.hatchLocal.x, this.platform.position.y + 0.14, this.hatchLocal.z)
    );
  }

  getBoardingCameraPosition(): THREE.Vector3 {
    return this.group.localToWorld(new THREE.Vector3(10.4, 4.9, 8.2));
  }

  getBoardingLookTarget(): THREE.Vector3 {
    const local = this.hatchLocal.clone().lerp(this.liftBaseLocal, 0.46);
    local.x += 0.45;
    return this.group.localToWorld(local);
  }

  getGroundExitPosition(): THREE.Vector3 {
    return this.boardingAnchor.getWorldPosition(new THREE.Vector3());
  }

  getBoardingAnchorWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.boardingAnchor.getWorldPosition(target);
  }

  getLiftProgressForExitPath(exitProgress: number): number {
    return THREE.MathUtils.smoothstep(exitProgress, 0.18, 0.76);
  }

  get liftContactShadowActive(): boolean {
    return this.group.visible && this.contactShadow.visible && this.contactShadowMaterial.opacity > 0.01;
  }
}
