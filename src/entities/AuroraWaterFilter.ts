import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

/**
 * The Aurora microfilter: a small pump housing on the bank, a short intake
 * hose running down to a float sensor on the water, and a fine condensation
 * plume that only appears once flow is calibrated. Everything about its
 * scale is intentional — this is a sampling rig, not an extraction plant.
 *
 * Flow progress drives the status ring, the plume and a slow ripple on the
 * float; nothing here dredges or drains the sheet.
 */
export class AuroraWaterFilter {
  readonly group = new THREE.Group();
  readonly interactionPosition = new THREE.Vector3();

  private readonly ringMaterial: THREE.MeshStandardMaterial;
  private readonly housingMaterial: THREE.MeshStandardMaterial;
  private readonly float: THREE.Mesh;
  private readonly plume: THREE.Points;
  private readonly plumeMaterial: THREE.PointsMaterial;
  private readonly plumeSeeds: Float32Array;
  private readonly light: THREE.PointLight;
  private readonly panelMaterial: THREE.MeshStandardMaterial;
  private readonly ripples: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private flow = 0;

  constructor() {
    this.group.name = 'Microfiltro Aurora';
    this.group.visible = false;
    const instanceMatrix = new THREE.Matrix4();

    const metal = new THREE.MeshStandardMaterial({ color: 0x6d7378, roughness: 0.52, metalness: 0.62 });
    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x6a6459, roughness: 0.94, metalness: 0.03 });
    this.housingMaterial = new THREE.MeshStandardMaterial({
      color: 0x9aa0a2,
      emissive: 0x3f8f9c,
      emissiveIntensity: 0,
      roughness: 0.58,
      metalness: 0.42
    });
    this.ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f2a2c,
      emissive: 0x5fc8d8,
      emissiveIntensity: 0.14,
      roughness: 0.34,
      metalness: 0.45
    });

    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 14),
      new THREE.MeshBasicMaterial({
        map: createSoftParticleTexture(64),
        color: 0x000000,
        transparent: true,
        opacity: 0.28,
        depthWrite: false
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.02;
    this.group.add(contactShadow);

    // Pump housing on a small skid.
    const skid = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 0.95), metal);
    skid.position.y = 0.08;
    this.group.add(skid);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.85, 10), this.housingMaterial);
    housing.position.y = 0.6;
    this.group.add(housing);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.4, 0.14, 10), metal);
    cap.position.y = 1.06;
    this.group.add(cap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 6, 14), this.ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.16;
    this.group.add(ring);

    // Bolt ring around the housing seam.
    const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 5), metal, 8);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      instanceMatrix.makeRotationZ(Math.PI / 2);
      instanceMatrix.premultiply(new THREE.Matrix4().makeRotationY(-angle));
      instanceMatrix.setPosition(Math.cos(angle) * 0.43, 0.95, Math.sin(angle) * 0.43);
      bolts.setMatrixAt(i, instanceMatrix);
    }
    bolts.instanceMatrix.needsUpdate = true;
    this.group.add(bolts);

    // Small status panel angled toward the operator.
    this.panelMaterial = new THREE.MeshStandardMaterial({
      color: 0x1c2426,
      emissive: 0x5fc8d8,
      emissiveIntensity: 0.06,
      roughness: 0.32,
      metalness: 0.4
    });
    const panelBody = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.06), metal);
    panelBody.position.set(0.46, 0.72, 0.22);
    panelBody.rotation.y = -0.5;
    panelBody.rotation.x = -0.3;
    this.group.add(panelBody);
    const panelFace = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.17), this.panelMaterial);
    panelFace.position.set(0.48, 0.735, 0.25);
    panelFace.rotation.y = -0.5;
    panelFace.rotation.x = -0.3;
    this.group.add(panelFace);

    // Wet, darkened shoreline patch: the ground here stays damp.
    const wetPatch = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 14),
      new THREE.MeshStandardMaterial({
        color: 0x3a4440,
        roughness: 0.55,
        metalness: 0.04,
        transparent: true,
        opacity: 0.5,
        depthWrite: false
      })
    );
    wetPatch.rotation.x = -Math.PI / 2;
    // Damp ground between the pump and the waterline, stretched along the
    // intake run rather than pooled around the housing.
    wetPatch.position.set(-1.9, 0.03, -5.5);
    wetPatch.scale.set(1.15, 2.4, 1);
    this.group.add(wetPatch);

    // A few shoreline stones the rig was seated between.
    const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMaterial, 6);
    const stoneSpots: [number, number, number][] = [
      [0.9, -0.7, 1], [-1.1, 0.55, 0.75], [-2.2, -1.6, 1.3],
      [1.25, 0.4, 0.6], [-0.6, -2.3, 0.9], [-3.4, -2.6, 1.1]
    ];
    for (let i = 0; i < stoneSpots.length; i += 1) {
      const [sx, sz, scale] = stoneSpots[i];
      instanceMatrix.makeRotationY(i * 1.3);
      instanceMatrix.scale(new THREE.Vector3(scale, scale * 0.6, scale));
      instanceMatrix.setPosition(sx, 0.06, sz);
      stones.setMatrixAt(i, instanceMatrix);
    }
    stones.instanceMatrix.needsUpdate = true;
    this.group.add(stones);

    // Two slow ripple rings spreading from the float while flow is running.
    for (let i = 0; i < 2; i += 1) {
      const ripple = new THREE.Mesh(
        new THREE.RingGeometry(0.88, 1, 24),
        new THREE.MeshBasicMaterial({
          color: 0xb6e4ef,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.set(-3.9, -0.18, -11.9);
      this.ripples.push(ripple);
      this.group.add(ripple);
    }

    // Intake line running from the pump down the bank to the float out on
    // the sheet. Built from repeated segments along a fixed local path so it
    // reads as a laid hose rather than a floating stick.
    const intakeEnd = new THREE.Vector3(-3.4, -0.62, -11.5);
    const intakeSegments = 9;
    const hoses = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1, 5),
      metal,
      intakeSegments
    );
    const hoseUp = new THREE.Vector3(0, 1, 0);
    const hoseDir = new THREE.Vector3();
    const hoseQuat = new THREE.Quaternion();
    const hoseScale = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < intakeSegments; i += 1) {
      const t0 = i / intakeSegments;
      const t1 = (i + 1) / intakeSegments;
      // Slight sag on the way down, flattening once it meets the water.
      const p0 = new THREE.Vector3(
        -0.5 + intakeEnd.x * t0,
        0.42 + intakeEnd.y * t0 - Math.sin(t0 * Math.PI) * 0.18,
        -0.2 + intakeEnd.z * t0
      );
      const p1 = new THREE.Vector3(
        -0.5 + intakeEnd.x * t1,
        0.42 + intakeEnd.y * t1 - Math.sin(t1 * Math.PI) * 0.18,
        -0.2 + intakeEnd.z * t1
      );
      hoseDir.subVectors(p1, p0);
      hoseScale.set(1, hoseDir.length(), 1);
      hoseQuat.setFromUnitVectors(hoseUp, hoseDir.clone().normalize());
      instanceMatrix.compose(p0.lerp(p1, 0.5), hoseQuat, hoseScale);
      hoses.setMatrixAt(i, instanceMatrix);
    }
    hoses.instanceMatrix.needsUpdate = true;
    this.group.add(hoses);

    // Float sensor sitting out on the sheet at the end of the intake.
    this.float = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.14, 10), this.housingMaterial);
    this.float.position.set(-3.9, -0.2, -11.9);
    this.group.add(this.float);
    const floatMast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.44, 4), metal);
    floatMast.position.set(-3.9, 0.04, -11.9);
    this.group.add(floatMast);

    this.light = new THREE.PointLight(0x5fc8d8, 0.18, 8, 1.9);
    this.light.position.y = 1.1;
    this.group.add(this.light);

    // Condensation plume above the housing: eight motes on a slow rise.
    const count = 8;
    const positions = new Float32Array(count * 3);
    this.plumeSeeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) this.plumeSeeds[i] = (i * 0.618) % 1;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 6);
    this.plumeMaterial = new THREE.PointsMaterial({
      color: 0xd7ecf2,
      size: 0.3,
      map: createSoftParticleTexture(32),
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.plume = new THREE.Points(geometry, this.plumeMaterial);
    this.plume.frustumCulled = false;
    this.group.add(this.plume);

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.interactionPosition.set(x, y + 0.6, z);
  }

  restore(installed: boolean, flowPercent: number): void {
    this.group.visible = installed;
    this.flow = Math.min(1, Math.max(0, flowPercent / 100));
    this.applyFlow(this.flow);
  }

  update(elapsed: number, flowPercent: number): void {
    if (!this.group.visible) return;
    this.flow = Math.min(1, Math.max(0, flowPercent / 100));
    this.applyFlow(this.flow);

    // The float rides a slow swell whether or not the pump is running.
    this.float.position.y = -0.2 + Math.sin(elapsed * 0.9) * 0.035;

    // Intake ripples spread from the float, offset half a cycle apart. Very
    // small amplitude: this is a trickle, not a pump station.
    for (let i = 0; i < this.ripples.length; i += 1) {
      const cycle = (elapsed * 0.32 + i * 0.5) % 1;
      const scale = 0.35 + cycle * 1.5;
      this.ripples[i].scale.set(scale, scale, 1);
      this.ripples[i].material.opacity = this.flow * (1 - cycle) * 0.3;
    }

    const positions = this.plume.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i += 1) {
      const cycle = (elapsed * 0.16 + this.plumeSeeds[i]) % 1;
      positions.setXYZ(
        i,
        Math.sin(elapsed * 0.5 + i) * 0.22,
        1.2 + cycle * 1.5,
        Math.cos(elapsed * 0.42 + i * 1.3) * 0.2
      );
    }
    positions.needsUpdate = true;
    // Condensation only once there is actual flow through the housing.
    this.plumeMaterial.opacity = this.flow * 0.26 * (1 - Math.abs(Math.sin(elapsed * 0.3)) * 0.3);

    const pulse = 0.5 + Math.sin(elapsed * 2.1) * 0.5;
    this.ringMaterial.emissiveIntensity = this.flow >= 1 ? 0.46 + pulse * 0.16 : 0.14 + this.flow * 0.3;
    this.housingMaterial.emissiveIntensity = this.flow * 0.14;
    // Status panel ticks on its own slower beat: readout, not heartbeat.
    this.panelMaterial.emissiveIntensity = 0.06 + this.flow * (0.24 + Math.sin(elapsed * 0.8) * 0.08);
    this.light.intensity = this.flow >= 1 ? 0.34 + pulse * 0.12 : 0.16 + this.flow * 0.15;
  }

  private applyFlow(value: number): void {
    this.ringMaterial.emissiveIntensity = value >= 1 ? 0.5 : 0.14 + value * 0.3;
    this.housingMaterial.emissiveIntensity = value * 0.14;
    this.panelMaterial.emissiveIntensity = 0.06 + value * 0.24;
    for (const ripple of this.ripples) ripple.material.opacity = 0;
    this.plumeMaterial.opacity = value * 0.24;
    this.light.intensity = value >= 1 ? 0.36 : 0.16 + value * 0.15;
  }
}
