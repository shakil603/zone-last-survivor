import * as THREE from "three";

export interface Humanoid {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  weapon: THREE.Group;
  muzzle: THREE.Object3D;
  height: number;
  materials: THREE.MeshStandardMaterial[];
  animWalk: number;
  moving: boolean;
  dispose: () => void;
}

export interface Palette {
  shirt: number;
  pants: number;
  vest: number;
  skin: number;
  helmet: number;
  boot: number;
  accent: number; // shoulder/team light
  gun: number;
  hair?: number;
  scarf?: number;
}

export type CharacterStyle = "hero" | "companion" | "enemy";

export const PLAYER_PALETTE: Palette = {
  shirt: 0x1d4262,
  pants: 0x1c2634,
  vest: 0x18222d,
  skin: 0xc88b5a,
  helmet: 0x182531,
  boot: 0x14160f,
  accent: 0x56e1ff,
  gun: 0x303943,
  hair: 0x261710,
  scarf: 0x56e1ff,
};

export const COMPANION_PALETTE: Palette = {
  shirt: 0x8a355c,
  pants: 0x222434,
  vest: 0x33263d,
  skin: 0xb97856,
  helmet: 0x39202c,
  boot: 0x17151b,
  accent: 0xff91c4,
  gun: 0x352d3a,
  hair: 0x301719,
  scarf: 0xffb0d1,
};

const ENEMY_PALETTES: Palette[] = [
  { shirt: 0x6b5326, pants: 0x4a3c22, vest: 0x2a2218, skin: 0xb5784f, helmet: 0x3a2f1d, boot: 0x161310, accent: 0xff5a4d, gun: 0x33312d },
  { shirt: 0x44484c, pants: 0x2c2f33, vest: 0x1a1c1f, skin: 0x9c6b45, helmet: 0x23262a, boot: 0x0e0f11, accent: 0xff5a4d, gun: 0x2c2a28 },
  { shirt: 0x5a3a2e, pants: 0x3a2620, vest: 0x241612, skin: 0xa9744c, helmet: 0x301d16, boot: 0x140c0a, accent: 0xff5a4d, gun: 0x302a26 },
  { shirt: 0x33402f, pants: 0x243022, vest: 0x161e14, skin: 0xb07a4f, helmet: 0x1d291a, boot: 0x0c120b, accent: 0xff5a4d, gun: 0x2a2e2a },
];

export function randomEnemyPalette(): Palette {
  return ENEMY_PALETTES[Math.floor(Math.random() * ENEMY_PALETTES.length)];
}

function mat(color: number, rough = 0.85, metal = 0.05) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
  });
}

export function createGun(palette: Palette): { group: THREE.Group; muzzle: THREE.Object3D } {
  const group = new THREE.Group();
  const m = mat(palette.gun, 0.5, 0.6);
  const dark = mat(0x121316, 0.6, 0.5);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.46), m);
  body.position.set(0, 0, 0.05);
  group.add(body);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, 0.42);
  group.add(barrel);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.12), dark);
  mag.position.set(0, -0.18, 0.02);
  mag.rotation.x = 0.18;
  group.add(mag);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.22), dark);
  stock.position.set(0, -0.02, -0.24);
  group.add(stock);

  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.1), dark);
  sight.position.set(0, 0.13, 0.05);
  group.add(sight);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), dark);
  grip.position.set(0, -0.13, -0.12);
  grip.rotation.x = -0.25;
  group.add(grip);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, 0.68);
  group.add(muzzle);

  return { group, muzzle };
}

export function createHumanoid(palette: Palette, style: CharacterStyle = "enemy", variant = 0): Humanoid {
  const materials: THREE.MeshStandardMaterial[] = [];
  const mk = (color: number, r = 0.85, m = 0.05) => {
    const mm = mat(color, r, m);
    materials.push(mm);
    return mm;
  };

  const shirt = mk(palette.shirt, 0.9, 0.02);
  const pants = mk(palette.pants, 0.92, 0.02);
  const vest = mk(palette.vest, 0.7, 0.15);
  const skin = mk(palette.skin, 0.7, 0.02);
  const helmet = mk(palette.helmet, 0.6, 0.2);
  const boot = mk(palette.boot, 0.5, 0.3);
  const accent = mk(palette.accent, 0.4, 0.4);
  const hair = mk(palette.hair ?? 0x231711, 0.85, 0.01);
  const scarf = mk(palette.scarf ?? palette.accent, 0.6, 0.1);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // ---------- Legs (pivot at hip) ----------
  function makeLeg(side: number) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.13, 0.92, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.52, 4, 10), pants);
    thigh.position.y = -0.36;
    pivot.add(thigh);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.26), boot);
    b.position.set(0, -0.74, 0.04);
    pivot.add(b);
    return pivot;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  body.add(legL, legR);

  // ---------- Hips ----------
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.24), pants);
  hips.position.y = 0.95;
  body.add(hips);

  // ---------- Torso (spine group, can lean) ----------
  const torso = new THREE.Group();
  torso.position.y = 1.2;
  body.add(torso);

  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.4, 4, 12), shirt);
  chest.position.y = 0.22;
  torso.add(chest);

  const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.26), vest);
  vestMesh.position.y = 0.22;
  vestMesh.position.z = 0.02;
  torso.add(vestMesh);

  // Hero and companion get distinct silhouette layers so the playable cast is
  // recognisable at a glance instead of reusing an identical soldier shape.
  if (style === "hero") {
    const jacketTrim = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.06, 0.28), accent);
    jacketTrim.position.set(0, 0.22, 0.15);
    torso.add(jacketTrim);
    const shoulderPadL = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), vest);
    shoulderPadL.position.set(-0.31, 0.44, 0);
    const shoulderPadR = shoulderPadL.clone();
    shoulderPadR.position.x = 0.31;
    torso.add(shoulderPadL, shoulderPadR);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.07, 0.27), scarf);
    belt.position.set(0, -0.02, 0.02);
    torso.add(belt);
  } else if (style === "companion") {
    const croppedJacket = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.28), scarf);
    croppedJacket.position.set(0, 0.07, 0.14);
    torso.add(croppedJacket);
    const shoulderCape = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.08), scarf);
    shoulderCape.position.set(0, 0.46, -0.17);
    torso.add(shoulderCape);
  } else {
    // Raider variants alter their gear silhouette. Combined with the varied
    // palettes/scales, enemy squads no longer look like cloned characters.
    const gearVariant = variant % 4;
    if (gearVariant === 0) {
      const chestRig = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.3), vest);
      chestRig.position.set(0, 0.34, 0.11);
      torso.add(chestRig);
    } else if (gearVariant === 1) {
      const radio = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.07), accent);
      radio.position.set(-0.2, 0.38, -0.17);
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), accent);
      antenna.position.set(-0.2, 0.62, -0.17);
      antenna.rotation.z = -0.2;
      torso.add(radio, antenna);
    } else if (gearVariant === 2) {
      const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.12), vest);
      satchel.position.set(0.26, 0.08, 0.14);
      torso.add(satchel);
    } else {
      const bandolier = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.58, 0.12), scarf);
      bandolier.position.set(0.1, 0.24, 0.14);
      bandolier.rotation.z = -0.46;
      torso.add(bandolier);
    }
  }

  // pouches
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.08), mat(0x2b2b22));
  pouch.position.set(0.13, 0.08, 0.16);
  torso.add(pouch);

  // backpack hint
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.16), vest);
  pack.position.set(0, 0.26, -0.18);
  torso.add(pack);

  // shoulder team light
  const lightDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 8),
    accent
  );
  lightDot.position.set(-0.24, 0.42, 0.12);
  torso.add(lightDot);

  // ---------- Head ----------
  const head = new THREE.Group();
  head.position.y = 0.62;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), skin);
  skull.scale.set(0.92, 1, 0.98);
  head.add(skull);
  const helm = new THREE.Mesh(
    new THREE.SphereGeometry(0.175, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9),
    helmet
  );
  helm.position.y = 0.04;
  if (style !== "companion") {
    if (style === "enemy" && variant % 4 === 1) {
      helm.scale.set(1.04, 0.82, 1.02);
    } else if (style === "enemy" && variant % 4 === 2) {
      helm.scale.set(0.88, 1.08, 0.92);
    }
    head.add(helm);
  }
  // visor
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.04), mat(0x0a0d10, 0.3, 0.6));
  visor.position.set(0, 0.0, 0.15);
  head.add(visor);

  if (style === "hero") {
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.8), hair);
    fringe.position.set(0, 0.08, 0.015);
    head.add(fringe);
    const earComm = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), accent);
    earComm.position.set(-0.17, 0.02, 0.02);
    head.add(earComm);
  } else if (style === "companion") {
    // Distinct long-haired companion silhouette, kept non-sexual and tactical.
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), hair);
    hairCap.scale.set(0.98, 0.72, 1.02);
    hairCap.position.set(0, 0.09, -0.01);
    head.add(hairCap);
    const ponytail = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.28, 4, 8), hair);
    ponytail.position.set(0, -0.12, -0.16);
    ponytail.rotation.x = -0.32;
    head.add(ponytail);
    const headband = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.015, 6, 12), scarf);
    headband.rotation.x = Math.PI / 2;
    headband.position.set(0, 0.055, 0.08);
    head.add(headband);
  }

  // ---------- Arms (pivot at shoulder) ----------
  function makeArm(side: number) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.3, 0.45, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.34, 4, 10), shirt);
    upper.position.y = -0.22;
    pivot.add(upper);
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.12), mat(0x161611));
    glove.position.y = -0.44;
    pivot.add(glove);
    return pivot;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);
  torso.add(armL, armR);

  // ---------- Weapon ----------
  const { group: weapon, muzzle } = createGun(palette);
  weapon.position.set(0.16, 0.42, 0.28);
  torso.add(weapon);

  // shadows
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = false;
    }
  });

  const height = 2.0;

  return {
    root,
    body,
    torso,
    head,
    armL,
    armR,
    legL,
    legR,
    weapon,
    muzzle,
    height,
    materials,
    animWalk: 0,
    moving: false,
    dispose() {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
        }
      });
      materials.forEach((m) => m.dispose());
    },
  };
}
