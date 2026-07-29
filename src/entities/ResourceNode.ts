import * as THREE from 'three';
import { createRockGeometry } from './AsteroidField';
import { createSoftParticleTexture, createWaterNormalTexture } from '../assets/materials';
import type { ResourceSiteStatus, SurfaceResourceDefinition } from '../assets/surfaceResourceDefinitions';

const TYPE_COLORS: Record<string, number> = {
  water: 0x4fc3e8,
  minerals: 0xd88a2e,
  energy: 0xff6a3a,
  organic: 0x5fd98a,
  ancient: 0x59c8dc
};

/**
 * Surface resource deposits woven into the terrain instead of glowing
 * primitives: damp frost pans, veined outcrops, steaming vents, lichen
 * colonies and Atlas ceramic shards. Each carries a small holographic
 * survey tag so the scanner HUD and the world agree.
 */
export class ResourceNode {
  readonly group = new THREE.Group();
  readonly interactionPosition = new THREE.Vector3();
  scanned = false;
  scanProgress = 0;
  status: ResourceSiteStatus = 'unknown';

  private readonly glowMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly glowBaseIntensities: number[] = [];
  private readonly mineralSeamMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly pointLight: THREE.PointLight;
  private readonly tagMaterial: THREE.SpriteMaterial;
  private readonly particles?: THREE.Points;
  private readonly particleSeeds?: Float32Array;
  private readonly particleStyle: 'vapor' | 'steam' | 'specks' | 'none';
  private waterSurface?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private waterRipple?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private waterNormalTexture?: THREE.CanvasTexture;
  private geothermalShimmer?: THREE.Sprite;
  private emberSparks?: THREE.Points;
  private emberSeeds?: Float32Array;
  private feedbackPulse = 0;
  private lastUpdateElapsed = 0;

  constructor(
    readonly definition: SurfaceResourceDefinition,
    position: THREE.Vector3,
    interactionPosition = position
  ) {
    this.group.name = `ResourceNode (${definition.id})`;
    this.group.position.copy(position);
    this.group.rotation.y = definition.visualRotation ?? 0;
    this.interactionPosition.copy(interactionPosition);

    const color = TYPE_COLORS[definition.type] ?? 0x4fc3e8;

    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a352e,
      roughness: 0.92,
      metalness: 0.05
    });

    this.particleStyle =
      definition.type === 'water' ? 'vapor' : definition.type === 'energy' ? 'steam' : definition.type === 'organic' ? 'specks' : 'none';

    switch (definition.type) {
      case 'water': {
        // Authored lagoon footprint: a broad reflective water surface and a
        // damp shoreline that reads as a place, not a pickup marker.
        const shore = new THREE.Mesh(
          new THREE.RingGeometry(16.5, 21, 40),
          new THREE.MeshStandardMaterial({ color: 0x26343a, roughness: 0.82, metalness: 0.04 })
        );
        shore.rotation.x = -Math.PI / 2;
        shore.position.y = 0.04;
        this.group.add(shore);
        // Baked ripple normal map, scrolled at runtime: the lagoon catches
        // the sun as drifting micro-facets instead of a static sheet.
        this.waterNormalTexture = createWaterNormalTexture(128);
        this.waterNormalTexture.repeat.set(2.5, 2.5);
        const waterMaterial = new THREE.MeshStandardMaterial({
          color: 0x2f6674,
          roughness: 0.16,
          metalness: 0.08,
          transparent: true,
          opacity: 0.88,
          envMapIntensity: 1.2,
          normalMap: this.waterNormalTexture,
          normalScale: new THREE.Vector2(0.26, 0.26)
        });
        const pan = new THREE.Mesh(new THREE.CircleGeometry(18, 48), waterMaterial);
        pan.rotation.x = -Math.PI / 2;
        pan.position.y = 0.1;
        this.waterSurface = pan;
        this.group.add(pan);

        const rippleMaterial = new THREE.MeshBasicMaterial({
          color: 0xa8eeff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const ripple = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.7, 32), rippleMaterial);
        ripple.rotation.x = -Math.PI / 2;
        ripple.position.y = 0.14;
        ripple.visible = false;
        this.waterRipple = ripple;
        this.group.add(ripple);

        const frost = new THREE.MeshStandardMaterial({
          color: 0xbfe4f0,
          emissive: color,
          emissiveIntensity: 0.25,
          roughness: 0.25,
          metalness: 0.1,
          transparent: true,
          opacity: 0.85
        });
        this.registerGlowMaterial(frost);
        for (let i = 0; i < 12; i += 1) {
          const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.22;
          const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.24 + Math.random() * 0.2, 0.8 + Math.random() * 0.7, 5), frost);
          crystal.position.set(Math.cos(angle) * (18 + Math.random() * 2), 0.3, Math.sin(angle) * (18 + Math.random() * 2));
          crystal.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
          this.group.add(crystal);
        }
        break;
      }

      case 'minerals': {
        // Veta Ferrita: a stratified outcrop wall with a shared geological
        // dip. Bedding slabs stack into a cliff silhouette, one dark
        // metallic seam runs diagonally through the strata, and fallen
        // fragments collect at the foot. Authored formation, not a pile.
        const dip = 0.22;
        const strataWall = new THREE.Group();
        strataWall.name = 'Veta Ferrita Strata Wall';
        for (let i = 0; i < 4; i += 1) {
          // Strong tone alternation and lateral stepping so the bedding
          // reads as distinct strata even under flat light.
          const layerTone = new THREE.Color().setHSL(0.08, 0.12, 0.16 + (i % 2) * 0.1);
          const layer = new THREE.Mesh(
            createRockGeometry(101 + i * 13.7, 2),
            new THREE.MeshStandardMaterial({ color: layerTone, roughness: 0.93, metalness: 0.06 })
          );
          layer.scale.set(4.4 - i * 0.55, 1.05 + (i % 2) * 0.2, 2.1 - i * 0.22);
          layer.position.set(i * 0.85, 0.9 + i * 1.5, -i * 0.3);
          layer.rotation.z = dip;
          layer.rotation.y = (i % 2) * 0.12;
          strataWall.add(layer);
        }
        strataWall.rotation.y = 0.6;
        this.group.add(strataWall);

        // Exposed ferrite seam following the dip: dark ore, dull amber heat.
        const veinTemplate = new THREE.MeshStandardMaterial({
          color: 0x3a2c1e,
          emissive: color,
          emissiveIntensity: 0.32,
          roughness: 0.34,
          metalness: 0.9
        });
        for (let i = 0; i < 7; i += 1) {
          const veinMaterial = veinTemplate.clone();
          this.registerGlowMaterial(veinMaterial);
          this.mineralSeamMaterials.push(veinMaterial);
          const segment = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.24, 0.34), veinMaterial);
          const along = -2.6 + i * 0.92;
          segment.position.set(along * Math.cos(0.6), 2 + along * dip * 1.35, -along * Math.sin(0.6) + 1.15);
          segment.rotation.set(0, 0.6 + (Math.random() - 0.5) * 0.14, dip);
          this.group.add(segment);
        }

        // Talus at the base: fragments broken off the seam face.
        for (let i = 0; i < 5; i += 1) {
          const fragment = new THREE.Mesh(createRockGeometry(160 + i * 7.9, 1), rockMaterial);
          fragment.scale.setScalar(0.5 + Math.random() * 0.9);
          fragment.position.set((Math.random() - 0.5) * 6.5, 0.3, 2 + Math.random() * 2.6);
          fragment.rotation.y = Math.random() * Math.PI;
          this.group.add(fragment);
        }
        break;
      }

      case 'energy': {
        // Fisura Geotérmica: a linear fissure, not a point vent. Two rock
        // lips flank a glowing crack; vents breathe steam along its length
        // over scorched ground. Reads as tapped planetary heat.
        const scorch = new THREE.Mesh(
          new THREE.CircleGeometry(7.5, 26),
          new THREE.MeshStandardMaterial({ color: 0x1a1310, roughness: 0.98, metalness: 0 })
        );
        scorch.rotation.x = -Math.PI / 2;
        scorch.rotation.z = 0.3;
        scorch.scale.set(1.6, 1, 0.62);
        scorch.position.y = 0.05;
        this.group.add(scorch);

        for (const side of [-1, 1]) {
          const lip = new THREE.Mesh(createRockGeometry(313.9 + side * 11.1, 2), rockMaterial);
          lip.scale.set(5.4, 1.15, 1.35);
          lip.position.set(side * 0.35, 0.55, side * 1.28);
          lip.rotation.y = 0.3 + side * 0.05;
          this.group.add(lip);
        }

        // Molten interior visible between the lips.
        const ember = new THREE.MeshStandardMaterial({
          color: 0x2a1008,
          emissive: color,
          emissiveIntensity: 1.05,
          roughness: 0.55
        });
        this.registerGlowMaterial(ember);
        for (let i = 0; i < 3; i += 1) {
          const crack = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.3, 0.85), ember);
          const along = -3.4 + i * 3.4;
          crack.position.set(along * Math.cos(0.3), 0.24, -along * Math.sin(0.3));
          crack.rotation.y = 0.3 + (i - 1) * 0.09;
          this.group.add(crack);
        }

        // Heat shimmer hovering over the crack line.
        const shimmer = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: createSoftParticleTexture(96),
            color: 0xff8a4a,
            transparent: true,
            opacity: 0.12,
            depthWrite: false,
            blending: THREE.AdditiveBlending
          })
        );
        shimmer.position.y = 1.6;
        shimmer.scale.set(9, 2.6, 1);
        this.geothermalShimmer = shimmer;
        this.group.add(shimmer);

        // Occasional tiny embers popping out of the crack line: six points
        // on staggered deterministic cycles, parked underground between pops.
        const emberCount = 6;
        const emberPositions = new Float32Array(emberCount * 3);
        this.emberSeeds = new Float32Array(emberCount * 3);
        for (let i = 0; i < emberCount; i += 1) {
          const along = (Math.random() - 0.5) * 7.2;
          this.emberSeeds[i * 3] = along * Math.cos(0.3);
          this.emberSeeds[i * 3 + 1] = Math.random();
          this.emberSeeds[i * 3 + 2] = -along * Math.sin(0.3);
          emberPositions[i * 3 + 1] = -6;
        }
        const emberGeometry = new THREE.BufferGeometry();
        emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
        emberGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 10);
        this.emberSparks = new THREE.Points(
          emberGeometry,
          new THREE.PointsMaterial({
            color: 0xffb36a,
            size: 0.3,
            map: createSoftParticleTexture(48),
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            blending: THREE.AdditiveBlending
          })
        );
        this.group.add(this.emberSparks);
        break;
      }

      case 'organic': {
        // Lichen colony: mossy pads clustered against a sheltering stone.
        const shelter = new THREE.Mesh(createRockGeometry(517.3, 1), rockMaterial);
        shelter.scale.set(1.6, 1.1, 1.4);
        shelter.position.set(1.2, 0.5, -0.8);
        this.group.add(shelter);

        const moss = new THREE.MeshStandardMaterial({
          color: 0x2f5a3d,
          emissive: 0x1d4d2c,
          emissiveIntensity: 0.3,
          roughness: 0.85
        });
        this.registerGlowMaterial(moss);
        for (let i = 0; i < 7; i += 1) {
          const pad = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), moss);
          pad.scale.y = 0.4;
          pad.position.set((Math.random() - 0.5) * 4.4, 0.08, (Math.random() - 0.5) * 4.4);
          this.group.add(pad);
        }
        break;
      }

      default: {
        // Ancient residue: fractured ceramic slabs with cyan glyph seams.
        const ceramic = new THREE.MeshStandardMaterial({
          color: 0x2a2d33,
          roughness: 0.35,
          metalness: 0.55
        });
        for (let i = 0; i < 3; i += 1) {
          const slab = new THREE.Mesh(new THREE.BoxGeometry(1.6 + Math.random(), 0.28, 1.1 + Math.random() * 0.8), ceramic);
          slab.position.set((Math.random() - 0.5) * 3.2, 0.3 + i * 0.16, (Math.random() - 0.5) * 3.2);
          slab.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI, (Math.random() - 0.5) * 0.4);
          this.group.add(slab);
        }
        const glyph = new THREE.MeshStandardMaterial({
          color: 0x16333a,
          emissive: color,
          emissiveIntensity: 0.7,
          roughness: 0.3
        });
        this.registerGlowMaterial(glyph);
        for (let i = 0; i < 4; i += 1) {
          const seam = new THREE.Mesh(new THREE.BoxGeometry(0.9 + Math.random() * 0.7, 0.05, 0.09), glyph);
          seam.position.set((Math.random() - 0.5) * 2.8, 0.52 + i * 0.14, (Math.random() - 0.5) * 2.8);
          seam.rotation.y = Math.random() * Math.PI;
          this.group.add(seam);
        }
        break;
      }
    }

    // Vapor / steam / bioluminescent specks, animated deterministically.
    if (this.particleStyle !== 'none') {
      const count = this.particleStyle === 'steam' ? 18 : 10;
      const positions = new Float32Array(count * 3);
      this.particleSeeds = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        if (this.particleStyle === 'steam') {
          // Vents breathe along the whole fissure line, not from one point.
          const along = (Math.random() - 0.5) * 8.4;
          this.particleSeeds[i * 3] = along * Math.cos(0.3);
          this.particleSeeds[i * 3 + 1] = Math.random() * Math.PI * 2;
          this.particleSeeds[i * 3 + 2] = -along * Math.sin(0.3) + (Math.random() - 0.5) * 0.8;
        } else {
          this.particleSeeds[i * 3] = (Math.random() - 0.5) * (this.particleStyle === 'specks' ? 4.2 : 1.6);
          this.particleSeeds[i * 3 + 1] = Math.random() * Math.PI * 2;
          this.particleSeeds[i * 3 + 2] = (Math.random() - 0.5) * (this.particleStyle === 'specks' ? 4.2 : 1.6);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.5, 0), 12);
      const material = new THREE.PointsMaterial({
        color: this.particleStyle === 'steam' ? 0xd8b9a0 : color,
        size: this.particleStyle === 'specks' ? 0.5 : 1.1,
        map: createSoftParticleTexture(48),
        transparent: true,
        opacity: this.particleStyle === 'steam' ? 0.3 : 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      this.particles = new THREE.Points(geometry, material);
      this.particles.frustumCulled = true;
      this.group.add(this.particles);
    }

    // Holographic survey tag: small, flickering, HUD-linked.
    this.tagMaterial = new THREE.SpriteMaterial({
      map: createSoftParticleTexture(64),
      color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const tag = new THREE.Sprite(this.tagMaterial);
    tag.position.y = 6.5;
    tag.scale.setScalar(2.4);
    this.group.add(tag);

    this.pointLight = new THREE.PointLight(color, 0.8, 22, 1.9);
    this.pointLight.position.y = 2.4;
    this.group.add(this.pointLight);
    this.setStatus('unknown');
  }

  anchorToTerrain(getGroundHeight: (x: number, z: number) => number): void {
    const [siteX, siteZ] = this.definition.position;
    const targetX = siteX + this.definition.sampleOffset[0];
    const targetZ = siteZ + this.definition.sampleOffset[1];
    this.group.position.set(siteX, getGroundHeight(siteX, siteZ), siteZ);
    this.interactionPosition.set(targetX, getGroundHeight(targetX, targetZ) + 0.18, targetZ);
  }

  get lagoonWaterAnimated(): boolean {
    return Boolean(this.waterSurface);
  }

  get lagoonWaterFxCost(): number {
    return this.waterSurface ? 1 : 0;
  }

  get hasActiveFeedback(): boolean {
    return this.feedbackPulse > 0.015;
  }

  triggerSampleFeedback(): void {
    this.feedbackPulse = 1;
  }

  private registerGlowMaterial(material: THREE.MeshStandardMaterial): void {
    this.glowMaterials.push(material);
    this.glowBaseIntensities.push(material.emissiveIntensity);
  }

  private getStatusGlowScale(): number {
    if (this.status === 'unknown') return 0.34;
    if (this.status === 'detected') return 0.62;
    if (this.status === 'located') return 1;
    if (this.status === 'sampled') return 0.48;
    return 0.34;
  }

  setStatus(status: ResourceSiteStatus): void {
    this.status = status;
    this.scanned = status === 'sampled' || status === 'analyzed';
    const glowScale = this.getStatusGlowScale();
    for (let i = 0; i < this.glowMaterials.length; i += 1) {
      this.glowMaterials[i].emissiveIntensity = this.glowBaseIntensities[i] * glowScale;
    }
    if (status === 'unknown') {
      this.tagMaterial.opacity = 0;
      this.pointLight.intensity = 0;
    } else if (status === 'detected') {
      this.tagMaterial.color.setHex(TYPE_COLORS[this.definition.type] ?? 0x4fc3e8);
      this.tagMaterial.opacity = 0.36;
      this.pointLight.intensity = 0.28;
    } else if (status === 'located') {
      this.tagMaterial.color.setHex(0xffe184);
      this.tagMaterial.opacity = 0.66;
      this.pointLight.intensity = 0.75;
    } else {
      this.tagMaterial.color.setHex(status === 'analyzed' ? 0x9fffe0 : 0xe8f8ff);
      this.tagMaterial.opacity = status === 'analyzed' ? 0.2 : 0.32;
      this.pointLight.intensity = status === 'analyzed' ? 0.18 : 0.3;
    }
  }

  scan(delta: number): boolean {
    if (this.scanned) return true;
    this.scanProgress = Math.min(100, this.scanProgress + delta * 55);
    if (this.scanProgress >= 100) {
      this.setStatus('sampled');
      this.triggerSampleFeedback();
      return true;
    }
    return false;
  }

  update(elapsed: number): void {
    const phase = this.group.position.x;
    const delta = this.lastUpdateElapsed > 0 ? THREE.MathUtils.clamp(elapsed - this.lastUpdateElapsed, 0, 0.1) : 0;
    this.lastUpdateElapsed = elapsed;
    if (this.feedbackPulse > 0) this.feedbackPulse = Math.max(0, this.feedbackPulse - delta / 1.8);

    if (this.status === 'detected' || this.status === 'located') {
      // Signal flicker: two incommensurate sines, like the nav pings.
      const flicker = 0.5 + 0.24 * Math.sin(elapsed * 3.1 + phase) * Math.sin(elapsed * 7.7 + phase);
      this.tagMaterial.opacity = flicker;
      this.pointLight.intensity = 0.55 + flicker * 0.5;
    }

    if (this.waterSurface) {
      const shimmer = Math.sin(elapsed * 0.72 + phase * 0.01);
      const crossRipple = Math.sin(elapsed * 1.08 - phase * 0.008);
      this.waterSurface.position.y = 0.1 + shimmer * 0.012;
      this.waterSurface.scale.set(1 + shimmer * 0.0018, 1 + crossRipple * 0.0015, 1);
      this.waterSurface.material.roughness = 0.15 + crossRipple * 0.018;
      this.waterSurface.material.opacity = 0.875 + shimmer * 0.018 + this.feedbackPulse * 0.035;
      if (this.waterNormalTexture) {
        // Two incommensurate scroll speeds so the ripple field never loops
        // visibly; the scan pulse briefly roughens the whole surface.
        this.waterNormalTexture.offset.set(elapsed * 0.0085, elapsed * 0.0121);
        this.waterSurface.material.normalScale.setScalar(0.26 + this.feedbackPulse * 0.34);
      }
    }

    if (this.waterRipple) {
      const rippleProgress = 1 - this.feedbackPulse;
      this.waterRipple.visible = this.feedbackPulse > 0.015;
      this.waterRipple.scale.setScalar(0.75 + rippleProgress * 1.9);
      this.waterRipple.material.opacity = this.feedbackPulse * 0.3;
    }

    if (this.mineralSeamMaterials.length > 0) {
      const sweep = (1 - this.feedbackPulse) * (this.mineralSeamMaterials.length + 1);
      const stateScale = this.getStatusGlowScale();
      for (let i = 0; i < this.mineralSeamMaterials.length; i += 1) {
        const wave = this.feedbackPulse > 0 ? Math.max(0, 1 - Math.abs(i - sweep) / 1.55) : 0;
        const base = this.glowBaseIntensities[this.glowMaterials.indexOf(this.mineralSeamMaterials[i])] ?? 0.32;
        this.mineralSeamMaterials[i].emissiveIntensity = base * stateScale + wave * 0.92;
      }
    }

    if (this.emberSparks && this.emberSeeds) {
      // Each ember pops for a short window of its own cycle, rising and
      // drifting with the vent wind, then parks underground until the next.
      const emberPositions = this.emberSparks.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < emberPositions.count; i += 1) {
        const cycle = (elapsed * (0.21 + (i % 3) * 0.06) + this.emberSeeds[i * 3 + 1]) % 1;
        if (cycle < 0.16) {
          const rise = cycle / 0.16;
          emberPositions.setXYZ(
            i,
            this.emberSeeds[i * 3] + rise * 0.5,
            0.28 + rise * 1.5,
            this.emberSeeds[i * 3 + 2] + rise * 0.2
          );
        } else {
          emberPositions.setY(i, -6);
        }
      }
      emberPositions.needsUpdate = true;
    }

    if (this.geothermalShimmer) {
      const material = this.geothermalShimmer.material as THREE.SpriteMaterial;
      material.opacity = 0.1 + Math.sin(elapsed * 1.35) * 0.018 + this.feedbackPulse * 0.24;
      this.geothermalShimmer.scale.set(9 + this.feedbackPulse * 1.2, 2.6 + this.feedbackPulse * 0.7, 1);
    }

    if (this.particles && this.particleSeeds) {
      if (this.particleStyle === 'steam') {
        (this.particles.material as THREE.PointsMaterial).opacity = 0.3 + this.feedbackPulse * 0.22;
      }
      const positions = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i += 1) {
        const seedPhase = this.particleSeeds[i * 3 + 1];
        if (this.particleStyle === 'specks') {
          // Fireflies hovering over the lichen pads.
          positions.setXYZ(
            i,
            this.particleSeeds[i * 3] + Math.sin(elapsed * 0.7 + seedPhase) * 0.5,
            0.6 + Math.sin(elapsed * 1.1 + seedPhase * 2) * 0.4 + 0.4,
            this.particleSeeds[i * 3 + 2] + Math.cos(elapsed * 0.6 + seedPhase) * 0.5
          );
        } else {
          // Vapor / steam column rising on a loop, drifting with the wind.
          // Fissure steam rises from ground level along the crack line.
          const speed = this.particleStyle === 'steam' ? 1.7 : 0.8;
          const height = this.particleStyle === 'steam' ? 5.2 : 3.2;
          const base = this.particleStyle === 'steam' ? 0.5 : 0.4;
          const t = ((elapsed * speed + seedPhase) % height);
          positions.setXYZ(
            i,
            this.particleSeeds[i * 3] + t * 0.24 + Math.sin(elapsed * 2 + seedPhase) * 0.12,
            base + t,
            this.particleSeeds[i * 3 + 2] + t * 0.1
          );
        }
      }
      positions.needsUpdate = true;
    }
  }
}
