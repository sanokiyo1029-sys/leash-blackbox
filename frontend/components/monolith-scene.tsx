"use client";
/* eslint-disable react-hooks/immutability -- three.js objects (scene, loaded textures, materials) are mutated by design in R3F */

/**
 * Homepage hero object: a polished obsidian server rack wrapped in a liquid-chrome ribbon (original art, all
 * procedural). One blade slot is empty: the session the witness saw and the host never logged.
 * Drag turns the rack (with inertia); the ribbon flows and leans toward the pointer; the empty slot opens the case.
 * Reduced motion: no flow or idle sway, rendered on demand; dragging still works.
 */
import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

const W = 1.15, H = 2.7, D = 0.9; // rack body, metres
const BLADES = 12, MISSING = 4; // blade 4 (from the top) is the missing session
const SEG = 220; // ribbon segments

function roundedBox(w: number, h: number, d: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const bevel = 0.035;
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 10 });
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  return g;
}

const bladeY = (i: number) => H / 2 - 0.32 - i * 0.18;

function Rack({ reduce, begun, onSlot }: { reduce: boolean; begun: boolean; onSlot: (hover: boolean, open?: boolean) => void }) {
  const { gl, invalidate, size } = useThree();
  const group = useRef<THREE.Group>(null);
  const ribbon = useRef<THREE.Mesh>(null);
  const slot = useRef<THREE.MeshStandardMaterial>(null);
  const slotLight = useRef<THREE.PointLight>(null);
  const drag = useRef({ on: false, x: 0, vel: 0, rot: 0.5 });

  const mats = useMemo(
    () => ({
      body: new THREE.MeshPhysicalMaterial({ color: "#0a0b0e", metalness: 0.55, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 }),
      blade: new THREE.MeshStandardMaterial({ color: "#1a1d22", metalness: 0.8, roughness: 0.32 }),
      led: new THREE.MeshStandardMaterial({ color: "#062", emissive: "#35f0a0", emissiveIntensity: 2.2 }),
      ribbon: new THREE.MeshPhysicalMaterial({ color: "#e9e9ee", metalness: 1, roughness: 0.1, iridescence: 1, iridescenceIOR: 1.55, iridescenceThicknessRange: [140, 560], clearcoat: 1, side: THREE.DoubleSide, envMapIntensity: 1.7 }),
    }),
    [],
  );
  const body = useMemo(() => roundedBox(W, H, D, 0.09), []);
  const ribbonGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < SEG; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    g.setIndex(idx);
    return g;
  }, []);

  // Drag to turn: listeners on the canvas element; horizontal drags turn, vertical swipes still scroll (touch-action: pan-y).
  useEffect(() => {
    const el = gl.domElement;
    const d = drag.current;
    const down = (e: PointerEvent) => {
      d.on = true;
      d.x = e.clientX;
      d.vel = 0;
    };
    const move = (e: PointerEvent) => {
      if (!d.on) return;
      const dx = e.clientX - d.x;
      d.x = e.clientX;
      d.rot += dx * 0.008;
      d.vel = dx * 0.008;
      invalidate();
    };
    const up = () => (d.on = false);
    el.addEventListener("pointerdown", down);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
    };
  }, [gl, invalidate]);

  // Reduced motion renders on demand only: draw after mounting and whenever the layout or the case changes.
  useEffect(() => invalidate(), [invalidate, begun, size.width, size.height]);

  const p = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), t: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), n: new THREE.Vector3() }), []);
  useFrame((state, dt) => {
    const time = reduce ? 1.2 : state.clock.elapsedTime;
    const d = drag.current;
    const g = group.current;
    if (!g) return;
    // Turn: inertia after a drag, an idle sway otherwise; opening the case brings the empty slot to the front.
    if (!d.on) {
      d.rot += d.vel;
      d.vel *= 0.93;
      if (Math.abs(d.vel) < 0.0005) {
        const target = begun ? Math.round(d.rot / (2 * Math.PI)) * 2 * Math.PI : reduce ? d.rot : 0.45 * Math.sin(time * 0.22) + Math.round(d.rot / (2 * Math.PI)) * 2 * Math.PI;
        d.rot += (target - d.rot) * (reduce ? 1 : Math.min(1, dt * (begun ? 3 : 0.6)));
      }
    }
    g.rotation.y = d.rot;
    g.rotation.x += (-state.pointer.y * 0.08 - g.rotation.x) * Math.min(1, dt * 4);
    const wide = size.width >= 1024;
    // Phones: the canvas is its own zone under the headline, so the rack just centres in it.
    g.position.set(wide ? 1.35 : 0, 0, 0);
    g.scale.setScalar(wide ? 1 : 0.95);

    // Ribbon: a twisting strip spiralling round the rack, flowing in time and leaning toward the pointer.
    const pos = ribbonGeo.getAttribute("position") as THREE.BufferAttribute;
    const lean = state.pointer.x * 0.25;
    const at = (u: number, out: THREE.Vector3) => {
      const ang = u * Math.PI * 2.6 + time * 0.35;
      const rad = 1.05 + 0.18 * Math.sin(u * Math.PI * 3 + time * 0.9) + lean * Math.sin(ang);
      return out.set(Math.cos(ang) * rad, -1.75 + u * 3.5 + 0.08 * Math.sin(u * 11 + time * 1.3), Math.sin(ang) * rad);
    };
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      at(u, p.a);
      at(Math.min(1, u + 1 / SEG), p.b);
      p.t.subVectors(p.b, p.a).normalize();
      p.r.set(p.a.x, 0, p.a.z).normalize();
      p.n.crossVectors(p.t, p.r).normalize();
      const tw = u * Math.PI * 2 + time * 0.5;
      const width = 0.16 + 0.12 * Math.sin(u * Math.PI);
      p.w.copy(p.n).multiplyScalar(Math.cos(tw)).addScaledVector(p.r, Math.sin(tw)).multiplyScalar(width);
      pos.setXYZ(2 * i, p.a.x + p.w.x, p.a.y + p.w.y, p.a.z + p.w.z);
      pos.setXYZ(2 * i + 1, p.a.x - p.w.x, p.a.y - p.w.y, p.a.z - p.w.z);
    }
    pos.needsUpdate = true;
    ribbonGeo.computeVertexNormals();

    // The empty slot breathes amber; brighter once the case is open.
    const pulse = reduce ? 0.6 : 0.5 + 0.5 * Math.sin(time * (begun ? 4 : 2));
    if (slot.current) slot.current.emissiveIntensity = (begun ? 1.6 : 0.7) + pulse * (begun ? 2.2 : 1);
    if (slotLight.current) slotLight.current.intensity = (begun ? 1.2 : 0.4) + pulse * 0.8;
  });

  const slotEvents = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = "pointer";
      onSlot(true);
    },
    onPointerOut: () => {
      document.body.style.cursor = "";
      onSlot(false);
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 6) return; // that was a drag, not a click
      onSlot(true, true);
    },
  };

  return (
    <group ref={group}>
      <mesh geometry={body} material={mats.body} />
      {Array.from({ length: BLADES }, (_, i) =>
        i === MISSING ? (
          <group key={i} position={[0, bladeY(i), D / 2 - 0.01]}>
            <mesh {...slotEvents}>
              <boxGeometry args={[W - 0.2, 0.15, 0.02]} />
              <meshStandardMaterial ref={slot} color="#050505" emissive="#ff8a2a" emissiveIntensity={1} roughness={0.6} />
            </mesh>
            <pointLight ref={slotLight} color="#ff9a3c" intensity={0.6} distance={1.6} decay={2} position={[0, 0, 0.25]} />
          </group>
        ) : (
          <group key={i} position={[0, bladeY(i), D / 2 + 0.012]}>
            <mesh material={mats.blade}>
              <boxGeometry args={[W - 0.2, 0.14, 0.035]} />
            </mesh>
            <mesh material={mats.led} position={[(W - 0.2) / 2 - 0.07, 0, 0.02]}>
              <boxGeometry args={[0.035, 0.035, 0.01]} />
            </mesh>
            <mesh material={mats.led} position={[(W - 0.2) / 2 - 0.13, 0, 0.02]} visible={i % 3 !== 1}>
              <boxGeometry args={[0.035, 0.035, 0.01]} />
            </mesh>
          </group>
        ),
      )}
      <mesh ref={ribbon} geometry={ribbonGeo} material={mats.ribbon} />
    </group>
  );
}

function Lights() {
  const { scene } = useThree();
  const hdr = useLoader(HDRLoader, "/tour/empty_warehouse_01_1k.hdr");
  useEffect(() => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
    scene.environmentIntensity = 0.85;
  }, [hdr, scene]);
  return (
    <>
      <directionalLight position={[3, 4, 5]} intensity={2.2} color="#fff4e6" />
      <directionalLight position={[-4, 2, -3]} intensity={3} color="#8fb4ff" />
    </>
  );
}

export default function MonolithScene({ active, reduce, begun, onSlot }: { active: boolean; reduce: boolean; begun: boolean; onSlot: (hover: boolean, open?: boolean) => void }) {
  return (
    <Canvas
      frameloop={reduce ? "demand" : active ? "always" : "never"}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 35, position: [0, 0.2, 7.4] }}
      style={{ touchAction: "pan-y" }}
      aria-hidden
    >
      <Suspense fallback={null}>
        <Lights />
        <Rack reduce={reduce} begun={begun} onSlot={onSlot} />
      </Suspense>
    </Canvas>
  );
}
