import * as THREE from "three";

export type VehicleKind =
  | "rickshaw"
  | "taxi"
  | "cng"
  | "bus"
  | "buggy"
  | "helicopter"
  | "plane"
  | "fighter"
  | "boat";

export type AnimalKind =
  | "horse"
  | "deer"
  | "goat"
  | "dog"
  | "cow"
  | "wolf"
  | "tiger"
  | "bird"
  | "eagle";

export interface VehicleSpec {
  kind: VehicleKind;
  name: string;
  shortName: string;
  mode: "ground" | "air" | "water";
  maxSpeed: number;
  reverseSpeed: number;
  accel: number;
  turn: number;
  radius: number;
  cameraHeight: number;
}

export interface VehicleModel {
  root: THREE.Group;
  rotor?: THREE.Object3D;
  wheels: THREE.Object3D[];
  spec: VehicleSpec;
}

export interface AnimalModel {
  root: THREE.Group;
  wingL?: THREE.Object3D;
  wingR?: THREE.Object3D;
  kind: AnimalKind;
  speed: number;
}

export const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec> = {
  rickshaw: { kind: "rickshaw", name: "CITY RICKSHAW", shortName: "RICKSHAW", mode: "ground", maxSpeed: 11, reverseSpeed: 4, accel: 17, turn: 2.25, radius: 1.15, cameraHeight: 1.5 },
  taxi: { kind: "taxi", name: "YELLOW TAXI", shortName: "TAXI", mode: "ground", maxSpeed: 19, reverseSpeed: 7, accel: 24, turn: 1.72, radius: 1.3, cameraHeight: 1.55 },
  cng: { kind: "cng", name: "GREEN CNG", shortName: "CNG", mode: "ground", maxSpeed: 15, reverseSpeed: 6, accel: 20, turn: 1.95, radius: 1.16, cameraHeight: 1.55 },
  bus: { kind: "bus", name: "BATTLE BUS", shortName: "BUS", mode: "ground", maxSpeed: 14, reverseSpeed: 5, accel: 14, turn: 0.92, radius: 2.1, cameraHeight: 2.2 },
  buggy: { kind: "buggy", name: "RAID BUGGY", shortName: "BUGGY", mode: "ground", maxSpeed: 24, reverseSpeed: 9, accel: 30, turn: 2.1, radius: 1.25, cameraHeight: 1.25 },
  helicopter: { kind: "helicopter", name: "SCOUT HELICOPTER", shortName: "HELI", mode: "air", maxSpeed: 26, reverseSpeed: 8, accel: 18, turn: 1.35, radius: 1.8, cameraHeight: 2.8 },
  plane: { kind: "plane", name: "CARGO PLANE", shortName: "PLANE", mode: "air", maxSpeed: 36, reverseSpeed: 0, accel: 15, turn: 0.78, radius: 2.3, cameraHeight: 2.6 },
  fighter: { kind: "fighter", name: "FIGHTER JET", shortName: "JET", mode: "air", maxSpeed: 46, reverseSpeed: 0, accel: 22, turn: 1.05, radius: 1.65, cameraHeight: 1.8 },
  boat: { kind: "boat", name: "PATROL BOAT", shortName: "BOAT", mode: "water", maxSpeed: 17, reverseSpeed: 6, accel: 17, turn: 1.5, radius: 1.55, cameraHeight: 1.75 },
};

const std = (color: number, roughness = 0.6, metalness = 0.2) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(g: THREE.Group, size: [number, number, number], pos: [number, number, number], material: THREE.Material, bevel = false) {
  const m = new THREE.Mesh(
    bevel ? new THREE.BoxGeometry(size[0], size[1], size[2], 2, 2, 2) : new THREE.BoxGeometry(...size),
    material
  );
  m.position.set(...pos);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function cylinder(g: THREE.Group, radius: number, height: number, pos: [number, number, number], material: THREE.Material, rotation: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), material);
  m.position.set(...pos);
  m.rotation.set(...rotation);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function wheel(g: THREE.Group, pos: [number, number, number], scale = 1) {
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28 * scale, 0.28 * scale, 0.18 * scale, 12),
    std(0x101114, 0.8, 0.15)
  );
  tire.rotation.z = Math.PI / 2;
  tire.position.set(...pos);
  tire.castShadow = true;
  g.add(tire);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.12 * scale, 0.185 * scale, 10), std(0xbec4c4, 0.35, 0.8));
  hub.rotation.z = Math.PI / 2;
  hub.position.set(...pos);
  g.add(hub);
  return tire;
}

function windowMesh(g: THREE.Group, size: [number, number, number], pos: [number, number, number]) {
  return box(g, size, pos, std(0x102b38, 0.12, 0.8));
}

function addLights(g: THREE.Group, z: number, width: number) {
  const lamp = std(0xffe4a1, 0.2, 0.1);
  const red = std(0xcc1f25, 0.25, 0.1);
  box(g, [0.22, 0.12, 0.05], [-width, 0.5, z], lamp);
  box(g, [0.22, 0.12, 0.05], [width, 0.5, z], lamp);
  box(g, [0.17, 0.1, 0.05], [-width, 0.5, -z], red);
  box(g, [0.17, 0.1, 0.05], [width, 0.5, -z], red);
}

function makeCar(color: number, taxi = false) {
  const g = new THREE.Group();
  const body = std(color, 0.45, 0.35);
  box(g, [1.5, 0.42, 2.75], [0, 0.55, 0], body, true);
  box(g, [1.3, 0.5, 1.25], [0, 0.98, -0.16], body, true);
  windowMesh(g, [1.33, 0.33, 0.52], [0, 1.05, 0.32]);
  windowMesh(g, [1.33, 0.33, 0.38], [0, 1.05, -0.73]);
  windowMesh(g, [0.04, 0.33, 0.75], [0.68, 1.05, -0.17]);
  windowMesh(g, [0.04, 0.33, 0.75], [-0.68, 1.05, -0.17]);
  const wheels = [
    wheel(g, [-0.78, 0.33, 0.82]), wheel(g, [0.78, 0.33, 0.82]),
    wheel(g, [-0.78, 0.33, -0.82]), wheel(g, [0.78, 0.33, -0.82]),
  ];
  addLights(g, 1.4, 0.49);
  if (taxi) {
    box(g, [0.52, 0.18, 0.26], [0, 1.34, -0.12], std(0xf4f1cf, 0.4, 0.1));
    box(g, [0.25, 0.04, 0.28], [0, 1.44, -0.12], std(0x101114));
  }
  return { root: g, wheels };
}

function makeRickshaw() {
  const g = new THREE.Group();
  const green = std(0x1a7f54, 0.55, 0.2);
  const trim = std(0xf1b82d, 0.45, 0.2);
  box(g, [1.42, 0.45, 1.5], [0, 0.55, -0.25], green);
  box(g, [1.45, 0.12, 1.58], [0, 1.55, -0.25], trim);
  // canopy poles and seat
  for (const x of [-0.63, 0.63]) {
    cylinder(g, 0.035, 1.1, [x, 1.05, -0.72], trim);
    cylinder(g, 0.035, 1.1, [x, 1.05, 0.32], trim);
  }
  box(g, [1.15, 0.2, 0.65], [0, 0.95, -0.42], std(0x3b2818));
  box(g, [0.2, 0.2, 1.5], [0, 0.48, 1.18], green);
  const wheels = [wheel(g, [-0.78, 0.3, -0.42], 1.05), wheel(g, [0.78, 0.3, -0.42], 1.05), wheel(g, [0, 0.28, 1.18], 0.85)];
  return { root: g, wheels };
}

function makeCng() {
  const g = new THREE.Group();
  const green = std(0x167556, 0.5, 0.25);
  const black = std(0x171a19);
  box(g, [1.4, 0.45, 1.9], [0, 0.55, -0.12], green);
  box(g, [1.28, 0.9, 1.05], [0, 1.08, -0.35], green);
  windowMesh(g, [1.3, 0.55, 0.7], [0, 1.17, -0.13]);
  box(g, [1.42, 0.08, 1.08], [0, 1.56, -0.35], black);
  const wheels = [wheel(g, [-0.74, 0.3, 0.65]), wheel(g, [0.74, 0.3, 0.65]), wheel(g, [-0.74, 0.3, -0.7]), wheel(g, [0.74, 0.3, -0.7])];
  addLights(g, 1.05, 0.44);
  return { root: g, wheels };
}

function makeBus() {
  const g = new THREE.Group();
  const blue = std(0x1e5a86, 0.5, 0.28);
  const stripe = std(0xe8c44c, 0.4, 0.15);
  box(g, [2.05, 1.4, 4.7], [0, 1.1, 0], blue, true);
  box(g, [2.1, 0.2, 4.76], [0, 0.55, 0], stripe);
  for (let z = -1.45; z <= 1.45; z += 0.7) {
    windowMesh(g, [0.05, 0.55, 0.46], [1.05, 1.35, z]);
    windowMesh(g, [0.05, 0.55, 0.46], [-1.05, 1.35, z]);
  }
  windowMesh(g, [1.48, 0.55, 0.04], [0, 1.35, 2.37]);
  const wheels = [
    wheel(g, [-1.06, 0.45, 1.42], 1.35), wheel(g, [1.06, 0.45, 1.42], 1.35),
    wheel(g, [-1.06, 0.45, -1.42], 1.35), wheel(g, [1.06, 0.45, -1.42], 1.35),
  ];
  addLights(g, 2.38, 0.72);
  return { root: g, wheels };
}

function makeBuggy() {
  const g = new THREE.Group();
  const orange = std(0xb84f22, 0.5, 0.35);
  const tube = std(0x1a1b1c, 0.45, 0.7);
  box(g, [1.5, 0.35, 2.2], [0, 0.55, 0], orange);
  box(g, [1.1, 0.22, 0.7], [0, 0.82, -0.3], std(0x222a2e));
  for (const x of [-0.65, 0.65]) {
    cylinder(g, 0.045, 1.2, [x, 1.2, -0.45], tube, [0.38, 0, 0]);
    cylinder(g, 0.045, 1.2, [x, 1.2, 0.43], tube, [-0.38, 0, 0]);
  }
  const wheels = [wheel(g, [-0.83, 0.33, 0.72], 1.25), wheel(g, [0.83, 0.33, 0.72], 1.25), wheel(g, [-0.83, 0.33, -0.72], 1.25), wheel(g, [0.83, 0.33, -0.72], 1.25)];
  addLights(g, 1.12, 0.47);
  return { root: g, wheels };
}

function makeHelicopter() {
  const g = new THREE.Group();
  const olive = std(0x475b3a, 0.55, 0.35);
  const glass = std(0x1f6678, 0.15, 0.7);
  const fuselage = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10), olive);
  fuselage.scale.set(1.1, 0.75, 1.5);
  fuselage.position.y = 1.25;
  fuselage.castShadow = true;
  g.add(fuselage);
  box(g, [1.05, 0.55, 0.72], [0, 1.33, 0.82], glass);
  box(g, [0.16, 0.18, 3.2], [0, 1.25, -2.05], olive);
  box(g, [1.4, 0.08, 0.42], [0, 1.25, -3.42], olive);
  cylinder(g, 0.06, 1.25, [0, 2.3, 0], std(0x242524), [0, 0, 0]);
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.94, 0);
  box(rotor, [0.12, 0.04, 5.2], [0, 0, 0], std(0x232525));
  box(rotor, [5.2, 0.04, 0.12], [0, 0, 0], std(0x232525));
  g.add(rotor);
  for (const x of [-0.68, 0.68]) box(g, [0.08, 0.08, 2.4], [x, 0.3, 0], std(0x202321));
  box(g, [1.7, 0.08, 0.08], [0, 0.3, 0.8], std(0x202321));
  return { root: g, wheels: [], rotor };
}

function makePlane(fighter = false) {
  const g = new THREE.Group();
  const body = std(fighter ? 0x3f4852 : 0xd2d8d7, 0.35, 0.65);
  const accent = std(fighter ? 0x31465c : 0x507b98, 0.4, 0.5);
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(fighter ? 0.42 : 0.7, fighter ? 0.58 : 0.82, fighter ? 5 : 7, 14), body);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.y = fighter ? 1.1 : 1.45;
  fuselage.castShadow = true;
  g.add(fuselage);
  windowMesh(g, [fighter ? 0.65 : 1.05, fighter ? 0.32 : 0.45, fighter ? 0.78 : 1.1], [0, fighter ? 1.38 : 1.8, fighter ? 1.1 : 1.45]);
  box(g, [fighter ? 5.2 : 8.5, 0.12, fighter ? 1.1 : 1.6], [0, fighter ? 1.1 : 1.45, -0.2], accent);
  box(g, [fighter ? 2.0 : 3.4, 0.12, 0.75], [0, fighter ? 1.65 : 2.2, -2.0], accent);
  box(g, [0.12, fighter ? 1.45 : 1.8, 0.85], [0, fighter ? 1.55 : 2.0, -2.05], accent);
  if (fighter) {
    cylinder(g, 0.12, 0.42, [-0.56, 0.9, -1.55], std(0x24282d), [Math.PI / 2, 0, 0]);
    cylinder(g, 0.12, 0.42, [0.56, 0.9, -1.55], std(0x24282d), [Math.PI / 2, 0, 0]);
  }
  return { root: g, wheels: [] };
}

function makeBoat() {
  const g = new THREE.Group();
  const hull = std(0x294b68, 0.55, 0.4);
  const deck = std(0xe0e3d9, 0.55, 0.12);
  const hullMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.65, 3.6, 2, 1, 3), hull);
  hullMesh.position.y = 0.55;
  hullMesh.castShadow = true;
  g.add(hullMesh);
  box(g, [1.35, 0.16, 2.5], [0, 0.92, -0.1], deck);
  box(g, [1.18, 0.65, 0.92], [0, 1.33, -0.55], std(0x2c6b88));
  windowMesh(g, [1.22, 0.42, 0.05], [0, 1.45, -0.07]);
  cylinder(g, 0.05, 1.25, [0, 2.0, -0.58], std(0x232323));
  return { root: g, wheels: [] };
}

export function createVehicle(kind: VehicleKind): VehicleModel {
  const spec = VEHICLE_SPECS[kind];
  let model: { root: THREE.Group; wheels: THREE.Object3D[]; rotor?: THREE.Object3D };
  switch (kind) {
    case "rickshaw": model = makeRickshaw(); break;
    case "taxi": model = makeCar(0xe9b937, true); break;
    case "cng": model = makeCng(); break;
    case "bus": model = makeBus(); break;
    case "buggy": model = makeBuggy(); break;
    case "helicopter": model = makeHelicopter(); break;
    case "plane": model = makePlane(false); break;
    case "fighter": model = makePlane(true); break;
    case "boat": model = makeBoat(); break;
  }
  model.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return { ...model, spec };
}

export function createAnimal(kind: AnimalKind): AnimalModel {
  const g = new THREE.Group();
  const animalColor: Record<AnimalKind, number> = {
    horse: 0x8d5b38,
    deer: 0x9b653d,
    goat: 0xe0d6c2,
    dog: 0x9a6134,
    cow: 0xe5dfd2,
    wolf: 0x74756e,
    tiger: 0xc77b25,
    bird: 0x315879,
    eagle: 0x5b4633,
  };
  const brown = std(animalColor[kind], 0.85, 0.02);
  const dark = std(0x222016, 0.8, 0.05);
  if (kind === "bird" || kind === "eagle") {
    const eagle = kind === "eagle";
    const body = new THREE.Mesh(new THREE.SphereGeometry(eagle ? 0.24 : 0.17, 10, 8), brown);
    body.scale.set(eagle ? 1.45 : 1.2, 0.9, eagle ? 1.8 : 1.6);
    g.add(body);
    const wingColor = std(eagle ? 0x3b2d27 : 0x1e415e);
    const wingL = box(g, [eagle ? 0.9 : 0.55, 0.04, eagle ? 0.3 : 0.22], [eagle ? -0.52 : -0.32, 0, 0], wingColor);
    const wingR = box(g, [eagle ? 0.9 : 0.55, 0.04, eagle ? 0.3 : 0.22], [eagle ? 0.52 : 0.32, 0, 0], wingColor);
    box(g, [eagle ? 0.12 : 0.08, eagle ? 0.09 : 0.06, eagle ? 0.28 : 0.2], [0, 0, eagle ? 0.34 : 0.26], std(0xe1a83c));
    return { root: g, wingL, wingR, kind, speed: eagle ? 7.2 : 5.5 };
  }
  const large = kind === "horse" || kind === "cow";
  const tall = kind === "horse" || kind === "deer" || kind === "cow";
  const bodyRadius = kind === "cow" ? 0.42 : kind === "tiger" ? 0.34 : kind === "wolf" ? 0.29 : 0.3;
  const bodyLength = large ? (kind === "cow" ? 1 : 0.85) : kind === "tiger" ? 0.67 : 0.45;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(bodyRadius, bodyLength, 5, 10), brown);
  body.rotation.z = Math.PI / 2;
  body.position.y = kind === "horse" ? 0.92 : kind === "cow" ? 0.88 : kind === "tiger" ? 0.58 : 0.65;
  body.castShadow = true;
  g.add(body);
  box(g, [0.24, tall ? (kind === "cow" ? 0.46 : 0.65) : 0.35, 0.24], [0, kind === "horse" ? 1.25 : kind === "cow" ? 1.12 : 0.92, 0.55], brown);
  const head = new THREE.Mesh(new THREE.SphereGeometry(kind === "dog" || kind === "wolf" ? 0.2 : 0.24, 10, 8), brown);
  head.position.set(0, kind === "horse" ? 1.6 : kind === "cow" ? 1.42 : kind === "tiger" ? 1.02 : 1.15, 0.66);
  g.add(head);
  const legH = kind === "horse" || kind === "cow" ? 0.8 : kind === "tiger" || kind === "wolf" ? 0.42 : 0.52;
  for (const x of [-0.22, 0.22]) for (const z of [-0.42, 0.42]) cylinder(g, 0.055, legH, [x, legH / 2, z], dark);
  if (kind === "goat" || kind === "deer" || kind === "cow") {
    cylinder(g, 0.025, 0.3, [-0.12, 1.36, 0.74], dark, [0.3, 0, 0]);
    cylinder(g, 0.025, 0.3, [0.12, 1.36, 0.74], dark, [0.3, 0, 0]);
  }
  if (kind === "cow") {
    for (const [x, z] of [[-0.28, 0.2], [0.3, -0.15], [0.02, -0.55]] as Array<[number, number]>) {
      const patch = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), dark);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(x, 0.9, z);
      g.add(patch);
    }
  }
  if (kind === "tiger") {
    for (let z = -0.35; z <= 0.35; z += 0.18) {
      box(g, [0.62, 0.035, 0.05], [0, 0.67, z], dark);
    }
  }
  return { root: g, kind, speed: kind === "horse" ? 4.8 : kind === "tiger" ? 5.2 : kind === "wolf" ? 4.6 : kind === "dog" ? 3.8 : kind === "cow" ? 2.1 : 2.8 };
}