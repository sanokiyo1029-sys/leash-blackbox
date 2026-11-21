"use client";
/* eslint-disable react-hooks/immutability -- three.js objects (camera, materials, lights, canvases) are mutated per frame by design in R3F */

/*
 * The data hall (React Three Fiber). One space in metres, +Y up, entrance at +z: a cold aisle of racks (the host
 * web-prod-01 among them), the network tap in its own cage (the independent witness), the evidence vault cage,
 * the yellow fibre raceway that carries the session, and the verification wall at the far end. Surfaces use CC0
 * PBR maps and a warehouse HDRI (public/tour/SOURCES.md); server fronts, labels and screens are drawn on canvases.
 * Native scroll drives the camera through keyframes (sections with data-room); frameloop="demand".
 */
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { setCase, useCase, type SealResult } from "@/lib/case-state";

type V3 = [number, number, number];
RectAreaLightUniformsLib.init(); // once, before any rect light compiles (this module only loads in the browser)

// ----------------------------------------------------------------- camera path (chapter coordinate c)
// c = i + progress through section i. Each room holds, then travels on; turns happen at thresholds.
const KEYS: { c: number; p: V3; l: V3 }[] = [
  { c: 0, p: [-0.45, 1.62, 5.6], l: [1.1, 1.3, -20] }, // the hall entrance, eye level in cold aisle A: server fronts recede right of the headline
  { c: 0.3, p: [-0.4, 1.62, 4.8], l: [1.0, 1.3, -20] },
  { c: 0.62, p: [0.2, 1.65, 1.6], l: [0, 1.4, -14] }, // through the containment door
  { c: 1, p: [-0.55, 1.55, -6.3], l: [1.4, 1.2, -8.4] }, // the host rack, web-prod-01
  { c: 1.42, p: [-0.55, 1.55, -6.5], l: [1.4, 1.2, -8.5] },
  { c: 1.7, p: [-0.3, 2.6, -2], l: [-2, 1.2, -12] },
  { c: 2, p: [8.6, 5.1, 4.6], l: [-4.6, 0.3, -12.5] }, // up under the slab, from the right: uplink, tap cage, host row, vault in one view
  { c: 2.42, p: [8.6, 5.1, 4.2], l: [-4.6, 0.3, -12.8] },
  { c: 2.64, p: [8.2, 5.1, -15], l: [-5, 1.4, 6] }, // look back to the entrance and the uplink the session came in on
  { c: 2.86, p: [5.2, 2.0, -10.5], l: [10.5, 1.2, -18] },
  { c: 3, p: [5.6, 1.65, -13.2], l: [10.6, 1.15, -17.4] }, // the evidence vault cage
  { c: 3.42, p: [5.6, 1.65, -13.5], l: [10.6, 1.15, -17.7] },
  { c: 3.8, p: [0.2, 1.7, -23.5], l: [-1.6, 1.85, -31] },
  { c: 4, p: [-0.7, 1.72, -27.7], l: [-2.9, 1.85, -31.6] }, // the verification wall, filling the right half
];
const smooth = (t: number) => t * t * (3 - 2 * t);
const tmpA = new THREE.Vector3();
function sample(c: number, p: THREE.Vector3, l: THREE.Vector3) {
  let i = 0;
  while (i < KEYS.length - 2 && c > KEYS[i + 1].c) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smooth(THREE.MathUtils.clamp((c - a.c) / (b.c - a.c), 0, 1));
  p.set(...a.p).lerp(tmpA.set(...b.p), t);
  l.set(...a.l).lerp(tmpA.set(...b.l), t);
}
function chapter(): number {
  const rooms = Array.from(document.querySelectorAll<HTMLElement>("[data-room]"));
  if (!rooms.length) return 0;
  const y = window.scrollY;
  const tops = rooms.map((r) => r.getBoundingClientRect().top + y);
  const end = Math.max(tops[tops.length - 1] + 1, document.documentElement.scrollHeight - window.innerHeight);
  for (let i = 0; i < tops.length; i++) {
    const next = i + 1 < tops.length ? tops[i + 1] : end;
    if (y < next || i === tops.length - 1) return THREE.MathUtils.clamp(i + (y - tops[i]) / (next - tops[i]), 0, rooms.length - 1);
  }
  return 0;
}

// ----------------------------------------------------------------- themes: the same hall, dimmed at night
const PALETTE = {
  dark: { bg: "#07090c", rack: "#181b20", floor: "#3a3f45", wall: "#4f555b", ceiling: "#1d2025", env: 0.5, hemi: 0.3, fixture: 6, key: 1.1, glass: 0.1, bloom: 0.85 },
  light: { bg: "#d9dde1", rack: "#e4e6e9", floor: "#b9bec3", wall: "#c9ccd0", ceiling: "#e9ebee", env: 0.9, hemi: 0.5, fixture: 7, key: 1.7, glass: 0.16, bloom: 1.1 }, // bright surfaces stay below the light bloom threshold; LEDs and screens still glow
};
type Pal = (typeof PALETTE)["dark"];
const isDark = () => document.documentElement.classList.contains("dark");

// ----------------------------------------------------------------- canvases (server fronts, signs, screens)
function canvasTex(cv: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** A rack front: 42U of servers or disk shelves, with status LEDs on a separate emissive map. */
function rackFront(seed: number, storage: boolean) {
  const W = 120;
  const H = 400;
  const c = document.createElement("canvas");
  const e = document.createElement("canvas");
  c.width = e.width = W;
  c.height = e.height = H;
  const g = c.getContext("2d")!;
  const ge = e.getContext("2d")!;
  ge.fillStyle = "#000";
  ge.fillRect(0, 0, W, H);
  g.fillStyle = "#0b0d10";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#24282d";
  g.fillRect(0, 0, 5, H);
  g.fillRect(W - 5, 0, 5, H);
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const U = (H - 16) / 42;
  let y = 8;
  while (y < H - 8 - U) {
    const u = storage ? 2 : r() < 0.16 ? 0 : r() < 0.55 ? 1 : 2;
    const h = Math.max(1, u) * U;
    if (u === 0) {
      g.fillStyle = "#14171b";
      g.fillRect(5, y, W - 10, h - 0.6);
      y += h;
      continue;
    }
    g.fillStyle = "#1c2025";
    g.fillRect(5, y + 0.4, W - 10, h - 0.8);
    const bays = storage ? 12 : 6;
    const bw = (W - 30) / bays;
    g.fillStyle = storage ? "#353a41" : "#2a2f35";
    for (let i = 0; i < bays; i++) g.fillRect(9 + i * bw, y + 1.6, bw - 1.4, h - 3.2);
    const leds = storage ? bays : 2;
    for (let i = 0; i < leds; i++) {
      const lx = storage ? 10 + i * bw : W - 15 + i * 4;
      const col = storage || r() < 0.45 ? "#5aa9ff" : "#3ddc84";
      for (const ctx of [g, ge]) {
        ctx.fillStyle = col;
        ctx.fillRect(lx, y + h / 2 - 1, 1.8, 1.8);
      }
    }
    y += h;
  }
  return { map: canvasTex(c), emissiveMap: canvasTex(e) };
}
function sign(text: string, sub = "", w = 512, h = 112) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0f1215";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#e8eaec";
  g.font = `600 ${Math.round(h * 0.36)}px Inter, Arial, sans-serif`;
  g.textBaseline = "middle";
  g.fillText(text, h * 0.22, sub ? h * 0.36 : h / 2);
  if (sub) {
    g.fillStyle = "#9aa3ab";
    g.font = `500 ${Math.round(h * 0.2)}px Inter, Arial, sans-serif`;
    g.fillText(sub, h * 0.22, h * 0.74);
  }
  return canvasTex(c);
}
/** One verification-wall screen. */
function drawScreen(cv: HTMLCanvasElement, title: string, big: string, lines: string[], tone: "idle" | "ok" | "bad" | "info") {
  const g = cv.getContext("2d")!;
  const { width: w, height: h } = cv;
  g.fillStyle = "#0c1219";
  g.fillRect(0, 0, w, h);
  const accent = tone === "ok" ? "#4fd18b" : tone === "bad" ? "#ff5a4e" : tone === "info" ? "#7fb4ff" : "#8a949e";
  g.fillStyle = accent;
  g.fillRect(0, 0, w, 6);
  g.fillStyle = "#9aa3ab";
  g.font = "600 30px 'IBM Plex Mono', monospace";
  g.fillText(title, 36, 62);
  g.fillStyle = accent;
  g.font = `700 ${big.length > 12 ? 64 : 92}px Inter, Arial, sans-serif`;
  g.fillText(big, 36, 190);
  g.fillStyle = "#e3e8ec";
  g.font = "500 28px 'IBM Plex Mono', monospace";
  lines.forEach((l, i) => g.fillText(l, 36, 260 + i * 40));
}

// ----------------------------------------------------------------- materials
const TEX = "/tour/";
function useMaterials() {
  const [fn, fr, md, mn, mr, wd, wn, wr] = useLoader(THREE.TextureLoader, [
    `${TEX}concrete_floor_painted_nor_gl_1k.jpg`, `${TEX}concrete_floor_painted_rough_1k.jpg`,
    `${TEX}metal_plate_02_diff_1k.jpg`, `${TEX}metal_plate_02_nor_gl_1k.jpg`, `${TEX}metal_plate_02_rough_1k.jpg`,
    `${TEX}precast_concrete_wall_diff_1k.jpg`, `${TEX}precast_concrete_wall_nor_gl_1k.jpg`, `${TEX}precast_concrete_wall_rough_1k.jpg`,
  ]);
  return useMemo(() => {
    const rep = (t: THREE.Texture, x: number, y: number, srgb = false) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(x, y);
      c.anisotropy = 8;
      if (srgb) c.colorSpace = THREE.SRGBColorSpace;
      c.needsUpdate = true;
      return c;
    };
    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
    const grid = document.createElement("canvas");
    grid.width = grid.height = 64;
    const gg = grid.getContext("2d")!;
    gg.strokeStyle = "#fff";
    gg.lineWidth = 3;
    gg.strokeRect(0, 0, 64, 64);
    const meshAlpha = (x: number, y: number) => {
      const t = new THREE.CanvasTexture(grid);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(x, y);
      return t;
    };
    const fronts = [1, 2, 3].map((k) => rackFront(k * 7919, false));
    const storage = rackFront(4242, true);
    const front = (f: { map: THREE.Texture; emissiveMap: THREE.Texture }) =>
      std({ map: f.map, emissiveMap: f.emissiveMap, emissive: "#ffffff", emissiveIntensity: 2.2, roughness: 0.55, metalness: 0.4 });
    return {
      // Sealed grey epoxy: the painted-concrete colour map reads as dirt, so only its relief and roughness are used.
      floor: std({ normalMap: rep(fn, 7, 10), roughnessMap: rep(fr, 7, 10), roughness: 0.5, normalScale: new THREE.Vector2(0.5, 0.5) }),
      wall: std({ map: rep(wd, 6, 1.4, true), normalMap: rep(wn, 6, 1.4), roughnessMap: rep(wr, 6, 1.4) }),
      ceiling: std({ roughness: 0.9 }),
      rack: std({ normalMap: rep(mn, 1, 2), roughnessMap: rep(mr, 1, 2), metalness: 0.55, roughness: 0.5, normalScale: new THREE.Vector2(0.25, 0.25) }),
      steel: std({ map: rep(md, 2, 2, true), normalMap: rep(mn, 2, 2), roughnessMap: rep(mr, 2, 2), metalness: 0.8, roughness: 0.4, color: "#b8bec4" }),
      cage: std({ color: "#9aa1a8", metalness: 0.8, roughness: 0.4, alphaMap: meshAlpha(60, 22), alphaTest: 0.5, side: THREE.DoubleSide }),
      tray: std({ color: "#8d949b", metalness: 0.8, roughness: 0.45, alphaMap: meshAlpha(1, 60), alphaTest: 0.5, side: THREE.DoubleSide }),
      raceway: std({ color: "#d9b21c", roughness: 0.45 }),
      glass: new THREE.MeshPhysicalMaterial({ color: "#cfe3ef", roughness: 0.08, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false }),
      frame: std({ color: "#c3c8cd", metalness: 0.85, roughness: 0.3 }),
      fixture: std({ color: "#ffffff", emissive: "#e8f1ff", emissiveIntensity: 3 }),
      beacon: std({ color: "#3a2a0c", emissive: "#ffb03a", emissiveIntensity: 4 }),
      pulse: std({ color: "#ffffff", emissive: "#fff3d6", emissiveIntensity: 8 }),
      bezel: std({ color: "#0a0b0d", roughness: 0.4, metalness: 0.3 }),
      fronts: fronts.map(front),
      storage: front(storage),
    };
  }, [fn, fr, md, mn, mr, wd, wn, wr]);
}
type Mats = ReturnType<typeof useMaterials>;

// ----------------------------------------------------------------- the hall
const RACK: V3 = [1.1, 2.0, 0.6]; // depth (x), height, width (z): the front is the +x face
const ROWS: { x: number; rot: number }[] = [
  { x: -1.75, rot: 0 }, // A-left, fronts into cold aisle A
  { x: 1.75, rot: Math.PI }, // A-right (web-prod-01 is here)
  { x: -4.75, rot: Math.PI },
  { x: 4.75, rot: 0 },
];
const PER_ROW = 40;
const rackZ = (i: number) => -0.3 - i * 0.6;
const HOST = { row: 1, i: 13 }; // web-prod-01 at z -8.1

/** All server racks, split over three front variants. */
function Racks({ m }: { m: Mats }) {
  const geo = useMemo(() => new THREE.BoxGeometry(...RACK), []);
  const refs = [useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null)];
  const slots = useMemo(() => {
    const out: { p: V3; rot: number; v: number }[] = [];
    ROWS.forEach((row, ri) => {
      for (let i = 0; i < PER_ROW; i++) out.push({ p: [row.x, 1, rackZ(i)], rot: row.rot, v: (ri * 7 + i * 3) % 3 });
    });
    return out;
  }, []);
  const counts = [0, 1, 2].map((v) => slots.filter((s) => s.v === v).length);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    [0, 1, 2].forEach((v) => {
      const mesh = refs[v].current!;
      slots.filter((s) => s.v === v).forEach((s, k) => {
        o.position.set(...s.p);
        o.rotation.set(0, s.rot, 0);
        o.updateMatrix();
        mesh.setMatrixAt(k, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  });
  return (
    <>
      {[0, 1, 2].map((v) => (
        <instancedMesh key={v} ref={refs[v]} args={[geo, [m.fronts[v], m.rack, m.rack, m.rack, m.rack, m.rack], counts[v]]} castShadow receiveShadow />
      ))}
    </>
  );
}

function Box({ p, s, m, rot = 0, shadow = false }: { p: V3; s: V3; m: THREE.Material | THREE.Material[]; rot?: number; shadow?: boolean }) {
  const [w, h, d] = s;
  const g = useMemo(() => new THREE.BoxGeometry(w, h, d), [w, h, d]);
  return <mesh geometry={g} material={m} position={p} rotation={[0, rot, 0]} castShadow={shadow} receiveShadow />;
}

function Sign({ p, rot = 0, w, text, sub }: { p: V3; rot?: number; w: number; text: string; sub?: string }) {
  const tex = useMemo(() => sign(text, sub), [text, sub]);
  return (
    <mesh position={p} rotation={[0, rot, 0]}>
      <planeGeometry args={[w, w * (112 / 512)]} />
      <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.6} />
    </mesh>
  );
}

/** A mesh cage: four panels, open at the top. */
function Cage({ x0, x1, z0, z1, m }: { x0: number; x1: number; z0: number; z1: number; m: Mats }) {
  const h = 2.6;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  return (
    <group>
      {[
        { p: [cx, h / 2, z0] as V3, w: x1 - x0, rot: 0 },
        { p: [cx, h / 2, z1] as V3, w: x1 - x0, rot: 0 },
        { p: [x0, h / 2, cz] as V3, w: Math.abs(z1 - z0), rot: Math.PI / 2 },
        { p: [x1, h / 2, cz] as V3, w: Math.abs(z1 - z0), rot: Math.PI / 2 },
      ].map((s, i) => (
        <mesh key={i} material={m.cage} position={s.p} rotation={[0, s.rot, 0]}>
          <planeGeometry args={[s.w, h]} />
        </mesh>
      ))}
      {[[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => (
        <Box key={`${x}${z}`} p={[x, h / 2, z]} s={[0.06, h, 0.06]} m={m.frame} />
      ))}
    </group>
  );
}

// The session's path: in at the uplink, along the fibre raceway, through the network tap (the witness), to the host.
const PATH: V3[] = [
  [-10.4, 2.95, 6.6],
  [-10.4, 2.95, -7.3],
  [-10.6, 2.2, -8.0], // the network tap: the observed threshold
  [-10.4, 2.95, -8.7],
  [1.75, 2.95, -8.7],
  [1.75, 2.12, -8.1], // web-prod-01
];
const REPLAY_MS = 5600;

function Hall({ m, pal }: { m: Mats; pal: React.MutableRefObject<Pal> }) {
  const { towerLit, replayAt, witnessSeen, revealAt, seal } = useCase();
  const invalidate = useThree((s) => s.invalidate);
  const pulse = useRef<THREE.Mesh>(null);
  const pulseLight = useRef<THREE.PointLight>(null);
  const beaconLight = useRef<THREE.PointLight>(null);
  const seen = useRef(false);
  const { path, tapT } = useMemo(() => {
    const cp = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i < PATH.length - 1; i++) cp.add(new THREE.LineCurve3(new THREE.Vector3(...PATH[i]), new THREE.Vector3(...PATH[i + 1])));
    const lens = cp.getCurveLengths();
    return { path: cp, tapT: lens[1] / lens[lens.length - 1] };
  }, []);
  const trail = useMemo(() => new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#fff1cf", transparent: true, opacity: 0.85 })), []);

  // Raceway segments along the path (horizontal runs and the drops into the tap and the host).
  const raceway = useMemo(() => {
    const segs: { p: V3; s: V3 }[] = [];
    segs.push({ p: [-10.4, 2.85, -0.3], s: [0.32, 0.12, 13.8] });
    segs.push({ p: [-4.3, 2.85, -8.7], s: [12.5, 0.12, 0.32] });
    segs.push({ p: [-10.4, 2.5, -8.0], s: [0.18, 0.7, 0.18] });
    segs.push({ p: [1.75, 2.5, -8.4], s: [0.18, 0.75, 0.18] });
    return segs;
  }, []);

  // The verification wall: two result screens and three status screens.
  const screens = useMemo(() => {
    const mk = (w: number, h: number) => {
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      return { cv, tex: canvasTex(cv) };
    };
    return { orig: mk(1024, 576), alt: mk(1024, 576), s1: mk(1024, 576), s2: mk(1024, 576), s3: mk(1024, 576) };
  }, []);
  useEffect(() => {
    const r: SealResult | null = seal;
    drawScreen(screens.orig.cv, "ORIGINAL SAMPLE", r ? (r.original ? "MATCH" : "NO MATCH") : "READY", r ? [`record #${r.seq}`, `root anchored in block ${r.block ?? "?"}`, `chain ${r.chainId ?? "?"} (local)`] : ["press Verify evidence"], r ? (r.original ? "ok" : "bad") : "idle");
    drawScreen(screens.alt.cv, "ALTERED COPY", r ? (r.altered ? "MATCH" : "NO MATCH") : "READY", r ? [`record #${r.seq}, one field changed`, "digest differs from the sealed leaf", "proof climbs to a different root"] : ["press Verify evidence"], r ? (r.altered ? "ok" : "bad") : "idle");
    drawScreen(screens.s1.cv, "LEASH BLACKBOX", "ANCHOR", ["Merkle roots of sealed batches", "committed to LeashAnchor"], "info");
    drawScreen(screens.s2.cv, "EVIDENCE VAULT", "APPEND-ONLY", ["off-host copy of every event", "hash-chained, batch-sealed"], "info");
    drawScreen(screens.s3.cv, "GATEWAY WITNESS", "SIGNED", ["secp256k1 / EIP-191", "own key, own store"], "info");
    Object.values(screens).forEach((s) => (s.tex.needsUpdate = true));
    invalidate();
  }, [seal, screens, invalidate]);

  useFrame(() => {
    const now = performance.now();
    let lit = towerLit;
    if (replayAt !== null && pulse.current) {
      const t = Math.min(1, (now - replayAt) / REPLAY_MS);
      const pt = path.getPointAt(t);
      pulse.current.visible = true;
      pulse.current.position.copy(pt);
      pulseLight.current?.position.copy(pt);
      if (pulseLight.current) pulseLight.current.intensity = t < 1 ? 2.5 : 0;
      trail.geometry.setFromPoints(path.getSpacedPoints(80).slice(0, Math.max(2, Math.round(t * 80))));
      if (t >= tapT && !witnessSeen && !seen.current) {
        seen.current = true;
        setCase({ witnessSeen: true, towerLit: true, pulseAt: now });
      }
      lit = t >= tapT;
      if (t < 1) invalidate();
    } else if (pulse.current?.visible) {
      seen.current = false;
      pulse.current.visible = false;
      if (pulseLight.current) pulseLight.current.intensity = 0;
      trail.geometry.setFromPoints([]);
    }
    const flash = revealAt !== null ? Math.max(0, 1 - (now - revealAt) / 1600) : 0;
    if (flash > 0) invalidate();
    m.beacon.emissiveIntensity = (lit ? 4 : 0.2) + flash * 8;
    if (beaconLight.current) beaconLight.current.intensity = (lit ? 1.6 : 0) + flash * 4;
  });

  const p = pal.current;
  return (
    <group>
      {/* Shell: floor, precast walls, dark slab ceiling */}
      <mesh material={m.floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -12.5]} receiveShadow>
        <planeGeometry args={[28, 39]} />
      </mesh>
      <Box p={[-14, 2.8, -12.5]} s={[0.3, 5.6, 39]} m={m.wall} />
      <Box p={[14, 2.8, -12.5]} s={[0.3, 5.6, 39]} m={m.wall} />
      <Box p={[0, 2.8, -32]} s={[28, 5.6, 0.3]} m={m.wall} />
      <Box p={[0, 2.8, 7]} s={[28, 5.6, 0.3]} m={m.wall} />
      <mesh material={m.ceiling} rotation={[Math.PI / 2, 0, 0]} position={[0, 5.6, -12.5]}>
        <planeGeometry args={[28, 39]} />
      </mesh>

      <Racks m={m} />
      {/* End panels of the rows */}
      {ROWS.map((r) => (
        <group key={r.x}>
          <Box p={[r.x, 1, 0.03]} s={[1.12, 2.02, 0.06]} m={m.rack} />
          <Box p={[r.x, 1, rackZ(PER_ROW - 1) - 0.33]} s={[1.12, 2.02, 0.06]} m={m.rack} />
        </group>
      ))}

      {/* Cold aisle A containment: door frame, glass roof, sign */}
      <Box p={[-1.22, 1.15, 0.12]} s={[0.06, 2.3, 0.08]} m={m.frame} />
      <Box p={[1.22, 1.15, 0.12]} s={[0.06, 2.3, 0.08]} m={m.frame} />
      <Box p={[0, 2.3, 0.12]} s={[2.5, 0.08, 0.08]} m={m.frame} />
      <mesh material={m.glass} position={[0, 2.12, 0.12]}>
        <planeGeometry args={[2.4, 0.3]} />
      </mesh>
      <mesh material={m.glass} rotation={[Math.PI / 2, 0, 0]} position={[0, 2.32, -11.9]}>
        <planeGeometry args={[2.4, 24]} />
      </mesh>
      {[-1.2, 1.2].map((x) => (
        <Box key={x} p={[x, 2.32, -11.9]} s={[0.05, 0.05, 24]} m={m.frame} />
      ))}
      <Sign p={[0, 2.62, 0.16]} w={1.5} text="COLD AISLE A" sub="rows A1 · A2" />

      {/* Cable baskets over the rows, and the yellow fibre raceway that carries the session */}
      {ROWS.map((r) => (
        <mesh key={r.x} material={m.tray} position={[r.x, 2.62, -11.9]}>
          <boxGeometry args={[0.5, 0.06, 24]} />
        </mesh>
      ))}
      {raceway.map((s, i) => (
        <Box key={i} p={s.p} s={s.s} m={m.raceway} />
      ))}
      <Box p={[-10.4, 2.6, 6.75]} s={[0.9, 0.7, 0.2]} m={m.bezel} />
      <Sign p={[-10.4, 3.15, 6.84]} rot={Math.PI} w={1.1} text="UPLINK" sub="ISP edge · 203.0.113.0/24" />

      {/* LED fixtures over the aisles (they come on down the aisle when the investigation starts) */}
      {[-2, -8, -14, -20].flatMap((z) => [0, -6.4, 6.4].map((x) => (
        <mesh key={`${x}${z}`} material={m.fixture} position={[x, 4.4, z]}>
          <boxGeometry args={[0.16, 0.05, 3.2]} />
        </mesh>
      )))}

      {/* The network tap: its own locked cage, its own key; the amber beacon is the witness */}
      <Cage x0={-12.6} x1={-8.6} z0={-5.6} z1={-10.6} m={m} />
      <mesh position={[-10.6, 1, -8]} material={[m.fronts[1], m.rack, m.rack, m.rack, m.rack, m.rack]} castShadow>
        <boxGeometry args={RACK} />
      </mesh>
      <mesh material={m.beacon} position={[-10.6, 2.12, -8]}>
        <cylinderGeometry args={[0.07, 0.07, 0.18, 16]} />
      </mesh>
      <pointLight ref={beaconLight} color="#ffb03a" intensity={1.6} distance={7} decay={2} position={[-10.4, 2.4, -8]} />
      <Sign p={[-8.55, 2.4, -8.1]} rot={Math.PI / 2} w={1.7} text="NETWORK TAP" sub="gateway witness · separate key" />

      {/* The evidence vault: a second cage, storage arrays, append-only */}
      <Cage x0={8} x1={12.6} z0={-14} z1={-21.6} m={m} />
      {[-15.6, -16.2, -16.8, -17.4, -18.0, -18.6, -19.2, -19.8].map((z) => (
        <mesh key={z} position={[11.2, 1, z]} rotation={[0, Math.PI, 0]} material={[m.storage, m.rack, m.rack, m.rack, m.rack, m.rack]} castShadow>
          <boxGeometry args={RACK} />
        </mesh>
      ))}
      <Sign p={[7.95, 2.4, -17.8]} rot={-Math.PI / 2} w={1.9} text="EVIDENCE VAULT" sub="append-only · off-host" />

      {/* The host rack's label */}
      <Sign p={[1.18, 2.12, rackZ(HOST.i)]} rot={-Math.PI / 2} w={0.58} text="WEB-PROD-01" />

      {/* The verification wall */}
      <group position={[0.4, 0, -31.7]}>
        {[
          { k: "orig", p: [-1.05, 1.35, 0], s: [1.9, 1.07] },
          { k: "alt", p: [1.05, 1.35, 0], s: [1.9, 1.07] },
          { k: "s1", p: [-1.42, 2.46, 0], s: [1.25, 0.7] },
          { k: "s2", p: [0, 2.46, 0], s: [1.25, 0.7] },
          { k: "s3", p: [1.42, 2.46, 0], s: [1.25, 0.7] },
        ].map((sc) => {
          const tex = screens[sc.k as keyof typeof screens].tex;
          return (
            <group key={sc.k} position={sc.p as V3}>
              <mesh material={m.bezel} position={[0, 0, -0.02]}>
                <boxGeometry args={[sc.s[0] + 0.05, sc.s[1] + 0.05, 0.04]} />
              </mesh>
              <mesh>
                <planeGeometry args={sc.s as [number, number]} />
                <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={1.7} roughness={0.3} />
              </mesh>
            </group>
          );
        })}
        <Box p={[0, 0.45, 0.6]} s={[3.6, 0.9, 0.8]} m={m.bezel} />
      </group>

      {/* The replayed session */}
      <mesh ref={pulse} material={m.pulse} visible={false}>
        <sphereGeometry args={[0.07, 16, 12]} />
      </mesh>
      <pointLight ref={pulseLight} color="#fff1cf" intensity={0} distance={3} decay={2} />
      <primitive object={trail} />
      <fog attach="fog" args={[p.bg, 18, 70]} />
    </group>
  );
}

// ----------------------------------------------------------------- lights, camera, post-processing
function Rig({ m, pal }: { m: Mats; pal: React.MutableRefObject<Pal> }) {
  const { camera, invalidate, scene, size, gl } = useThree();
  const { begun } = useCase();
  const hdr = useLoader(HDRLoader, `${TEX}empty_warehouse_01_1k.hdr`);
  const target = useRef({ p: new THREE.Vector3(), l: new THREE.Vector3(), c: 0, px: 0 });
  const look = useRef(new THREE.Vector3(...KEYS[0].l));
  const hemi = useRef<THREE.HemisphereLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const aisle = useRef<(THREE.RectAreaLight | null)[]>([]);
  const lightsOn = useRef<number | null>(null);

  useEffect(() => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
    const apply = () => {
      const p = isDark() ? PALETTE.dark : PALETTE.light;
      pal.current = p;
      scene.background = new THREE.Color(p.bg);
      if (scene.fog instanceof THREE.Fog) scene.fog.color.set(p.bg);
      scene.environmentIntensity = p.env;
      m.rack.color.set(p.rack);
      m.floor.color.set(p.floor);
      m.wall.color.set(p.wall);
      m.ceiling.color.set(p.ceiling);
      m.glass.opacity = p.glass;
      invalidate();
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const onScroll = () => {
      target.current.c = chapter();
      invalidate();
    };
    const fine = matchMedia("(pointer: fine)").matches;
    const onPointer = (e: PointerEvent) => {
      if (!fine) return;
      target.current.px = (e.clientX / window.innerWidth - 0.5) * 2;
      invalidate();
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      mo.disconnect();
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      removeEventListener("pointermove", onPointer);
    };
  }, [m, scene, hdr, invalidate, pal]);

  useEffect(() => {
    lightsOn.current = begun ? performance.now() : null;
    invalidate();
  }, [begun, invalidate]);

  // Bloom for LEDs and screens; the composer replaces R3F's own render (priority 1).
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.45, 0.85));
    c.addPass(new OutputPass());
    return c;
  }, [gl, scene, camera]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
    invalidate();
  }, [composer, gl, size, invalidate]);

  useFrame((_, dt) => {
    const t = target.current;
    sample(t.c, t.p, t.l);
    const right = new THREE.Vector3().subVectors(t.l, t.p).cross(camera.up).normalize();
    t.p.addScaledVector(right, t.px * (t.c < 0.7 ? 0.6 : 0.25));
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 5);
    camera.position.lerp(t.p, k);
    look.current.lerp(t.l, k);
    camera.lookAt(look.current);
    const pcam = camera as THREE.PerspectiveCamera;
    const fov = size.width < 640 ? 64 : 50;
    if (pcam.fov !== fov) {
      pcam.fov = fov;
      pcam.updateProjectionMatrix();
    }
    // The aisle fixtures switch on one after another down the aisle once the investigation starts.
    const p = pal.current;
    const now = performance.now();
    let settling = false;
    aisle.current.forEach((l, i) => {
      if (!l) return;
      const on = lightsOn.current === null ? 0.5 : THREE.MathUtils.clamp((now - lightsOn.current - i * 140) / 260, 0.5, 1);
      if (lightsOn.current !== null && on < 1) settling = true;
      l.intensity = p.fixture * on;
    });
    m.fixture.emissiveIntensity = lightsOn.current === null ? 1.4 : 3;
    if (hemi.current) hemi.current.intensity = p.hemi;
    if (key.current) key.current.intensity = p.key;
    (composer.passes[1] as UnrealBloomPass).threshold = p.bloom;
    composer.render();
    if (settling || camera.position.distanceTo(t.p) > 0.005 || look.current.distanceTo(t.l) > 0.005) invalidate();
  }, 1);

  return (
    <>
      <hemisphereLight ref={hemi} args={["#dfe8f2", "#1a1d21", 0.3]} />
      <directionalLight
        ref={key}
        position={[4, 9, 4]}
        color="#eef4ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
      {[-2, -8, -14, -20].map((z, i) => (
        <rectAreaLight
          key={z}
          ref={(l) => {
            aisle.current[i] = l;
          }}
          args={["#eef4ff", 1, 0.3, 3.2]}
          position={[0, 4.35, z]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      ))}
    </>
  );
}

function Scene() {
  const m = useMaterials();
  const pal = useRef<Pal>(PALETTE.dark);
  return (
    <>
      <Rig m={m} pal={pal} />
      <Hall m={m} pal={pal} />
    </>
  );
}

export default function DataCenterScene() {
  return (
    <Canvas
      frameloop="demand"
      shadows="soft"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance", toneMappingExposure: 1 }}
      camera={{ fov: 50, near: 0.05, far: 200, position: KEYS[0].p }}
      aria-hidden
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
