import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import {
  coalitionHiddenNodeDefinition,
  coalitionTerminalDefinition
} from '../assets/mission14Definitions';

/**
 * The two objects Mission 14 genuinely adds to the Aurora clearing, plus the
 * contamination markers that sit on hardware that is already standing.
 *
 * The power node and the relay are M13's generator and comms mast — nothing is
 * rebuilt for them, they just get a marker parented into this group and
 * positioned onto the existing station. Only the analysis terminal and the
 * contaminated perimeter sensor are new geometry.
 *
 * Everything is built once in the constructor: four shared materials, one
 * shared sprite texture, one shared marker geometry. Nothing here allocates
 * geometry, materials or vectors during update, and no value is derived from
 * Math.random after construction.
 */
export class AuroraCoalitionTraceNodes {
  readonly group = new THREE.Group();
  readonly terminalPosition = new THREE.Vector3();
  readonly hiddenNodePosition = new THREE.Vector3();

  private readonly terminalGroup = new THREE.Group();
  private readonly hiddenGroup = new THREE.Group();
  /** Marker order: 0 power, 1 comms, 2 hidden. */
  private readonly markerGroups: THREE.Group[] = [];
  private readonly markerCores: THREE.Sprite[] = [];
  private readonly markerHalos: THREE.Sprite[] = [];

  private readonly screenMaterial: THREE.MeshStandardMaterial;
  private readonly sensorMaterial: THREE.MeshStandardMaterial;
  private readonly markerCoreMaterial: THREE.SpriteMaterial;
  private readonly markerHaloMaterial: THREE.SpriteMaterial;
  private readonly cleanMaterial: THREE.SpriteMaterial;
  private readonly sharedTexture: THREE.Texture;
  private readonly matrix = new THREE.Matrix4();

  /** Purge state per marker, mirrored so update never reads mission state. */
  private readonly purged = [false, false, false];
  private hiddenRevealed = false;
  private contamination = 0;

  constructor() {
    this.group.name = 'Rastro de la Coalición';
    this.group.visible = false;
    this.sharedTexture = createSoftParticleTexture(64);

    const shell = new THREE.MeshStandardMaterial({ color: 0x9d9c92, roughness: 0.66, metalness: 0.34 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2f3438, roughness: 0.52, metalness: 0.72 });
    this.screenMaterial = new THREE.MeshStandardMaterial({
      color: 0x141a1e,
      emissive: 0x6fd0e0,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.36
    });
    // The contaminated sensor reads amber, not the colony's cyan.
    this.sensorMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3227,
      emissive: 0xc4761f,
      emissiveIntensity: 0.2,
      roughness: 0.58,
      metalness: 0.48
    });

    // ----- Analysis terminal -----
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.2, 10), darkMetal);
    pad.position.y = 0.1;
    this.terminalGroup.add(pad);
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 0.6), shell);
    column.position.y = 0.78;
    this.terminalGroup.add(column);
    const console_ = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.9), darkMetal);
    console_.position.y = 1.4;
    this.terminalGroup.add(console_);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.86, 0.07), this.screenMaterial);
    screen.position.set(0, 1.92, -0.16);
    screen.rotation.x = -0.22;
    this.terminalGroup.add(screen);
    // Side ribs: one instanced mesh rather than four meshes.
    const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.9, 0.5), darkMetal, 4);
    for (let i = 0; i < 4; i += 1) {
      this.matrix.identity();
      this.matrix.setPosition(i < 2 ? -0.5 : 0.5, 0.78, i % 2 === 0 ? -0.22 : 0.22);
      ribs.setMatrixAt(i, this.matrix);
    }
    ribs.instanceMatrix.needsUpdate = true;
    this.terminalGroup.add(ribs);
    this.terminalGroup.add(this.makeContactShadow(1.6, 0.3));
    this.group.add(this.terminalGroup);

    // ----- Contaminated perimeter sensor -----
    const sensorBase = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.72, 0.26, 8), darkMetal);
    sensorBase.position.y = 0.13;
    this.hiddenGroup.add(sensorBase);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 2.3, 8), shell);
    stem.position.y = 1.35;
    this.hiddenGroup.add(stem);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.34), this.sensorMaterial);
    head.position.y = 2.66;
    this.hiddenGroup.add(head);
    const vane = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.05, 0.2), darkMetal);
    vane.position.y = 2.98;
    this.hiddenGroup.add(vane);
    this.hiddenGroup.add(this.makeContactShadow(1.0, 0.28));
    this.group.add(this.hiddenGroup);

    // ----- Contamination markers on the three nodes -----
    this.markerCoreMaterial = new THREE.SpriteMaterial({
      map: this.sharedTexture,
      color: 0xd8622a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.markerHaloMaterial = new THREE.SpriteMaterial({
      map: this.sharedTexture,
      color: 0x8c2f16,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    // A purged node keeps a marker, but a cold cyan one that no longer pulses.
    this.cleanMaterial = new THREE.SpriteMaterial({
      map: this.sharedTexture,
      color: 0x5fbfd4,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    for (let i = 0; i < 3; i += 1) {
      const marker = new THREE.Group();
      const halo = new THREE.Sprite(this.markerHaloMaterial);
      halo.scale.setScalar(11);
      marker.add(halo);
      this.markerHalos.push(halo);
      const core = new THREE.Sprite(this.markerCoreMaterial);
      core.scale.setScalar(3.6);
      marker.add(core);
      this.markerCores.push(core);
      marker.visible = false;
      this.markerGroups.push(marker);
      this.group.add(marker);
    }

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) child.frustumCulled = false;
    });
  }

  private makeContactShadow(radius: number, opacity: number): THREE.Mesh {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 14),
      new THREE.MeshBasicMaterial({
        map: this.sharedTexture,
        color: 0x000000,
        transparent: true,
        opacity,
        depthWrite: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    return shadow;
  }

  /**
   * Seat the new hardware on the terrain and pin the two reused markers onto
   * the M13 stations. Called on sync, never per frame.
   */
  setLayout(
    getGroundHeight: (x: number, z: number) => number,
    powerNode: THREE.Vector3,
    commsNode: THREE.Vector3
  ): void {
    const [tx, tz] = coalitionTerminalDefinition.position;
    const ty = getGroundHeight(tx, tz);
    this.terminalGroup.position.set(tx, ty, tz);
    this.terminalPosition.set(tx, ty + 1.5, tz);

    const [hx, hz] = coalitionHiddenNodeDefinition.position;
    const hy = getGroundHeight(hx, hz);
    this.hiddenGroup.position.set(hx, hy, hz);
    this.hiddenNodePosition.set(hx, hy + 1.6, hz);

    // Markers 0 and 1 ride the hardware M13 already built.
    this.markerGroups[0].position.set(powerNode.x, powerNode.y + 2.2, powerNode.z);
    this.markerGroups[1].position.set(commsNode.x, commsNode.y + 6.4, commsNode.z);
    this.markerGroups[2].position.set(hx, hy + 3.2, hz);
  }

  /**
   * Push mission state in. Called on sync and on every state change, never
   * per frame — `update` only animates what is set here.
   */
  restore(
    visible: boolean,
    powerPurged: boolean,
    commsPurged: boolean,
    samplePulled: boolean,
    hiddenRevealed: boolean,
    signatureAnalyzed: boolean,
    contamination: number
  ): void {
    this.group.visible = visible;
    this.purged[0] = powerPurged;
    this.purged[1] = commsPurged;
    this.purged[2] = samplePulled;
    this.hiddenRevealed = hiddenRevealed;
    this.contamination = THREE.MathUtils.clamp(contamination / 100, 0, 1);
    // Nothing is marked until the terminal has actually identified the nodes:
    // before the analysis the pilot has a symptom, not a map.
    for (let i = 0; i < this.markerGroups.length; i += 1) {
      // The hidden node's marker stays dark until the pilot is close enough
      // for it to be honest — the search is not solved by a floating light.
      const shown = visible && signatureAnalyzed && (i < 2 || hiddenRevealed || samplePulled);
      this.markerGroups[i].visible = shown;
      const material = this.purged[i] ? this.cleanMaterial : this.markerCoreMaterial;
      this.markerCores[i].material = material;
      this.markerHalos[i].material = this.purged[i] ? this.cleanMaterial : this.markerHaloMaterial;
    }
    // The sensor only lights up once it has been found.
    this.sensorMaterial.emissiveIntensity = samplePulled ? 0.08 : hiddenRevealed ? 0.5 : 0.2;
    this.screenMaterial.emissiveIntensity = signatureAnalyzed ? 0.55 : 0.4;
  }

  /**
   * True once the pilot is close enough for the sensor to light up. Flipped
   * from the mission update so the marker follows the approach instead of
   * waiting for the next state change.
   */
  setHiddenRevealed(revealed: boolean, signatureAnalyzed: boolean, samplePulled: boolean): void {
    if (revealed === this.hiddenRevealed) return;
    this.hiddenRevealed = revealed;
    this.markerGroups[2].visible = this.group.visible && signatureAnalyzed && (revealed || samplePulled);
    this.sensorMaterial.emissiveIntensity = samplePulled ? 0.08 : revealed ? 0.5 : 0.2;
  }

  update(elapsed: number, contamination = this.contamination * 100): void {
    if (!this.group.visible) return;
    // Tracked live so the markers actually drain during the closing phase.
    this.contamination = THREE.MathUtils.clamp(contamination / 100, 0, 1);

    // Terminal screen: a slow steady breath, faster while the mark is live.
    this.screenMaterial.emissiveIntensity =
      0.34 + Math.sin(elapsed * (1.1 + this.contamination * 2.4)) * 0.12 + this.contamination * 0.12;

    // Contaminated markers pulse; purged ones sit still and cold.
    const pulse = 0.5 + Math.sin(elapsed * 3.1) * 0.5;
    this.markerCoreMaterial.opacity = 0.24 + pulse * 0.4 * (0.35 + this.contamination * 0.65);
    this.markerHaloMaterial.opacity = 0.08 + pulse * 0.16 * (0.35 + this.contamination * 0.65);
    for (let i = 0; i < this.markerGroups.length; i += 1) {
      if (!this.markerGroups[i].visible) continue;
      // Offsetting each node's phase stops the three reading as one system.
      const scale = this.purged[i] ? 1 : 1 + Math.sin(elapsed * 2.6 + i * 2.1) * 0.14;
      this.markerGroups[i].scale.setScalar(scale);
    }

    // The contaminated sensor flickers irregularly while it is still active.
    if (!this.purged[2] && this.hiddenRevealed) {
      this.sensorMaterial.emissiveIntensity =
        0.34 + Math.abs(Math.sin(elapsed * 7.7) * Math.sin(elapsed * 2.9)) * 0.5;
    }
  }

  dispose(): void {
    this.screenMaterial.dispose();
    this.sensorMaterial.dispose();
    this.markerCoreMaterial.dispose();
    this.markerHaloMaterial.dispose();
    this.cleanMaterial.dispose();
    // The soft sprite texture is shared application-wide; freeing it here
    // would pull it out from under every other effect using the same size.
  }
}
