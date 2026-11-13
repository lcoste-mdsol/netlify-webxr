import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { convertBm3UrlToGlbBlob } from './bm3Converter.ts';
import { Startup } from '../types.ts';

export class VirtualTwinOverlay extends THREE.Group {
  public modelGroup: THREE.Group;
  public pedestalGroup: THREE.Group;
  public currentModel: THREE.Group | null = null;
  public currentStartup: Startup | null = null;
  public isAnimating = true;
  private mixer: THREE.AnimationMixer | null = null;
  private baseElevation = 1.35;
  private animTime = 0;
  private glowRing: THREE.Mesh | null = null;
  private activeLoadToken = 0;

  constructor() {
    super();
    this.name = 'VirtualTwinOverlayRoot';

    // Pedestal holographic base
    this.pedestalGroup = new THREE.Group();
    this.createPedestal();
    this.add(this.pedestalGroup);

    // Interactive model group with manipulation
    this.modelGroup = new THREE.Group();
    (this.modelGroup as any).xb = { manipulation: true };
    this.modelGroup.position.set(0, this.baseElevation, -1.05);
    this.add(this.modelGroup);
  }

  private createPedestal() {
    // Holographic floor ring
    const ringGeo = new THREE.RingGeometry(0.28, 0.32, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    this.glowRing = new THREE.Mesh(ringGeo, ringMat);
    this.glowRing.position.set(0, this.baseElevation - 0.28, -1.05);
    (this.glowRing as any).xb = { pointerEvents: 'none' };
    this.pedestalGroup.add(this.glowRing);

    // Subtle dashed outer ring
    const outerRingGeo = new THREE.RingGeometry(0.36, 0.37, 48);
    outerRingGeo.rotateX(-Math.PI / 2);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: 0x818cf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRing.position.set(0, this.baseElevation - 0.28, -1.05);
    (outerRing as any).xb = { pointerEvents: 'none' };
    this.pedestalGroup.add(outerRing);

    this.pedestalGroup.visible = false;
  }

  async loadStartupModel(startup: Startup, onProgress?: (msg: string) => void): Promise<boolean> {
    const loadToken = ++this.activeLoadToken;

    if (!startup.highQualityURL) {
      // If no BM3 URL, generate an impressive procedural 3D holographic prototype representation
      this.loadProceduralHologram(startup);
      return true;
    }

    onProgress?.(`Fetching ${startup.name} CAD BM3 geometry...`);

    try {
      onProgress?.('Decompressing BM3 archive & compiling GLB in memory...');
      const glbBlob = await convertBm3UrlToGlbBlob(startup.highQualityURL);
      if (loadToken !== this.activeLoadToken) return false;

      const arrayBuffer = await glbBlob.arrayBuffer();
      if (loadToken !== this.activeLoadToken) return false;

      onProgress?.('Parsing binary GLTF into WebXR scene...');
      return new Promise<boolean>((resolve) => {
        const loader = new GLTFLoader();
        loader.parse(
          arrayBuffer,
          '',
          (gltf) => {
            if (loadToken !== this.activeLoadToken) {
              resolve(false);
              return;
            }
            this.clearCurrentModel();
            this.currentStartup = startup;
            this.currentModel = gltf.scene;

            // Auto-normalize bounding box to realistic table-top scale (~0.55m max dimension)
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const targetScale = maxDim > 0 ? 0.52 / maxDim : 1;
            gltf.scene.scale.setScalar(targetScale);

            // Center geometry
            const center = box.getCenter(new THREE.Vector3());
            gltf.scene.position.sub(center.multiplyScalar(targetScale));

            // Enable shadows
            gltf.scene.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });

            // Handle animations
            if (gltf.animations && gltf.animations.length > 0) {
              this.mixer = new THREE.AnimationMixer(gltf.scene);
              gltf.animations.forEach((clip) => {
                this.mixer?.clipAction(clip).play();
              });
            }

            this.modelGroup.add(gltf.scene);
            this.pedestalGroup.visible = true;
            this.visible = true;
            resolve(true);
          },
          (error) => {
            if (loadToken !== this.activeLoadToken) {
              resolve(false);
              return;
            }
            console.error('Error parsing GLTF:', error);
            this.loadProceduralHologram(startup);
            resolve(true);
          }
        );
      });
    } catch (err) {
      if (loadToken !== this.activeLoadToken) return false;
      console.error('Failed to convert or load 3D model:', err);
      this.loadProceduralHologram(startup);
      return true;
    }
  }

  loadProceduralHologram(startup: Startup) {
    this.clearCurrentModel();
    this.currentStartup = startup;

    const group = new THREE.Group();

    // Pick visual geometry based on category / type
    let mainGeometry: THREE.BufferGeometry;
    let color = 0x38bdf8;

    if (startup.typeID === 172) {
      // Life: organic capsule or bio-structure
      mainGeometry = new THREE.CapsuleGeometry(0.12, 0.22, 16, 32);
      color = 0x34d399;
    } else if (startup.typeID === 27) {
      // Nature / Energy: undulating membrane or torus knot
      mainGeometry = new THREE.TorusKnotGeometry(0.12, 0.04, 96, 24);
      color = 0x38bdf8;
    } else {
      // Product / Deep Tech: precision faceted icosahedron
      mainGeometry = new THREE.IcosahedronGeometry(0.18, 2);
      color = 0xa78bfa;
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.2,
      metalness: 0.8,
      wireframe: false,
    });
    const mainMesh = new THREE.Mesh(mainGeometry, material);
    mainMesh.castShadow = true;
    group.add(mainMesh);

    // Glowing wireframe aura
    const wireframeMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });
    const wireMesh = new THREE.Mesh(mainGeometry, wireframeMat);
    wireMesh.scale.setScalar(1.03);
    group.add(wireMesh);

    this.currentModel = group;
    this.modelGroup.add(group);
    this.pedestalGroup.visible = true;
    this.visible = true;
  }

  adjustScale(multiplier: number) {
    this.modelGroup.scale.multiplyScalar(multiplier);
  }

  adjustElevation(delta: number) {
    this.baseElevation += delta;
    this.modelGroup.position.y = this.baseElevation;
    if (this.glowRing) {
      this.glowRing.position.y = this.baseElevation - 0.28;
    }
  }

  toggleAnimation() {
    this.isAnimating = !this.isAnimating;
    return this.isAnimating;
  }

  private clearCurrentModel() {
    if (this.currentModel) {
      this.modelGroup.remove(this.currentModel);
      this.currentModel = null;
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.pedestalGroup.visible = false;
    this.currentStartup = null;
    this.modelGroup.scale.set(1, 1, 1);
    this.baseElevation = 1.35;
    this.modelGroup.position.set(0, this.baseElevation, -1.05);
    this.modelGroup.rotation.set(0, 0, 0);
  }

  dismiss() {
    this.activeLoadToken++;
    this.clearCurrentModel();
  }

  update(delta: number) {
    if (this.mixer && this.isAnimating) {
      this.mixer.update(delta);
    }

    if (this.currentModel && this.isAnimating) {
      this.animTime += delta;
      this.modelGroup.rotation.y += delta * 0.45;
      this.modelGroup.position.y = this.baseElevation + Math.sin(this.animTime * 2.2) * 0.02;
    }

    if (this.glowRing && this.pedestalGroup.visible) {
      this.glowRing.rotation.z += delta * 0.3;
    }
  }

  dispose() {
    this.dismiss();
    this.clear();
  }
}
