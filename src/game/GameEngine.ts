import * as THREE from "three";
import {
  COMPANION_PALETTE,
  createHumanoid,
  randomEnemyPalette,
  PLAYER_PALETTE,
  type Humanoid,
} from "./characters";
import {
  createAnimal,
  createVehicle,
  type AnimalModel,
  type VehicleModel,
} from "./vehicles";
import { sfx } from "./sound";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export interface HudState {
  health: number;
  maxHealth: number;
  ammo: number;
  magSize: number;
  reserve: number;
  reloading: boolean;
  kills: number;
  score: number;
  alive: number;
  zonePhase: number;
  zoneText: string;
  inZone: boolean;
  combo: number;
  vehicleName: string | null;
  vehiclePrompt: string | null;
  vehicleSpeed: number;
  vehicleIsAir: boolean;
  companionHealth: number;
  companionMaxHealth: number;
  companionStatus: string;
  companionPrompt: string | null;
}

export interface GameResult {
  win: boolean;
  score: number;
  kills: number;
  headshots: number;
  timeMs: number;
  placement: number;
  shots: number;
  hits: number;
}

export type CameraMode = "third" | "eye";

export interface EngineCallbacks {
  onHud: (s: HudState) => void;
  onKillFeed: (msg: string, headshot: boolean) => void;
  onDamage: () => void;
  onHitMarker: (headshot: boolean) => void;
  onGameOver: (r: GameResult) => void;
  onPauseRequest: () => void;
  onCameraModeChange: (mode: CameraMode) => void;
}

interface Enemy {
  rig: Humanoid;
  pos: THREE.Vector3;
  yaw: number;
  vel: THREE.Vector3;
  health: number;
  maxHealth: number;
  state: "wander" | "engage" | "dead";
  fireCd: number;
  wanderTarget: THREE.Vector3;
  wanderCd: number;
  losCd: number;
  hasLos: boolean;
  deathT: number;
  hitBody: THREE.Mesh;
  hitHead: THREE.Mesh;
  barBg: THREE.Mesh;
  barFill: THREE.Mesh;
  animT: number;
  speed: number;
  stride: number;
  action: EnemyAction;
  actionT: number;
  idleStyle: number;
  hitT: number;
  role: EnemyRole;
  memoryPos: THREE.Vector3;
  memoryT: number;
  decisionCd: number;
  coverTarget: THREE.Vector3 | null;
  flankSign: number;
  burstShots: number;
  burstCd: number;
}

type EnemyAction = "idle" | "patrol" | "run" | "aim" | "fire" | "evade" | "reload" | "hit";
type EnemyRole = "rusher" | "flanker" | "guardian" | "hunter";

type RigMotion = "idle" | "walk" | "sprint" | "jump" | "fall" | "aim" | "fire" | "reload" | "evade" | "hit" | "vehicle" | "wave";

interface RigAnimationInput {
  motion: RigMotion;
  speed: number;
  lookPitch?: number;
  recoil?: number;
  reloadProgress?: number;
  hit?: number;
  idleStyle?: number;
}

type CompanionAction = "idle" | "follow" | "alert" | "aim" | "fire" | "reload" | "wave" | "downed" | "dead" | "vehicle";

interface Companion {
  rig: Humanoid;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  action: CompanionAction;
  actionT: number;
  idleStyle: number;
  health: number;
  maxHealth: number;
  ammo: number;
  magSize: number;
  reserve: number;
  fireCd: number;
  reloading: boolean;
  reloadEnd: number;
  downedT: number;
  hitT: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  spin: number;
  active: boolean;
}

interface Tracer {
  mesh: THREE.Mesh;
  life: number;
  active: boolean;
}

interface Pickup {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  kind: "health" | "ammo";
  t: number;
}

interface DrivableVehicle {
  model: VehicleModel;
  pos: THREE.Vector3;
  yaw: number;
  speed: number;
  airTarget: number;
}

interface Wildlife {
  model: AnimalModel;
  pos: THREE.Vector3;
  yaw: number;
  target: THREE.Vector3;
  cooldown: number;
  t: number;
}

interface WaterSurface {
  mesh: THREE.Mesh;
  baseY: number;
  phase: number;
}

const ZONE_PHASES = [
  { wait: 14, shrink: 20, radius: 34 },
  { wait: 12, shrink: 18, radius: 23 },
  { wait: 10, shrink: 16, radius: 14 },
  { wait: 8, shrink: 14, radius: 7 },
  { wait: 6, shrink: 12, radius: 2.5 },
];

export class GameEngine {
  private container: HTMLElement;
  private cb: EngineCallbacks;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private thirdCamera!: THREE.PerspectiveCamera;
  private eyeCamera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;

  private player!: Humanoid;
  private companion!: Companion;
  private pPos = new THREE.Vector3(0, 0, 0);
  private pVel = new THREE.Vector3();
  private pYaw = 0;
  private pPitch = 0;
  private pOnGround = true;
  private health = 100;
  private maxHealth = 100;
  private lastHitT = 0;
  private lastDmgCb = 0;
  private playerHitT = 0;

  // weapon
  private ammo = 30;
  private magSize = 30;
  private reserve = 120;
  private reloading = false;
  private reloadEnd = 0;
  private lastShot = 0;
  private fireInterval = 0.105;
  private recoil = 0;
  private recoilKick = 0;

  // Stable third-person chase camera. Aim pitch changes the target, never the
  // camera's floor clearance, so dragging cannot push the view underground.
  private camDist = 6.4;
  private camShoulder = 0.92;
  private camHeight = 1.15;
  private chestHeight = 1.32;
  private menuYaw = 0.6;
  private cameraMode: CameraMode = "third";

  // input
  private keys = new Set<string>();
  private moveX = 0;
  private moveY = 0;
  private lookDX = 0;
  private lookDY = 0;
  private firing = false;
  private sprinting = false;
  private jumpQueued = false;
  private reloadQueued = false;
  private pointerLocked = false;
  private isTouch = false;

  // world
  private colliders: THREE.Box3[] = [];
  private colliderMeshes: THREE.Object3D[] = [];
  private coverPoints: THREE.Vector3[] = [];
  private waterSurfaces: WaterSurface[] = [];
  private arenaHalf = 46;

  // entities
  private enemies: Enemy[] = [];
  private particles: Particle[] = [];
  private tracers: Tracer[] = [];
  private pickups: Pickup[] = [];
  private vehicles: DrivableVehicle[] = [];
  private driving: DrivableVehicle | null = null;
  private wildlife: Wildlife[] = [];
  private muzzleFlash!: THREE.Mesh;
  private muzzleLight!: THREE.PointLight;
  private flashLife = 0;

  // zone
  private zoneCenter = new THREE.Vector3(0, 0, 0);
  private zoneRadius = 44;
  private zoneStartR = 44;
  private zoneTargetR = 44;
  private zonePhaseIdx = 0;
  private zoneTimer = 0;
  private zoneShrinking = false;
  private zoneMesh!: THREE.Mesh;
  private zoneRing!: THREE.Mesh;

  // shake
  private shake = 0;

  // scoring / match
  private kills = 0;
  private headshots = 0;
  private score = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private alive = 50;
  private combo = 0;
  private comboT = 0;
  private matchStart = 0;
  private simCd = 0;
  private desiredNearby = 6;
  private running = false;
  private paused = false;
  private gameOver = false;

  // hud throttle
  private hudCd = 0;
  private hudDirty = true;
  private miniCd = 0;
  private minimap: HTMLCanvasElement | null = null;

  // temps
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpV3 = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();

  // bound handlers
  private _onKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  private _onKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);
  private _onMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private _onMouseDown = (e: MouseEvent) => this.onMouseDown(e);
  private _onMouseUp = () => (this.firing = false);
  private _onLockChange = () => this.onLockChange();
  private _onResize = () => this.onResize();
  private _onContext = (e: Event) => e.preventDefault();

  constructor(container: HTMLElement, cb: EngineCallbacks) {
    this.container = container;
    this.cb = cb;
    this.isTouch =
      window.matchMedia?.("(pointer: coarse)").matches ||
      "ontouchstart" in window;
    this.desiredNearby = this.isTouch ? 5 : 6;
    this.initRenderer();
    this.buildWorld();
    this.buildPlayer();
    this.buildFx();
    this.bindInput();
    this.clock.start();
    this.loop();
  }

  // ---------------------------------------------------------------- setup
  private initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isTouch,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isTouch ? 1.5 : 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const fogCol = new THREE.Color(0xcabf9c);
    this.scene.fog = new THREE.Fog(fogCol, 60, 215);

    this.thirdCamera = new THREE.PerspectiveCamera(
      68,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      600
    );
    this.thirdCamera.up.set(0, 1, 0);
    this.thirdCamera.position.set(0, 3, -5);
    this.eyeCamera = new THREE.PerspectiveCamera(
      72,
      this.container.clientWidth / this.container.clientHeight,
      0.05,
      600
    );
    this.eyeCamera.up.set(0, 1, 0);
    this.camera = this.thirdCamera;
  }

  private makeGroundTexture(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#8d8350";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const s = Math.random() * 2.4;
      const g = 90 + Math.random() * 70;
      ctx.fillStyle = `rgba(${g - 10},${g - 6},${g - 40},${Math.random() * 0.5})`;
      ctx.fillRect(x, y, s, s);
    }
    // patches
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = 12 + Math.random() * 30;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(70,66,40,0.35)");
      grd.addColorStop(1, "rgba(70,66,40,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(28, 28);
    tex.anisotropy = 4;
    return tex;
  }

  private buildWorld() {
    // sky dome
    const skyGeo = new THREE.SphereGeometry(420, 32, 18);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x29608a) },
        mid: { value: new THREE.Color(0xbcd2dc) },
        bottom: { value: new THREE.Color(0xe0bd7e) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
        void main(){ float h=normalize(vP).y; vec3 c = h>0.0 ? mix(mid,top,smoothstep(0.0,0.55,h)) : mix(mid,bottom,smoothstep(0.0,-0.28,h)); gl_FragColor=vec4(c,1.0);} `,
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));

    // lights
    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6b6042, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
    sun.position.set(48, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.isTouch ? 1024 : 2048, this.isTouch ? 1024 : 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 70;
    sc.bottom = -70;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x404a55, 0.5));

    // ground
    const gtex = this.makeGroundTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.arenaHalf * 2 + 40, this.arenaHalf * 2 + 40),
      new THREE.MeshStandardMaterial({ map: gtex, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.colliderMeshes.push(ground);

    // perimeter wall (visual + collide)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4636, roughness: 0.95 });
    const perim = this.arenaHalf + 6;
    const wallH = 6;
    const wallDefs = [
      [0, perim, perim * 2 + 4, wallH],
      [0, -perim, perim * 2 + 4, wallH],
      [perim, 0, wallH, perim * 2 + 4],
      [-perim, 0, wallH, perim * 2 + 4],
    ];
    for (const [x, z, w, d] of wallDefs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
      m.position.set(x, wallH / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      this.addCollider(m);
    }

    this.buildWaterways();
    this.buildStructures();
    this.buildNature();
    this.buildZoneVisual();
    this.buildMobility();
  }

  private addCollider(mesh: THREE.Mesh) {
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    this.colliders.push(box);
    this.colliderMeshes.push(mesh);
  }

  private buildWaterways() {
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1b7fa6,
      emissive: 0x073c59,
      emissiveIntensity: 0.38,
      roughness: 0.18,
      metalness: 0.32,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });

    // Ocean surrounds the playable island. The central hole keeps land dry,
    // leaving a sandy shoreline between the map wall and open water.
    const outer = new THREE.Shape();
    outer.moveTo(-150, -150);
    outer.lineTo(150, -150);
    outer.lineTo(150, 150);
    outer.lineTo(-150, 150);
    outer.lineTo(-150, -150);
    const islandHole = new THREE.Path();
    islandHole.moveTo(-56, -56);
    islandHole.lineTo(-56, 56);
    islandHole.lineTo(56, 56);
    islandHole.lineTo(56, -56);
    islandHole.lineTo(-56, -56);
    outer.holes.push(islandHole);
    const ocean = new THREE.Mesh(new THREE.ShapeGeometry(outer), waterMat.clone());
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = 0.012;
    ocean.receiveShadow = true;
    this.scene.add(ocean);
    this.waterSurfaces.push({ mesh: ocean, baseY: 0.012, phase: 0 });

    // A winding river cuts across the island. The simple strip geometry keeps
    // it performant while still giving the battle map recognisable geography.
    const points = [
      new THREE.Vector2(-46, -30),
      new THREE.Vector2(-31, -20),
      new THREE.Vector2(-14, -22),
      new THREE.Vector2(1, -10),
      new THREE.Vector2(15, 3),
      new THREE.Vector2(28, 16),
      new THREE.Vector2(46, 20),
    ];
    const width = 4.7;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const dir = next.clone().sub(prev).normalize();
      const perp = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(width / 2);
      const left = points[i].clone().add(perp);
      const right = points[i].clone().sub(perp);
      vertices.push(left.x, 0.045, left.y, right.x, 0.045, right.y);
      const v = i / (points.length - 1);
      uvs.push(0, v, 1, v);
      if (i < points.length - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const riverGeo = new THREE.BufferGeometry();
    riverGeo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    riverGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    riverGeo.setIndex(indices);
    riverGeo.computeVertexNormals();
    const river = new THREE.Mesh(riverGeo, waterMat.clone());
    river.receiveShadow = true;
    this.scene.add(river);
    this.waterSurfaces.push({ mesh: river, baseY: 0.045, phase: 1.8 });

    // Two bridges keep the river visually believable and create tactical cover.
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x563d26, roughness: 0.9 });
    for (const [x, z, rot] of [[-15, -21, 0], [15, 3, 0.76]] as Array<[number, number, number]>) {
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.34, 1.25), bridgeMat);
      bridge.position.set(x, 0.22, z);
      bridge.rotation.y = rot;
      bridge.castShadow = true;
      bridge.receiveShadow = true;
      this.scene.add(bridge);
      this.addCollider(bridge);
      this.coverPoints.push(new THREE.Vector3(x, 0, z));
    }
  }

  private buildNature() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3921, roughness: 0.96 });
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x365b2d, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x456f35, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x2d4d29, roughness: 0.9 }),
    ];
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d6759, roughness: 0.95 });
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x476f36, roughness: 0.94 });
    const count = this.isTouch ? 22 : 38;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rand(-0.25, 0.25);
      const radius = rand(23, 43);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      // keep key spawns and the river corridor clear
      if (Math.hypot(x, z) < 12 || Math.abs(z - (0.65 * x - 10)) < 3.5) continue;
      const tree = new THREE.Group();
      const height = rand(2.8, 5.4);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, height, 7), trunkMat);
      trunk.position.y = height / 2;
      trunk.castShadow = true;
      tree.add(trunk);
      const canopyMat = leafMats[i % leafMats.length];
      for (let c = 0; c < 3; c++) {
        const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.75, 1.18), 0), canopyMat);
        canopy.position.set(rand(-0.45, 0.45), height + c * 0.38, rand(-0.45, 0.45));
        canopy.scale.y = 1.15;
        canopy.castShadow = true;
        tree.add(canopy);
      }
      tree.position.set(x, 0, z);
      tree.rotation.y = rand(0, Math.PI * 2);
      this.scene.add(tree);
    }

    const rockCount = this.isTouch ? 28 : 48;
    for (let i = 0; i < rockCount; i++) {
      const x = rand(-this.arenaHalf + 3, this.arenaHalf - 3);
      const z = rand(-this.arenaHalf + 3, this.arenaHalf - 3);
      if (Math.hypot(x, z) < 10) continue;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.28, 0.85), 0), rockMat);
      rock.position.set(x, rand(0.15, 0.38), z);
      rock.scale.set(rand(0.8, 1.5), rand(0.55, 1.1), rand(0.8, 1.5));
      rock.rotation.set(rand(0, 1), rand(0, Math.PI), rand(0, 1));
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
    }

    const bushCount = this.isTouch ? 34 : 60;
    for (let i = 0; i < bushCount; i++) {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(rand(0.23, 0.52), 8, 6), bushMat);
      bush.position.set(rand(-44, 44), rand(0.18, 0.32), rand(-44, 44));
      bush.scale.set(rand(0.8, 1.6), rand(0.55, 1), rand(0.8, 1.45));
      bush.castShadow = true;
      this.scene.add(bush);
    }
  }

  private buildStructures() {
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x7a5a32, roughness: 0.85 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x6b7079, roughness: 0.5, metalness: 0.6 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x9a958c, roughness: 0.95 });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0xb5482e, roughness: 0.6, metalness: 0.3 });
    const placed: THREE.Vector3[] = [];

    const tryPlace = (x: number, z: number, r: number) => {
      for (const p of placed) {
        if (p.distanceTo(this.tmpV.set(x, 0, z)) < r) return false;
      }
      if (Math.hypot(x, z) < 6) return false; // keep center clear
      placed.push(new THREE.Vector3(x, 0, z));
      return true;
    };

    // buildings (boxes with roofs)
    for (let i = 0; i < 5; i++) {
      const x = rand(-this.arenaHalf + 8, this.arenaHalf - 8);
      const z = rand(-this.arenaHalf + 8, this.arenaHalf - 8);
      if (!tryPlace(x, z, 12)) continue;
      const w = rand(7, 12);
      const d = rand(7, 12);
      const h = rand(4, 7);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), concreteMat);
      b.position.set(x, h / 2, z);
      b.castShadow = true;
      b.receiveShadow = true;
      this.scene.add(b);
      this.addCollider(b);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
        new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.9 })
      );
      roof.position.set(x, h + 0.25, z);
      roof.castShadow = true;
      this.scene.add(roof);
    }

    // crates
    for (let i = 0; i < 26; i++) {
      const x = rand(-this.arenaHalf + 4, this.arenaHalf - 4);
      const z = rand(-this.arenaHalf + 4, this.arenaHalf - 4);
      if (!tryPlace(x, z, 2.4)) continue;
      const s = rand(1.1, 1.9);
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
      m.position.set(x, s / 2, z);
      m.rotation.y = rand(0, Math.PI);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      this.addCollider(m);
      this.coverPoints.push(new THREE.Vector3(x, 0, z));
    }

    // low walls (cover)
    for (let i = 0; i < 14; i++) {
      const x = rand(-this.arenaHalf + 4, this.arenaHalf - 4);
      const z = rand(-this.arenaHalf + 4, this.arenaHalf - 4);
      if (!tryPlace(x, z, 3)) continue;
      const w = rand(2.5, 5);
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, 1.4, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x6e6047, roughness: 0.95 })
      );
      m.position.set(x, 0.7, z);
      m.rotation.y = rand(0, Math.PI);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      this.addCollider(m);
      this.coverPoints.push(new THREE.Vector3(x, 0, z));
    }

    // barrels
    for (let i = 0; i < 16; i++) {
      const x = rand(-this.arenaHalf + 3, this.arenaHalf - 3);
      const z = rand(-this.arenaHalf + 3, this.arenaHalf - 3);
      if (!tryPlace(x, z, 1.6)) continue;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.3, 12), barrelMat);
      m.position.set(x, 0.65, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      this.addCollider(m);
    }

    // scattered metal debris (no collide)
    const debrisMat = metalMat;
    for (let i = 0; i < 10; i++) {
      const x = rand(-this.arenaHalf, this.arenaHalf);
      const z = rand(-this.arenaHalf, this.arenaHalf);
      const m = new THREE.Mesh(new THREE.BoxGeometry(rand(0.6, 1.4), 0.2, rand(0.6, 1.4)), debrisMat);
      m.position.set(x, 0.1, z);
      m.rotation.y = rand(0, Math.PI);
      m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  private buildZoneVisual() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4fb8ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40, 48, 1, true), mat);
    cyl.position.set(0, 20, 0);
    this.scene.add(cyl);
    this.zoneMesh = cyl;

    const ringMat = new THREE.MeshBasicMaterial({ color: 0x8fd6ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.04, 64), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.scene.add(ring);
    this.zoneRing = ring;
  }

  private buildMobility() {
    // A playable mixed transport fleet. Every model is procedural and persists
    // across the match so a parked vehicle remains where the player left it.
    const fleet: Array<[Parameters<typeof createVehicle>[0], number, number, number]> = [
      ["rickshaw", 7, -7, 0.35],
      ["taxi", -10, -8, -0.5],
      ["cng", 12, 10, 2.4],
      ["bus", -27, 18, 1.4],
      ["buggy", 26, -18, -1.1],
      ["helicopter", -19, -24, 0.75],
      ["plane", 29, 27, -2.2],
      ["fighter", -32, -27, 0.4],
      ["boat", 5, 31, Math.PI],
    ];
    for (const [kind, x, z, yaw] of fleet) {
      const model = createVehicle(kind);
      const pos = new THREE.Vector3(x, 0, z);
      model.root.position.copy(pos);
      model.root.rotation.y = yaw;
      this.scene.add(model.root);
      this.vehicles.push({ model, pos, yaw, speed: 0, airTarget: 0 });
    }

    // Ambient animals and birds make the island feel alive without adding
    // expensive simulation. They wander locally and avoid the combat center.
    const kinds: Parameters<typeof createAnimal>[0][] = [
      "horse", "deer", "goat", "dog", "cow", "wolf", "tiger", "bird", "eagle", "bird", "horse", "cow", "deer", "goat", "wolf",
    ];
    const count = this.isTouch ? 7 : kinds.length;
    for (let i = 0; i < count; i++) {
      const kind = kinds[i];
      const model = createAnimal(kind);
      const angle = (i / count) * Math.PI * 2 + 0.35;
      const radius = 17 + (i % 3) * 7;
      const pos = new THREE.Vector3(
        Math.cos(angle) * radius,
        kind === "bird" || kind === "eagle" ? 5 + (i % 3) : 0,
        Math.sin(angle) * radius
      );
      model.root.position.copy(pos);
      model.root.rotation.y = angle;
      this.scene.add(model.root);
      this.wildlife.push({
        model,
        pos,
        yaw: angle,
        target: pos.clone(),
        cooldown: rand(0.2, 2),
        t: rand(0, 10),
      });
    }
  }

  private buildPlayer() {
    const rig = createHumanoid(PLAYER_PALETTE, "hero");
    rig.root.position.copy(this.pPos);
    this.scene.add(rig.root);
    this.player = rig;

    const companionRig = createHumanoid(COMPANION_PALETTE, "companion");
    const companionPos = new THREE.Vector3(-1.25, 0, -1.7);
    companionRig.root.position.copy(companionPos);
    companionRig.root.scale.setScalar(0.96);
    this.scene.add(companionRig.root);
    this.companion = {
      rig: companionRig,
      pos: companionPos,
      vel: new THREE.Vector3(),
      yaw: 0,
      action: "idle",
      actionT: 1.5,
      idleStyle: 1,
      health: 100,
      maxHealth: 100,
      ammo: 24,
      magSize: 24,
      reserve: 144,
      fireCd: 0,
      reloading: false,
      reloadEnd: 0,
      downedT: 0,
      hitT: 0,
    };
  }

  private buildFx() {
    // muzzle flash
    this.muzzleFlash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.scene.add(this.muzzleFlash);
    this.muzzleLight = new THREE.PointLight(0xffb24d, 0, 12, 2);
    this.scene.add(this.muzzleLight);

    // particle pool
    const pgeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    for (let i = 0; i < 160; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(pgeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        gravity: 0,
        spin: 0,
        active: false,
      });
    }

    // tracer pool
    const tgeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfff2b0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(tgeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.tracers.push({ mesh, life: 0, active: false });
    }
  }

  private bindInput() {
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    const el = this.renderer.domElement;
    el.addEventListener("mousemove", this._onMouseMove);
    el.addEventListener("mousedown", this._onMouseDown);
    window.addEventListener("mouseup", this._onMouseUp);
    el.addEventListener("contextmenu", this._onContext);
    document.addEventListener("pointerlockchange", this._onLockChange);
    window.addEventListener("resize", this._onResize);
  }

  // ---------------------------------------------------------------- input
  private onKeyDown(e: KeyboardEvent) {
    if (!this.running || this.paused) {
      if (e.code === "Escape" && this.running) this.cb.onPauseRequest();
      return;
    }
    this.keys.add(e.code);
    if (e.code === "KeyC") this.toggleCamera();
    if (e.code === "KeyE") {
      this.tryVehicleAction();
      e.preventDefault();
    }
    if (e.code === "KeyR") this.reloadQueued = true;
    if (e.code === "Space") {
      this.jumpQueued = true;
      e.preventDefault();
    }
    if (e.code === "Escape") this.cb.onPauseRequest();
  }
  private onKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.code);
  }
  private onMouseMove(e: MouseEvent) {
    if (!this.pointerLocked) return;
    this.lookDX += e.movementX * 0.0022;
    this.lookDY += e.movementY * 0.0022;
  }
  private onMouseDown(e: MouseEvent) {
    if (!this.running || this.paused || this.gameOver) return;
    if (!this.isTouch && !this.pointerLocked) {
      this.renderer.domElement.requestPointerLock?.();
      return;
    }
    if (e.button === 0) this.firing = true;
  }
  private onLockChange() {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (!this.pointerLocked && this.running && !this.paused && !this.gameOver) {
      this.cb.onPauseRequest();
    }
  }
  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.thirdCamera.aspect = w / h;
    this.thirdCamera.updateProjectionMatrix();
    this.eyeCamera.aspect = w / h;
    this.eyeCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // public touch/control API
  setMove(x: number, y: number) {
    this.moveX = clamp(x, -1, 1);
    this.moveY = clamp(y, -1, 1);
  }
  addLook(dx: number, dy: number) {
    this.lookDX += dx * 0.005;
    this.lookDY += dy * 0.005;
  }
  setSprint(b: boolean) {
    this.sprinting = b;
  }
  pressJump() {
    this.jumpQueued = true;
  }
  pressReload() {
    this.reloadQueued = true;
  }
  pressVehicleAction() {
    this.tryVehicleAction();
  }
  setFiring(b: boolean) {
    this.firing = b;
  }
  toggleCamera() {
    this.cameraMode = this.cameraMode === "third" ? "eye" : "third";
    this.camera = this.cameraMode === "eye" ? this.eyeCamera : this.thirdCamera;
    this.camera.up.set(0, 1, 0);
    this.cb.onCameraModeChange(this.cameraMode);
  }
  getCameraMode() {
    return this.cameraMode;
  }

  private nearestVehicle(maxDistance = Infinity): DrivableVehicle | null {
    let found: DrivableVehicle | null = null;
    let best = maxDistance;
    for (const vehicle of this.vehicles) {
      const d = Math.hypot(vehicle.pos.x - this.pPos.x, vehicle.pos.z - this.pPos.z);
      if (d < best) {
        best = d;
        found = vehicle;
      }
    }
    return found;
  }

  private tryVehicleAction() {
    if (!this.running || this.paused || this.gameOver) return;
    if (this.companion.action === "downed") {
      const reviveDistance = Math.hypot(
        this.companion.pos.x - this.pPos.x,
        this.companion.pos.z - this.pPos.z
      );
      if (reviveDistance < 2.8) {
        this.reviveCompanion();
        return;
      }
    }
    if (this.driving) {
      const vehicle = this.driving;
      if (vehicle.pos.y > 2.2) {
        this.cb.onKillFeed("Land before exiting", false);
        return;
      }
      const side = this.rightVec(this.tmpV).clone();
      this.pPos.copy(vehicle.pos).addScaledVector(side, vehicle.model.spec.radius + 1.1);
      this.pPos.y = 0;
      this.pYaw = vehicle.yaw;
      this.pVel.set(0, 0, 0);
      this.driving = null;
      this.player.root.visible = this.cameraMode !== "eye";
      this.cb.onKillFeed("Exited vehicle", false);
      sfx.click();
      this.hudDirty = true;
      return;
    }
    const vehicle = this.nearestVehicle(4.4);
    if (!vehicle) {
      this.cb.onKillFeed("Move closer to a vehicle", false);
      return;
    }
    this.driving = vehicle;
    this.pPos.copy(vehicle.pos);
    this.pYaw = vehicle.yaw;
    this.pVel.set(0, 0, 0);
    this.player.root.visible = false;
    if (this.companion) this.companion.rig.root.visible = false;
    this.cb.onKillFeed(`Driving ${vehicle.model.spec.name}`, false);
    sfx.click();
    this.hudDirty = true;
  }

  requestPointerLock() {
    if (this.isTouch) return;
    try {
      const p = this.renderer.domElement.requestPointerLock?.() as
        | Promise<void>
        | undefined;
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* ignore */
    }
  }
  setMinimap(c: HTMLCanvasElement | null) {
    this.minimap = c;
  }
  getIsTouch() {
    return this.isTouch;
  }

  // ---------------------------------------------------------------- match
  startMatch() {
    // reset state
    this.enemies.forEach((e) => {
      this.scene.remove(e.rig.root);
      e.rig.dispose();
      this.scene.remove(e.hitBody);
      this.scene.remove(e.hitHead);
      this.scene.remove(e.barBg);
      this.scene.remove(e.barFill);
    });
    this.enemies = [];
    this.pickups.forEach((p) => this.scene.remove(p.mesh));
    this.pickups = [];
    this.particles.forEach((p) => (p.active = false));
    this.tracers.forEach((t) => (t.active = false));

    this.pPos.set(0, 0, 0);
    this.pVel.set(0, 0, 0);
    this.pYaw = 0;
    this.pPitch = -0.04;
    this.driving = null;
    this.cameraMode = "third";
    this.camera = this.thirdCamera;
    this.camera.up.set(0, 1, 0);
    this.cb.onCameraModeChange(this.cameraMode);
    this.player.root.visible = true;
    this.companion.pos.set(-1.25, 0, -1.7);
    this.companion.vel.set(0, 0, 0);
    this.companion.yaw = 0;
    this.companion.action = "idle";
    this.companion.actionT = 1.5;
    this.companion.idleStyle = 1;
    this.companion.health = this.companion.maxHealth;
    this.companion.ammo = this.companion.magSize;
    this.companion.reserve = 144;
    this.companion.fireCd = 0;
    this.companion.reloading = false;
    this.companion.reloadEnd = 0;
    this.companion.downedT = 0;
    this.companion.hitT = 0;
    this.companion.rig.root.visible = true;
    this.companion.rig.root.position.copy(this.companion.pos);
    this.companion.rig.root.rotation.set(0, 0, 0);
    this.health = this.maxHealth;
    this.ammo = this.magSize;
    this.reserve = 120;
    this.reloading = false;
    this.firing = false;
    this.recoil = 0;
    this.kills = 0;
    this.headshots = 0;
    this.score = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.alive = 40;
    this.combo = 0;
    this.comboT = 0;
    this.shake = 0;
    this.lastHitT = 0;
    this.playerHitT = 0;

    this.zonePhaseIdx = 0;
    this.zoneCenter.set(0, 0, 0);
    this.zoneRadius = 44;
    this.zoneStartR = 44;
    this.zoneTargetR = 44;
    this.zoneShrinking = false;
    this.zoneTimer = ZONE_PHASES[0].wait;

    this.matchStart = performance.now();
    this.simCd = 5;
    this.running = true;
    this.paused = false;
    this.gameOver = false;
    this.hudDirty = true;

    // initial enemies around the player
    for (let i = 0; i < this.desiredNearby; i++) this.spawnEnemy();

    this.updateZoneVisual();
    this.requestPointerLock();
    this.hudDirty = true;
  }

  pause() {
    if (!this.running || this.gameOver) return;
    this.paused = true;
    this.firing = false;
    if (this.pointerLocked) document.exitPointerLock?.();
  }
  resume() {
    if (!this.running || this.gameOver) return;
    this.paused = false;
    this.requestPointerLock();
  }

  private attractCamera(dt: number) {
    this.camera = this.thirdCamera;
    this.cameraMode = "third";
    this.camera.up.set(0, 1, 0);
    this.menuYaw += dt * 0.18;
    const px = this.player ? this.player.root.position.x : 0;
    const pz = this.player ? this.player.root.position.z : 0;
    const dist = 5.2;
    this.camera.position.set(
      px + Math.sin(this.menuYaw) * dist,
      2.5,
      pz + Math.cos(this.menuYaw) * dist
    );
    this.camera.lookAt(px, 1.35, pz);
    if (this.player) {
      this.player.animWalk += dt * 2;
      this.player.body.position.y = Math.sin(this.player.animWalk) * 0.02;
      this.player.armL.rotation.x = -1.1;
      this.player.armR.rotation.x = -1.2;
      this.player.armL.rotation.z = 0.3;
      this.player.armR.rotation.z = -0.28;
      this.player.legL.rotation.x = 0;
      this.player.legR.rotation.x = 0;
      this.player.root.rotation.y = this.menuYaw + Math.PI;
    }
    if (this.companion) {
      this.companion.rig.root.visible = true;
      this.companion.pos.set(-1.15, 0, -0.75);
      this.companion.rig.root.position.copy(this.companion.pos);
      this.companion.yaw = this.menuYaw + Math.PI * 0.86;
      this.companion.rig.root.rotation.y = this.companion.yaw;
      this.animateHumanoid(this.companion.rig, {
        motion: "idle",
        speed: 0,
        idleStyle: 1,
      }, dt);
    }
  }

  abortMatch() {
    this.running = false;
    this.paused = false;
    this.gameOver = false;
    this.firing = false;
    this.driving = null;
    this.cameraMode = "third";
    this.camera = this.thirdCamera;
    this.camera.up.set(0, 1, 0);
    this.cb.onCameraModeChange(this.cameraMode);
    if (this.pointerLocked) document.exitPointerLock?.();
    this.enemies.forEach((e) => {
      this.scene.remove(e.rig.root);
      e.rig.dispose();
      this.scene.remove(e.hitBody);
      this.scene.remove(e.hitHead);
      this.scene.remove(e.barBg);
      this.scene.remove(e.barFill);
    });
    this.enemies = [];
    this.pickups.forEach((p) => this.scene.remove(p.mesh));
    this.pickups = [];
    this.particles.forEach((p) => (p.active = false));
    this.tracers.forEach((t) => (t.active = false));
    this.pPos.set(0, 0, 0);
    this.pVel.set(0, 0, 0);
    if (this.player) {
      this.player.root.visible = true;
      this.player.root.position.set(0, 0, 0);
      this.player.root.rotation.x = 0;
      this.player.materials.forEach((m) => {
        m.transparent = false;
        m.opacity = 1;
      });
    }
    if (this.companion) {
      this.companion.pos.set(-1.25, 0, -1.7);
      this.companion.vel.set(0, 0, 0);
      this.companion.rig.root.visible = true;
      this.companion.rig.root.position.copy(this.companion.pos);
      this.companion.rig.root.rotation.set(0, 0, 0);
    }
  }

  private spawnEnemy() {
    const rig = createHumanoid(randomEnemyPalette(), "enemy", Math.floor(rand(0, 4)));
    // spawn at ring around player, within zone
    const ang = rand(0, Math.PI * 2);
    const dist = rand(22, 38);
    let x = this.pPos.x + Math.cos(ang) * dist;
    let z = this.pPos.z + Math.sin(ang) * dist;
    // clamp into zone
    const d = Math.hypot(x - this.zoneCenter.x, z - this.zoneCenter.z);
    if (d > this.zoneRadius - 3) {
      const nx = (x - this.zoneCenter.x) / d;
      const nz = (z - this.zoneCenter.z) / d;
      x = this.zoneCenter.x + nx * (this.zoneRadius - 4);
      z = this.zoneCenter.z + nz * (this.zoneRadius - 4);
    }
    x = clamp(x, -this.arenaHalf + 2, this.arenaHalf - 2);
    z = clamp(z, -this.arenaHalf + 2, this.arenaHalf - 2);
    const pos = new THREE.Vector3(x, 0, z);
    rig.root.position.copy(pos);
    const scale = rand(0.92, 1.08);
    rig.root.scale.setScalar(scale);
    this.scene.add(rig.root);

    // invisible hit meshes (raycastable, drawn with no color/depth)
    const invisMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const hitBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 0.5), invisMat);
    hitBody.position.set(x, 1.05, z);
    this.scene.add(hitBody);
    const hitHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), invisMat);
    hitHead.position.set(x, 1.78, z);
    this.scene.add(hitHead);

    // health bar
    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x220000, transparent: true, opacity: 0.85, depthTest: false })
    );
    barBg.position.set(x, 2.2, z);
    barBg.renderOrder = 999;
    this.scene.add(barBg);
    const barFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x7CFF6B, transparent: true, opacity: 1, depthTest: false })
    );
    barFill.position.set(x, 2.2, z);
    barFill.renderOrder = 1000;
    this.scene.add(barFill);

    const enemy: Enemy = {
      rig,
      pos,
      yaw: rand(0, Math.PI * 2),
      vel: new THREE.Vector3(),
      health: 100,
      maxHealth: 100,
      state: "wander",
      fireCd: rand(0.6, 1.6),
      wanderTarget: pos.clone(),
      wanderCd: 0,
      losCd: 0,
      hasLos: false,
      deathT: 0,
      hitBody,
      hitHead,
      barBg,
      barFill,
      animT: rand(0, 10),
      speed: rand(3.2, 4.4),
      stride: rand(7, 9),
      action: "idle",
      actionT: rand(0.8, 2.4),
      idleStyle: Math.floor(rand(0, 4)),
      hitT: 0,
      role: (["rusher", "flanker", "guardian", "hunter"] as EnemyRole[])[Math.floor(rand(0, 4))],
      memoryPos: pos.clone(),
      memoryT: 0,
      decisionCd: rand(0.1, 1.1),
      coverTarget: null,
      flankSign: Math.random() < 0.5 ? -1 : 1,
      burstShots: 0,
      burstCd: rand(0.3, 1),
    };
    hitBody.userData.enemy = enemy;
    hitBody.userData.part = "body";
    hitHead.userData.enemy = enemy;
    hitHead.userData.part = "head";
    this.enemies.push(enemy);
  }

  // ---------------------------------------------------------------- loop
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    let dt = this.clock.getDelta();
    if (dt > 0.05) dt = 0.05;
    if (this.running && !this.paused && !this.gameOver) {
      this.update(dt);
    } else if (!this.running) {
      this.attractCamera(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    this.updateLook();
    this.updatePlayer(dt);
    this.updateCompanion(dt);
    this.updateAmbientMobility(dt);
    this.updateCamera(dt);
    this.updateWeapon(dt);
    this.updateEnemies(dt);
    this.updateZone(dt);
    this.updateMatch(dt);
    this.updateParticles(dt);
    this.updatePickups(dt);
    this.updateHud(dt);
  }

  private updateLook() {
    this.pYaw -= this.lookDX;
    this.pPitch = clamp(this.pPitch - this.lookDY, -0.46, 0.42);
    this.lookDX = 0;
    this.lookDY = 0;
  }

  private forwardVec(out: THREE.Vector3) {
    return out.set(Math.sin(this.pYaw), 0, Math.cos(this.pYaw));
  }
  private rightVec(out: THREE.Vector3) {
    // Camera faces the character from behind, so screen-right is the inverse
    // horizontal axis in this world basis. This maps left/right joystick input
    // to the expected on-screen direction.
    return out.set(-Math.cos(this.pYaw), 0, Math.sin(this.pYaw));
  }

  // A compact procedural animation controller shared by the player and every
  // enemy. It blends movement, combat, recovery and idle poses without heavy
  // imported animation clips, which keeps the battle smooth on mobile.
  private animateHumanoid(rig: Humanoid, input: RigAnimationInput, dt: number) {
    const blend = 1 - Math.pow(0.00001, dt);
    const smooth = (current: number, target: number) => lerp(current, target, blend);
    const moving = input.motion === "walk" || input.motion === "sprint" || input.motion === "evade";
    const running = input.motion === "sprint";
    const pace = moving ? (running ? 12.5 : input.motion === "evade" ? 11 : 8.2) : 2.1;
    rig.animWalk += dt * pace;
    const cycle = Math.sin(rig.animWalk);
    const cycleOpp = Math.sin(rig.animWalk + Math.PI);
    const step = moving ? (running ? 1 : 0.68) : 0;
    const breath = Math.sin(rig.animWalk * 0.85 + (input.idleStyle ?? 0) * 1.7);

    let legL = cycle * 0.86 * step;
    let legR = cycleOpp * 0.86 * step;
    let armL = cycleOpp * 0.38 * step - 1.02;
    let armR = cycle * 0.32 * step - 1.08;
    let armLZ = 0.31;
    let armRZ = -0.29;
    let torsoX = running ? 0.18 : 0.05;
    let torsoY = 0;
    let torsoZ = moving ? cycle * 0.055 * step : 0;
    let bodyY = moving ? Math.abs(cycle) * 0.065 * step : breath * 0.017;
    let bodyX = 0;
    let headX = -(input.lookPitch ?? 0) * 0.42;
    let headY = 0;
    let headZ = 0;
    let weaponX = 0.16;
    let weaponY = 0.42;
    let weaponZ = 0.28;
    let weaponRX = 0;
    let weaponRY = 0;
    let weaponRZ = 0;

    if (input.motion === "idle") {
      // Four idle variations: breathing, scanning, weapon check and alert hold.
      const style = input.idleStyle ?? 0;
      if (style === 1) {
        headY = Math.sin(rig.animWalk * 0.55) * 0.42;
        torsoZ = Math.sin(rig.animWalk * 0.55) * 0.025;
      } else if (style === 2) {
        weaponY -= 0.07 + Math.abs(breath) * 0.04;
        weaponRZ = 0.16 * breath;
        armL = -0.78;
        armR = -0.88;
      } else if (style === 3) {
        torsoX = 0.12;
        headY = Math.sin(rig.animWalk * 0.38) * 0.18;
        armL = -1.16;
        armR = -1.22;
      }
    }

    if (input.motion === "aim" || input.motion === "fire") {
      armL = -1.22;
      armR = -1.28;
      armLZ = 0.42;
      armRZ = -0.38;
      torsoX = 0.08;
      weaponY += 0.035;
      weaponZ += 0.06;
    }

    if (input.motion === "fire") {
      const kick = Math.max(0.35, input.recoil ?? 0.7);
      weaponZ -= 0.18 * kick;
      weaponRX = 0.3 * kick;
      torsoX += 0.07 * kick;
      headX += 0.05 * kick;
    }

    if (input.motion === "reload") {
      const p = clamp(input.reloadProgress ?? 0.5, 0, 1);
      const swing = Math.sin(p * Math.PI);
      legL = 0;
      legR = 0;
      armL = -0.48 - swing * 0.55;
      armR = -0.82;
      armLZ = 0.68;
      armRZ = -0.2;
      torsoX = 0.03;
      weaponX = 0.28;
      weaponY = 0.25 - swing * 0.12;
      weaponZ = 0.2;
      weaponRX = swing * 0.55;
      weaponRZ = swing * 0.42;
      headY = swing * 0.16;
    }

    if (input.motion === "jump") {
      legL = -0.72;
      legR = -0.52;
      armL = -0.55;
      armR = -0.62;
      armLZ = 0.48;
      armRZ = -0.46;
      torsoX = -0.16;
      bodyY = 0.08;
      weaponY = 0.48;
    } else if (input.motion === "fall") {
      legL = 0.46;
      legR = 0.3;
      armL = -0.4;
      armR = -0.5;
      torsoX = 0.2;
      bodyY = -0.02;
    } else if (input.motion === "evade") {
      legL = cycle * 0.66;
      legR = cycleOpp * 0.66;
      armL = -1.12;
      armR = -1.18;
      torsoX = 0.34;
      torsoZ = cycle * 0.14;
      bodyY = -0.15 + Math.abs(cycle) * 0.035;
      weaponY = 0.34;
    } else if (input.motion === "hit") {
      const hit = Math.max(0, input.hit ?? 0.5);
      torsoX = -0.24 * hit;
      torsoZ = 0.26 * hit;
      headX = 0.2 * hit;
      armL = -0.45;
      armR = -0.5;
      weaponZ = 0.1;
    } else if (input.motion === "vehicle") {
      legL = 1.12;
      legR = 1.12;
      armL = -0.82;
      armR = -0.84;
      armLZ = 0.18;
      armRZ = -0.18;
      torsoX = -0.12;
      bodyY = -0.31;
      weaponY = 0.13;
      weaponZ = 0.12;
      weaponRX = 0.25;
    } else if (input.motion === "wave") {
      const wave = Math.sin(rig.animWalk * 6.5);
      legL = 0;
      legR = 0;
      armL = -0.95;
      armR = -2.05 + wave * 0.28;
      armLZ = 0.25;
      armRZ = -0.9;
      torsoZ = Math.sin(rig.animWalk * 1.8) * 0.04;
      headY = Math.sin(rig.animWalk * 1.8) * 0.22;
      weaponY = 0.25;
      weaponZ = 0.1;
      weaponRX = 0.25;
    }

    rig.legL.rotation.x = smooth(rig.legL.rotation.x, legL);
    rig.legR.rotation.x = smooth(rig.legR.rotation.x, legR);
    rig.armL.rotation.x = smooth(rig.armL.rotation.x, armL);
    rig.armR.rotation.x = smooth(rig.armR.rotation.x, armR);
    rig.armL.rotation.z = smooth(rig.armL.rotation.z, armLZ);
    rig.armR.rotation.z = smooth(rig.armR.rotation.z, armRZ);
    rig.body.position.y = smooth(rig.body.position.y, bodyY);
    rig.body.rotation.x = smooth(rig.body.rotation.x, bodyX);
    rig.torso.rotation.x = smooth(rig.torso.rotation.x, torsoX);
    rig.torso.rotation.y = smooth(rig.torso.rotation.y, torsoY);
    rig.torso.rotation.z = smooth(rig.torso.rotation.z, torsoZ);
    rig.head.rotation.x = smooth(rig.head.rotation.x, headX);
    rig.head.rotation.y = smooth(rig.head.rotation.y, headY);
    rig.head.rotation.z = smooth(rig.head.rotation.z, headZ);
    rig.weapon.position.x = smooth(rig.weapon.position.x, weaponX);
    rig.weapon.position.y = smooth(rig.weapon.position.y, weaponY);
    rig.weapon.position.z = smooth(rig.weapon.position.z, weaponZ);
    rig.weapon.rotation.x = smooth(rig.weapon.rotation.x, weaponRX);
    rig.weapon.rotation.y = smooth(rig.weapon.rotation.y, weaponRY);
    rig.weapon.rotation.z = smooth(rig.weapon.rotation.z, weaponRZ);
  }

  private updatePlayer(dt: number) {
    // keyboard movement input
    let mx = this.moveX;
    let my = this.moveY;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) my += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) my -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) mx += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) mx -= 1;
    const sprint = this.sprinting || this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    if (this.driving) {
      this.updateDrivenVehicle(this.driving, dt, clamp(mx, -1, 1), clamp(my, -1, 1));
      this.animateHumanoid(this.player, {
        motion: "vehicle",
        speed: Math.abs(this.driving.speed),
        lookPitch: this.pPitch,
      }, dt);
      return;
    }
    this.forwardVec(this.tmpV);
    this.rightVec(this.tmpV2);
    const dir = this.tmpV.clone().multiplyScalar(my).add(this.tmpV2.clone().multiplyScalar(mx));
    const moving = dir.lengthSq() > 0.001;
    if (moving) dir.normalize();
    const speed = sprint && my > 0.1 ? 8.2 : 5.0;

    // horizontal velocity (snappy)
    const targetVx = dir.x * speed;
    const targetVz = dir.z * speed;
    this.pVel.x = lerp(this.pVel.x, targetVx, 1 - Math.pow(0.0001, dt));
    this.pVel.z = lerp(this.pVel.z, targetVz, 1 - Math.pow(0.0001, dt));

    // jump / gravity
    if (this.jumpQueued && this.pOnGround) {
      this.pVel.y = 7.2;
      this.pOnGround = false;
    }
    this.jumpQueued = false;
    this.pVel.y -= 22 * dt;

    this.pPos.x += this.pVel.x * dt;
    this.pPos.z += this.pVel.z * dt;
    this.pPos.y += this.pVel.y * dt;
    if (this.pPos.y <= 0) {
      this.pPos.y = 0;
      this.pVel.y = 0;
      this.pOnGround = true;
    }

    // collisions with structures (circle vs AABB)
    this.resolveCircle(this.pPos, 0.5);

    // arena clamp
    this.pPos.x = clamp(this.pPos.x, -this.arenaHalf + 1, this.arenaHalf - 1);
    this.pPos.z = clamp(this.pPos.z, -this.arenaHalf + 1, this.arenaHalf - 1);

    // zone damage
    const dz = Math.hypot(this.pPos.x - this.zoneCenter.x, this.pPos.z - this.zoneCenter.z);
    if (dz > this.zoneRadius) {
      const dps = 3 + this.zonePhaseIdx * 2.5;
      this.damagePlayer(dps * dt);
    }

    // slow regen out of combat
    const sinceHit = (performance.now() - this.lastHitT) / 1000;
    if (sinceHit > 6 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 6 * dt);
      this.hudDirty = true;
    }

    // Blend player locomotion with jump, reload, firing and recovery poses.
    const rig = this.player;
    rig.root.position.set(this.pPos.x, this.pPos.y, this.pPos.z);
    rig.root.rotation.y = this.pYaw;
    const horizSpeed = Math.hypot(this.pVel.x, this.pVel.z);
    this.playerHitT = Math.max(0, this.playerHitT - dt * 3.8);
    const reloadProgress = this.reloading
      ? 1 - clamp((this.reloadEnd - performance.now() / 1000) / 1.5, 0, 1)
      : 0;
    let motion: RigMotion = "idle";
    if (!this.pOnGround) motion = this.pVel.y > 0 ? "jump" : "fall";
    else if (this.reloading) motion = "reload";
    else if (this.recoilKick > 0.08) motion = "fire";
    else if (this.playerHitT > 0.08) motion = "hit";
    else if (horizSpeed > 5.8) motion = "sprint";
    else if (horizSpeed > 0.5) motion = "walk";
    this.animateHumanoid(rig, {
      motion,
      speed: horizSpeed,
      lookPitch: this.pPitch,
      recoil: this.recoilKick,
      reloadProgress,
      hit: this.playerHitT,
      // Rotate the player through breathing, scanning, weapon-check and alert
      // idle poses whenever they stop moving.
      idleStyle: Math.floor(performance.now() / 6000) % 4,
    }, dt);

    this.player.moving = moving && horizSpeed > 0.5;
  }

  private updateCompanion(dt: number) {
    const c = this.companion;
    if (!c) return;

    if (c.action === "dead") {
      c.rig.root.visible = true;
      c.rig.root.rotation.x = -1.35;
      return;
    }

    // Downed companions can be revived with E / the existing action button.
    if (c.action === "downed") {
      c.downedT -= dt;
      c.rig.root.visible = true;
      c.rig.root.rotation.x = -0.92;
      this.animateHumanoid(c.rig, { motion: "hit", speed: 0, hit: 1 }, dt);
      if (c.downedT <= 0) {
        c.action = "dead";
        c.rig.root.rotation.x = -1.35;
        this.cb.onKillFeed("MAYA ELIMINATED", false);
        this.hudDirty = true;
      }
      return;
    }

    // Companion rides along with the player rather than trying to follow a
    // moving vehicle on foot. She reappears beside the hero after exiting.
    if (this.driving) {
      c.rig.root.visible = false;
      c.pos.copy(this.pPos);
      return;
    }
    c.rig.root.visible = true;
    c.rig.root.rotation.x = 0;
    c.actionT = Math.max(0, c.actionT - dt);
    c.fireCd = Math.max(0, c.fireCd - dt);
    c.hitT = Math.max(0, c.hitT - dt);
    if (c.reloading && performance.now() / 1000 >= c.reloadEnd) {
      const need = c.magSize - c.ammo;
      const take = Math.min(need, c.reserve);
      c.ammo += take;
      c.reserve -= take;
      c.reloading = false;
      c.action = "aim";
    }

    const forward = this.forwardVec(this.tmpV);
    const right = this.rightVec(this.tmpV2);
    const followPoint = this.tmpV3
      .copy(this.pPos)
      .addScaledVector(forward, -1.45)
      .addScaledVector(right, -1.15);
    const toFollow = followPoint.clone().sub(c.pos);
    const dist = toFollow.length();

    // Find a target herself. Her decision loop is independent of the player's
    // aim: she closes distance, strafes, reloads and fires at visible threats.
    let closestEnemy: Enemy | null = null;
    let enemyDist = 34;
    for (const enemy of this.enemies) {
      if (enemy.state === "dead") continue;
      const d = Math.hypot(enemy.pos.x - c.pos.x, enemy.pos.z - c.pos.z);
      if (d < enemyDist) {
        enemyDist = d;
        closestEnemy = enemy;
      }
    }

    let move = this.tmpV.clone().set(0, 0, 0);
    if (closestEnemy) {
      const toEnemy = this.tmpV2.set(closestEnemy.pos.x - c.pos.x, 0, closestEnemy.pos.z - c.pos.z);
      const canSee = this.checkLineToPosition(
        c.pos.clone().setY(1.35),
        closestEnemy.pos.clone().setY(1.2)
      );
      if (toEnemy.lengthSq() > 0.001) toEnemy.normalize();
      c.yaw = Math.atan2(toEnemy.x, toEnemy.z);

      // Keep practical rifle distance, then strafe unpredictably while firing.
      if (enemyDist > 16) {
        move.copy(toEnemy);
        c.action = "alert";
      } else if (enemyDist < 7) {
        move.copy(toEnemy).multiplyScalar(-1);
        c.action = "alert";
      } else {
        move.set(-toEnemy.z, 0, toEnemy.x).multiplyScalar(Math.sin(performance.now() * 0.0018) > 0 ? 1 : -1);
        if (c.action !== "fire" || c.actionT <= 0) {
          c.action = c.reloading ? "reload" : "aim";
        }
      }

      if (c.ammo <= 0 && c.reserve > 0 && !c.reloading) {
        c.reloading = true;
        c.reloadEnd = performance.now() / 1000 + 1.25;
        c.action = "reload";
      }
      if (canSee && enemyDist < 30 && !c.reloading && c.ammo > 0 && c.fireCd <= 0) {
        this.companionFire(c, closestEnemy, enemyDist);
      }
    } else if (dist > 7.5) {
      c.pos.copy(followPoint);
      c.vel.set(0, 0, 0);
    } else if (dist > 1.1) {
      move.copy(toFollow.normalize());
      c.action = dist > 3.2 ? "alert" : "follow";
    } else {
      if (c.actionT <= 0) {
        const pick = Math.random();
        c.action = pick < 0.22 ? "wave" : pick < 0.48 ? "alert" : "idle";
        c.actionT = c.action === "wave" ? rand(1.4, 2.2) : rand(2.2, 4.5);
        c.idleStyle = Math.floor(rand(0, 4));
      }
    }

    if (move.lengthSq() > 0.01) {
      move.normalize();
      const movementSpeed = closestEnemy ? (enemyDist > 16 ? 5.8 : 3.9) : (dist > 3.2 ? 6.2 : 3.5);
      c.vel.lerp(move.multiplyScalar(movementSpeed), 1 - Math.pow(0.0001, dt));
      c.pos.addScaledVector(c.vel, dt);
      if (!closestEnemy) c.yaw = Math.atan2(c.vel.x, c.vel.z);
    } else {
      c.vel.multiplyScalar(Math.pow(0.0001, dt));
    }

    this.resolveCircle(c.pos, 0.42);
    c.pos.x = clamp(c.pos.x, -this.arenaHalf + 1, this.arenaHalf - 1);
    c.pos.z = clamp(c.pos.z, -this.arenaHalf + 1, this.arenaHalf - 1);

    const speed = Math.hypot(c.vel.x, c.vel.z);
    c.rig.moving = speed > 0.6;
    const motion: RigMotion = c.hitT > 0
      ? "hit"
      : c.action === "follow"
      ? "walk"
      : c.action === "alert"
        ? (speed > 2 ? "sprint" : "aim")
        : c.action === "aim"
          ? "aim"
          : c.action === "fire"
            ? "fire"
            : c.action === "reload"
              ? "reload"
          : c.action === "wave"
            ? "wave"
            : "idle";
    this.animateHumanoid(c.rig, {
      motion,
      speed,
      idleStyle: c.idleStyle,
      recoil: c.action === "fire" ? Math.max(0.15, c.actionT * 8) : 0,
      reloadProgress: c.reloading ? 1 - clamp((c.reloadEnd - performance.now() / 1000) / 1.25, 0, 1) : 0,
      hit: c.hitT * 4,
    }, dt);
    c.rig.root.position.copy(c.pos);
    c.rig.root.rotation.y = c.yaw;
  }

  private companionFire(c: Companion, enemy: Enemy, distance: number) {
    c.ammo--;
    c.fireCd = 0.2;
    c.action = "fire";
    c.actionT = 0.14;
    c.rig.muzzle.getWorldPosition(this.tmpV);
    const target = enemy.pos.clone().setY(Math.random() < 0.16 ? 1.74 : 1.15);
    const from = this.tmpV.clone();
    this.spawnTracer(from, target);
    this.spawnParticles(from, 0xffc77b, 4, 2.5);
    sfx.enemyShoot();

    const chance = clamp(0.88 - distance * 0.017, 0.38, 0.84);
    if (Math.random() < chance) {
      const headshot = Math.random() < 0.16;
      const hitPoint = enemy.pos.clone().setY(headshot ? 1.72 : 1.1);
      this.damageEnemy(enemy, headshot ? 55 : 25, headshot, hitPoint, "companion");
    }
  }

  private damageCompanion(dmg: number) {
    const c = this.companion;
    if (!c || c.action === "downed" || c.action === "dead" || this.driving) return;
    c.health -= dmg;
    c.hitT = Math.min(1, c.hitT + dmg * 0.1);
    if (c.health <= 0) {
      c.health = 0;
      c.action = "downed";
      c.downedT = 12;
      c.reloading = false;
      c.vel.set(0, 0, 0);
      this.cb.onKillFeed("MAYA DOWNED - REVIVE HER", false);
    }
    this.hudDirty = true;
  }

  private reviveCompanion() {
    const c = this.companion;
    if (c.action !== "downed") return;
    c.health = Math.ceil(c.maxHealth * 0.55);
    c.ammo = Math.max(c.ammo, 12);
    c.action = "alert";
    c.actionT = 1.2;
    c.downedT = 0;
    c.hitT = 0;
    c.rig.root.rotation.x = 0;
    this.cb.onKillFeed("MAYA REVIVED", false);
    sfx.click();
    this.hudDirty = true;
  }

  private updateDrivenVehicle(vehicle: DrivableVehicle, dt: number, steer: number, throttle: number) {
    const { spec, root, wheels, rotor } = vehicle.model;
    const isAir = spec.mode === "air";

    if (isAir && this.jumpQueued) {
      // SPACE / JUMP toggles takeoff and landing. Air vehicles never need a
      // separate complicated mobile throttle button.
      vehicle.airTarget = vehicle.airTarget > 0 ? 0 : (spec.kind === "helicopter" ? 15 : 10);
    }
    if (!isAir && this.jumpQueued) vehicle.speed *= 0.2;
    this.jumpQueued = false;

    const targetSpeed = throttle >= 0
      ? throttle * spec.maxSpeed
      : throttle * spec.reverseSpeed;
    vehicle.speed = lerp(vehicle.speed, targetSpeed, 1 - Math.pow(0.002, dt));
    if (Math.abs(throttle) < 0.05) vehicle.speed *= Math.pow(isAir ? 0.82 : 0.38, dt);

    const steeringFactor = 0.28 + Math.min(1, Math.abs(vehicle.speed) / spec.maxSpeed) * 0.72;
    vehicle.yaw -= steer * spec.turn * steeringFactor * dt * (vehicle.speed >= 0 ? 1 : -1);
    const forward = this.tmpV.set(Math.sin(vehicle.yaw), 0, Math.cos(vehicle.yaw));
    vehicle.pos.addScaledVector(forward, vehicle.speed * dt);
    vehicle.pos.x = clamp(vehicle.pos.x, -this.arenaHalf + 1, this.arenaHalf - 1);
    vehicle.pos.z = clamp(vehicle.pos.z, -this.arenaHalf + 1, this.arenaHalf - 1);

    if (isAir) {
      vehicle.pos.y = lerp(vehicle.pos.y, vehicle.airTarget, 1 - Math.pow(0.035, dt));
      if (vehicle.airTarget === 0 && vehicle.pos.y < 0.06) vehicle.pos.y = 0;
    } else {
      vehicle.pos.y = spec.mode === "water" ? 0.14 + Math.sin(performance.now() * 0.003) * 0.05 : 0;
      this.resolveCircle(vehicle.pos, spec.radius);
    }

    root.position.copy(vehicle.pos);
    root.rotation.y = vehicle.yaw;
    if (isAir) {
      root.rotation.x = clamp(-vehicle.speed / spec.maxSpeed * 0.14, -0.14, 0.1);
      root.rotation.z = clamp(-steer * 0.22, -0.22, 0.22);
    } else {
      root.rotation.x = 0;
      root.rotation.z = spec.mode === "water" ? Math.sin(performance.now() * 0.004) * 0.03 : 0;
    }
    for (const w of wheels) w.rotation.x -= vehicle.speed * dt * 2.7;
    if (rotor) rotor.rotation.y += dt * (18 + Math.abs(vehicle.speed) * 1.5);

    // The driver occupies the vehicle; the player position still powers zone,
    // enemy targeting, minimap and camera systems.
    this.pPos.copy(vehicle.pos);
    this.pYaw = vehicle.yaw;
    this.pVel.copy(forward).multiplyScalar(vehicle.speed);
    this.player.root.position.copy(this.pPos);
    this.player.root.rotation.y = vehicle.yaw;
    this.player.root.visible = false;
    this.player.moving = Math.abs(vehicle.speed) > 0.7;
  }

  private updateAmbientMobility(dt: number) {
    this.updateWater(dt);
    for (const vehicle of this.vehicles) {
      if (vehicle === this.driving) continue;
      if (vehicle.model.rotor) vehicle.model.rotor.rotation.y += dt * 7;
    }

    for (const animal of this.wildlife) {
      animal.t += dt;
      animal.cooldown -= dt;
      if (animal.cooldown <= 0 || animal.pos.distanceTo(animal.target) < 1.2) {
        animal.cooldown = rand(3, 7);
        const angle = rand(0, Math.PI * 2);
        const radius = rand(3, 12);
        animal.target.set(
          clamp(animal.pos.x + Math.cos(angle) * radius, -this.arenaHalf + 3, this.arenaHalf - 3),
          animal.model.kind === "bird" || animal.model.kind === "eagle" ? rand(4, 8) : 0,
          clamp(animal.pos.z + Math.sin(angle) * radius, -this.arenaHalf + 3, this.arenaHalf - 3)
        );
      }
      const to = this.tmpV2.copy(animal.target).sub(animal.pos);
      const distance = to.length();
      if (distance > 0.1) {
        to.normalize();
        animal.pos.addScaledVector(to, Math.min(distance, animal.model.speed * dt));
        animal.yaw = Math.atan2(to.x, to.z);
      }
      if (animal.model.kind === "bird" || animal.model.kind === "eagle") {
        animal.pos.y += Math.sin(animal.t * 3.2) * 0.012;
        if (animal.model.wingL) animal.model.wingL.rotation.z = Math.sin(animal.t * 14) * 0.55;
        if (animal.model.wingR) animal.model.wingR.rotation.z = -Math.sin(animal.t * 14) * 0.55;
      }
      animal.model.root.position.copy(animal.pos);
      animal.model.root.rotation.y = animal.yaw;
    }
  }

  private updateWater(dt: number) {
    const t = performance.now() * 0.001;
    for (const surface of this.waterSurfaces) {
      surface.phase += dt;
      surface.mesh.position.y = surface.baseY + Math.sin(t * 1.3 + surface.phase) * 0.018;
      const material = surface.mesh.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 0.3 + Math.sin(t * 1.6 + surface.phase) * 0.07;
    }
  }

  private resolveCircle(pos: THREE.Vector3, radius: number) {
    for (const box of this.colliders) {
      // skip perimeter walls handled by clamp; but include them is fine
      const cx = clamp(pos.x, box.min.x, box.max.x);
      const cz = clamp(pos.z, box.min.z, box.max.z);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = (radius - d) / d;
        // if center inside box (d2~0), push out along nearest face
        if (d2 < 0.0001) {
          // pick smallest penetration axis
          const penX = Math.min(pos.x - box.min.x, box.max.x - pos.x);
          const penZ = Math.min(pos.z - box.min.z, box.max.z - pos.z);
          if (penX < penZ) {
            pos.x += (pos.x - (box.min.x + box.max.x) / 2) > 0 ? penX + radius : -(penX + radius);
          } else {
            pos.z += (pos.z - (box.min.z + box.max.z) / 2) > 0 ? penZ + radius : -(penZ + radius);
          }
        } else {
          pos.x += dx * push;
          pos.z += dz * push;
        }
      }
    }
  }

  private updateCamera(dt: number) {
    const viewHeight = this.driving ? this.driving.model.spec.cameraHeight : this.chestHeight;
    const pivot = this.tmpV.set(this.pPos.x, this.pPos.y + viewHeight, this.pPos.z);
    const forward = this.forwardVec(this.tmpV2);
    const right = this.rightVec(this.tmpV3);
    const eyeMode = this.cameraMode === "eye";
    this.player.root.visible = !eyeMode && !this.driving;

    let desired: THREE.Vector3;
    let look: THREE.Vector3;

    if (eyeMode) {
      // The second camera sits at the character's eyes and is intentionally
      // kept separate from the chase camera for a true first-person view.
      desired = new THREE.Vector3(this.pPos.x, this.pPos.y + (this.driving ? viewHeight : 1.72), this.pPos.z);
      look = desired.clone().addScaledVector(forward, 32);
      look.y += (this.pPitch + this.recoil * 0.3) * 16;
      this.camera.position.lerp(desired, 1 - Math.pow(0.00001, dt));
    } else {
      const origin = pivot.clone().add(new THREE.Vector3(0, 0.45, 0));
      desired = origin
        .clone()
        .addScaledVector(forward, -this.camDist)
        .addScaledVector(right, this.camShoulder);
      desired.y += this.camHeight;

      // Keep walls from covering the camera without dropping it under terrain.
      const dirToCam = desired.clone().sub(origin);
      const dist = dirToCam.length();
      dirToCam.normalize();
      this.raycaster.set(origin, dirToCam);
      this.raycaster.far = dist;
      const hits = this.raycaster.intersectObjects(this.colliderMeshes, false);
      if (hits.length) {
        const safeDistance = hits[0].distance - 0.35;
        if (safeDistance >= 3.6) {
          desired.copy(origin).addScaledVector(dirToCam, safeDistance);
        } else {
          desired
            .copy(origin)
            .addScaledVector(forward, -2.8)
            .addScaledVector(right, this.camShoulder);
          desired.y += 2.2;
        }
      }
      this.raycaster.far = Infinity;
      desired.y = Math.max(0.9, desired.y);
      this.camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
      look = pivot.clone().addScaledVector(forward, 32);
      look.y += (this.pPitch + this.recoil * 0.22) * 16;
      look.addScaledVector(right, -0.2);
    }

    // Never mutate Euler rotation after lookAt. A forced rotation.z reset was
    // the source of the 180 degree mobile flip. Lock every view to world-up.
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(look);
    if (this.shake > 0.001) {
      const s = this.shake;
      this.camera.position.x += rand(-1, 1) * s;
      this.camera.position.y += rand(-1, 1) * s;
      this.shake = Math.max(0, this.shake - dt * 3.5);
    }
  }

  private updateWeapon(dt: number) {
    const now = performance.now() / 1000;
    // recoil recovery
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 9);

    // reload
    if (this.reloadQueued && !this.reloading && this.ammo < this.magSize && this.reserve > 0) {
      this.startReload();
    }
    this.reloadQueued = false;
    if (this.reloading && now >= this.reloadEnd) this.finishReload();

    // firing
    if (this.firing && !this.reloading && now - this.lastShot >= this.fireInterval) {
      if (this.ammo > 0) {
        this.playerShoot();
        this.lastShot = now;
      } else {
        sfx.empty();
        this.lastShot = now + 0.25;
        if (this.reserve > 0) this.startReload();
        this.firing = false;
      }
    }

    // muzzle flash decay
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      const a = Math.max(0, this.flashLife / 0.05);
      (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = a;
      this.muzzleLight.intensity = a * 6;
      this.muzzleFlash.lookAt(this.camera.position);
      this.muzzleFlash.rotateZ(rand(0, Math.PI));
      const sc = 0.6 + a * 0.8;
      this.muzzleFlash.scale.set(sc, sc, sc);
    }
  }

  private startReload() {
    if (this.reloading || this.ammo >= this.magSize || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadEnd = performance.now() / 1000 + 1.5;
    sfx.reload();
    this.hudDirty = true;
  }
  private finishReload() {
    const need = this.magSize - this.ammo;
    const take = Math.min(need, this.reserve);
    this.ammo += take;
    this.reserve -= take;
    this.reloading = false;
    this.hudDirty = true;
  }

  private playerShoot() {
    this.ammo--;
    this.shotsFired++;
    sfx.shoot();
    this.recoil = Math.min(0.12, this.recoil + 0.05);
    this.recoilKick = 1;
    this.shake = Math.min(0.12, this.shake + 0.05);
    this.flashLife = 0.05;

    // muzzle flash position
    if (this.driving) {
      const aim = new THREE.Vector3();
      this.camera.getWorldDirection(aim);
      this.tmpV.copy(this.camera.position).addScaledVector(aim, 0.65);
    } else {
      this.player.muzzle.getWorldPosition(this.tmpV);
    }
    this.muzzleFlash.position.copy(this.tmpV);
    this.muzzleLight.position.copy(this.tmpV).add(new THREE.Vector3(0, 0.2, 0));

    // aim ray from camera through screen center
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    // tiny spread
    const spread = this.player.moving ? 0.012 : 0.004;
    dir.x += rand(-spread, spread);
    dir.y += rand(-spread, spread);
    dir.z += rand(-spread, spread);
    dir.normalize();

    this.raycaster.set(origin, dir);
    this.raycaster.far = 140;
    const targets: THREE.Object3D[] = [];
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      targets.push(e.hitBody, e.hitHead);
    }
    for (const c of this.colliderMeshes) targets.push(c);
    const hits = this.raycaster.intersectObjects(targets, false);

    let endPoint = origin.clone().addScaledVector(dir, 140);
    if (hits.length) {
      const hit = hits[0];
      endPoint = hit.point.clone();
      const ud = hit.object.userData as { enemy?: Enemy; part?: string };
      if (ud.enemy) {
        const headshot = ud.part === "head";
        this.damageEnemy(ud.enemy, headshot ? 100 : 34, headshot, hit.point);
      } else {
        // wall / ground impact sparks
        this.spawnParticles(hit.point, 0xddc48a, 8, 4);
      }
    }

    // tracer from muzzle to endpoint
    this.spawnTracer(this.tmpV.clone(), endPoint);
    this.tmpV.set(0, 0, 0); // reset temp (muzzle world pos was in tmpV)
  }

  private damageEnemy(
    e: Enemy,
    dmg: number,
    headshot: boolean,
    point: THREE.Vector3,
    source: "player" | "companion" = "player"
  ) {
    e.health -= dmg;
    if (source === "player") {
      this.shotsHit++;
      this.cb.onHitMarker(headshot);
    }
    sfx.hit();
    if (headshot) sfx.headshot();
    // blood-ish hit particles
    this.spawnParticles(point, headshot ? 0xff5a4d : 0xb83a30, headshot ? 14 : 8, 5);

    if (e.health <= 0 && e.state !== "dead") {
      this.killEnemy(e, headshot, source);
    } else {
      // React with a short stagger before returning to autonomous combat.
      e.state = "engage";
      e.action = "hit";
      e.hitT = headshot ? 0.34 : 0.2;
      e.actionT = e.hitT;
    }
    this.hudDirty = true;
  }

  private killEnemy(e: Enemy, headshot: boolean, source: "player" | "companion" = "player") {
    e.state = "dead";
    e.deathT = 0;
    e.health = 0;
    sfx.death();
    this.spawnParticles(e.pos.clone().setY(1.1), 0x992222, 22, 6);
    this.shake = Math.min(0.18, this.shake + 0.05);

    // scoring
    this.kills++;
    this.alive--;
    if (performance.now() / 1000 - this.comboT < 5) this.combo = Math.min(this.combo + 1, 5);
    else this.combo = 1;
    this.comboT = performance.now() / 1000;
    const base = 100 + (headshot ? 75 : 0);
    const gained = base * this.combo;
    this.score += gained;
    if (headshot && source === "player") this.headshots++;

    this.cb.onKillFeed(
      `${source === "companion" ? "MAYA " : ""}${headshot ? "HEADSHOT " : ""}Eliminated  +${gained}${this.combo > 1 ? `  x${this.combo}` : ""}`,
      headshot
    );

    // drop pickup
    if (Math.random() < 0.55) {
      this.spawnPickup(e.pos.clone(), Math.random() < 0.4 ? "health" : "ammo");
    }
    this.hudDirty = true;
  }

  // ---------------------------------------------------------------- enemies
  private updateEnemies(dt: number) {
    const now = performance.now() / 1000;
    const targetActive = Math.min(this.desiredNearby, this.alive - 1);
    let living = 0;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      if (e.state === "dead") {
        e.deathT += dt;
        // fall over + sink
        const t = clamp(e.deathT / 0.5, 0, 1);
        e.rig.root.rotation.x = -t * (Math.PI / 2 - 0.1);
        e.rig.root.position.y = -Math.min(0.9, e.deathT * 0.9);
        if (e.deathT > 0.5) {
          const fade = clamp(1 - (e.deathT - 0.5) / 1.0, 0, 1);
          e.rig.materials.forEach((m) => {
            m.transparent = true;
            m.opacity = fade;
          });
        }
        e.barBg.visible = false;
        e.barFill.visible = false;
        if (e.deathT > 1.6) {
          this.scene.remove(e.rig.root);
          e.rig.dispose();
          this.scene.remove(e.hitBody);
          this.scene.remove(e.hitHead);
          this.scene.remove(e.barBg);
          this.scene.remove(e.barFill);
          this.enemies.splice(i, 1);
        }
        continue;
      }

      living++;
      e.actionT = Math.max(0, e.actionT - dt);
      e.hitT = Math.max(0, e.hitT - dt);
      e.memoryT = Math.max(0, e.memoryT - dt);
      e.decisionCd -= dt;
      e.burstCd = Math.max(0, e.burstCd - dt);
      const toP = this.tmpV2.set(this.pPos.x - e.pos.x, 0, this.pPos.z - e.pos.z);
      const distP = toP.length();
      toP.normalize();

      // line of sight (throttled)
      e.losCd -= dt;
      if (e.losCd <= 0) {
        e.losCd = 0.25;
        e.hasLos = this.checkLos(e);
        if (e.hasLos) {
          e.memoryPos.copy(this.pPos);
          e.memoryT = 5.5;
        }
      }

      // Tactical decisions are made less often than movement. That gives every
      // bot a readable intent rather than a jittery random walk.
      if (e.decisionCd <= 0) {
        e.decisionCd = rand(0.7, 1.5);
        if (e.role === "guardian" && (e.health < 68 || Math.random() < 0.38)) {
          e.coverTarget = this.chooseCover(e);
        } else if (e.role === "hunter" && e.health < 42) {
          e.coverTarget = this.chooseCover(e);
        } else if (e.role === "flanker") {
          e.flankSign = Math.random() < 0.5 ? -1 : 1;
        }
      }

      const engaging = distP < 52 && (e.hasLos || e.memoryT > 0);
      let moveDir = this.tmpV.set(0, 0, 0);

      if (engaging) {
        e.state = "engage";
        if (e.hasLos) e.yaw = Math.atan2(toP.x, toP.z);

        if (!e.hasLos && e.memoryT > 0) {
          moveDir.set(e.memoryPos.x - e.pos.x, 0, e.memoryPos.z - e.pos.z);
          if (moveDir.lengthSq() > 0.05) moveDir.normalize();
          if (e.hitT <= 0) e.action = "run";
        } else if (e.coverTarget && e.pos.distanceTo(e.coverTarget) > 1.5) {
          moveDir.set(e.coverTarget.x - e.pos.x, 0, e.coverTarget.z - e.pos.z).normalize();
          if (e.hitT <= 0) e.action = "run";
        } else if (e.role === "rusher" && distP > 9) {
          moveDir.copy(toP);
          if (e.hitT <= 0) e.action = "run";
        } else if (e.role === "flanker" && distP > 8) {
          const side = new THREE.Vector3(-toP.z, 0, toP.x).multiplyScalar(e.flankSign);
          moveDir.copy(toP).multiplyScalar(0.58).addScaledVector(side, 0.82).normalize();
          if (e.hitT <= 0) e.action = "run";
        } else if (distP < 10 || (e.health < 35 && distP < 18)) {
          moveDir.copy(toP).multiplyScalar(-1);
          if (e.hitT <= 0) e.action = "evade";
        } else {
          // Suppressive strafe keeps bots mobile while taking aimed bursts.
          moveDir.set(-toP.z, 0, toP.x).multiplyScalar(Math.sin(now * 1.3 + e.animT + e.flankSign) > 0 ? 1 : -1);
          if (e.hitT <= 0 && e.actionT <= 0) {
            const choice = Math.random();
            e.action = choice < 0.11 ? "reload" : choice < 0.36 ? "evade" : "aim";
            e.actionT = e.action === "reload" ? rand(0.8, 1.25) : rand(0.35, 1.1);
          }
        }
        // Human-like short bursts: acquire target, fire 2-4 rounds, relocate.
        e.fireCd -= dt;
        if (e.hasLos && e.burstShots <= 0 && e.burstCd <= 0 && e.action !== "reload") {
          e.burstShots = Math.floor(rand(2, e.role === "hunter" ? 5 : 4));
        }
        if (e.hasLos && e.burstShots > 0 && e.fireCd <= 0 && distP < 42 && e.action !== "reload" && e.hitT <= 0) {
          this.enemyFire(e, distP);
          e.burstShots--;
          e.fireCd = e.role === "hunter" ? rand(0.14, 0.22) : rand(0.19, 0.31);
          if (e.burstShots <= 0) {
            e.burstCd = rand(0.7, 1.6);
            if (e.role === "guardian") e.coverTarget = this.chooseCover(e);
          }
        }
      } else {
        e.state = "wander";
        e.wanderCd -= dt;
        if (e.wanderCd <= 0 || e.pos.distanceTo(e.wanderTarget) < 2) {
          e.wanderCd = rand(2, 4.5);
          // wander toward zone center-ish
          const ang = rand(0, Math.PI * 2);
          const rr = rand(4, this.zoneRadius * 0.6);
          e.wanderTarget.set(
            this.zoneCenter.x + Math.cos(ang) * rr,
            0,
            this.zoneCenter.z + Math.sin(ang) * rr
          );
        }
        const w = this.tmpV.set(e.wanderTarget.x - e.pos.x, 0, e.wanderTarget.z - e.pos.z);
        if (w.length() > 2.2) {
          moveDir.copy(w.normalize());
          if (e.hitT <= 0) e.action = "patrol";
        } else if (e.hitT <= 0 && e.actionT <= 0) {
          e.action = "idle";
          e.actionT = rand(1.2, 3.5);
          e.idleStyle = Math.floor(rand(0, 4));
        }
      }

      // steer back into zone if outside
      const dz = Math.hypot(e.pos.x - this.zoneCenter.x, e.pos.z - this.zoneCenter.z);
      if (dz > this.zoneRadius - 2) {
        const back = this.tmpV
          .set(this.zoneCenter.x - e.pos.x, 0, this.zoneCenter.z - e.pos.z)
          .normalize();
        moveDir.addScaledVector(back, 2);
        e.health -= 4 * dt; // zone hurts them too
        if (e.health <= 0) {
          this.killEnemy(e, false);
          continue;
        }
      }

      if (moveDir.lengthSq() > 0.01) {
        moveDir.normalize();
        const actionSpeed = e.action === "run" ? e.speed * 1.22 : e.action === "evade" ? e.speed * 1.08 : e.speed;
        e.pos.x += moveDir.x * actionSpeed * dt;
        e.pos.z += moveDir.z * actionSpeed * dt;
        if (e.state === "wander") e.yaw = Math.atan2(moveDir.x, moveDir.z);
      }

      this.resolveCircle(e.pos, 0.5);
      e.pos.x = clamp(e.pos.x, -this.arenaHalf + 1, this.arenaHalf - 1);
      e.pos.z = clamp(e.pos.z, -this.arenaHalf + 1, this.arenaHalf - 1);

      // Each bot selects its own visual action: patrol, scan, aim, fire,
      // reload, evade and hit-reaction. The action state is independent from
      // the core combat loop, so squads never animate in lockstep.
      e.animT += dt;
      let rigMotion: RigMotion = "idle";
      if (e.hitT > 0) rigMotion = "hit";
      else if (e.action === "patrol") rigMotion = "walk";
      else if (e.action === "run") rigMotion = "sprint";
      else if (e.action === "evade") rigMotion = "evade";
      else if (e.action === "reload") rigMotion = "reload";
      else if (e.action === "fire") rigMotion = "fire";
      else if (e.action === "aim") rigMotion = "aim";
      const rigSpeed = moveDir.lengthSq() > 0.01 ? e.speed : 0;
      this.animateHumanoid(e.rig, {
        motion: rigMotion,
        speed: rigSpeed,
        recoil: e.action === "fire" ? Math.max(0.15, e.actionT * 7) : 0,
        reloadProgress: e.action === "reload" ? 1 - clamp(e.actionT / 1.25, 0, 1) : 0,
        hit: e.hitT * 4,
        idleStyle: e.idleStyle,
      }, dt);
      e.rig.root.position.set(e.pos.x, 0, e.pos.z);
      e.rig.root.rotation.y = e.yaw;
      e.rig.root.rotation.x = 0;

      // hitboxes follow
      e.hitBody.position.set(e.pos.x, 1.05, e.pos.z);
      e.hitHead.position.set(e.pos.x, 1.78, e.pos.z);

      // health bar billboard
      const lowHp = e.health < e.maxHealth;
      e.barBg.visible = lowHp;
      e.barFill.visible = lowHp;
      if (lowHp) {
        const frac = clamp(e.health / e.maxHealth, 0, 1);
        e.barFill.scale.x = frac;
        e.barFill.position.x = e.pos.x - (1 - frac) * 0.5;
        e.barBg.position.set(e.pos.x, e.pos.y + 2.25, e.pos.z);
        e.barFill.position.y = e.pos.y + 2.25;
        e.barFill.position.z = e.pos.z;
        e.barBg.position.z = e.pos.z;
        (e.barFill.material as THREE.MeshBasicMaterial).color.setHex(frac > 0.5 ? 0x7CFF6B : frac > 0.25 ? 0xffcc33 : 0xff4d4d);
        e.barBg.lookAt(this.camera.position);
        e.barFill.lookAt(this.camera.position);
      }
    }

    // respawn to maintain pressure (but not beyond remaining contestants)
    if (this.alive - 1 > 0 && living < targetActive) {
      this.spawnEnemy();
    }
    // win check
    if (this.alive <= 1 && living === 0) {
      this.endMatch(true);
    }
  }

  private checkLos(e: Enemy): boolean {
    const from = new THREE.Vector3(e.pos.x, 1.4, e.pos.z);
    const to = new THREE.Vector3(this.pPos.x, 1.3, this.pPos.z);
    return this.checkLineToPosition(from, to);
  }

  private checkLineToPosition(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist < 0.01) return true;
    dir.normalize();
    this.raycaster.set(from, dir);
    this.raycaster.far = dist - 0.5;
    const hits = this.raycaster.intersectObjects(this.colliderMeshes, false);
    this.raycaster.far = Infinity;
    return hits.length === 0;
  }

  private chooseCover(enemy: Enemy): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestScore = Infinity;
    for (const point of this.coverPoints) {
      const fromEnemy = point.distanceTo(enemy.pos);
      const fromPlayer = point.distanceTo(this.pPos);
      if (fromEnemy > 24 || fromPlayer < 5) continue;
      // Prefer nearby cover that forces a new angle rather than standing in
      // the same firing lane. Guardians favour defensive spots slightly more.
      const lineOpen = this.checkLineToPosition(
        new THREE.Vector3(point.x, 1.2, point.z),
        new THREE.Vector3(this.pPos.x, 1.3, this.pPos.z)
      );
      const score = fromEnemy + (lineOpen ? 8 : 0) + Math.abs(fromPlayer - 16) * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = point;
      }
    }
    return best?.clone() ?? null;
  }

  private enemyFire(e: Enemy, dist: number) {
    e.action = "fire";
    e.actionT = 0.16;
    sfx.enemyShoot();
    const muzzle = this.tmpV.set(e.pos.x, 1.4, e.pos.z);
    const mayaAvailable =
      this.companion &&
      !this.driving &&
      this.companion.action !== "downed" &&
      this.companion.action !== "dead";
    const targetMaya = mayaAvailable && Math.random() < 0.38;
    const targetPos = targetMaya ? this.companion.pos : this.pPos;
    const target = this.tmpV2.set(targetPos.x, (targetMaya ? 1.26 : 1.3) + rand(-0.2, 0.2), targetPos.z);
    this.spawnTracer(muzzle.clone(), target.clone());
    // muzzle flash small
    this.flashLife = Math.max(this.flashLife, 0.04);
    this.muzzleFlash.position.copy(muzzle);

    // Role-specific aim makes hunters dangerous while rushers rely on pressure.
    const aimBonus = e.role === "hunter" ? 0.1 : e.role === "guardian" ? 0.045 : 0;
    let chance = clamp(0.43 + aimBonus - dist * 0.011, 0.06, 0.48);
    if (targetMaya ? this.companion.rig.moving : this.player.moving) chance -= 0.08;
    if (Math.random() < chance) {
      const dmg = rand(e.role === "hunter" ? 6 : 4, e.role === "hunter" ? 9 : 7);
      if (targetMaya) {
        this.damageCompanion(dmg);
        this.spawnParticles(this.tmpV.set(this.companion.pos.x, 1.28, this.companion.pos.z), 0xff5a4d, 5, 3);
      } else {
        this.damagePlayer(dmg);
        this.spawnParticles(this.tmpV.set(this.pPos.x, 1.3, this.pPos.z), 0xff5a4d, 5, 3);
      }
    }
  }

  private damagePlayer(dmg: number) {
    if (this.gameOver) return;
    this.health -= dmg;
    const now = performance.now();
    this.lastHitT = now;
    this.playerHitT = Math.min(1, this.playerHitT + Math.min(0.7, dmg * 0.08));
    this.shake = Math.min(0.22, this.shake + dmg * 0.012);
    if (now - this.lastDmgCb > 0.08) {
      this.lastDmgCb = now;
      this.cb.onDamage();
    }
    if (dmg > 3) sfx.hurt();
    this.hudDirty = true;
    if (this.health <= 0) {
      this.health = 0;
      this.endMatch(false);
    }
  }

  // ---------------------------------------------------------------- zone
  private updateZone(dt: number) {
    const phase = ZONE_PHASES[Math.min(this.zonePhaseIdx, ZONE_PHASES.length - 1)];
    this.zoneTimer -= dt;
    if (this.zoneShrinking) {
      const total = phase.shrink;
      const elapsed = total - this.zoneTimer;
      const t = clamp(elapsed / total, 0, 1);
      this.zoneRadius = lerp(this.zoneStartR, this.zoneTargetR, t);
      if (t >= 1) {
        this.zoneShrinking = false;
        this.zonePhaseIdx = Math.min(this.zonePhaseIdx + 1, ZONE_PHASES.length - 1);
        const next = ZONE_PHASES[Math.min(this.zonePhaseIdx, ZONE_PHASES.length - 1)];
        this.zoneTimer = next.wait;
        if (this.zonePhaseIdx >= ZONE_PHASES.length - 1) {
          // final phase hold
          this.zoneShrinking = false;
        }
      }
    } else {
      if (this.zoneTimer <= 0 && this.zonePhaseIdx < ZONE_PHASES.length - 1) {
        // begin shrink
        this.zoneStartR = this.zoneRadius;
        this.zoneTargetR = phase.radius;
        this.zoneShrinking = true;
        this.zoneTimer = phase.shrink;
        // shift center slightly
        const ang = rand(0, Math.PI * 2);
        const shift = rand(0, (this.zoneStartR - this.zoneTargetR) * 0.5);
        this.zoneCenter.x += Math.cos(ang) * shift;
        this.zoneCenter.z += Math.sin(ang) * shift;
        sfx.zoneAlarm();
      }
    }
    this.updateZoneVisual();

    // simulated off-screen eliminations
    this.simCd -= dt;
    if (this.simCd <= 0 && this.alive - 1 > this.desiredNearby) {
      this.simCd = rand(2.2, 4.0);
      this.alive--;
      this.hudDirty = true;
    }
  }

  private updateZoneVisual() {
    this.zoneMesh.scale.set(this.zoneRadius, 1, this.zoneRadius);
    this.zoneMesh.position.set(this.zoneCenter.x, 20, this.zoneCenter.z);
    this.zoneRing.scale.set(this.zoneRadius, this.zoneRadius, 1);
    this.zoneRing.position.set(this.zoneCenter.x, 0.06, this.zoneCenter.z);
    const col = this.zoneShrinking ? 0xff5a4d : 0x4fb8ff;
    (this.zoneMesh.material as THREE.MeshBasicMaterial).color.setHex(col);
  }

  // ---------------------------------------------------------------- fx
  private spawnParticles(at: THREE.Vector3, color: number, count: number, speed: number) {
    let spawned = 0;
    for (const p of this.particles) {
      if (p.active) continue;
      p.active = true;
      p.mesh.visible = true;
      p.mesh.position.copy(at);
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      mat.opacity = 1;
      p.vel.set(rand(-1, 1), rand(0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(speed * 0.3, speed));
      p.vel.y += rand(1, 3);
      p.maxLife = rand(0.4, 0.85);
      p.life = p.maxLife;
      p.gravity = 9;
      p.spin = rand(-8, 8);
      const s = rand(0.4, 1.2);
      p.mesh.scale.setScalar(s);
      spawned++;
      if (spawned >= count) break;
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.y += p.spin * dt;
      const k = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = k;
      p.mesh.scale.setScalar(0.4 + k * 0.8);
    }
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3) {
    for (const t of this.tracers) {
      if (t.active) continue;
      t.active = true;
      t.mesh.visible = true;
      t.life = 0.06;
      const mid = from.clone().add(to).multiplyScalar(0.5);
      t.mesh.position.copy(mid);
      const len = from.distanceTo(to);
      t.mesh.scale.set(0.025, 0.025, len);
      t.mesh.lookAt(to);
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
      return;
    }
  }

  private updateTracers(dt: number) {
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = clamp(t.life / 0.06, 0, 1) * 0.9;
    }
  }

  private spawnPickup(at: THREE.Vector3, kind: "health" | "ammo") {
    const g = new THREE.Group();
    const color = kind === "health" ? 0x33dd55 : 0xffcc33;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.6,
        roughness: 0.4,
      })
    );
    box.castShadow = true;
    g.add(box);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.05, 8, 20),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const at2 = at.clone();
    at2.y = 0.6;
    g.position.copy(at2);
    this.scene.add(g);
    this.pickups.push({ mesh: g, pos: at2, kind, t: 0 });
  }

  private updatePickups(dt: number) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 0.6 + Math.sin(p.t * 3) * 0.12;
      const d = Math.hypot(p.pos.x - this.pPos.x, p.pos.z - this.pPos.z);
      if (d < 1.4) {
        if (p.kind === "health") {
          this.health = Math.min(this.maxHealth, this.health + 35);
          this.cb.onKillFeed("Health +35", false);
        } else {
          this.reserve += 60;
          this.cb.onKillFeed("Ammo +60", false);
        }
        sfx.click();
        this.hudDirty = true;
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- match flow
  private updateMatch(dt: number) {
    if (this.combo > 0 && performance.now() / 1000 - this.comboT > 5) {
      this.combo = 0;
      this.hudDirty = true;
    }
    // survival score trickle
    this.score += dt * 2;
    this.updateTracers(dt);
  }

  private endMatch(win: boolean) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.running = false;
    this.firing = false;
    if (this.pointerLocked) document.exitPointerLock?.();
    if (win) sfx.victory();
    const timeMs = performance.now() - this.matchStart;
    const placement = win ? 1 : this.alive;
    const bonus = win ? 1500 : 0;
    this.score += bonus;
    this.cb.onGameOver({
      win,
      score: Math.round(this.score),
      kills: this.kills,
      headshots: this.headshots,
      timeMs,
      placement,
      shots: this.shotsFired,
      hits: this.shotsHit,
    });
  }

  // ---------------------------------------------------------------- hud
  private updateHud(dt: number) {
    this.hudCd -= dt;
    this.miniCd -= dt;
    if (this.hudDirty || this.hudCd <= 0) {
      this.hudCd = 0.1;
      this.hudDirty = false;
      const dz = Math.hypot(this.pPos.x - this.zoneCenter.x, this.pPos.z - this.zoneCenter.z);
      const nearbyVehicle = this.driving ? null : this.nearestVehicle(4.4);
      const companionDistance = Math.hypot(
        this.companion.pos.x - this.pPos.x,
        this.companion.pos.z - this.pPos.z
      );
      const companionStatus = this.companion.action === "dead"
        ? "ELIMINATED"
        : this.companion.action === "downed"
          ? `DOWNED ${Math.ceil(this.companion.downedT)}s`
          : this.companion.reloading
            ? "RELOADING"
            : this.companion.action === "fire"
              ? "ENGAGING"
              : this.companion.action === "aim" || this.companion.action === "alert"
                ? "COVERING"
                : "FOLLOWING";
      this.cb.onHud({
        health: Math.round(this.health),
        maxHealth: this.maxHealth,
        ammo: this.ammo,
        magSize: this.magSize,
        reserve: this.reserve,
        reloading: this.reloading,
        kills: this.kills,
        score: Math.round(this.score),
        alive: Math.max(1, this.alive),
        zonePhase: Math.min(this.zonePhaseIdx + 1, ZONE_PHASES.length),
        zoneText: this.zoneStatusText(),
        inZone: dz <= this.zoneRadius,
        combo: this.combo,
        vehicleName: this.driving?.model.spec.shortName ?? null,
        vehiclePrompt: this.driving
          ? `EXIT ${this.driving.model.spec.shortName}`
          : nearbyVehicle
            ? `DRIVE ${nearbyVehicle.model.spec.shortName}`
            : null,
        vehicleSpeed: this.driving ? Math.round(Math.abs(this.driving.speed) * 3.6) : 0,
        vehicleIsAir: this.driving?.model.spec.mode === "air",
        companionHealth: Math.round(this.companion.health),
        companionMaxHealth: this.companion.maxHealth,
        companionStatus,
        companionPrompt:
          this.companion.action === "downed" && companionDistance < 2.8
            ? "REVIVE MAYA"
            : null,
      });
    }
    if (this.miniCd <= 0) {
      this.miniCd = 0.12;
      this.drawMinimap();
    }
  }

  private zoneStatusText(): string {
    if (this.zonePhaseIdx >= ZONE_PHASES.length - 1 && !this.zoneShrinking && this.zoneTimer <= 0) {
      return "FINAL ZONE";
    }
    if (this.zoneShrinking) return "ZONE CLOSING";
    return `PHASE ${Math.min(this.zonePhaseIdx + 1, ZONE_PHASES.length)} • SHRINKS IN ${Math.ceil(this.zoneTimer)}s`;
  }

  private drawMinimap() {
    const c = this.minimap;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = c.width;
    const H = c.height;
    const span = this.arenaHalf * 2 + 8;
    const toMap = (x: number, z: number) => ({
      x: ((x + this.arenaHalf + 4) / span) * W,
      y: ((z + this.arenaHalf + 4) / span) * H,
    });
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(12,18,16,0.85)";
    ctx.fillRect(0, 0, W, H);

    // zone circle
    const cz = toMap(this.zoneCenter.x, this.zoneCenter.z);
    const rPx = (this.zoneRadius / span) * W;
    ctx.strokeStyle = this.zoneShrinking ? "#ff5a4d" : "#4fb8ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cz.x, cz.y, rPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(79,184,255,0.08)";
    ctx.fill();

    // enemies
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      const m = toMap(e.pos.x, e.pos.z);
      ctx.fillStyle = "#ff4d4d";
      ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
    }
    // pickups
    for (const p of this.pickups) {
      const m = toMap(p.pos.x, p.pos.z);
      ctx.fillStyle = p.kind === "health" ? "#33dd55" : "#ffcc33";
      ctx.fillRect(m.x - 1, m.y - 1, 2, 2);
    }
    // vehicle markers
    for (const v of this.vehicles) {
      const m = toMap(v.pos.x, v.pos.z);
      ctx.fillStyle = v === this.driving ? "#ffffff" : v.model.spec.mode === "air" ? "#c58dff" : "#8fd6ff";
      ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
    }
    // player
    const pm = toMap(this.pPos.x, this.pPos.z);
    ctx.save();
    ctx.translate(pm.x, pm.y);
    ctx.rotate(-this.pYaw);
    ctx.fillStyle = "#7CFF6B";
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(3, 4);
    ctx.lineTo(-3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- lifecycle
  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    this.renderer.domElement.removeEventListener("mousemove", this._onMouseMove);
    this.renderer.domElement.removeEventListener("mousedown", this._onMouseDown);
    window.removeEventListener("mouseup", this._onMouseUp);
    this.renderer.domElement.removeEventListener("contextmenu", this._onContext);
    document.removeEventListener("pointerlockchange", this._onLockChange);
    window.removeEventListener("resize", this._onResize);
    this.enemies.forEach((e) => e.rig.dispose());
    this.player?.dispose();
    this.companion?.rig.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
