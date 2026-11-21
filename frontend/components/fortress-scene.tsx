"use client";
/* eslint-disable react-hooks/immutability -- three.js objects (camera, materials, lights) are mutated per frame by design in R3F */

/*
 * The fortress (React Three Fiber). One place in metres, +Y up, the visitor starts at +z on the near side of a
 * ravine: a weathered basalt arch at the near left, a bridge that curves right across the ravine to a gatehouse,
 * the keep behind it with one amber window high up (the archive), a courtyard, and a vaulted passage with a slit
 * that looks into a second passage (the witness). Surfaces use CC0 photo-scanned maps and a misty dawn HDRI
 * (public/fortress/SOURCES.md). Native scroll drives the camera through keyframes (sections with data-room);
 * frameloop="demand", so a still page costs nothing.
 */
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { useCase } from "@/lib/case-state";

const TEX = "/fortress/";
type V3 = [number, number, number];

// ----------------------------------------------------------------- camera path (chapter coordinate c)
// c = i + progress through section i (bridge, gatehouse, witness, missing, seal, desk).
const KEYS: { c: number; p: V3; l: V3 }[] = [
  { c: 0, p: [-2.6, 2.4, 27], l: [3.2, 9.5, -22] }, // the near plateau before dawn: ruined arch left, the bridge turning right to the gatehouse, the keep's window above
  { c: 0.4, p: [-1.6, 2.0, 17], l: [3.6, 8, -22] },
  { c: 0.8, p: [0.8, 1.75, 2.5], l: [4.0, 4.6, -20] }, // mid-bridge: the arch has passed out of frame
  { c: 1.05, p: [3.3, 1.75, -8.5], l: [4.2, 3.4, -22] }, // the gate mouth
  { c: 1.3, p: [4.2, 1.75, -15], l: [4.2, 2.2, -24] }, // under the gate, in shadow
  { c: 1.7, p: [4.2, 1.6, -21.5], l: [6, 18, -30] }, // courtyard: the amber window is overhead now
  { c: 2.0, p: [2.6, 1.7, -24.9], l: [-6, 1.8, -25] }, // turning into the passage
  { c: 2.5, p: [-2.4, 1.7, -24.8], l: [-3.4, 1.7, -27.4] }, // at the slit: a second passage runs alongside
  { c: 3.0, p: [-6.2, 1.7, -24.8], l: [-9.6, 1.2, -26.4] }, // the guard desk
  { c: 5.0, p: [-6.4, 1.75, -24.6], l: [-9.6, 1.2, -26.4] },
];
const smooth = (t: number) => t * t * (3 - 2 * t);
const tmp = new THREE.Vector3();
function sample(c: number, p: THREE.Vector3, l: THREE.Vector3) {
  let i = 0;
  while (i < KEYS.length - 2 && c > KEYS[i + 1].c) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smooth(THREE.MathUtils.clamp((c - a.c) / (b.c - a.c), 0, 1));
  p.set(...a.p).lerp(tmp.set(...b.p), t);
  l.set(...a.l).lerp(tmp.set(...b.l), t);
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

// ----------------------------------------------------------------- themes: the same stone, different light
const LOOK = {
  dark: { sky: 0.42, env: 0.55, fog: "#1d2430", fogD: 0.0085, sun: "#ffb07a", sunI: 1.3, hemiS: "#6d7c9c", hemiG: "#1a1612", hemiI: 0.7, torch: 7, window: 9, glow: 4, stone: "#8f8a84", cliff: "#6f7178", cobble: "#8a857e", bloom: 0.85, mist: 0.16 },
  light: { sky: 0.75, env: 0.55, fog: "#b8c2cb", fogD: 0.0042, sun: "#fff0d8", sunI: 3.4, hemiS: "#dfe8f3", hemiG: "#6f6658", hemiI: 0.42, torch: 1.4, window: 3, glow: 1.6, stone: "#ffffff", cliff: "#c9c6c0", cobble: "#ffffff", bloom: 1.1, mist: 0.18 },
};
type Look = (typeof LOOK)["dark"];
const isDark = () => document.documentElement.classList.contains("dark");

// ----------------------------------------------------------------- materials (one texture density everywhere)
type Mats = ReturnType<typeof useMaterials>;
function useMaterials() {
  const names = ["castle_wall_slates", "cliff_side", "cobblestone_floor_08"];
  const maps = useLoader(THREE.TextureLoader, names.flatMap((n) => [`${TEX}${n}_diff_1k.jpg`, `${TEX}${n}_nor_gl_1k.jpg`, `${TEX}${n}_rough_1k.jpg`]));
  return useMemo(() => {
    maps.forEach((t, i) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (i % 3 === 0) t.colorSpace = THREE.SRGBColorSpace;
    });
    const pbr = (k: number, normal = 1) =>
      new THREE.MeshStandardMaterial({ map: maps[k * 3], normalMap: maps[k * 3 + 1], roughnessMap: maps[k * 3 + 2], normalScale: new THREE.Vector2(normal, normal), roughness: 1 });
    return {
      stone: pbr(0, 1.2),
      cliff: pbr(1, 1.6),
      cobble: pbr(2, 1.1),
      dark: new THREE.MeshStandardMaterial({ color: "#0c0d0f", roughness: 0.9 }),
      iron: new THREE.MeshStandardMaterial({ color: "#2a2724", metalness: 0.7, roughness: 0.55 }),
      slate: new THREE.MeshStandardMaterial({ color: "#2f3238", roughness: 0.7, metalness: 0.1 }),
      wood: new THREE.MeshStandardMaterial({ color: "#3a2a1c", roughness: 0.85 }),
      window: new THREE.MeshStandardMaterial({ color: "#2a1606", emissive: "#ffae4a", emissiveIntensity: 4 }),
      flame: new THREE.MeshStandardMaterial({ color: "#2a1606", emissive: "#ff9a3c", emissiveIntensity: 5 }),
      slit: new THREE.MeshStandardMaterial({ color: "#2a1606", emissive: "#9fb6d8", emissiveIntensity: 0.6 }),
    };
  }, [maps]);
}

/** Rescale a box's UVs so one texture tile covers `s` metres on every face. */
function boxGeo(w: number, h: number, d: number, s = 2.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / s, (uv.getY(i) * dims[f][1]) / s);
  }
  return g;
}
function Block({ size, pos, rot = [0, 0, 0], mat, s = 2.5 }: { size: V3; pos: V3; rot?: V3; mat: THREE.Material; s?: number }) {
  const geo = useMemo(() => boxGeo(size[0], size[1], size[2], s), [size, s]);
  return <mesh geometry={geo} material={mat} position={pos} rotation={rot} castShadow receiveShadow />;
}
/** A wall with a round-headed opening, extruded along its depth; extrude UVs are already in metres. */
function archedWall(w: number, h: number, d: number, ow: number, oh: number, s = 2.5) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0).lineTo(w / 2, 0).lineTo(w / 2, h).lineTo(-w / 2, h).lineTo(-w / 2, 0);
  const r = ow / 2;
  const hole = new THREE.Path();
  hole.moveTo(-r, 0).lineTo(-r, oh - r).absarc(0, oh - r, r, Math.PI, 0, true).lineTo(r, 0).lineTo(-r, 0);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 20 });
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / s, uv.getY(i) / s);
  return g;
}

// Deterministic value noise for the cliff faces.
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number) => noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.28 + noise(x * 4.3, y * 4.3) * 0.17;

/** A rough rock face: a plane displaced along its normal, more at the bottom of the ravine. */
function cliffGeo(w: number, h: number, depth: number, seed: number) {
  const g = new THREE.PlaneGeometry(w, h, 90, 60);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, (fbm(x * 0.09 + seed, y * 0.11) - 0.5) * depth + (fbm(x * 0.35 + seed, y * 0.4) - 0.5) * depth * 0.25);
    uv.setXY(i, (x + w / 2) / 8, (y + h / 2) / 8);
  }
  g.computeVertexNormals();
  return g;
}

// ----------------------------------------------------------------- the fortress
const BRIDGE = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.7, 0, 22), new THREE.Vector3(-1.2, 0, 12), new THREE.Vector3(0.6, 0, 3), new THREE.Vector3(2.9, 0, -5), new THREE.Vector3(4.2, 0, -11.5)]);
const GATE: V3 = [4.2, 0, -15];

function Bridge({ m }: { m: Mats }) {
  const parts = useMemo(() => {
    const n = 26;
    const out: { p: THREE.Vector3; yaw: number; len: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = BRIDGE.getPointAt(i / n), b = BRIDGE.getPointAt((i + 1) / n);
      out.push({ p: a.clone().lerp(b, 0.5), yaw: Math.atan2(b.x - a.x, b.z - a.z), len: a.distanceTo(b) * 1.06 });
    }
    return out;
  }, []);
  const piers = [5, 11, 17, 23];
  return (
    <group>
      {parts.map(({ p, yaw, len }, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, yaw, 0]}>
          <Block size={[3.4, 0.5, len]} pos={[0, -0.25, 0]} mat={m.cobble} s={3} />
          <Block size={[0.4, 0.95, len]} pos={[-1.9, 0.22, 0]} mat={m.stone} />
          <Block size={[0.4, 0.95, len]} pos={[1.9, 0.22, 0]} mat={m.stone} />
          <Block size={[4.2, 2.2, len]} pos={[0, -1.6, 0]} mat={m.stone} />
          {piers.includes(i) && <Block size={[4.6, 46, 3.2]} pos={[0, -25, 0]} mat={m.stone} s={3} />}
        </group>
      ))}
    </group>
  );
}

function NearArch({ m }: { m: Mats }) {
  // A weathered basalt ruin at the start of the bridge: one pier and the broken springing of its arch cut into the
  // near left edge of the first frame.
  const geo = useMemo(() => {
    const cx = 4.8, cy = 6;
    const s = new THREE.Shape();
    s.moveTo(0, -3).lineTo(1.6, -3).lineTo(1.6, cy);
    s.absarc(cx, cy, 3.2, Math.PI, Math.PI * 0.62, true);
    s.absarc(cx, cy, 4.5, Math.PI * 0.6, Math.PI, false);
    s.lineTo(0, cy).lineTo(0, -3);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1.8, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 24 });
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
    return g;
  }, []);
  return <mesh geometry={geo} material={m.stone} position={[-4.6, -0.4, 13.2]} rotation={[0, 0.25, 0]} castShadow receiveShadow />;
}

function Ravine({ m }: { m: Mats }) {
  const far = useMemo(() => cliffGeo(140, 60, 7, 3.1), []);
  const near = useMemo(() => cliffGeo(140, 60, 6, 9.4), []);
  const plateau = useMemo(() => boxGeo(160, 4, 60, 8), []);
  return (
    <group>
      <mesh geometry={far} material={m.cliff} position={[0, -30, -11]} receiveShadow />
      <mesh geometry={near} material={m.cliff} position={[0, -30, 17]} rotation={[0, Math.PI, 0]} receiveShadow />
      <mesh geometry={plateau} material={m.cliff} position={[0, -2, -41]} receiveShadow />
      <mesh geometry={plateau} material={m.cliff} position={[0, -2, 47]} receiveShadow />
    </group>
  );
}

function Merlons({ m, from, to, y, z, rot = 0 }: { m: Mats; from: number; to: number; y: number; z: number; rot?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = Math.max(1, Math.floor((to - from) / 1.6));
  const geo = useMemo(() => boxGeo(0.9, 1.1, 2.4), []);
  useEffect(() => {
    const o = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      o.position.set(from + 0.8 + i * 1.6, y + 0.55, 0);
      o.updateMatrix();
      ref.current?.setMatrixAt(i, o.matrix);
    }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [n, from, y]);
  return (
    <group position={[0, 0, z]} rotation={[0, rot, 0]}>
      <instancedMesh ref={ref} args={[geo, m.stone, n]} castShadow receiveShadow />
    </group>
  );
}

function Tower({ m, x, z, r, h, roof }: { m: Mats; x: number; z: number; r: number; h: number; roof?: boolean }) {
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(r * 0.94, r, h, 28, 1);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * r) / 2.5, (uv.getY(i) * h) / 2.5);
    return g;
  }, [r, h]);
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={geo} material={m.stone} position={[0, h / 2, 0]} castShadow receiveShadow />
      {roof ? (
        <mesh material={m.slate} position={[0, h + 3.2, 0]} castShadow>
          <coneGeometry args={[r * 1.25, 6.4, 24]} />
        </mesh>
      ) : (
        Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return <Block key={i} size={[0.8, 1.1, 0.7]} pos={[Math.sin(a) * r * 0.9, h + 0.55, Math.cos(a) * r * 0.9]} rot={[0, a, 0]} mat={m.stone} />;
        })
      )}
    </group>
  );
}

function Gatehouse({ m, look }: { m: Mats; look: React.RefObject<Look> }) {
  const gate = useMemo(() => archedWall(8.4, 9, 6, 3.6, 5.4), []);
  const torches = useRef<(THREE.PointLight | null)[]>([]);
  useFrame(() => torches.current.forEach((t) => t && (t.intensity = look.current.torch)));
  return (
    <group position={GATE}>
      <mesh geometry={gate} material={m.stone} position={[0, 0, -3]} castShadow receiveShadow />
      <Merlons m={m} from={-4.2} to={4.2} y={9} z={0} />
      {/* the raised portcullis */}
      {Array.from({ length: 7 }, (_, i) => <Block key={i} size={[0.09, 1.3, 0.09]} pos={[-1.5 + i * 0.5, 4.75, 3.1]} mat={m.iron} />)}
      {[4.3, 4.9].map((y) => <Block key={y} size={[3.4, 0.09, 0.09]} pos={[0, y, 3.1]} mat={m.iron} />)}
      <Tower m={m} x={-5.4} z={0.6} r={2.5} h={13} />
      <Tower m={m} x={5.4} z={0.6} r={2.5} h={13} />
      {[-2.5, 2.5].map((x, i) => (
        <group key={x} position={[x, 3.3, 3.25]}>
          <Block size={[0.12, 0.5, 0.12]} pos={[0, -0.3, 0]} mat={m.iron} />
          <mesh material={m.flame} position={[0, 0.05, 0]}>
            <sphereGeometry args={[0.11, 12, 8]} />
          </mesh>
          <pointLight ref={(l) => { torches.current[i] = l; }} color="#ff9a44" distance={12} decay={2} position={[0, 0.2, 0.4]} />
        </group>
      ))}
      {/* curtain walls running off into the mist */}
      <Block size={[30, 8, 2.6]} pos={[-22.5, 4, 0.6]} mat={m.stone} s={3} />
      <Block size={[30, 8, 2.6]} pos={[22.5, 4, 0.6]} mat={m.stone} s={3} />
      <Merlons m={m} from={-37.5} to={-7.5} y={8} z={0.6} />
      <Merlons m={m} from={7.5} to={37.5} y={8} z={0.6} />
    </group>
  );
}

function Keep({ m, look }: { m: Mats; look: React.RefObject<Look> }) {
  const win = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.55, 0).lineTo(0.55, 0).lineTo(0.55, 1.5).absarc(0, 1.5, 0.55, 0, Math.PI, false).lineTo(-0.55, 0);
    return new THREE.ShapeGeometry(s, 16);
  }, []);
  const lamp = useRef<THREE.PointLight>(null);
  useFrame(() => lamp.current && (lamp.current.intensity = look.current.window));
  return (
    <group position={[6.6, 0, -31]}>
      <Block size={[7.5, 24, 7.5]} pos={[0, 12, 0]} mat={m.stone} s={3} />
      <Merlons m={m} from={-3.75} to={3.75} y={24} z={3.4} />
      <Merlons m={m} from={-3.75} to={3.75} y={24} z={-3.4} />
      {/* the slender stair turret with its tall slate roof: the silhouette you can find again from inside */}
      <Tower m={m} x={4.1} z={3.6} r={1.5} h={29} roof />
      {/* the archive window, high on the face that looks over the gate */}
      <mesh geometry={win} material={m.window} position={[-1.2, 18.4, 3.77]} />
      <Block size={[1.6, 0.25, 0.5]} pos={[-1.2, 18.3, 3.95]} mat={m.stone} />
      <pointLight ref={lamp} color="#ffae4a" distance={26} decay={1.6} position={[-1.2, 19.3, 5.2]} />
    </group>
  );
}

function Courtyard({ m }: { m: Mats }) {
  const vault = useMemo(() => {
    const g = new THREE.CylinderGeometry(1.45, 1.45, 15, 20, 1, true, 0, Math.PI);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.8, uv.getY(i) * 6);
    return g;
  }, []);
  const { revealed } = useCase();
  return (
    <group>
      <Block size={[30, 0.4, 18]} pos={[2, -0.2, -27]} mat={m.cobble} s={3} />
      <Block size={[2.4, 9, 18]} pos={[-13.2, 4.5, -27]} mat={m.stone} s={3} />
      <Block size={[2.4, 9, 18]} pos={[17.2, 4.5, -27]} mat={m.stone} s={3} />
      {/* the passage: x from 1 to -14, between z -23.5 and -26.3, under a stone vault */}
      <Block size={[15, 3.2, 0.6]} pos={[-6.5, 1.6, -23.3]} mat={m.stone} />
      <Block size={[3.2, 3.2, 0.6]} pos={[0.6, 1.6, -26.5]} mat={m.stone} />
      <Block size={[10.6, 3.2, 0.6]} pos={[-8.75, 1.6, -26.5]} mat={m.stone} />
      {/* the slit, between the two wall pieces at x ≈ -3.4: a cooler light from the parallel passage shows through */}
      <Block size={[0.6, 1.2, 0.6]} pos={[-3.4, 0.6, -26.5]} mat={m.stone} />
      <Block size={[0.6, 0.6, 0.6]} pos={[-3.4, 2.9, -26.5]} mat={m.stone} />
      <mesh geometry={vault} material={m.stone} position={[-6.5, 3.2, -24.9]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow />
      <Block size={[15, 0.3, 3.2]} pos={[-6.5, 0.05, -24.9]} mat={m.cobble} s={3} />
      {/* the parallel passage beyond the slit */}
      <Block size={[15, 3.2, 0.6]} pos={[-6.5, 1.6, -29.4]} mat={m.stone} />
      <Block size={[15, 0.3, 2.6]} pos={[-6.5, 0.05, -28]} mat={m.cobble} s={3} />
      <pointLight color="#9fb6d8" intensity={6} distance={7} decay={2} position={[-3.4, 2.2, -28]} />
      {/* the guard desk at the end of the passage, its lantern */}
      <Block size={[1.8, 0.1, 0.9]} pos={[-9.6, 0.9, -25.6]} mat={m.wood} />
      {[[-10.4, -25.25], [-8.8, -25.25], [-10.4, -25.95], [-8.8, -25.95]].map(([x, z]) => <Block key={`${x}${z}`} size={[0.08, 0.9, 0.08]} pos={[x, 0.45, z]} mat={m.wood} />)}
      <mesh material={m.flame} position={[-9.1, 1.08, -25.5]}>
        <sphereGeometry args={[0.07, 12, 8]} />
      </mesh>
      <pointLight color="#ffa24a" intensity={revealed ? 9 : 3.5} distance={6} decay={2} position={[-9.1, 1.4, -25.2]} />
    </group>
  );
}

/** Soft mist banks in the ravine: a radial gradient on a few large planes, tinted with the fog colour. */
function Mist({ look }: { look: React.RefObject<Look> }) {
  const mat = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false });
  }, []);
  useFrame(() => {
    mat.color.set(look.current.fog);
    mat.opacity = look.current.mist;
  });
  const banks: V3[] = [[-18, -6, 4], [10, -9, 2], [30, -5, -2], [-35, -7, -4], [0, -14, 8], [18, -3, 8]];
  return (
    <group>
      {banks.map((p, i) => (
        <mesh key={i} material={mat} position={p} rotation={[-Math.PI / 2 + 0.25, 0, i]}>
          <planeGeometry args={[46, 26]} />
        </mesh>
      ))}
    </group>
  );
}

// ----------------------------------------------------------------- camera, light, theme, bloom
function Rig({ m, look }: { m: Mats; look: React.RefObject<Look> }) {
  const { camera, invalidate, scene, size, gl } = useThree();
  const hdr = useLoader(HDRLoader, `${TEX}kloofendal_misty_morning_puresky_1k.hdr`);
  const target = useRef({ p: new THREE.Vector3(), l: new THREE.Vector3(), c: 0, px: 0, py: 0 });
  const eye = useRef(new THREE.Vector3(...KEYS[0].l));
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const { revealed } = useCase();
  // Before dawn the misty sky is overcast grey; paint a deep blue sky with a faint warm band at the horizon instead.
  const predawn = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 256;
    const g = c.getContext("2d")!;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, "#070a12");
    grd.addColorStop(0.45, "#172033");
    grd.addColorStop(0.68, "#3a3d4c");
    grd.addColorStop(0.8, "#6e5a52");
    grd.addColorStop(1, "#1b1d24");
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  // Bloom for the amber window, torches and lanterns; the composer replaces R3F's own render (priority 1).
  const post = useMemo(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.65, 0.5, 0.85);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return { composer, bloom };
  }, [gl, scene, camera]);

  useEffect(() => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
    scene.fog = new THREE.FogExp2("#161b23", 0.017);
    const apply = () => {
      const k = isDark() ? LOOK.dark : LOOK.light;
      look.current = k;
      scene.background = isDark() ? predawn : hdr;
      scene.backgroundIntensity = isDark() ? 1 : k.sky;
      scene.environmentIntensity = k.env;
      (scene.fog as THREE.FogExp2).color.set(k.fog);
      (scene.fog as THREE.FogExp2).density = k.fogD;
      // The same photographed stone in both themes; night darkens it to basalt, morning lifts it.
      m.stone.color.set(k.stone);
      m.window.emissiveIntensity = k.glow;
      m.cliff.color.set(k.cliff);
      m.cobble.color.set(k.cobble);
      if (sun.current) {
        sun.current.color.set(k.sun);
        sun.current.intensity = k.sunI;
        sun.current.position.set(isDark() ? 40 : -45, isDark() ? 9 : 16, isDark() ? -60 : 12); // dawn behind the keep; a low raking morning sun
      }
      if (hemi.current) {
        hemi.current.color.set(k.hemiS);
        hemi.current.groundColor.set(k.hemiG);
        hemi.current.intensity = k.hemiI;
      }
      post.bloom.threshold = k.bloom;
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
      target.current.py = (e.clientY / window.innerHeight - 0.5) * 2;
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
  }, [m, scene, hdr, invalidate, look, post, predawn]);

  useEffect(() => invalidate(), [revealed, invalidate]);

  useEffect(() => {
    post.composer.setPixelRatio(gl.getPixelRatio());
    post.composer.setSize(size.width, size.height);
    invalidate();
  }, [post, gl, size, invalidate]);

  useFrame((_, dt) => {
    const t = target.current;
    sample(t.c, t.p, t.l);
    // A small look-around under the pointer, strongest on the bridge where there is the most to see.
    const sway = t.c < 1 ? 1 : 0.35;
    t.l.x += t.px * 1.6 * sway;
    t.l.y -= t.py * 0.8 * sway;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 4.5);
    camera.position.lerp(t.p, k);
    eye.current.lerp(t.l, k);
    camera.lookAt(eye.current);
    const pcam = camera as THREE.PerspectiveCamera;
    const fov = size.width < 1100 ? 58 : 50;
    if (pcam.fov !== fov) {
      pcam.fov = fov;
      pcam.updateProjectionMatrix();
    }
    post.composer.render();
    if (camera.position.distanceTo(t.p) > 0.004 || eye.current.distanceTo(t.l) > 0.004) invalidate();
  }, 1);

  return (
    <>
      <hemisphereLight ref={hemi} args={["#5d6b86", "#15120f", 0.32]} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={160}
      />
    </>
  );
}

function Fortress() {
  const m = useMaterials();
  const look = useRef<Look>(LOOK.dark);
  return (
    <>
      <Rig m={m} look={look} />
      <Ravine m={m} />
      <Mist look={look} />
      <NearArch m={m} />
      <Bridge m={m} />
      <Gatehouse m={m} look={look} />
      <Keep m={m} look={look} />
      <Courtyard m={m} />
    </>
  );
}

export default function FortressScene() {
  return (
    <Canvas
      frameloop="demand"
      shadows="soft"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance", toneMappingExposure: 1 }}
      camera={{ fov: 50, near: 0.1, far: 400, position: KEYS[0].p }}
      aria-hidden
    >
      <Suspense fallback={null}>
        <Fortress />
      </Suspense>
    </Canvas>
  );
}
