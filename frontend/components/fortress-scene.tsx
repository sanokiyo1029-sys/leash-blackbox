"use client";
/* eslint-disable react-hooks/immutability -- three.js objects (camera, materials, lights) are mutated per frame by design in R3F */

/*
 * The fortress (React Three Fiber, procedural geometry only: no images, no loaders). One coordinate system in
 * metres, +Y up. The visitor approaches along +Z → -Z: bridge (z 34 → 0) over the moat, gatehouse (z 0 → -4),
 * outer courtyard (to z -24), inner wall with a wall walk and a second gate, the inner ward with its maze, the
 * keep, the watchtower and the archive; a stair turret down to the undercroft vault (y -9) with the ledger desk
 * and, at its west end, the seal press. Native scroll drives the camera through keyframes (section anchors with
 * data-room); the pointer nudges it sideways on desktop. frameloop="demand": nothing renders while nothing moves.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { setCase, useCase } from "@/lib/case-state";

type V3 = [number, number, number];
const TILE = 3; // metres per masonry texture tile

// ----------------------------------------------------------------- camera path (chapter coordinate c)
// c = i + progress through section i. Each room holds for the first part of its section, then travels on.
const KEYS: { c: number; p: V3; l: V3 }[] = [
  { c: 0, p: [0.6, 1.7, 45], l: [-8, 6.5, -6] }, // eye level on the wet bridge: open sky left, gate right, the near post in the corner
  { c: 0.3, p: [0.5, 1.7, 41], l: [-6, 6.2, -6] },
  { c: 0.62, p: [0.4, 1.8, 12], l: [0, 4.4, -8] }, // the grooves lead under the gate
  { c: 0.86, p: [0, 2.0, 0.6], l: [0, 6.5, -10] }, // under the arch: its soffit overhead
  { c: 1, p: [-1, 2.5, -6], l: [-6, 1.0, -13] }, // courtyard: the watch desk
  { c: 1.42, p: [-1, 2.5, -6.5], l: [-6, 1.0, -13.5] },
  { c: 1.7, p: [-8, 1.8, -20], l: [-8, 1.8, -42] }, // the intruder's view at the second gate: no archive in sight
  { c: 2, p: [-16, 26, -12], l: [4, 4, -42] }, // risen above the wall: the route, the inner gate, the junction, watchtower and archive in one shot
  { c: 2.42, p: [-16, 26, -11.6], l: [4, 4, -42] },
  { c: 2.62, p: [-16, 34, -12], l: [2, 0, 30] }, // look back, above the gate towers: the gatehouse and the same bridge
  { c: 2.86, p: [22, 17, -14], l: [22, -6, -14.6] }, // down the stair turret
  { c: 3, p: [10, -6, -14], l: [3, -7.6, -12] }, // undercroft: the ledger desk, right of the panel
  { c: 3.42, p: [10, -6, -14.2], l: [3, -7.6, -12.2] },
  { c: 3.8, p: [-4, -6.2, -14], l: [-17, -7.0, -14] },
  { c: 4, p: [-10.6, -6.4, -14], l: [-17, -6.9, -12.2] }, // the seal press, face on, right of the panel: its two seals
];
const smooth = (t: number) => t * t * (3 - 2 * t);
function sample(c: number, p: THREE.Vector3, l: THREE.Vector3) {
  let i = 0;
  while (i < KEYS.length - 2 && c > KEYS[i + 1].c) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smooth(THREE.MathUtils.clamp((c - a.c) / (b.c - a.c), 0, 1));
  p.set(...a.p).lerp(new THREE.Vector3(...b.p), t);
  l.set(...a.l).lerp(new THREE.Vector3(...b.l), t);
}
/** Where the scroll is, in chapter coordinates. */
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

// ----------------------------------------------------------------- palettes (both themes, swapped in place)
const PALETTE = {
  dark: { fog: "#22303f", hemiSky: "#7d97b6", hemiGround: "#0d1218", hemi: 1.7, sun: "#b4c8df", sunI: 1.9, sunPos: [-40, 50, 30] as V3, stone: "#5d6670", wall: "#4e5660", roof: "#262c33", iron: "#16191c", water: "#1f3346", land: "#34424f", far: "#344354", bronze: "#9a7442", wood: "#3b2c20" },
  light: { fog: "#e8dccb", hemiSky: "#fff1dc", hemiGround: "#8f877a", hemi: 1.5, sun: "#ffd7a3", sunI: 2.4, sunPos: [70, 30, 50] as V3, stone: "#d6cdbd", wall: "#c9c0b0", roof: "#7e878d", iron: "#2a2d30", water: "#8fa3ad", land: "#a49e89", far: "#c3c4bd", bronze: "#9a7442", wood: "#6b5038" },
};
type Pal = (typeof PALETTE)["dark"];
const isDark = () => document.documentElement.classList.contains("dark");

function masonry(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#7c7c7c";
  g.fillRect(0, 0, 256, 256);
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < 256; y += 32) {
    for (let x = y % 64 ? -24 : 0; x < 256; x += 48) {
      const v = 175 + Math.floor(r() * 70);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x + 2, y + 2, 44, 28);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function useMaterials() {
  return useMemo(() => {
    const map = masonry();
    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
    return {
      stone: std({ map, roughness: 0.55 }),
      wall: std({ map, roughness: 0.6 }),
      roof: std({ roughness: 0.7 }),
      iron: std({ metalness: 0.7, roughness: 0.45 }),
      water: std({ roughness: 0.12, metalness: 0.55 }),
      land: std({ roughness: 1 }),
      far: std({ roughness: 1, flatShading: true }),
      bronze: std({ metalness: 0.35, roughness: 0.45 }), // no environment map: a full metal would render black
      wood: std({ roughness: 0.8 }),
      inner: std({ map, roughness: 0.6, side: THREE.DoubleSide }),
      groove: std({ color: "#1a1a1a", emissive: "#ffb45c", emissiveIntensity: 0, roughness: 0.3 }),
      glass: std({ color: "#2a1c0c", emissive: "#ffb24f", emissiveIntensity: 2.4 }),
      marker: std({ color: "#f3ead8", emissive: "#f3ead8", emissiveIntensity: 0.8 }),
      sealOk: std({ color: "#3a2a12", emissive: "#ffb24f", emissiveIntensity: 0 }),
      sealBad: std({ color: "#3a1210", emissive: "#d2402f", emissiveIntensity: 0 }),
      door: std({ color: "#07090b", roughness: 1 }),
    };
  }, []);
}
type Mats = ReturnType<typeof useMaterials>;

function paint(m: Mats, p: Pal) {
  m.stone.color.set(p.stone);
  m.inner.color.set(p.stone);
  m.wall.color.set(p.wall);
  m.roof.color.set(p.roof);
  m.iron.color.set(p.iron);
  m.water.color.set(p.water);
  m.land.color.set(p.land);
  m.far.color.set(p.far);
  m.bronze.color.set(p.bronze);
  m.wood.color.set(p.wood);
}

// ----------------------------------------------------------------- geometry helpers
/** A box whose UVs repeat the masonry at a constant scale on every face. */
function stoneBox(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) uv.setXY(f * 4 + i, (uv.getX(f * 4 + i) * dims[f][0]) / TILE, (uv.getY(f * 4 + i) * dims[f][1]) / TILE);
  return g;
}
/** A wall in the x-y plane, extruded `depth` towards -z, with pointed arches cut up from the ground. */
function archWall(w: number, h: number, depth: number, arches: { x: number; w: number; h: number }[]) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  for (const a of [...arches].sort((m, n) => m.x - n.x)) {
    const r = a.w / 2;
    s.lineTo(a.x - r, 0);
    s.lineTo(a.x - r, a.h);
    s.quadraticCurveTo(a.x - r, a.h + r * 0.95, a.x, a.h + r * 1.15);
    s.quadraticCurveTo(a.x + r, a.h + r * 0.95, a.x + r, a.h);
    s.lineTo(a.x + r, 0);
  }
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -depth);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / TILE, uv.getY(i) / TILE);
  return g;
}
function towerGeo(r: number, h: number, open = false) {
  const g = new THREE.CylinderGeometry(r, r * 1.04, h, 28, 1, open);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * r) / TILE, (uv.getY(i) * h) / TILE);
  return g;
}

function Block({ p, s: [w, h, d], m }: { p: V3; s: V3; m: THREE.Material }) {
  const g = useMemo(() => stoneBox(w, h, d), [w, h, d]);
  return <mesh geometry={g} material={m} position={p} />;
}

/** Merlons along a wall top, as one instanced mesh. */
function Merlons({ from, to, y, m, size = 0.9, gap = 0.8 }: { from: V3; to: V3; y: number; m: THREE.Material; size?: number; gap?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const n = Math.max(1, Math.floor(a.distanceTo(b) / (size + gap)));
  const g = useMemo(() => stoneBox(size, 1.1, size), [size]);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      o.position.lerpVectors(a, b, (i + 0.5) / n).setY(y + 0.55);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[g, m, n]} />;
}

function Tower({ p, r, h, m, roof }: { p: V3; r: number; h: number; m: Mats; roof?: number }) {
  const g = useMemo(() => towerGeo(r, h), [r, h]);
  return (
    <group position={p}>
      <mesh geometry={g} material={m.stone} position={[0, h / 2, 0]} />
      {roof ? (
        <mesh material={m.roof} position={[0, h + roof / 2, 0]}>
          <coneGeometry args={[r + 0.5, roof, 28]} />
        </mesh>
      ) : null}
    </group>
  );
}

// ----------------------------------------------------------------- the fortress
// The intruder's route: across the outer ward, through the inner gate (the gateway the watchtower watches), to
// the junction, then toward the keep. From there the archive is behind the maze walls.
const ROUTE: V3[] = [
  [2, 0.3, -8],
  [-6, 0.3, -18],
  [-8, 0.3, -23],
  [-8, 0.3, -27.5],
  [-8, 0.3, -33],
  [-14, 0.3, -35],
];
const THRESHOLD_T = 0.6; // fraction of the route (by length) at which the marker passes the inner gate
const REPLAY_MS = 5200;

function Fortress({ m }: { m: Mats }) {
  const { towerLit, replayAt, witnessSeen, revealAt, seal } = useCase();
  const invalidate = useThree((s) => s.invalidate);
  const marker = useRef<THREE.Mesh>(null);
  const towerLight = useRef<THREE.PointLight>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(ROUTE.map((v) => new THREE.Vector3(...v)), false, "centripetal"), []);
  const bridgeGeo = useMemo(() => {
    // The bridge's side profile (z, y) with three pointed arches, extruded across its 6 m width.
    const g = archWall(34, 7, 6, [{ x: -10, w: 6, h: 1.5 }, { x: -1, w: 6, h: 1.5 }, { x: 8, w: 6, h: 1.5 }]);
    g.rotateY(Math.PI / 2);
    g.translate(3, -7, 17);
    return g;
  }, []);
  const gateGeo = useMemo(() => archWall(32, 10, 4, [{ x: 0, w: 4.4, h: 5.2 }]), []);
  const innerGeo = useMemo(() => archWall(54, 16, 3, [{ x: -8, w: 3, h: 3.4 }]), []);
  const groundGeo = useMemo(() => {
    const sh = new THREE.Shape([new THREE.Vector2(-34, 0), new THREE.Vector2(34, 0), new THREE.Vector2(34, 74), new THREE.Vector2(-34, 74)]);
    sh.holes.push(new THREE.Path().absarc(22, 14, 3.15, 0, Math.PI * 2, false));
    const g = new THREE.ShapeGeometry(sh, 24);
    g.rotateX(-Math.PI / 2); // shape y → world -z
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / TILE, uv.getY(i) / TILE);
    return g;
  }, []);
  const turretGeo = useMemo(() => towerGeo(3.2, 17, true), []);
  const trailLine = useMemo(() => new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#f3ead8", transparent: true, opacity: 0.65 })), []);
  const seen = useRef(false);
  const stairs = useRef<THREE.InstancedMesh>(null);
  const stepGeo = useMemo(() => stoneBox(2.6, 0.3, 0.9), []);

  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    for (let i = 0; i < 64; i++) {
      const a = i * 0.36;
      o.position.set(22 + Math.cos(a) * 1.75, 13.6 - i * 0.355, -14 + Math.sin(a) * 1.75);
      o.rotation.set(0, -a, 0);
      o.updateMatrix();
      stairs.current!.setMatrixAt(i, o.matrix);
    }
    stairs.current!.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(() => {
    const now = performance.now();
    let lit = towerLit;
    if (replayAt !== null && marker.current) {
      const t = Math.min(1, (now - replayAt) / REPLAY_MS);
      marker.current.visible = true;
      marker.current.position.copy(curve.getPointAt(t));
      trailLine.geometry.setFromPoints(curve.getSpacedPoints(48).slice(0, Math.max(2, Math.round(t * 48))));
      if (t >= THRESHOLD_T && !witnessSeen && !seen.current) {
        seen.current = true;
        setCase({ witnessSeen: true, towerLit: true, pulseAt: now });
      }
      lit = t >= THRESHOLD_T;
      if (t < 1) invalidate();
    } else if (marker.current?.visible) {
      seen.current = false;
      marker.current.visible = false;
      trailLine.geometry.setFromPoints([]);
    }
    let flash = 0;
    if (revealAt !== null) {
      flash = Math.max(0, 1 - (now - revealAt) / 1600);
      if (flash > 0) invalidate();
    }
    m.glass.emissiveIntensity = (lit ? 2.4 : 0.15) + flash * 3;
    if (towerLight.current) towerLight.current.intensity = (lit ? 60 : 0) + flash * 120;
    m.sealOk.emissiveIntensity = seal ? (seal.original ? 2.2 : 0) : 0;
    m.sealBad.emissiveIntensity = seal ? (seal.altered ? 0 : 2.2) : 0;
  });

  const jump = () => document.getElementById("maze")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });

  return (
    <group>
      {/* Land, moat and the plateau the fortress stands on (deep enough to hold the undercroft) */}
      <mesh material={m.water} rotation={[-Math.PI / 2, 0, 0]} position={[0, -6, 0]}>
        <planeGeometry args={[900, 900]} />
      </mesh>
      <Block p={[0, -6, 160]} s={[900, 12, 252]} m={m.land} />
      <Block p={[220, -6, -100]} s={[372, 12, 270]} m={m.land} />
      <Block p={[-220, -6, -100]} s={[372, 12, 270]} m={m.land} />
      <mesh geometry={groundGeo} material={m.stone} />
      <Block p={[0, -6.5, 0.2]} s={[68, 13, 0.4]} m={m.wall} />
      <Block p={[-34, -6.5, -37]} s={[0.4, 13, 74]} m={m.wall} />
      <Block p={[34, -6.5, -37]} s={[0.4, 13, 74]} m={m.wall} />
      <Block p={[0, -6.5, -74]} s={[68, 13, 0.4]} m={m.wall} />
      {[[-170, -330, 120], [-60, -380, 150], [90, -360, 130], [210, -300, 110], [300, -160, 90], [-300, -170, 100]].map(([x, z, h]) => (
        <mesh key={x} material={m.far} position={[x, h / 2 - 6, z]}>
          <coneGeometry args={[h * 0.9, h, 6]} />
        </mesh>
      ))}

      {/* Bridge: arched viaduct, parapets, the near post, and three shallow grooves leading under the gate */}
      <mesh geometry={bridgeGeo} material={m.stone} />
      <Block p={[0, -0.25, 41]} s={[6, 0.5, 14]} m={m.stone} />
      <Block p={[-3.25, 0.55, 24]} s={[0.5, 1.1, 48]} m={m.stone} />
      <Block p={[3.25, 0.55, 24]} s={[0.5, 1.1, 48]} m={m.stone} />
      <Block p={[3.3, 2.1, 38.5]} s={[1.4, 4.2, 1.4]} m={m.stone} />
      <Block p={[-3.3, 2.1, 38.5]} s={[1.4, 4.2, 1.4]} m={m.stone} />
      <Block p={[3.3, 4.35, 38.5]} s={[1.8, 0.3, 1.8]} m={m.wall} />
      <Block p={[-3.3, 4.35, 38.5]} s={[1.8, 0.3, 1.8]} m={m.wall} />
      {[-0.55, 0, 0.55].map((x) => (
        <mesh key={x} material={m.groove} position={[x, 0.012, 21]}>
          <boxGeometry args={[0.1, 0.02, 50]} />
        </mesh>
      ))}

      {/* Gatehouse: arch wall (its soffit is real geometry), flanking towers, the raised portcullis */}
      <mesh geometry={gateGeo} material={m.stone} />
      <Merlons from={[-16, 0, -0.5]} to={[16, 0, -0.5]} y={10} m={m.stone} />
      <Tower p={[-10.8, 0, -1]} r={2.6} h={14} m={m} roof={6} />
      <Tower p={[10.8, 0, -1]} r={2.6} h={14} m={m} roof={6} />
      <group position={[0, 0, -1.6]}>
        {Array.from({ length: 11 }, (_, i) => (
          <mesh key={`v${i}`} material={m.iron} position={[-2 + i * 0.4, 7.4, 0]}>
            <boxGeometry args={[0.1, 5.2, 0.1]} />
          </mesh>
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={`h${i}`} material={m.iron} position={[0, 5.2 + i * 0.62, 0]}>
            <boxGeometry args={[4.2, 0.1, 0.1]} />
          </mesh>
        ))}
      </group>

      {/* Curtain walls round the whole fortress, with merlons */}
      <Block p={[-22, 5, -1.5]} s={[12, 10, 3]} m={m.wall} />
      <Block p={[22, 5, -1.5]} s={[12, 10, 3]} m={m.wall} />
      <Block p={[-28.5, 5, -35]} s={[3, 10, 70]} m={m.wall} />
      <Block p={[28.5, 5, -35]} s={[3, 10, 70]} m={m.wall} />
      <Block p={[0, 5, -68.5]} s={[60, 10, 3]} m={m.wall} />
      <Merlons from={[-29.6, 0, -1]} to={[-29.6, 0, -69]} y={10} m={m.wall} />
      <Merlons from={[29.6, 0, -1]} to={[29.6, 0, -69]} y={10} m={m.wall} />
      <Merlons from={[-29, 0, -69.6]} to={[29, 0, -69.6]} y={10} m={m.wall} />
      <Tower p={[-28.5, 0, -1]} r={3.4} h={16} m={m} roof={7} />
      <Tower p={[28.5, 0, -1]} r={3.4} h={16} m={m} roof={7} />
      <Tower p={[-28.5, 0, -68.5]} r={3.4} h={16} m={m} roof={7} />
      <Tower p={[28.5, 0, -68.5]} r={3.4} h={16} m={m} roof={7} />

      {/* Courtyard: the watch desk and its lantern */}
      <Block p={[-6, 0.5, -13]} s={[3.2, 1, 1.5]} m={m.wood} />
      <mesh material={m.marker} position={[-6.2, 1.02, -13]} rotation={[-Math.PI / 2, 0, 0.1]}>
        <planeGeometry args={[1.1, 0.8]} />
      </mesh>
      <pointLight color="#ffb45c" intensity={40} distance={18} decay={2} position={[-5.2, 2.2, -12.6]} />
      <pointLight color="#ffb45c" intensity={90} distance={26} decay={2} position={[1.5, 3.5, -9]} />

      {/* Inner wall with its wall walk and the second, controlled gate */}
      <mesh geometry={innerGeo} material={m.wall} position={[0, 0, -24]} />
      <Merlons from={[-27, 0, -24.5]} to={[27, 0, -24.5]} y={16} m={m.wall} />
      <Merlons from={[-27, 0, -26.5]} to={[27, 0, -26.5]} y={16} m={m.wall} />
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} material={m.iron} position={[-9.3 + i * 0.43, 2.4, -25.5]}>
          <boxGeometry args={[0.09, 4.8, 0.09]} />
        </mesh>
      ))}

      {/* Inner ward: maze walls that hide the archive from the second gate, the keep */}
      <Block p={[-8, 3, -36]} s={[24, 6, 1.2]} m={m.wall} />
      <Block p={[4, 3, -38]} s={[1.2, 6, 22]} m={m.wall} />
      <Block p={[-14, 3, -44]} s={[20, 6, 1.2]} m={m.wall} />
      <Block p={[-2, 3, -54]} s={[1.2, 6, 20]} m={m.wall} />
      <Block p={[-15, 9, -56]} s={[12, 18, 12]} m={m.stone} />
      <Merlons from={[-21, 0, -50]} to={[-9, 0, -50]} y={18} m={m.stone} />
      {[[-21, -50], [-9, -50], [-21, -62], [-9, -62]].map(([x, z]) => (
        <Tower key={`${x}${z}`} p={[x, 0, z]} r={1.6} h={21} m={m} roof={4} />
      ))}

      {/* The archive (the evidence vault) and the watchtower (the witness) */}
      <Block p={[17, 3.5, -54]} s={[9, 7, 9]} m={m.stone} />
      <mesh material={m.roof} position={[17, 9.2, -54]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[7, 4.4, 4]} />
      </mesh>
      <mesh material={m.door} position={[12.45, 1.6, -54]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[1.8, 3.2]} />
      </mesh>
      <pointLight color="#c9d6e6" intensity={30} distance={14} decay={2} position={[10.5, 4, -54]} />
      <group
        onClick={(e) => {
          e.stopPropagation();
          jump();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <Tower p={[12, 0, -38]} r={3.2} h={26} m={m} roof={7} />
        <mesh material={m.glass} position={[12, 22, -34.72]}>
          <planeGeometry args={[1.1, 2.0]} />
        </mesh>
      </group>
      <pointLight ref={towerLight} color="#ffb24f" intensity={60} distance={30} decay={2} position={[12, 22, -33.4]} />

      {/* The replayed crossing */}
      <mesh ref={marker} material={m.marker} visible={false}>
        <sphereGeometry args={[0.38, 16, 12]} />
      </mesh>
      <primitive object={trailLine} />

      {/* Stair turret down to the undercroft */}
      <mesh geometry={turretGeo} material={m.inner} position={[22, 5.5, -14]} />
      <mesh material={m.stone} position={[22, 2.5, -14]}>
        <cylinderGeometry args={[0.45, 0.45, 23, 12]} />
      </mesh>
      <instancedMesh ref={stairs} args={[stepGeo, m.stone, 64]} />

      {/* Undercroft: barrel vault, ledger desk, and the seal chamber with its bronze press at the west end */}
      <Block p={[0, -9.1, -14]} s={[50, 0.2, 16]} m={m.stone} />
      <Block p={[25, -6.5, -14]} s={[0.4, 5, 16]} m={m.stone} />
      <Block p={[0, -6.5, -5.8]} s={[50, 5, 0.4]} m={m.stone} />
      <Block p={[0, -6.5, -22.2]} s={[50, 5, 0.4]} m={m.stone} />
      <Block p={[-25, -6.5, -14]} s={[0.4, 5, 16]} m={m.stone} />
      <mesh material={m.inner} position={[0, -4, -14]} rotation={[0, 0, Math.PI / 2]} scale={[0.42, 1, 1]}>
        <cylinderGeometry args={[8, 8, 50, 28, 1, true, 0, Math.PI]} />
      </mesh>
      {[-18, -10, -2, 6, 14].map((x) => (
        <mesh key={x} material={m.wall} position={[x, -4, -14]} rotation={[0, Math.PI / 2, 0]} scale={[1, 0.42, 1]}>
          <torusGeometry args={[7.8, 0.28, 8, 28, Math.PI]} />
        </mesh>
      ))}
      <Block p={[3, -8.5, -14]} s={[2, 1, 4.6]} m={m.wood} />
      <mesh material={m.marker} position={[3, -7.98, -15.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.2, 1.7]} />
      </mesh>
      <mesh material={m.marker} position={[3, -7.98, -12.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.2, 1.7]} />
      </mesh>
      <pointLight color="#ffb45c" intensity={80} distance={16} decay={2} position={[4.5, -6.4, -14]} />
      <group position={[-17, -9, -14]}>
        <mesh material={m.bronze} position={[0, 0.6, 0]}>
          <boxGeometry args={[2.6, 1.2, 3.4]} />
        </mesh>
        <mesh material={m.bronze} position={[0.6, 1.9, 0]}>
          <boxGeometry args={[1.4, 1.4, 3.2]} />
        </mesh>
        {[-1.3, 1.3].map((z) => (
          <mesh key={z} material={m.bronze} position={[0, 2.6, z]}>
            <cylinderGeometry args={[0.18, 0.18, 4, 12]} />
          </mesh>
        ))}
        <mesh material={m.bronze} position={[0, 4.6, 0]}>
          <boxGeometry args={[1, 0.5, 3]} />
        </mesh>
        <mesh material={m.bronze} position={[0, 3.6, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 2, 12]} />
        </mesh>
        {/* Two seals hung on the press front, facing the visitor: the original (left) and the altered copy (right) */}
        <mesh material={m.sealOk} position={[1.36, 1.9, 0.75]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.5, 0.5, 0.1, 28]} />
        </mesh>
        <mesh material={m.sealBad} position={[1.36, 1.9, -0.75]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.5, 0.5, 0.1, 28]} />
        </mesh>
      </group>
      <pointLight color="#ffb45c" intensity={40} distance={14} decay={2} position={[-14.2, -5.4, -14]} />
      <pointLight color="#ffcf8a" intensity={60} distance={26} decay={2} position={[-4, -2.2, -14]} />
    </group>
  );
}

// ----------------------------------------------------------------- camera, lights, theme
function Rig({ m }: { m: Mats }) {
  const { camera, invalidate, scene, size } = useThree();
  const { begun, pulseAt } = useCase();
  const target = useRef({ p: new THREE.Vector3(), l: new THREE.Vector3(), c: 0, px: 0 });
  const look = useRef(new THREE.Vector3(...KEYS[0].l));
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const lantern = useRef<THREE.PointLight>(null);
  const base = useRef({ hemi: 1, sun: 1 });

  useEffect(() => {
    const apply = () => {
      const p = isDark() ? PALETTE.dark : PALETTE.light;
      paint(m, p);
      scene.fog = new THREE.Fog(p.fog, 40, 260);
      hemi.current?.color.set(p.hemiSky);
      hemi.current?.groundColor.set(p.hemiGround);
      sun.current?.color.set(p.sun);
      sun.current?.position.set(...p.sunPos);
      base.current = { hemi: p.hemi, sun: p.sunI };
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
  }, [m, scene, invalidate]);

  useEffect(() => invalidate(), [begun, pulseAt, invalidate]);

  useFrame((_, dt) => {
    const t = target.current;
    sample(t.c, t.p, t.l);
    // Sideways with the pointer on desktop, strongest on the bridge (the near post uncovers the courtyard).
    const side = t.px * (t.c < 0.7 ? 2.4 : 0.5);
    const right = new THREE.Vector3().subVectors(t.l, t.p).cross(camera.up).normalize();
    t.p.addScaledVector(right, side);
    const k = 1 - Math.exp(-dt * 5);
    camera.position.lerp(t.p, k);
    look.current.lerp(t.l, k);
    camera.lookAt(look.current);
    const pcam = camera as THREE.PerspectiveCamera;
    const fov = size.width < 640 ? 64 : 52;
    if (pcam.fov !== fov) {
      pcam.fov = fov;
      pcam.updateProjectionMatrix();
    }
    // Underground, the moon and the sky light fade: the vault is lit by its lamps.
    const under = THREE.MathUtils.clamp((0.5 - camera.position.y) / 4, 0, 1);
    if (hemi.current) hemi.current.intensity = base.current.hemi * (1 - 0.5 * under);
    if (sun.current) sun.current.intensity = base.current.sun * (1 - 0.85 * under);
    // Wick's lantern rides just ahead of the camera; it rises when the visitor begins and flares on new evidence.
    const now = performance.now();
    const flare = pulseAt ? Math.max(0, 1 - (now - pulseAt) / 1400) : 0;
    if (lantern.current) {
      const fwd = new THREE.Vector3().subVectors(look.current, camera.position).normalize();
      lantern.current.position.copy(camera.position).addScaledVector(fwd, 2.2).add(new THREE.Vector3(0, begun ? 0.2 : -0.9, 0)).addScaledVector(right, 0.5);
      lantern.current.intensity = (begun ? 14 : 3) + flare * 30;
    }
    m.groove.emissiveIntensity = begun ? 0.55 + flare : 0;
    if (camera.position.distanceTo(t.p) > 0.01 || look.current.distanceTo(t.l) > 0.01 || flare > 0) invalidate();
  });

  return (
    <>
      <hemisphereLight ref={hemi} />
      <directionalLight ref={sun} />
      <pointLight ref={lantern} color="#ffbe6a" distance={14} decay={2} />
    </>
  );
}

export default function FortressScene() {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 52, near: 0.1, far: 900, position: KEYS[0].p }}
      aria-hidden
    >
      <Scene />
    </Canvas>
  );
}

function Scene() {
  const m = useMaterials();
  return (
    <>
      <Rig m={m} />
      <Fortress m={m} />
    </>
  );
}
