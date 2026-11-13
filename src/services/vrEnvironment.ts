import * as THREE from 'three';

export class VREnvironmentManager {
  private scene: THREE.Scene;
  public currentMode: 'AR' | 'VR' = 'AR';
  private currentCategory = 'all';

  private envGroup: THREE.Group;
  private domeMaterial!: THREE.MeshBasicMaterial;
  private skyDome!: THREE.Mesh;
  private gridFloor!: THREE.GridHelper;
  private ambientParticles!: THREE.Points;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.envGroup = new THREE.Group();
    this.envGroup.name = 'VREnvironmentGroup';
    (this.envGroup as any).xb = { pointerEvents: 'none' };
    this.envGroup.visible = false;
    this.scene.add(this.envGroup);

    this.buildEnvironment();
  }

  private buildEnvironment() {
    const domeGeo = new THREE.SphereGeometry(45, 32, 16);
    this.domeMaterial = new THREE.MeshBasicMaterial({
      color: 0x050d1a,
      side: THREE.BackSide,
      fog: false,
    });
    this.skyDome = new THREE.Mesh(domeGeo, this.domeMaterial);
    this.envGroup.add(this.skyDome);

    this.gridFloor = new THREE.GridHelper(30, 60, 0x38bdf8, 0x1e293b);
    this.gridFloor.position.y = -0.01;
    this.envGroup.add(this.gridFloor);

    const particleCount = 200;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 16;
      positions[i + 1] = Math.random() * 6;
      positions[i + 2] = (Math.random() - 0.5) * 16;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.04,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
    });
    this.ambientParticles = new THREE.Points(particleGeo, particleMat);
    this.envGroup.add(this.ambientParticles);
  }

  setMode(mode: 'AR' | 'VR', category?: string) {
    this.currentMode = mode;
    if (category) this.currentCategory = category;

    if (mode === 'VR') {
      this.applyCategoryStyling();
      this.envGroup.visible = true;
    } else {
      this.envGroup.visible = false;
    }
  }

  setCategory(category: string) {
    this.currentCategory = category;
    if (this.currentMode === 'VR') {
      this.applyCategoryStyling();
    }
  }

  private applyCategoryStyling() {
    const cat = String(this.currentCategory);
    const particleMat = this.ambientParticles.material as THREE.PointsMaterial;
    if (cat === '172' || cat.toLowerCase() === 'life') {
      this.domeMaterial.color.setHex(0x021827);
      particleMat.color.setHex(0x34d399);
    } else if (cat === '27' || cat.toLowerCase() === 'nature') {
      this.domeMaterial.color.setHex(0x04242e);
      particleMat.color.setHex(0x38bdf8);
    } else {
      this.domeMaterial.color.setHex(0x0a0c16);
      particleMat.color.setHex(0xa78bfa);
    }
  }

  update(delta: number) {
    if (this.currentMode !== 'VR' || !this.envGroup.visible) return;
    this.skyDome.rotation.y += delta * 0.02;
    this.ambientParticles.rotation.y += delta * 0.015;
  }

  dispose() {
    this.scene.remove(this.envGroup);
    this.skyDome.geometry.dispose();
    this.domeMaterial.dispose();
    this.gridFloor.geometry.dispose();
    this.ambientParticles.geometry.dispose();
    (this.ambientParticles.material as THREE.Material).dispose();
  }
}
