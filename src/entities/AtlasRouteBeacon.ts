import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import type { AtlasRouteBeaconDefinition } from '../assets/mission09Definitions';

const DORMANT = new THREE.Color(0x9ab0c0);
const CONFIRMED = new THREE.Color(0x7fe0cf);

/**
 * Slim Atlas navigation pillar marking a leg of the Aurora route: a bolted
 * base, a tall mast, a directional vane pointing down-route, and a lit ring
 * that wakes from a dim dormant blue to a confirmed teal when scanned.
 * Restrained, tall enough to read across long distances through fog.
 */
export class AtlasRouteBeacon {
  readonly group = new THREE.Group();
  readonly interactionPosition = new THREE.Vector3();

  private readonly ringMaterial: THREE.MeshStandardMaterial;
  private readonly vaneMaterial: THREE.MeshStandardMaterial;
  private readonly glyphMaterial: THREE.MeshStandardMaterial;
  private readonly light: THREE.PointLight;
  private readonly orbitMotes: THREE.Points;
  private readonly orbitMoteMaterial: THREE.PointsMaterial;
  private scanned = false;

  constructor(readonly definition: AtlasRouteBeaconDefinition) {
    this.group.name = definition.name;
    this.group.visible = false;

    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x263038, roughness: 0.6, metalness: 0.78 });
    const mastMetal = new THREE.MeshStandardMaterial({ color: 0x7a868f, roughness: 0.4, metalness: 0.7 });
    this.ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a3b42,
      emissive: DORMANT.clone(),
      emissiveIntensity: 0.18,
      roughness: 0.34,
      metalness: 0.5
    });
    this.vaneMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a6b73,
      emissive: DORMANT.clone(),
      emissiveIntensity: 0.1,
      roughness: 0.4,
      metalness: 0.55
    });

    // Contact shadow + dust skirt so the pillar sits in the terrain.
    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 16),
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
    const dustSkirt = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.85, 16),
      new THREE.MeshStandardMaterial({ color: 0x2a251f, roughness: 0.98, metalness: 0, transparent: true, opacity: 0.5 })
    );
    dustSkirt.rotation.x = -Math.PI / 2;
    dustSkirt.position.y = 0.04;
    this.group.add(dustSkirt);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 0.5, 8), darkMetal);
    base.position.y = 0.25;
    this.group.add(base);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 6.4, 8), mastMetal);
    mast.position.y = 3.6;
    this.group.add(mast);

    // Subtle Atlas glyph strips running up the mast, barely lit.
    this.glyphMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e2a2c,
      emissive: DORMANT.clone(),
      emissiveIntensity: 0.06,
      roughness: 0.4,
      metalness: 0.4
    });
    for (let i = 0; i < 3; i += 1) {
      const angle = i * ((Math.PI * 2) / 3) + 0.5;
      const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.2, 0.02), this.glyphMaterial);
      glyph.position.set(Math.cos(angle) * 0.26, 2.6 + i * 0.4, Math.sin(angle) * 0.26);
      glyph.rotation.y = -angle;
      this.group.add(glyph);
    }

    // Lit navigation ring near the top.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.1, 8, 20), this.ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 5.6;
    this.group.add(ring);

    // Directional vane pointing down-route (toward -Z / Aurora).
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.4), this.vaneMaterial);
    vane.position.set(0, 6.6, -0.4);
    this.group.add(vane);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), mastMetal);
    cap.position.y = 7.1;
    this.group.add(cap);

    this.light = new THREE.PointLight(DORMANT.getHex(), 0.25, 26, 1.8);
    this.light.position.y = 5.6;
    this.group.add(this.light);

    // Three tiny motes orbiting the navigation ring.
    const orbitPositions = new Float32Array(9);
    const orbitGeometry = new THREE.BufferGeometry();
    orbitGeometry.setAttribute('position', new THREE.BufferAttribute(orbitPositions, 3));
    orbitGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5.6, 0), 3);
    this.orbitMoteMaterial = new THREE.PointsMaterial({
      color: DORMANT.getHex(),
      size: 0.16,
      map: createSoftParticleTexture(32),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.orbitMotes = new THREE.Points(orbitGeometry, this.orbitMoteMaterial);
    this.group.add(this.orbitMotes);

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.frustumCulled = false;
    });
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.interactionPosition.set(x, y + 0.2, z);
  }

  restore(visible: boolean, scanned: boolean): void {
    this.group.visible = visible;
    this.scanned = scanned;
    const color = scanned ? CONFIRMED : DORMANT;
    this.ringMaterial.emissive.copy(color);
    this.vaneMaterial.emissive.copy(color);
    this.light.color.copy(color);
    this.ringMaterial.emissiveIntensity = scanned ? 0.7 : 0.18;
    this.light.intensity = scanned ? 0.75 : 0.25;
  }

  markScanned(): void {
    this.scanned = true;
    this.ringMaterial.emissive.copy(CONFIRMED);
    this.vaneMaterial.emissive.copy(CONFIRMED);
    this.light.color.copy(CONFIRMED);
    this.ringMaterial.emissiveIntensity = 0.85;
    this.light.intensity = 0.9;
  }

  update(elapsed: number, active: boolean): void {
    if (!this.group.visible) return;
    const pulse = 0.5 + Math.sin(elapsed * (this.scanned ? 1.6 : active ? 3.0 : 1.1)) * 0.5;
    this.ringMaterial.emissiveIntensity = this.scanned ? 0.55 + pulse * 0.3 : active ? 0.2 + pulse * 0.28 : 0.14 + pulse * 0.08;
    this.vaneMaterial.emissiveIntensity = this.scanned ? 0.3 + pulse * 0.12 : 0.08 + pulse * 0.06;
    this.glyphMaterial.emissiveIntensity = this.scanned ? 0.24 + pulse * 0.08 : active ? 0.1 + pulse * 0.05 : 0.05;
    this.light.intensity = this.scanned ? 0.6 + pulse * 0.4 : active ? 0.3 + pulse * 0.3 : 0.2 + pulse * 0.1;

    // Orbit motes circle the navigation ring, faster when the beacon is the
    // active route target.
    const orbitSpeed = this.scanned ? 0.5 : active ? 1.1 : 0.3;
    const orbitPositions = this.orbitMotes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < 3; i += 1) {
      const phase = elapsed * orbitSpeed + i * ((Math.PI * 2) / 3);
      orbitPositions.setXYZ(i, Math.cos(phase) * 0.85, 5.6 + Math.sin(phase * 2) * 0.12, Math.sin(phase) * 0.85);
    }
    orbitPositions.needsUpdate = true;
    this.orbitMoteMaterial.color.copy(this.scanned ? CONFIRMED : DORMANT);
    this.orbitMoteMaterial.opacity = this.scanned ? 0.5 : active ? 0.45 : 0.22;
  }
}
