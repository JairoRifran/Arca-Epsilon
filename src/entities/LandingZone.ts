import * as THREE from 'three';
import type { LandingZoneDefinition } from '../assets/landingZoneDefinitions';

export class LandingZone {
  readonly group = new THREE.Group();

  active = false;

  private readonly beaconMaterial: THREE.MeshBasicMaterial;

  private readonly ringMaterial: THREE.MeshBasicMaterial;

  private readonly surfaceMaterial: THREE.MeshStandardMaterial;

  private readonly beacon: THREE.Mesh;

  private readonly guideLight: THREE.PointLight;

  private readonly approachMarkers = new THREE.Group();

  private approachVisibility = 1;

  private settled = false;

  constructor(readonly definition: LandingZoneDefinition) {
    this.group.name = definition.name;
    this.group.visible = false;

    this.surfaceMaterial = new THREE.MeshStandardMaterial({
      color: 0x263f35,
      roughness: 0.86,
      metalness: 0.02,
      emissive: 0x071a13,
      emissiveIntensity: 0.22
    });

    const padRadius = definition.radius * 0.48;
    const plateau = new THREE.Mesh(new THREE.CylinderGeometry(padRadius, padRadius * 1.03, 0.12, 40), this.surfaceMaterial);
    plateau.name = 'Nereida Contact Slab';
    // The gameplay anchor remains at y=1.5. Sink the visual slab to terrain
    // level so it reads as a prepared apron rather than a floating arena.
    plateau.position.y = -1.55;
    plateau.receiveShadow = true;
    this.group.add(plateau);

    const seamMaterial = new THREE.MeshStandardMaterial({
      color: 0x314b40,
      emissive: 0x0d3428,
      emissiveIntensity: 0.28,
      roughness: 0.72,
      metalness: 0.08
    });
    for (let i = 0; i < 4; i += 1) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, padRadius * 1.25), seamMaterial);
      seam.position.y = -1.44;
      seam.rotation.y = (i / 4) * Math.PI;
      this.group.add(seam);
    }

    // Diegetic perimeter landing pads instead of colored torus rings or cones
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x7dffd2,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    this.approachMarkers.name = 'Nereida Approach Marker Guides';
    this.group.add(this.approachMarkers);

    for (let i = 0; i < 4; i += 1) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const padRadius = definition.radius * 0.72;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.05, 0.12, 16), this.surfaceMaterial);
      pad.position.set(Math.cos(angle) * padRadius, -1.53, Math.sin(angle) * padRadius);
      pad.receiveShadow = true;
      this.group.add(pad);

      const markerLight = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), this.ringMaterial);
      markerLight.position.set(Math.cos(angle) * padRadius, 2.1, Math.sin(angle) * padRadius);
      this.approachMarkers.add(markerLight);
    }

    this.beaconMaterial = new THREE.MeshBasicMaterial({
      color: 0x88ffe0,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    // Subtle central landing beacon diamond instead of a giant 96-unit floating cone
    this.beacon = new THREE.Mesh(new THREE.OctahedronGeometry(3.5, 0), this.beaconMaterial);
    this.beacon.name = 'Nereida Landing Beacon';
    this.beacon.position.y = 6;
    this.group.add(this.beacon);

    this.guideLight = new THREE.PointLight(0x7dffd2, 2.4, 260, 1.7);
    this.guideLight.position.y = 9;
    this.group.add(this.guideLight);
  }

  activate(position: THREE.Vector3, normal: THREE.Vector3): void {
    this.active = true;
    this.setSettled(false);
    this.group.visible = true;
    this.group.position.copy(position);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
  }

  distanceTo(position: THREE.Vector3): number {
    return this.group.position.distanceTo(position);
  }

  isInAssistRange(position: THREE.Vector3): boolean {
    return this.active && this.distanceTo(position) <= this.definition.assistRadius;
  }

  canTouchDown(position: THREE.Vector3, speed: number): boolean {
    return this.active && this.distanceTo(position) <= this.definition.radius && speed <= this.definition.touchdownSpeed;
  }

  setApproachVisibility(visibility: number): void {
    this.approachVisibility = THREE.MathUtils.clamp(visibility, 0.18, 1);
  }

  setSettled(settled: boolean): void {
    this.settled = settled;
    this.beacon.visible = !settled;
    this.approachMarkers.visible = !settled;
  }

  update(delta: number, elapsed: number): void {
    if (!this.active) return;
    const pulse = 0.46 + Math.sin(elapsed * 2.8) * 0.16;
    this.beaconMaterial.opacity = pulse * this.approachVisibility;
    this.ringMaterial.opacity = (0.22 + pulse * 0.22) * this.approachVisibility;
    this.surfaceMaterial.emissiveIntensity = 0.12 + this.approachVisibility * 0.18;
    this.guideLight.intensity = this.settled
      ? 0.16
      : (1.2 + pulse * 1.7) * this.approachVisibility;
    this.beacon.rotation.y += delta * 0.38;
  }
}
