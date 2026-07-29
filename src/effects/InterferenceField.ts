import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

export class InterferenceField {
  readonly group = new THREE.Group();

  private readonly markers: Array<{ group: THREE.Group; core: THREE.SpriteMaterial; halo: THREE.SpriteMaterial }> = [];

  constructor(positions: readonly (readonly [number, number, number])[]) {
    this.group.name = 'Ecos de la Sonda Silenciosa';
    const texture = createSoftParticleTexture(48);
    positions.forEach(([x, y, z], index) => {
      const marker = new THREE.Group();
      marker.name = `Eco de Interferencia ${index + 1}`;
      marker.position.set(x, y, z);

      const haloMaterial = new THREE.SpriteMaterial({
        map: texture,
        color: 0xd88952,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const halo = new THREE.Sprite(haloMaterial);
      halo.scale.setScalar(18);
      marker.add(halo);

      const coreMaterial = haloMaterial.clone();
      coreMaterial.color.set(0x75d9cf);
      coreMaterial.opacity = 0.35;
      const core = new THREE.Sprite(coreMaterial);
      core.scale.setScalar(5.5);
      marker.add(core);

      marker.visible = false;
      this.markers.push({ group: marker, core: coreMaterial, halo: haloMaterial });
      this.group.add(marker);
    });
  }

  getPosition(index: number): THREE.Vector3 | undefined {
    return this.markers[index]?.group.position;
  }

  sync(activeIndex: number, resolvedCount: number, visible: boolean): void {
    this.group.visible = visible;
    this.markers.forEach((marker, index) => {
      marker.group.visible = visible;
      const active = index === activeIndex;
      const resolved = index < resolvedCount;
      marker.core.color.set(resolved ? 0x4f8d82 : active ? 0x8ffff0 : 0x8a6a52);
      marker.core.opacity = resolved ? 0.12 : active ? 0.62 : 0.2;
      marker.halo.opacity = resolved ? 0.06 : active ? 0.3 : 0.12;
    });
  }

  update(elapsed: number, activeIndex: number): void {
    if (!this.group.visible) return;
    this.markers.forEach((marker, index) => {
      const pulse = index === activeIndex ? 1 + Math.sin(elapsed * 6.2) * 0.22 : 1;
      marker.group.scale.setScalar(pulse);
    });
  }
}
