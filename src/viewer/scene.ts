import * as THREE from "three";

export interface ViewerScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Lokomotion bewegt immer das Rig, nie die Kamera (in VR gehört die Pose dem Headset). */
  rig: THREE.Group;
  canvas: HTMLCanvasElement;
}

export function createViewerScene(container: HTMLElement): ViewerScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setFoveation(1.0);
  renderer.xr.setFramebufferScaleFactor(0.9);
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14171c);

  const camera = new THREE.PerspectiveCamera(
    65,
    window.innerWidth / window.innerHeight,
    0.1,
    2000,
  );
  camera.position.set(12, 10, 12);

  const rig = new THREE.Group();
  rig.name = "rig";
  rig.add(camera);
  scene.add(rig);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(40, 80, 20);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.6);
  fill.position.set(-30, 20, -40);
  scene.add(fill);

  const grid = new THREE.GridHelper(100, 100, 0x38b2ac, 0x2a323d);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  grid.name = "grid";
  scene.add(grid);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, rig, canvas: renderer.domElement };
}
