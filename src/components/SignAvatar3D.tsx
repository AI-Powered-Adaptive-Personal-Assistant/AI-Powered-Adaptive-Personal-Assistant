import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/**
 * SignAvatar3D — procedural 3D signing avatar for Cognify.
 *
 * - Builds a stylized avatar bust + a fully articulated right hand
 *   (15 finger joints + thumb, wrist, dynamic forearm) in pure Three.js.
 *   No external .glb files, no CDN, no CORS issues -> works in AI Studio.
 * - Fingerspells any word letter-by-letter (ASL alphabet approximations,
 *   A–Z + 0–9) and plays full-arm gestures for common words
 *   (hello / thanks / yes / no / me / you / love / help + Arabic equivalents).
 * - Arabic input is transliterated to the closest fingerspelling pose.
 *
 * Usage:
 *   <SignAvatar3D
 *     words={["hello", "world"]}
 *     playing={isPlaying}
 *     onProgress={(i) => setPlaybackProgress(i)}
 *     onDone={() => setIsPlaying(false)}
 *   />
 *
 * All pose values live in LETTER_POSES / WORD_SIGNS below — they are
 * deliberately plain numbers (0 = open finger, 1 = fully curled) so they
 * can be tuned without touching the engine.
 */

export interface SignAvatar3DProps {
  /** The sentence, already split into words. */
  words: string[];
  /** Starts / stops the signing timeline. */
  playing: boolean;
  /** Fired when the avatar starts signing word index `i`. */
  onProgress?: (wordIndex: number) => void;
  /** Fired after the last word finishes. */
  onDone?: () => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* Pose data                                                           */
/* ------------------------------------------------------------------ */

interface HandPose {
  /** Finger curls 0..1 in order: [thumb, index, middle, ring, pinky] */
  f: [number, number, number, number, number];
  /** Thumb sticking out sideways (L / Y / open hand). 0..1 */
  out?: number;
  /** Finger fan/spread. 0..1 */
  spread?: number;
  /** Wrist euler offset [x, y, z] in radians. */
  wrist?: [number, number, number];
  /** Hand root position override [x, y, z] (world). */
  pos?: [number, number, number];
  /** Procedural micro-motion layered on top of the pose. */
  motion?: "wave" | "nod" | "tap" | "j" | "z" | "circle" | null;
  /** How long to hold this pose (ms) when used inside a word gesture. */
  hold?: number;
}

const HAND_HOME: [number, number, number] = [0.2, 1.17, 0.42];

const NEUTRAL: HandPose = {
  f: [0.18, 0.22, 0.22, 0.22, 0.25],
  out: 0.15,
  spread: 0.1,
  wrist: [0, 0, 0],
  pos: HAND_HOME,
  motion: null,
};

/** ASL alphabet + digits — pragmatic approximations, tune freely. */
const LETTER_POSES: Record<string, HandPose> = {
  A: { f: [0.15, 1, 1, 1, 1], out: 0.25 },
  B: { f: [0.95, 0, 0, 0, 0], spread: 0.05 },
  C: { f: [0.45, 0.5, 0.5, 0.5, 0.5], out: 0.3 },
  D: { f: [0.55, 0, 0.85, 0.9, 0.9] },
  E: { f: [0.85, 0.8, 0.8, 0.8, 0.8] },
  F: { f: [0.5, 0.55, 0, 0, 0], spread: 0.4 },
  G: { f: [0.25, 0, 1, 1, 1], out: 0.6, wrist: [0, 0, -1.4] },
  H: { f: [0.6, 0, 0, 1, 1], wrist: [0, 0, -1.4] },
  I: { f: [0.8, 1, 1, 1, 0] },
  J: { f: [0.8, 1, 1, 1, 0], motion: "j" },
  K: { f: [0.45, 0, 0, 1, 1], spread: 0.55 },
  L: { f: [0, 0, 1, 1, 1], out: 1 },
  M: { f: [1, 0.78, 0.78, 0.78, 1] },
  N: { f: [1, 0.78, 0.78, 1, 1] },
  O: { f: [0.55, 0.6, 0.6, 0.6, 0.6] },
  P: { f: [0.45, 0, 0.35, 1, 1], spread: 0.4, wrist: [1.7, 0, 0] },
  Q: { f: [0.3, 0, 1, 1, 1], out: 0.5, wrist: [1.7, 0, 0] },
  R: { f: [0.85, 0.05, 0.14, 1, 1] },
  S: { f: [0.7, 1, 1, 1, 1] },
  T: { f: [0.75, 0.9, 1, 1, 1] },
  U: { f: [0.85, 0, 0, 1, 1] },
  V: { f: [0.85, 0, 0, 1, 1], spread: 0.8 },
  W: { f: [0.85, 0, 0, 0, 1], spread: 0.6 },
  X: { f: [0.8, 0.5, 1, 1, 1] },
  Y: { f: [0, 1, 1, 1, 0], out: 1 },
  Z: { f: [0.8, 0, 1, 1, 1], motion: "z" },
  "0": { f: [0.55, 0.6, 0.6, 0.6, 0.6] },
  "1": { f: [0.8, 0, 1, 1, 1] },
  "2": { f: [0.85, 0, 0, 1, 1], spread: 0.8 },
  "3": { f: [0, 0, 0, 1, 1], out: 1, spread: 0.6 },
  "4": { f: [0.9, 0, 0, 0, 0], spread: 0.7 },
  "5": { f: [0, 0, 0, 0, 0], out: 1, spread: 0.8 },
  "6": { f: [0.5, 0, 0, 0, 0.6] },
  "7": { f: [0.5, 0, 0, 0.6, 0] },
  "8": { f: [0.5, 0, 0.6, 0, 0] },
  "9": { f: [0.5, 0.6, 0, 0, 0] },
};

/** Arabic letters -> nearest fingerspelling pose key. */
const AR_MAP: Record<string, string> = {
  "ا": "A", "أ": "A", "إ": "A", "آ": "A", "ء": "A",
  "ب": "B", "ت": "T", "ث": "T", "ج": "J", "ح": "H", "خ": "K",
  "د": "D", "ذ": "D", "ر": "R", "ز": "Z", "س": "S", "ش": "S",
  "ص": "S", "ض": "D", "ط": "T", "ظ": "Z", "ع": "E", "غ": "G",
  "ف": "F", "ق": "Q", "ك": "K", "ل": "L", "م": "M", "ن": "N",
  "ه": "H", "ة": "H", "و": "W", "ؤ": "W", "ي": "Y", "ى": "Y", "ئ": "Y",
};

/** Full-arm gestures for common words. Each step is held, then the next plays. */
const WORD_SIGNS: Record<string, { steps: HandPose[] }> = {
  HELLO: {
    steps: [
      { f: [0, 0, 0, 0, 0], out: 1, spread: 0.4, pos: [0.13, 1.5, 0.3], wrist: [0.25, 0, 0.35], hold: 380 },
      { f: [0, 0, 0, 0, 0], out: 1, spread: 0.4, pos: [0.36, 1.46, 0.44], wrist: [0.25, 0, -0.45], hold: 420 },
    ],
  },
  THANK: {
    steps: [
      { f: [0.1, 0, 0, 0, 0], pos: [0.06, 1.41, 0.34], wrist: [0.55, 0, 0], hold: 340 },
      { f: [0.1, 0, 0, 0, 0], pos: [0.12, 1.28, 0.56], wrist: [1.05, 0, 0], hold: 440 },
    ],
  },
  YES: { steps: [{ f: [0.7, 1, 1, 1, 1], motion: "nod", hold: 850 }] },
  NO: { steps: [{ f: [0.35, 0, 0, 1, 1], motion: "tap", hold: 850 }] },
  ME: { steps: [{ f: [0.8, 0, 1, 1, 1], pos: [0.1, 1.24, 0.3], wrist: [2.4, 0, 0], hold: 750 }] },
  YOU: { steps: [{ f: [0.8, 0, 1, 1, 1], wrist: [1.5, 0, 0], hold: 750 }] },
  LOVE: { steps: [{ f: [0.7, 1, 1, 1, 1], pos: [0.02, 1.22, 0.3], wrist: [0.4, 0, 0], hold: 850 }] },
  HELP: { steps: [{ f: [0, 0, 0, 0, 0], out: 1, spread: 0.4, motion: "circle", pos: [0.08, 1.24, 0.34], hold: 950 }] },
  GOODBYE: { steps: [{ f: [0, 0, 0, 0, 0], out: 1, spread: 0.4, pos: [0.3, 1.5, 0.42], motion: "wave", hold: 950 }] },
  GOOD: { steps: [
    { f: [0, 0, 0, 0, 0], pos: [0.05, 1.44, 0.36], wrist: [0.5, 0, 0], hold: 360 },
    { f: [0, 0, 0, 0, 0], pos: [0.08, 1.18, 0.4], wrist: [0, 0, 0], hold: 440 },
  ] },
  BAD: { steps: [
    { f: [0, 0, 0, 0, 0], pos: [0.05, 1.44, 0.36], wrist: [0.5, 0, 0], hold: 360 },
    { f: [0, 0, 0, 0, 0], pos: [0.1, 1.16, 0.4], wrist: [0, 0, 3.1], hold: 440 },
  ] },
  PAIN: { steps: [{ f: [1, 0, 1, 1, 1], pos: [0.06, 1.2, 0.34], motion: "tap", hold: 900 }] },
  DOCTOR: { steps: [{ f: [0, 0, 0.4, 1, 1], pos: [0.1, 1.14, 0.34], motion: "tap", hold: 900 }] },
  WATER: { steps: [{ f: [1, 0, 0, 0, 1], spread: 0.5, pos: [0.05, 1.42, 0.34], motion: "tap", hold: 900 }] },
  EAT: { steps: [{ f: [0.3, 0.3, 0.3, 0.3, 0.3], pos: [0.03, 1.46, 0.32], motion: "tap", hold: 900 }] },
  DRINK: { steps: [{ f: [0.4, 0.5, 0.5, 0.5, 0.5], pos: [0.04, 1.44, 0.34], wrist: [0.6, 0, 0], hold: 800 }] },
  NAME: { steps: [{ f: [1, 0, 0, 1, 1], pos: [0.06, 1.25, 0.33], motion: "tap", hold: 900 }] },
  HOW: { steps: [{ f: [0.5, 0.5, 0.5, 0.5, 0.5], spread: 0.3, pos: [0.06, 1.2, 0.42], wrist: [0.3, 0, 0], motion: "nod", hold: 900 }] },
  WHAT: { steps: [{ f: [0, 0, 0, 0, 0], out: 1, spread: 0.5, pos: [0.1, 1.15, 0.42], motion: "tap", hold: 900 }] },
  WHERE: { steps: [{ f: [1, 0, 1, 1, 1], pos: [0.16, 1.35, 0.42], motion: "tap", hold: 900 }] },
  SORRY: { steps: [{ f: [1, 1, 1, 1, 1], pos: [0.05, 1.18, 0.34], motion: "circle", hold: 950 }] },
  WAIT: { steps: [{ f: [0, 0, 0, 0, 0], spread: 0.5, pos: [0.1, 1.15, 0.42], wrist: [0.5, 0, 0], motion: "tap", hold: 900 }] },
  STOP: { steps: [
    { f: [0, 0, 0, 0, 0], spread: 0, pos: [0.05, 1.32, 0.42], wrist: [0, 0, 0], hold: 320 },
    { f: [0, 0, 0, 0, 0], spread: 0, pos: [0.05, 1.2, 0.4], wrist: [0, 0, 0], hold: 420 },
  ] },
  COME: { steps: [{ f: [1, 0, 1, 1, 1], pos: [0.1, 1.32, 0.46], motion: "nod", hold: 900 }] },
  GO: { steps: [{ f: [1, 0, 1, 1, 1], pos: [0.26, 1.32, 0.5], wrist: [0, -0.5, 0], hold: 800 }] },
  MORE: { steps: [{ f: [0.4, 0.4, 0.4, 0.4, 0.4], pos: [0.05, 1.25, 0.42], motion: "tap", hold: 900 }] },
  FINISH: { steps: [
    { f: [0, 0, 0, 0, 0], out: 1, spread: 0.4, pos: [0.08, 1.22, 0.4], wrist: [0.4, 0, 0], hold: 340 },
    { f: [0, 0, 0, 0, 0], out: 1, spread: 0.4, pos: [0.12, 1.2, 0.42], wrist: [0, 0, 0.7], hold: 440 },
  ] },
  WANT: { steps: [
    { f: [0.5, 0.5, 0.5, 0.5, 0.5], spread: 0.4, pos: [0.1, 1.2, 0.48], wrist: [0.4, 0, 0], hold: 360 },
    { f: [0.5, 0.5, 0.5, 0.5, 0.5], spread: 0.3, pos: [0.06, 1.18, 0.34], wrist: [0.4, 0, 0], hold: 440 },
  ] },
  HAPPY: { steps: [
    { f: [0, 0, 0, 0, 0], pos: [0.05, 1.14, 0.36], hold: 320 },
    { f: [0, 0, 0, 0, 0], pos: [0.05, 1.34, 0.4], hold: 420 },
  ] },
  SICK: { steps: [{ f: [1, 1, 0, 1, 1], pos: [0.05, 1.48, 0.33], motion: "tap", hold: 900 }] },
  MEDICINE: { steps: [{ f: [0, 1, 1, 1, 1], pos: [0.06, 1.2, 0.36], motion: "circle", hold: 950 }] },
  BATHROOM: { steps: [{ f: [0.5, 1, 1, 1, 1], out: 1, pos: [0.12, 1.35, 0.42], motion: "tap", hold: 900 }] },
  MOTHER: { steps: [{ f: [0, 1, 1, 1, 1], out: 1, pos: [0.05, 1.44, 0.34], hold: 800 }] },
  FATHER: { steps: [{ f: [0, 1, 1, 1, 1], out: 1, pos: [0.05, 1.5, 0.34], hold: 800 }] },
};

const WORD_ALIASES: Record<string, string> = {
  hello: "HELLO", hi: "HELLO", hey: "HELLO",
  "مرحبا": "HELLO", "اهلا": "HELLO", "أهلا": "HELLO", "سلام": "HELLO", "ازيك": "HELLO",
  thanks: "THANK", thank: "THANK", "شكرا": "THANK", "شكرًا": "THANK", "متشكر": "THANK",
  yes: "YES", ok: "YES", okay: "YES", "نعم": "YES", "ايوه": "YES", "أيوه": "YES", "تمام": "YES",
  no: "NO", not: "NO", "لا": "NO", "كلا": "NO",
  me: "ME", i: "ME", "انا": "ME", "أنا": "ME",
  you: "YOU", "انت": "YOU", "أنت": "YOU", "انتي": "YOU",
  love: "LOVE", "حب": "LOVE", "بحبك": "LOVE",
  help: "HELP", please: "HELP", "مساعدة": "HELP", "ساعدني": "HELP", "لو سمحت": "HELP",
  goodbye: "GOODBYE", bye: "GOODBYE", "مع السلامة": "GOODBYE", "باي": "GOODBYE", "وداعا": "GOODBYE",
  good: "GOOD", fine: "GOOD", great: "GOOD", "كويس": "GOOD", "جيد": "GOOD", "حلو": "GOOD",
  bad: "BAD", "وحش": "BAD", "سيء": "BAD", "مش كويس": "BAD",
  pain: "PAIN", hurt: "PAIN", ache: "PAIN", "ألم": "PAIN", "وجع": "PAIN", "بيوجعني": "PAIN",
  doctor: "DOCTOR", nurse: "DOCTOR", "دكتور": "DOCTOR", "طبيب": "DOCTOR", "ممرضة": "DOCTOR",
  water: "WATER", "ماء": "WATER", "مياه": "WATER", "ميه": "WATER",
  eat: "EAT", food: "EAT", hungry: "EAT", "اكل": "EAT", "أكل": "EAT", "جعان": "EAT", "جوعان": "EAT",
  drink: "DRINK", thirsty: "DRINK", "اشرب": "DRINK", "عطشان": "DRINK",
  name: "NAME", "اسم": "NAME", "اسمي": "NAME",
  how: "HOW", "ازاي": "HOW", "كيف": "HOW",
  what: "WHAT", "ايه": "WHAT", "ماذا": "WHAT", "إيه": "WHAT",
  where: "WHERE", "فين": "WHERE", "اين": "WHERE", "وين": "WHERE",
  sorry: "SORRY", "اسف": "SORRY", "آسف": "SORRY", "معذرة": "SORRY",
  wait: "WAIT", "استنى": "WAIT", "انتظر": "WAIT", "لحظة": "WAIT",
  stop: "STOP", "قف": "STOP", "بس": "STOP", "كفاية": "STOP",
  come: "COME", "تعالى": "COME", "تعال": "COME",
  go: "GO", "روح": "GO", "اذهب": "GO", "امشي": "GO",
  more: "MORE", "كمان": "MORE", "اكثر": "MORE", "زيادة": "MORE",
  finish: "FINISH", done: "FINISH", "خلص": "FINISH", "انتهى": "FINISH", "خلاص": "FINISH",
  want: "WANT", need: "WANT", "عايز": "WANT", "اريد": "WANT", "محتاج": "WANT", "عاوز": "WANT",
  happy: "HAPPY", "سعيد": "HAPPY", "مبسوط": "HAPPY", "فرحان": "HAPPY",
  sick: "SICK", ill: "SICK", "مريض": "SICK", "تعبان": "SICK",
  medicine: "MEDICINE", medication: "MEDICINE", pill: "MEDICINE", "دواء": "MEDICINE", "علاج": "MEDICINE",
  bathroom: "BATHROOM", toilet: "BATHROOM", restroom: "BATHROOM", "حمام": "BATHROOM", "تواليت": "BATHROOM", "دورة المياه": "BATHROOM",
  mother: "MOTHER", mom: "MOTHER", mum: "MOTHER", "ام": "MOTHER", "أم": "MOTHER", "ماما": "MOTHER",
  father: "FATHER", dad: "FATHER", "اب": "FATHER", "أب": "FATHER", "بابا": "FATHER",
};

/* ------------------------------------------------------------------ */
/* Rig                                                                 */
/* ------------------------------------------------------------------ */

const ACCENT = 0x2563eb; // Cognify primary
const ACCENT_SOFT = 0x60a5fa;

interface FingerRig {
  joints: THREE.Group[]; // [proximal, middle, distal]
  spreadDir: number;
}

interface Rig {
  root: THREE.Group; // whole avatar
  handRoot: THREE.Group; // moves in world space
  wrist: THREE.Group; // pose-driven rotations
  fingers: FingerRig[]; // [thumb, index, middle, ring, pinky]
  thumbBase: THREE.Group;
  head: THREE.Group;
  forearm: THREE.Mesh; // dynamic, follows the hand
  elbow: THREE.Vector3;
  rings: THREE.Mesh[];
  chestCore: THREE.Mesh;
}

const CURL_MAX = [1.45, 1.55, 1.05]; // per joint
const SEG_LEN = [0.072, 0.052, 0.038];
const FINGER_SCALE = [0.78, 0.96, 1.0, 0.94, 0.74]; // thumb handled separately

function fingerSegment(len: number, rad: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 4, 10), mat);
  mesh.position.y = len / 2;
  g.add(mesh);
  return g;
}

function buildFinger(scale: number, rad: number, mat: THREE.Material, spreadDir: number): FingerRig {
  const joints: THREE.Group[] = [];
  let parent: THREE.Group | null = null;
  for (let i = 0; i < 3; i++) {
    const len = SEG_LEN[i] * scale;
    const j = fingerSegment(len, rad * (1 - i * 0.12), mat);
    if (parent) {
      j.position.y = SEG_LEN[i - 1] * scale;
      parent.add(j);
    }
    joints.push(j);
    parent = j;
  }
  return { joints, spreadDir };
}

function buildRig(scene: THREE.Scene): Rig {
  const root = new THREE.Group();
  scene.add(root);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, metalness: 0.25 });
  const faceMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.4 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.45, metalness: 0.08 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: ACCENT, emissive: ACCENT, emissiveIntensity: 1.4, roughness: 0.3,
  });

  /* ---- bust ---- */
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.42, 6, 18), bodyMat);
  torso.position.set(0, 0.92, 0);
  torso.scale.set(1, 1, 0.72);
  root.add(torso);

  const chestCore = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 24), glowMat);
  chestCore.rotation.x = Math.PI / 2;
  chestCore.position.set(0, 1.16, 0.185);
  root.add(chestCore);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.12, 16), bodyMat);
  neck.position.set(0, 1.32, 0);
  root.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  root.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.155, 24, 20), bodyMat);
  skull.scale.set(0.92, 1.05, 0.95);
  head.add(skull);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 18, 0, Math.PI), faceMat);
  visor.rotation.y = 0; // facing +Z (camera)
  visor.position.z = 0.045;
  visor.scale.set(0.95, 0.85, 0.6);
  head.add(visor);
  const eyeGeo = new THREE.CapsuleGeometry(0.014, 0.02, 3, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: ACCENT_SOFT, emissive: ACCENT_SOFT, emissiveIntensity: 2.2 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.05, 0.02, 0.155);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.05;
  head.add(eyeL, eyeR);

  /* ---- shoulders + idle left arm ---- */
  const shoulderGeo = new THREE.SphereGeometry(0.085, 16, 14);
  const shoulderR = new THREE.Mesh(shoulderGeo, bodyMat);
  shoulderR.position.set(0.3, 1.22, 0);
  const shoulderL = shoulderR.clone();
  shoulderL.position.x = -0.3;
  root.add(shoulderR, shoulderL);

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.34, 4, 12), bodyMat);
  leftArm.position.set(-0.33, 0.98, 0.02);
  leftArm.rotation.z = 0.12;
  root.add(leftArm);
  const leftMitt = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 12), skinMat);
  leftMitt.position.set(-0.36, 0.76, 0.03);
  root.add(leftMitt);

  /* ---- right arm (dynamic forearm follows the hand) ---- */
  const elbow = new THREE.Vector3(0.36, 1.0, 0.12);
  const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.24, 4, 12), bodyMat);
  upperArm.position.copy(new THREE.Vector3().addVectors(new THREE.Vector3(0.3, 1.22, 0), elbow).multiplyScalar(0.5));
  upperArm.lookAt(elbow);
  upperArm.rotateX(Math.PI / 2);
  root.add(upperArm);
  const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 12), bodyMat);
  elbowBall.position.copy(elbow);
  root.add(elbowBall);
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1, 12), bodyMat);
  root.add(forearm);

  /* ---- right hand ---- */
  const handRoot = new THREE.Group();
  handRoot.position.set(...HAND_HOME);
  root.add(handRoot);

  const wrist = new THREE.Group();
  wrist.rotation.set(-0.12, 0, 0.06); // slight natural tilt, palm to camera
  handRoot.add(wrist);

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.185, 0.055), skinMat);
  palm.position.y = 0.05;
  wrist.add(palm);
  const wristCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.06, 14), bodyMat);
  wristCuff.position.y = -0.06;
  wrist.add(wristCuff);

  // viewer sees the avatar's right hand palm-out: thumb on the +X side
  const baseX = [0.058, 0.02, -0.02, -0.058]; // index..pinky
  const spreadDirs = [-1, -0.3, 0.35, 1];
  const fingers: FingerRig[] = [];

  // thumb (index 0)
  const thumbBase = new THREE.Group();
  thumbBase.position.set(0.082, -0.01, 0.012);
  thumbBase.rotation.set(0.35, 0.2, -0.9);
  wrist.add(thumbBase);
  const tJoints: THREE.Group[] = [];
  let tParent: THREE.Group = thumbBase;
  const tLens = [0.06, 0.045];
  for (let i = 0; i < 2; i++) {
    const j = fingerSegment(tLens[i], 0.021 - i * 0.002, skinMat);
    if (i > 0) j.position.y = tLens[i - 1];
    tParent.add(j);
    tJoints.push(j);
    tParent = j;
  }
  fingers.push({ joints: [tJoints[0], tJoints[1], tJoints[1]], spreadDir: 0 });

  for (let fi = 0; fi < 4; fi++) {
    const base = new THREE.Group();
    base.position.set(baseX[fi], 0.142, 0);
    wrist.add(base);
    const f = buildFinger(FINGER_SCALE[fi + 1], 0.018, skinMat, spreadDirs[fi]);
    base.add(f.joints[0]);
    fingers.push(f);
  }

  /* ---- pedestal rings ---- */
  const ringMat = new THREE.MeshStandardMaterial({
    color: ACCENT, emissive: ACCENT, emissiveIntensity: 1.1, transparent: true, opacity: 0.85,
  });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.008, 10, 80), ringMat);
  ring1.rotation.x = Math.PI / 2;
  ring1.position.y = 0.58;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.004, 8, 80), ringMat.clone());
  (ring2.material as THREE.MeshStandardMaterial).opacity = 0.3;
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = 0.55;
  root.add(ring1, ring2);

  return { root, handRoot, wrist, fingers, thumbBase, head, forearm, elbow, rings: [ring1, ring2], chestCore };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

function normalizeChar(ch: string): string {
  const up = ch.toUpperCase();
  if (LETTER_POSES[up]) return up;
  if (AR_MAP[ch]) return AR_MAP[ch];
  return "";
}

export default function SignAvatar3D({ words, playing, onProgress, onDone, className }: SignAvatar3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [glyph, setGlyph] = useState("");
  const [ready, setReady] = useState(false);
  const [webglError, setWebglError] = useState(false);

  // mutable target the animation loop chases
  const target = useRef({
    curls: [...NEUTRAL.f] as number[],
    out: NEUTRAL.out ?? 0,
    spread: NEUTRAL.spread ?? 0,
    wrist: [0, 0, 0] as number[],
    pos: [...HAND_HOME] as number[],
    motion: null as HandPose["motion"],
    motionStart: 0,
  });

  const onProgressRef = useRef(onProgress);
  const onDoneRef = useRef(onDone);
  onProgressRef.current = onProgress;
  onDoneRef.current = onDone;

  const applyPose = (p: HandPose) => {
    const t = target.current;
    t.curls = [...p.f];
    t.out = p.out ?? 0;
    t.spread = p.spread ?? 0;
    t.wrist = p.wrist ? [...p.wrist] : [0, 0, 0];
    t.pos = p.pos ? [...p.pos] : [...HAND_HOME];
    t.motion = p.motion ?? null;
    t.motionStart = performance.now();
  };

  /* ---- three.js scene ---- */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
    // Pulled back and centred lower so the whole avatar fits (was cropping it).
    camera.position.set(0, 1.15, 2.55);
    camera.lookAt(0, 1.0, 0);

    // Some hospital/locked-down devices have no GPU or blocked WebGL. Fail
    // gracefully to a visible message instead of a permanent black "loading" box.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      console.error("WebGL unavailable — 3D avatar disabled", e);
      setWebglError(true);
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xbfd7ff, 0x0b1120, 0.9);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-1.4, 2.2, 2.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(ACCENT_SOFT, 1.6);
    rim.position.set(1.8, 1.4, -1.6);
    scene.add(rim);

    const rig = buildRig(scene);
    setReady(true);

    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const clock = new THREE.Clock();
    const fromV = new THREE.Vector3();
    const dirV = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let raf = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      // Don't burn GPU/battery when the tab is backgrounded (hospital tablets).
      if (document.hidden) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const now = performance.now();
      const t = target.current;
      const kFinger = 1 - Math.exp(-13 * dt);
      const kBody = 1 - Math.exp(-8 * dt);
      const elapsed = (now - t.motionStart) / 1000;

      // motion layers
      let wristAdd = [0, 0, 0];
      let posAdd = [0, 0, 0];
      let curlAdd = [0, 0, 0, 0, 0];
      switch (t.motion) {
        case "wave": wristAdd = [0, 0, Math.sin(elapsed * 9) * 0.28]; break;
        case "nod": wristAdd = [Math.sin(elapsed * 8) * 0.3, 0, 0]; break;
        case "tap": { const c = (Math.sin(elapsed * 11) + 1) / 2; curlAdd = [0.25 * c, 0.4 * c, 0.4 * c, 0, 0]; break; }
        case "j": wristAdd = [Math.sin(elapsed * 4) * 0.25, 0, -Math.min(elapsed * 2.2, 1.4)]; break;
        case "z": posAdd = [Math.sin(elapsed * 6) * 0.1, -Math.min(elapsed * 0.18, 0.13), 0]; break;
        case "circle": posAdd = [Math.cos(elapsed * 5) * 0.045, Math.sin(elapsed * 5) * 0.045, 0]; break;
      }

      // fingers
      for (let fi = 0; fi < 5; fi++) {
        const curl = THREE.MathUtils.clamp(t.curls[fi] + curlAdd[fi], 0, 1.15);
        const rigF = rig.fingers[fi];
        for (let ji = 0; ji < 3; ji++) {
          const j = rigF.joints[ji];
          if (fi === 0 && ji === 2) continue; // thumb alias
          const goal = curl * CURL_MAX[ji] * (fi === 0 ? 0.8 : 1);
          j.rotation.x += (goal - j.rotation.x) * kFinger;
          if (ji === 0 && fi > 0) {
            const spreadGoal = t.spread * 0.32 * rigF.spreadDir;
            j.rotation.z += (spreadGoal - j.rotation.z) * kFinger;
          }
        }
      }
      // thumb base: out + wrap across palm as it curls
      const tb = rig.thumbBase.rotation;
      const outGoal = -0.9 - t.out * 0.55 + t.curls[0] * 0.7;
      const wrapGoal = 0.2 + t.curls[0] * 0.9;
      tb.z += (outGoal - tb.z) * kFinger;
      tb.y += (wrapGoal - tb.y) * kFinger;

      // wrist + hand position
      const w = rig.wrist.rotation;
      w.x += (-0.12 + t.wrist[0] + wristAdd[0] - w.x) * kBody;
      w.y += (t.wrist[1] + wristAdd[1] - w.y) * kBody;
      w.z += (0.06 + t.wrist[2] + wristAdd[2] - w.z) * kBody;

      const idle = t.motion ? 0 : Math.sin(now / 900) * 0.008;
      const p = rig.handRoot.position;
      p.x += (t.pos[0] + posAdd[0] - p.x) * kBody;
      p.y += (t.pos[1] + posAdd[1] + idle - p.y) * kBody;
      p.z += (t.pos[2] + posAdd[2] - p.z) * kBody;

      // forearm follows hand
      fromV.copy(rig.elbow);
      dirV.copy(p).sub(fromV);
      const len = Math.max(dirV.length(), 0.001);
      rig.forearm.position.copy(fromV).addScaledVector(dirV, 0.5);
      rig.forearm.scale.set(1, len, 1);
      rig.forearm.quaternion.setFromUnitVectors(up, dirV.normalize());

      // life: breathing, head, rings, chest pulse
      rig.root.position.y = Math.sin(now / 1600) * 0.006;
      rig.head.rotation.y = Math.sin(now / 2300) * 0.08;
      rig.head.rotation.x = Math.sin(now / 2900) * 0.04;
      rig.rings[0].rotation.z += dt * 0.4;
      rig.rings[1].rotation.z -= dt * 0.25;
      const pulse = 1.1 + Math.sin(now / 500) * 0.35;
      (rig.chestCore.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    };
  }, []);

  /* ---- signing timeline ---- */
  const wordsKey = useMemo(() => words.join("\u0001"), [words]);

  useEffect(() => {
    if (!playing || words.length === 0) {
      applyPose(NEUTRAL);
      setGlyph("");
      return;
    }
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((res) => timers.push(setTimeout(res, ms)));

    (async () => {
      for (let i = 0; i < words.length; i++) {
        if (cancelled) return;
        onProgressRef.current?.(i);
        const raw = words[i].replace(/[.,!?؛،:"'()\[\]{}]/g, "").trim();
        const alias = WORD_ALIASES[raw.toLowerCase()];
        const gesture = alias ? WORD_SIGNS[alias] : undefined;

        if (gesture) {
          setGlyph("");
          for (const step of gesture.steps) {
            if (cancelled) return;
            applyPose(step);
            await wait(step.hold ?? 500);
          }
        } else {
          for (const ch of Array.from(raw)) {
            if (cancelled) return;
            const key = normalizeChar(ch);
            if (!key) continue;
            applyPose({ ...NEUTRAL, ...LETTER_POSES[key], pos: HAND_HOME });
            setGlyph(key);
            await wait(360);
          }
        }
        applyPose(NEUTRAL);
        setGlyph("");
        if (cancelled) return;
        await wait(280);
      }
      if (!cancelled) {
        applyPose(NEUTRAL);
        onDoneRef.current?.();
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, wordsKey]);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className || ""}`}>
      {/* current fingerspelled letter */}
      {glyph && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 shadow-xl pointer-events-none">
          <span className="text-2xl font-black text-white tracking-widest">{glyph}</span>
        </div>
      )}
      {webglError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
          <span className="text-3xl">🤟</span>
          <span className="text-text-muted text-xs font-bold">3D avatar isn't supported on this device.</span>
          <span className="text-faint text-[11px]">The signed text still appears below.</span>
        </div>
      ) : !ready && (
        <div className="absolute inset-0 flex items-center justify-center text-text-muted text-xs font-bold uppercase tracking-widest">
          Loading 3D engine…
        </div>
      )}
    </div>
  );
}
