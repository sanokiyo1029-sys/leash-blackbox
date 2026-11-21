"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutated per frame by design in R3F */

/*
 * The seal room's close-up: an oxidised bronze seal resting in dark wax, lit like a watch on a black table.
 * The seal's face carries the fortress's own silhouette (gatehouse, keep and stair turret), raised in bronze and
 * sunk into the wax. When the visitor verifies, the seal lifts and the impression shows. Scratches and patina come
 * from a CC0 metal scan (public/fortress/SOURCES.md); the emblem is drawn on a canvas.
 */
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

const TEX = "/fortress/";
const isDark = () => document.documentElement.classList.contains("dark");

/** The emblem as a height map: white is raised. The same silhouette as the 3D fortress. */
function emblemCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "#fff";
  g.lineWidth = 14;
  g.beginPath();
  g.arc(256, 256, 226, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  g.arc(256, 256, 200, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#fff";
  // gatehouse: two towers and the gate block with its arch cut out
  g.fillRect(140, 250, 52, 130);
  g.fillRect(320, 250, 52, 130);
  g.fillRect(180, 270, 152, 110);
  for (let x = 140; x < 372; x += 20) g.fillRect(x, 238, 12, 14);
  // keep and the tall stair turret with its cone roof
  g.fillRect(232, 140, 64, 132);
  g.fillRect(300, 110, 26, 162);
  g.beginPath();
  g.moveTo(293, 112);
  g.lineTo(313, 66);
  g.lineTo(333, 112);
  g.fill();
  g.fillStyle = "#000";
  g.beginPath();
  g.moveTo(232, 380);
  g.lineTo(232, 330);
  g.arc(256, 330, 24, Math.PI, 0);
  g.lineTo(280, 380);
  g.fill();
  g.fillRect(256, 172, 12, 22); // the archive window
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

function Seal({ lifted }: { lifted: boolean }) {
  const { scene, invalidate } = useThree();
  const [nor, rough] = useLoader(THREE.TextureLoader, [`${TEX}rusty_metal_03_nor_gl_1k.jpg`, `${TEX}rusty_metal_03_rough_1k.jpg`]);
  const hdr = useLoader(HDRLoader, `${TEX}kloofendal_misty_morning_puresky_1k.hdr`);
  const emblem = useMemo(() => emblemCanvas(), []);
  const seal = useRef<THREE.Group>(null);
  const t = useRef(0);

  const mats = useMemo(() => {
    nor.wrapS = nor.wrapT = rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
    return {
      bronze: new THREE.MeshStandardMaterial({ color: "#5c4427", metalness: 1, roughness: 0.62, roughnessMap: rough, normalMap: nor, normalScale: new THREE.Vector2(1.5, 1.5) }),
      face: new THREE.MeshStandardMaterial({ color: "#6b5030", metalness: 1, roughness: 0.5, bumpMap: emblem, bumpScale: 6, roughnessMap: rough }),
      wax: new THREE.MeshPhysicalMaterial({ color: "#33090b", roughness: 0.34, clearcoat: 0.85, clearcoatRoughness: 0.25, bumpMap: emblem, bumpScale: -6 }),
      paper: new THREE.MeshStandardMaterial({ color: "#151413", roughness: 0.95 }),
    };
  }, [nor, rough, emblem]);

  const waxGeo = useMemo(() => {
    // A pool of wax: a flat disc whose rim wanders.
    const s = new THREE.Shape();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const r = 1.32 + Math.sin(a * 5) * 0.05 + Math.sin(a * 11 + 1) * 0.03;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 4, curveSegments: 64 });
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.2 + 0.5, uv.getY(i) / 2.2 + 0.5);
    return g;
  }, []);
  const handle = useMemo(
    () =>
      new THREE.LatheGeometry(
        [[0.98, 0], [1.0, 0.08], [0.86, 0.3], [0.5, 0.5], [0.42, 1.2], [0.5, 1.5], [0.62, 1.75], [0.5, 2.0], [0.0, 2.05]].map(([x, y]) => new THREE.Vector2(x, y)),
        48,
      ),
    [],
  );

  useEffect(() => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
    const apply = () => {
      scene.background = new THREE.Color(isDark() ? "#0b0b0c" : "#e6e2da");
      scene.environmentIntensity = isDark() ? 0.45 : 0.9;
      mats.paper.color.set(isDark() ? "#141312" : "#d9d3c7");
      invalidate();
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [scene, hdr, mats, invalidate]);

  useEffect(() => invalidate(), [lifted, invalidate]);
  useFrame((_, dt) => {
    const goal = lifted ? 1 : 0;
    t.current += (goal - t.current) * (1 - Math.exp(-dt * 3));
    if (seal.current) {
      seal.current.position.y = 0.12 + t.current * 1.6;
      seal.current.rotation.z = t.current * 0.35;
    }
    if (Math.abs(goal - t.current) > 0.002) invalidate();
  });

  return (
    <>
      <mesh material={mats.paper} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
      </mesh>
      <mesh geometry={waxGeo} material={mats.wax} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow />
      <group ref={seal}>
        {/* the face (emblem) points down into the wax; once the seal lifts the impression it left shows */}
        <mesh material={mats.face} position={[0, 0.005, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.97, 64]} />
        </mesh>
        <mesh geometry={handle} material={mats.bronze} castShadow />
      </group>
      {/* watch-photography light: one soft key from the upper left, a hard warm rim from behind that draws the edges */}
      <spotLight position={[-3.2, 5, 2.4]} angle={0.42} penumbra={0.85} intensity={45} color="#fff1dc" castShadow shadow-mapSize={[1024, 1024]} />
      <spotLight position={[2.2, 3.4, -3.6]} angle={0.35} penumbra={0.4} intensity={70} color="#ffc48a" />
      <directionalLight position={[0, 6, 4]} intensity={0.25} color="#cfd8e6" />
    </>
  );
}

export default function SealScene({ lifted }: { lifted: boolean }) {
  return (
    <Canvas frameloop="demand" shadows="soft" dpr={[1, 1.5]} camera={{ fov: 24, near: 0.1, far: 60, position: [0, 3.1, 4.6] }} onCreated={({ camera }) => camera.lookAt(0, 0.75, 0)} aria-hidden>
      <Suspense fallback={null}>
        <Seal lifted={lifted} />
      </Suspense>
    </Canvas>
  );
}
