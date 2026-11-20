"use client";

/**
 * /story: one continuous world (scrollcraft "continuous world" grammar, bespoke fixed stage).
 *
 * A single fixed stage holds the whole world (host log, wire, vault, Merkle tree, chain, verifier, console plate) at
 * fixed world positions; scroll drives one camera over it. Nothing in document flow but an invisible track.
 * The cover-up is performed by the visitor's own scroll (the signature move); the verdict brings the lines home.
 * Every hash shown is computed here with lib/verify.ts. The records themselves are labelled sample data.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { useApi } from "@/lib/api";
import type { Status } from "@/lib/types";
import { leafHash, rootFromProof, type ProofStep } from "@/lib/verify";
import {
  ALTER_AT, ALTERED_FROM, ALTERED_RECORD, ALTERED_SEQ, BLOCK_NO, CHAPTERS, COMMANDS, COPY, ERASE_AT, ERASED, FLIGHT,
  LAYOUTS, RECORDS, RESTORE_AT, T, TRACK, WRITE_AT, type Layout, type Shot,
} from "./story-data";

// ------------------------------------------------------------------ hashing (real)
interface Hashes {
  leaves: string[];
  levels: string[][];
  root: string;
  hostRoot: string;
  proofs: Record<number, { steps: number; ok: boolean }>;
}

const node = (l: string, r: string) => rootFromProof(l, [{ side: "R", hash: r }]); // sha256(0x01 || L || R)

async function levelsOf(leaves: string[]): Promise<string[][]> {
  const levels = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const next: string[] = [];
    for (let i = 0; i + 1 < cur.length; i += 2) next.push(await node(cur[i], cur[i + 1]));
    if (cur.length % 2) next.push(cur[cur.length - 1]); // unpaired node promoted, as backend/app/merkle.py
    levels.push(next);
  }
  return levels;
}

function proofOf(levels: string[][], index: number): ProofStep[] {
  const out: ProofStep[] = [];
  let idx = index;
  for (let k = 0; k < levels.length - 1; k++) {
    const lvl = levels[k];
    if (idx % 2 === 1) out.push({ side: "L", hash: lvl[idx - 1] });
    else if (idx + 1 < lvl.length) out.push({ side: "R", hash: lvl[idx + 1] });
    idx = Math.floor(idx / 2);
  }
  return out;
}

async function computeHashes(): Promise<Hashes> {
  const leaves = await Promise.all(RECORDS.map((r) => leafHash(r.record)));
  const levels = await levelsOf(leaves);
  const root = levels[levels.length - 1][0];
  const hostRecords = RECORDS.filter((r) => !(r.seq in ERASE_AT)).map((r) => (r.seq === ALTERED_SEQ ? ALTERED_RECORD : r.record));
  const hostLevels = await levelsOf(await Promise.all(hostRecords.map(leafHash)));
  const proofs: Hashes["proofs"] = {};
  for (const seq of Object.keys(RESTORE_AT).map(Number)) {
    const p = proofOf(levels, seq - 1);
    proofs[seq] = { steps: p.length, ok: (await rootFromProof(leaves[seq - 1], p)) === root };
  }
  return { leaves, levels, root, hostRoot: hostLevels[hostLevels.length - 1][0], proofs };
}

// ------------------------------------------------------------------ small math
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const smooth = (v: number) => v * v * (3 - 2 * v);
const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const hex = (h: string | undefined, n: number) => (h ? h.slice(0, n) : "·".repeat(n));

type P = { x: number; y: number };
function bez(p0: P, p1: P, p2: P, p3: P, u: number): P {
  const a = 1 - u;
  return {
    x: a * a * a * p0.x + 3 * a * a * u * p1.x + 3 * a * u * u * p2.x + u * u * u * p3.x,
    y: a * a * a * p0.y + 3 * a * a * u * p1.y + 3 * a * u * u * p2.y + u * u * u * p3.y,
  };
}

function cameraAt(shots: Shot[], t: number, stepped: boolean): Required<Shot> {
  let i = 0;
  while (i < shots.length - 2 && t >= shots[i + 1].t) i++;
  const a = shots[i];
  const b = shots[i + 1];
  const u = stepped ? (t >= b.t ? 1 : 0) : smooth(ramp(t, a.t, b.t));
  return {
    t,
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), u)),
    ax: lerp(a.ax, b.ax, u),
    ay: lerp(a.ay, b.ay, u),
    r: lerp(a.r ?? 0, b.r ?? 0, u),
  };
}

// ------------------------------------------------------------------ environment stores
const subscribeResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const getMode = () => (window.innerWidth / Math.max(1, window.innerHeight) < 0.9 ? "tall" : "wide");
const RM = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const m = window.matchMedia(RM);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const getReduced = () => window.matchMedia(RM).matches;

// ------------------------------------------------------------------ derived geometry
function geometry(L: Layout) {
  const { host, vault, tree, chain } = L;
  const hostFull = host.head + 16 * host.row + 14;
  const vaultFull = vault.head + 16 * vault.row + 12;
  const tall = L.ref[0] < 600;
  const p0 = tall ? { x: host.x + host.w / 2, y: host.top + host.head + 4 * host.row } : { x: host.x + host.w / 2, y: host.top + host.head + 4 * host.row };
  const p3 = tall ? { x: vault.x + vault.w / 2, y: vault.top + vault.head + 3 * vault.row } : { x: vault.x - vault.w / 2, y: vault.top + vault.head + 6 * vault.row };
  const p1 = tall ? { x: p0.x + 96, y: p0.y + 230 } : { x: p0.x + 300, y: p0.y };
  const p2 = tall ? { x: p3.x + 96, y: p3.y - 230 } : { x: p3.x - 300, y: p3.y };
  const wire = [p0, p1, p2, p3] as const;
  // Merkle tree node positions, level 0 = 16 leaves.
  const nodes: P[][] = [];
  let n = 16;
  for (let k = 0; n >= 1; k++) {
    const row: P[] = [];
    for (let i = 0; i < n; i++) {
      if (k === 0) row.push({ x: vault.x - tree.spread / 2 + (tree.spread * (i + 0.5)) / 16, y: tree.leafY });
      else row.push({ x: (nodes[k - 1][2 * i].x + nodes[k - 1][2 * i + 1].x) / 2, y: tree.leafY + tree.step * k });
    }
    nodes.push(row);
    if (n === 1) break;
    n = n / 2;
  }
  const rootP = nodes[nodes.length - 1][0];
  const stemY = tree.step < 0 ? vault.top : vault.top + vaultFull;
  const blocks = [-3, -2, -1, 0, 1].map((k) => ({ no: BLOCK_NO + k, x: chain.x + k * (chain.bw + chain.gap), k }));
  const blockIn = { x: chain.x, y: tree.step < 0 ? chain.y + chain.bh / 2 : chain.y - chain.bh / 2 };
  // where the host's recomputed-root label sits during the verdict (11 rows left after the cover-up)
  const hostRootP = { x: host.x, y: host.top + host.head + (16 - Object.keys(ERASE_AT).length) * host.row + 14 + 16 + 46 };
  return { hostFull, vaultFull, wire, nodes, rootP, stemY, blocks, blockIn, hostRootP, tall };
}

// ------------------------------------------------------------------ the page
export function StoryWorld() {
  const rootRef = useRef<HTMLDivElement>(null);
  const mode = useSyncExternalStore(subscribeResize, getMode, () => "wide" as const);
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, () => false);
  const L = LAYOUTS[mode];
  const G = useMemo(() => geometry(L), [L]);
  const [hx, setHx] = useState<Hashes | null>(null);
  const status = useApi<Status>("/api/status", 15000);

  useEffect(() => {
    let live = true;
    computeHashes().then((h) => live && setHx(h));
    return () => {
      live = false;
    };
  }, []);

  // ---------------------------------------------------------------- the render loop
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const q = <E extends Element = HTMLElement>(s: string) => Array.from(root.querySelectorAll<E>(s) as NodeListOf<E>);
    const one = <E extends Element = HTMLElement>(s: string) => root.querySelector<E>(s)!;
    const track = one("[data-track]");
    const stage = one("[data-stage]");
    const world = one("[data-world]");
    const grid = one("[data-grid]");
    const clock = one("[data-clock]");
    const canvas = one<HTMLCanvasElement>("[data-motes]");
    const red = one("[data-red]");
    const vignette = one("[data-vignette]");
    const rows = q("[data-row]");
    const sels = q("[data-sel]");
    const fwds = q("[data-fwd]");
    const vrows = q("[data-vrow]");
    const vtags = q("[data-vtag]");
    const dots = q("[data-dot]");
    const paper = one("[data-paper]");
    const term = one("[data-term]");
    const termLines = q("[data-cmd]");
    const stamp = one("[data-stamp]");
    const hostStatus = one("[data-host-status]");
    const hostBad = one("[data-host-bad]");
    const hostRootEl = one("[data-host-root]");
    const scan = one("[data-scan]");
    const alteredFrom = one("[data-altered-from]");
    const restoredTags = q("[data-rtag]");
    const vault = one("[data-vault]");
    const wireLit = one<SVGPathElement>("[data-wire-lit]");
    const wireBase = one<SVGPathElement>("[data-wire]");
    const follow = one("[data-follow]");
    const edges = q<SVGPathElement>("[data-edge]");
    const nodeLabels = q<SVGGElement>("[data-nlabel]");
    const rootBox = one("[data-rootbox]");
    const rootChip = one("[data-rootchip]");
    const blockLock = one("[data-lock]");
    const blockIntact = one("[data-intact]");
    const chainEl = one("[data-chain]");
    const vLinks = q<SVGPathElement>("[data-vlink]");
    const verifierEl = one("[data-verifier]");
    const compareEl = one("[data-compare]");
    const plate = one("[data-plate]");
    const systemEls = q("[data-system]");
    const copies = q("[data-sc-copy]");
    const scrims = { lead: one("[data-scrim=lead]"), trail: one("[data-scrim=trail]"), band: one("[data-scrim=band]") };
    const railBtns = q("[data-rail]");
    const railNow = one("[data-rail-now]");

    const cache = new WeakMap<Element, Record<string, string>>();
    const set = (el: Element, prop: string, val: string) => {
      let c = cache.get(el);
      if (!c) cache.set(el, (c = {}));
      if (c[prop] === val) return;
      c[prop] = val;
      if (prop === "text") el.textContent = val;
      else if (prop.startsWith("attr:")) el.setAttribute(prop.slice(5), val);
      else (el as HTMLElement).style.setProperty(prop, val);
    };

    let W = innerWidth;
    let H = innerHeight;
    let unit = track.offsetHeight / (TRACK + 1);
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    const ctx = canvas.getContext("2d");
    const sizeCanvas = () => {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    };
    sizeCanvas();

    // Motes at many depths: the world's atmosphere and its strongest depth cue.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const motes = Array.from({ length: G.tall ? 70 : 120 }, () => ({ u: rnd(), v: rnd(), d: 0.35 + rnd() * 1.9, vx: (rnd() - 0.5) * 0.004, vy: -0.002 - rnd() * 0.004 }));

    let cur = scrollY / unit;
    let last = performance.now();
    let prevT = cur;
    let vel = 0;
    let raf = 0;
    let chapter = -1;

    const render = (t: number, now: number, dt: number) => {
      const base = Math.max(0.55, Math.min(1.6, Math.min(W / L.ref[0], H / L.ref[1])));
      // Camera, with the ch4 follow of the intruder's forwarded login line.
      const cam = cameraAt(L.shots, t, reduced);
      const fu = easeOut(ramp(t, T.follow[0], T.follow[1]));
      const fp = bez(...G.wire, fu);
      const fw = reduced ? 0 : Math.min(ramp(t, 5.0, 5.22), 1 - ramp(t, 5.8, 6.0));
      const cx = lerp(cam.x, fp.x, fw);
      const cy = lerp(cam.y, fp.y, fw);
      const ax = lerp(cam.ax, G.tall ? 0.5 : 0.36, fw);
      const ay = lerp(cam.ay, G.tall ? 0.34 : 0.5, fw);
      const S = cam.z * base;
      // velocity-driven instability during intrusion and cover-up
      const unrest = reduced ? 0 : Math.min(ramp(t, 1.5, 2.2), 1 - ramp(t, 4.4, 4.7));
      const jx = unrest * Math.min(2.6, Math.abs(vel) * 2.2) * Math.sin(now / 19);
      set(world, "transform", `translate(${(ax * W + jx).toFixed(2)}px, ${(ay * H).toFixed(2)}px) rotate(${cam.r.toFixed(3)}deg) scale(${S.toFixed(4)}) translate(${(-cx).toFixed(2)}px, ${(-cy).toFixed(2)}px)`);
      // Reduced motion: hard cuts become a short fade through the dark ground.
      if (reduced) {
        let dip = 1;
        for (let k = 1; k < L.shots.length - 1; k++) dip = Math.min(dip, 0.2 + 0.8 * clamp01(Math.abs(t - L.shots[k].t) / 0.06));
        set(stage, "opacity", dip.toFixed(3));
      }
      // Camera centre in world space, for parallax layers.
      const ccx = cx + ((0.5 - ax) * W) / S;
      const ccy = cy + ((0.5 - ay) * H) / S;
      const cell = 92;
      set(grid, "transform", `translate(${(mod(-ccx * S * 0.42, cell) - cell).toFixed(1)}px, ${(mod(-ccy * S * 0.42, cell) - cell).toFixed(1)}px)`);
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const TW = W + 240;
        const TH = H + 240;
        for (const m of motes) {
          if (!reduced) {
            m.u = mod(m.u + m.vx * dt, 1);
            m.v = mod(m.v + m.vy * dt, 1);
          }
          const f = 1 / m.d;
          const x = mod(m.u * TW - ccx * S * f, TW) - 120;
          const y = mod(m.v * TH - ccy * S * f, TH) - 120;
          const near = m.d < 0.6;
          const r = near ? 2.2 + (0.6 - m.d) * 9 : 0.6 + 1.1 * f;
          ctx.globalAlpha = near ? 0.07 : 0.12 + 0.28 * Math.min(1, f);
          ctx.fillStyle = "#efe7da";
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 6.2832);
          ctx.fill();
        }
      }
      // the night's clock: the latest written line's time, far behind the stage
      let latest = RECORDS[0].view.time;
      for (const r of RECORDS) if (WRITE_AT[r.seq] <= t) latest = r.view.time;
      set(clock, "text", latest.slice(0, 5));
      set(clock, "opacity", (0.05 * (1 - ramp(t, 4.4, 5.0))).toFixed(4));
      set(clock, "transform", `translate3d(${(-ccx * S * 0.28).toFixed(1)}px, ${(-ccy * S * 0.2).toFixed(1)}px, 0)`);
      set(vignette, "opacity", (0.9 * Math.min(ramp(t, 1.6, 2.7), 1 - ramp(t, 4.2, 5.1))).toFixed(3));

      // ---------------- host log
      const hr = L.host.row;
      let acc = 0;
      let visible = 0;
      for (let i = 0; i < 16; i++) {
        const seq = i + 1;
        const wAt = WRITE_AT[seq];
        const written = wAt <= 0 ? 1 : ramp(t, wAt, wAt + 0.06);
        const e = ERASE_AT[seq];
        const sweep = e ? ramp(t, e, e + 0.045) : 0;
        const gone = e ? ramp(t, e + 0.045, e + 0.1) : 0;
        const back = e ? ramp(t, RESTORE_AT[seq], RESTORE_AT[seq] + 0.07) : 0;
        const coll = gone * (1 - back);
        const vis = written * (1 - coll);
        const row = rows[i];
        set(row, "transform", `translate3d(0, ${(L.host.head + acc * hr).toFixed(2)}px, 0)`);
        set(row, "opacity", (written * (1 - gone) + gone * back).toFixed(3));
        set(row, "clip-path", written < 1 ? `inset(0 ${((1 - easeOut(written)) * 100).toFixed(1)}% 0 0)` : "none");
        set(sels[i], "transform", `scaleX(${(sweep * (1 - gone)).toFixed(3)})`);
        set(fwds[i], "opacity", ramp(t, wAt + 0.05, wAt + 0.1).toFixed(2));
        if (e) set(row, "attr:data-state", back > 0 ? "restored" : sweep > 0 ? "erasing" : "live");
        acc += vis;
        if (vis > 0.5) visible++;
      }
      const alt = ramp(t, ALTER_AT[0], ALTER_AT[1]);
      const backAlt = ramp(t, RESTORE_AT[ALTERED_SEQ], RESTORE_AT[ALTERED_SEQ] + 0.07);
      const orig = RECORDS[ALTERED_SEQ - 1].view.from;
      let fromTxt = orig;
      if (backAlt > 0) fromTxt = orig;
      else if (alt >= 1) fromTxt = ALTERED_FROM;
      else if (alt > 0) {
        const glyphs = "0123456789.";
        const k = Math.floor(alt * ALTERED_FROM.length);
        fromTxt = ALTERED_FROM.slice(0, k) + Array.from({ length: Math.max(0, orig.length - k) }, (_, j) => glyphs[(Math.floor(t * 300) + j * 7) % glyphs.length]).join("").slice(0, ALTERED_FROM.length - k);
      }
      set(alteredFrom, "text", fromTxt);
      set(rows[ALTERED_SEQ - 1], "attr:data-state", backAlt > 0 ? "corrected" : alt > 0 ? "altering" : "live");
      restoredTags.forEach((el) => {
        const seq = Number(el.dataset.rtag);
        set(el, "opacity", ramp(t, RESTORE_AT[seq] + 0.04, RESTORE_AT[seq] + 0.12).toFixed(2));
      });
      const bodyH = L.host.head + acc * hr + 14;
      set(paper, "transform", `scaleY(${(bodyH / G.hostFull).toFixed(4)})`);
      const termOn = Math.min(ramp(t, 3.05, 3.2), 1 - ramp(t, 4.5, 4.64));
      set(term, "opacity", termOn.toFixed(3));
      set(term, "transform", `translate3d(0, ${(bodyH + 12).toFixed(1)}px, 0)`);
      COMMANDS.forEach((c, i) => {
        const p = ramp(t, c.from, c.to);
        set(termLines[i], "text", c.text.slice(0, Math.round(p * c.text.length)));
        set(termLines[i].parentElement!, "opacity", p > 0 ? "1" : "0");
      });
      const st = ramp(t, T.rootStamp[0], T.rootStamp[0] + 0.06);
      set(stamp, "opacity", (st * (1 - ramp(t, 2.98, 3.1))).toFixed(3));
      set(stamp, "transform", `rotate(-7deg) scale(${(1.25 - 0.25 * easeOut(st)).toFixed(3)})`);
      const tampered = ramp(t, T.unbloom[0] + 0.04, T.unbloom[1]);
      set(hostStatus, "text", t < 3.0 ? `${visible} entries · live` : t < 4.5 ? `${visible} entries` : `${visible} entries · 0 alerts`);
      set(hostBad, "opacity", tampered.toFixed(3));
      set(hostRootEl, "opacity", Math.min(ramp(t, T.scan[1] - 0.06, T.scan[1] + 0.04), 1 - ramp(t, 10.1, 10.3)).toFixed(3));
      set(hostRootEl, "transform", `translate3d(0, ${(bodyH + 16).toFixed(1)}px, 0)`);
      const sc = ramp(t, T.scan[0], T.scan[1]);
      set(scan, "opacity", (sc > 0 && sc < 1 ? 1 : 0).toFixed(0));
      set(scan, "transform", `translate3d(0, ${(L.host.head + sc * (bodyH - L.host.head)).toFixed(1)}px, 0)`);

      // ---------------- forwarding: each line leaves along the wire the moment it is written; originals fly home in the verdict
      for (let i = 0; i < 16; i++) {
        const seq = i + 1;
        const wAt = WRITE_AT[seq];
        const out = ramp(t, wAt + 0.02, wAt + 0.02 + FLIGHT);
        const r = RESTORE_AT[seq];
        const home = r ? ramp(t, r - FLIGHT, r) : 0;
        let u = -1;
        if (home > 0 && home < 1) u = 1 - easeOut(home);
        else if (out > 0 && out < 1) u = smooth(out);
        const d = dots[i];
        if (u < 0) set(d, "opacity", "0");
        else {
          const p = bez(...G.wire, u);
          set(d, "opacity", "1");
          set(d, "transform", `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`);
          set(d, "attr:data-home", home > 0 ? "1" : "0");
        }
        const arrived = wAt <= 0 ? 1 : ramp(t, wAt + FLIGHT - 0.02, wAt + FLIGHT + 0.03);
        const light = reduced ? 1 : 0.45 + 0.55 * ramp(t, T.vaultLight[0] + i * 0.012, T.vaultLight[0] + 0.12 + i * 0.012);
        set(vrows[i], "opacity", (arrived * (t < T.vaultLight[0] ? 0.45 : light)).toFixed(3));
      }
      vtags.forEach((el) => set(el, "opacity", ramp(t, T.vaultLight[1] - 0.05, T.vaultLight[1] + 0.05).toFixed(2)));
      set(vault, "opacity", (0.35 + 0.65 * ramp(t, 5.5, 5.95)).toFixed(3));
      const lit = ramp(t, T.wire[0], T.wire[1]);
      set(wireBase, "opacity", (0.16 + 0.3 * lit).toFixed(3));
      set(wireLit, "stroke-dashoffset", (1 - fu).toFixed(4));
      set(wireLit, "opacity", Math.min(lit, 1 - ramp(t, 8.1, 8.5) * 0.7).toFixed(3));
      const fo = Math.min(ramp(t, T.follow[0] - 0.04, T.follow[0] + 0.06), 1 - ramp(t, T.follow[1] - 0.04, T.follow[1] + 0.04));
      set(follow, "opacity", fo.toFixed(3));
      set(follow, "transform", `translate3d(${fp.x.toFixed(1)}px, ${fp.y.toFixed(1)}px, 0)`);

      // ---------------- the seal
      const tr = ramp(t, T.tree[0], T.tree[1]);
      edges.forEach((el) => {
        const k = Number(el.dataset.edge); // 0 stems, 1..4 levels; node squares appear with their level
        if (el.tagName === "rect") set(el, "opacity", ramp(tr, (k + 0.8) / 5, (k + 1) / 5).toFixed(2));
        else set(el, "stroke-dashoffset", (1 - ramp(tr, k / 5, (k + 1) / 5)).toFixed(4));
      });
      nodeLabels.forEach((el) => set(el, "opacity", ramp(tr, (Number(el.dataset.nlabel) + 0.6) / 5, (Number(el.dataset.nlabel) + 1) / 5).toFixed(2)));
      set(rootBox, "opacity", ramp(t, T.tree[1] - 0.06, T.tree[1] + 0.02).toFixed(3));
      const rise = easeOut(ramp(t, T.rootRise[0], T.rootRise[1]));
      const chipP = { x: lerp(G.rootP.x, G.blockIn.x, rise), y: lerp(G.rootP.y, G.blockIn.y, rise) };
      set(rootChip, "opacity", (ramp(t, T.rootRise[0], T.rootRise[0] + 0.03) * (1 - ramp(t, T.lock[0], T.lock[0] + 0.04))).toFixed(3));
      set(rootChip, "transform", `translate3d(${chipP.x.toFixed(1)}px, ${chipP.y.toFixed(1)}px, 0)`);
      set(blockLock, "opacity", ramp(t, T.lock[0], T.lock[1]).toFixed(3));
      set(blockIntact, "opacity", ramp(t, T.unbloom[0] + 0.06, T.unbloom[1] + 0.04).toFixed(3));

      // ---------------- the verdict
      const cmp = ramp(t, T.compare[0] - 0.12, T.compare[0] + 0.06);
      vLinks.forEach((el) => set(el, "stroke-dashoffset", (1 - cmp).toFixed(4)));
      const vOn = Math.min(ramp(t, 8.5, 8.7), 1 - ramp(t, 10.1, 10.3));
      set(verifierEl, "opacity", vOn.toFixed(3));
      set(compareEl, "opacity", Math.min(ramp(t, T.compare[1] - 0.04, T.compare[1] + 0.02), 1 - ramp(t, 10.1, 10.3)).toFixed(3));
      vLinks.forEach((el) => set(el, "opacity", vOn.toFixed(3)));
      const toScreen = (p: P) => {
        const rx = (p.x - cx) * S;
        const ry = (p.y - cy) * S;
        const rad = (cam.r * Math.PI) / 180;
        return { x: ax * W + rx * Math.cos(rad) - ry * Math.sin(rad), y: ay * H + rx * Math.sin(rad) + ry * Math.cos(rad) };
      };
      const diag = Math.hypot(W, H);
      const vs = toScreen(L.verifier);
      const hs = toScreen({ x: L.host.x, y: L.host.top + L.host.head / 2 });
      const bl = easeOut(ramp(t, T.bloom[0], T.bloom[1]));
      const ub = easeOut(ramp(t, T.unbloom[0], T.unbloom[1]));
      if (reduced) {
        set(red, "clip-path", "none");
        set(red, "opacity", (ramp(t, T.bloom[0], T.bloom[0] + 0.04) * (1 - ramp(t, T.unbloom[0], T.unbloom[0] + 0.05))).toFixed(3));
      } else {
        const R = t < T.unbloom[0] ? bl * diag * 1.05 : (1 - ub) * diag * 1.05;
        const c = t < T.unbloom[0] ? vs : { x: lerp(vs.x, hs.x, ub), y: lerp(vs.y, hs.y, ub) };
        set(red, "opacity", R > 0.5 ? "1" : "0");
        set(red, "clip-path", `circle(${R.toFixed(1)}px at ${c.x.toFixed(1)}px ${c.y.toFixed(1)}px)`);
      }

      // ---------------- the close
      const calm = ramp(t, 11.04, 11.4);
      systemEls.forEach((el) => set(el, "opacity", (1 - 0.72 * calm).toFixed(3)));
      set(chainEl, "opacity", (1 - 0.72 * calm).toFixed(3));
      set(plate, "opacity", ramp(t, T.consoleIn[0], T.consoleIn[1]).toFixed(3));

      // ---------------- copy windows (fixed layer), scrims
      const scrimMax = { lead: 0, trail: 0, band: 0 };
      copies.forEach((el, i) => {
        const w = COPY[i];
        const len = w.to - w.from;
        const rin = w.ramp ?? Math.min(0.22 * len, 0.22);
        const o = w.hold ? ramp(t, w.from, w.from + rin) : Math.min(ramp(t, w.from, w.from + rin), 1 - ramp(t, w.to - rin, w.to));
        const ty = reduced ? 0 : w.hold ? (1 - ramp(t, w.from, w.from + 0.6)) * 0.02 * H : (1 - 2 * clamp01((t - w.from) / len)) * 0.02 * H;
        set(el, "opacity", o.toFixed(3));
        set(el, "transform", `translate3d(0, ${ty.toFixed(1)}px, 0)`);
        set(el, "pointer-events", o > 0.5 ? "auto" : "none");
        if (w.anchor === "lead" || w.anchor === "low") scrimMax.lead = Math.max(scrimMax.lead, o);
        if (w.anchor === "trail") scrimMax.trail = Math.max(scrimMax.trail, o);
        if (w.anchor !== "verdict" && w.anchor !== "top") scrimMax.band = Math.max(scrimMax.band, o);
      });
      set(scrims.lead, "opacity", (G.tall ? 0 : scrimMax.lead).toFixed(3));
      set(scrims.trail, "opacity", (G.tall ? 0 : scrimMax.trail).toFixed(3));
      set(scrims.band, "opacity", (G.tall ? scrimMax.band : 0).toFixed(3));

      // ---------------- the map
      let ch = 0;
      CHAPTERS.forEach((c, i) => {
        if (t >= c.start - 0.001) ch = i;
      });
      if (ch !== chapter) {
        chapter = ch;
        railBtns.forEach((b, i) => (i === ch ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
        railNow.textContent = CHAPTERS[ch].label;
      }

      // What actually paints, for the verification harness (verify.md: bespoke fixed stages report their state).
      stage.setAttribute(
        "data-sc-verify-state",
        [Math.round(cx), Math.round(cy), S.toFixed(2), Math.round(acc * 10), visible, Math.round(fu * 20), Math.round(tr * 20), Math.round(rise * 10), Math.round(ramp(t, T.lock[0], T.lock[1]) * 10), Math.round(bl * 10 + ub * 10), Math.round(calm * 10)].join(","),
      );
      // Authored holds: the verdict plateau (the peak holds still on purpose) and the resolved close.
      stage.setAttribute("data-sc-verify-hold", t >= TRACK - 0.2 || (t > T.bloom[1] + 0.02 && t < T.unbloom[0] - 0.02) ? "true" : "false");
    };

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const target = scrollY / unit;
      if (reduced) cur = target;
      else cur += (target - cur) * (1 - Math.exp(-dt * 8.5));
      if (Math.abs(target - cur) < 0.0005) cur = target;
      vel = dt > 0 ? (cur - prevT) / dt : 0;
      prevT = cur;
      render(cur, now, dt);
      raf = document.hidden ? 0 : requestAnimationFrame(frame);
    };
    const onResize = () => {
      W = innerWidth;
      H = innerHeight;
      unit = track.offsetHeight / (TRACK + 1);
      sizeCanvas();
    };
    const onVis = () => {
      if (!document.hidden && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);
    render(cur, performance.now(), 0);
    raf = requestAnimationFrame(frame);
    stage.setAttribute("data-ready", "true");
    let ready = true;
    document.fonts?.ready.then(() => {
      if (!ready) return;
      onResize();
      document.documentElement.classList.add("sc-ready");
    });
    return () => {
      ready = false;
      cancelAnimationFrame(raf);
      removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      document.documentElement.classList.remove("sc-ready");
    };
  }, [L, G, reduced]);

  const goTo = (i: number) => {
    const track = rootRef.current?.querySelector<HTMLElement>("[data-track]");
    if (!track) return;
    const unit = track.offsetHeight / (TRACK + 1);
    const t = i === CHAPTERS.length - 1 ? TRACK : CHAPTERS[i].start + 0.18;
    window.scrollTo({ top: t * unit, behavior: reduced ? "auto" : "smooth" });
  };

  const live = status.data?.chain.connected ? status.data : null;
  const spans = CHAPTERS.map((c, i) => (i < CHAPTERS.length - 1 ? CHAPTERS[i + 1].start : TRACK + 1) - c.start);
  const W = L.host.w;
  const hostEdge = { left: L.host.x - W / 2, top: L.host.top };

  return (
    <div ref={rootRef} className={`story ${mode === "tall" ? "is-tall" : "is-wide"}`} data-reduced={reduced ? "true" : "false"}>
      {/* ------------------------------------------------------------ chrome */}
      <header className="st-bar">
        <Link href="/" className="st-mark">
          Leash Blackbox
        </Link>
        <Link href="/attack" className="st-skip">
          Enter live Attack Lab <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </header>
      <nav className="st-rail" aria-label="Story chapters">
        <span className="st-rail-now" data-rail-now aria-hidden>
          {CHAPTERS[0].label}
        </span>
        <ol>
          {CHAPTERS.map((c, i) => (
            <li key={c.id}>
              <button type="button" data-rail onClick={() => goTo(i)} aria-label={`Go to ${c.label}`}>
                <span className="st-rail-tick" aria-hidden />
                <span className="st-rail-label">{c.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <p className="st-note">Simulation with sample records · every hash is computed live in your browser</p>

      {/* ------------------------------------------------------------ the world (one fixed stage) */}
      <div className="st-stage" data-stage data-ready="false" aria-hidden>
        <div className="st-grid" data-grid />
        <div className="st-clock" data-clock>
          03:14
        </div>
        <canvas className="st-motes" data-motes />
        <div className="st-world" data-world>
          {/* wires, tree and verifier links: one SVG in world coordinates */}
          <svg className="st-svg" width="1" height="1" aria-hidden>
            <path data-wire className="st-wire" d={wirePath(G.wire)} />
            <path data-wire-lit className="st-wire-lit" d={wirePath(G.wire)} pathLength={1} strokeDasharray="1" strokeDashoffset="1" />
            {G.nodes[0].map((p, i) => (
              <path key={`s${i}`} data-edge="0" className="st-edge" d={`M${p.x} ${G.stemY} L${p.x} ${p.y}`} pathLength={1} strokeDasharray="1" strokeDashoffset="1" />
            ))}
            {G.nodes.slice(1).map((lvl, k) =>
              lvl.map((p, i) =>
                [0, 1].map((c) => {
                  const ch = G.nodes[k][2 * i + c];
                  return <path key={`e${k}-${i}-${c}`} data-edge={k + 1} className="st-edge" d={`M${ch.x} ${ch.y} L${ch.x} ${(ch.y + p.y) / 2} L${p.x} ${(ch.y + p.y) / 2} L${p.x} ${p.y}`} pathLength={1} strokeDasharray="1" strokeDashoffset="1" />;
                }),
              ),
            )}
            {G.nodes.slice(0, -1).map((lvl, k) =>
              lvl.map((p, i) => <rect key={`n${k}-${i}`} className="st-node" x={p.x - 2.5} y={p.y - 2.5} width={5} height={5} data-edge={k} />),
            )}
            {G.nodes.slice(2, -1).map((lvl, k) =>
              lvl.map((p, i) => (
                <g key={`l${k}-${i}`} data-nlabel={k + 2} opacity={0}>
                  <text className="st-nlabel" x={p.x} y={p.y + (L.tree.step < 0 ? -10 : 18)} textAnchor="middle">
                    {hex(hx?.levels[k + 2][i], 6)}
                  </text>
                </g>
              )),
            )}
            <path data-vlink className="st-vlink" d={`M${G.hostRootP.x} ${G.hostRootP.y} Q ${L.verifier.x} ${G.hostRootP.y} ${L.verifier.x} ${L.verifier.y}`} pathLength={1} strokeDasharray="1" strokeDashoffset="1" />
            <path data-vlink className="st-vlink" d={`M${G.blockIn.x} ${G.blockIn.y} Q ${L.verifier.x} ${G.blockIn.y} ${L.verifier.x} ${L.verifier.y}`} pathLength={1} strokeDasharray="1" strokeDashoffset="1" />
          </svg>

          {/* the host's log, on paper */}
          <section className="st-host" data-system style={{ left: hostEdge.left, top: hostEdge.top, width: W }}>
            <div className="st-paper" data-paper style={{ height: G.hostFull }} />
            <div className="st-host-head" style={{ height: L.host.head }}>
              <span>
                <b>web-prod-01</b> /var/log/auth.log
              </span>
              <span data-host-status className="tabular">
                2 entries · live
              </span>
            </div>
            <div className="st-host-bad" data-host-bad style={{ height: L.host.head }}>
              <b>Tampered</b>
              <span>
                {ERASED.length} erased · 1 altered
              </span>
            </div>
            {RECORDS.map((r) => (
              <div key={r.seq} className={`st-row${r.suspicious ? " is-sus" : ""}`} data-row style={{ height: L.host.row }} data-state="live">
                <i className="st-sel" data-sel />
                <span className="c-seq tabular">{String(r.seq).padStart(2, "0")}</span>
                <span className="c-time tabular">{r.view.time}</span>
                <span className="c-proc">{r.view.proc}</span>
                <span className="c-event">{r.view.event}</span>
                <span className="c-user">{r.view.user}</span>
                <span className="c-from tabular" data-altered-from={r.seq === ALTERED_SEQ ? "" : undefined}>
                  {r.view.from}
                </span>
                <i className="st-fwd" data-fwd title="forwarded" />
                {r.seq in RESTORE_AT && (
                  <span className="st-rtag" data-rtag={r.seq}>
                    <span className="rt-what">{r.seq === ALTERED_SEQ ? "altered · " : "erased · "}</span>
                    {r.seq === ALTERED_SEQ ? "restored" : "recovered"}
                    <span className="rt-proof"> · proof {hx?.proofs[r.seq]?.ok ? `✓ ${hx.proofs[r.seq].steps} steps` : "…"}</span>
                    <span className="rt-tick"> {hx?.proofs[r.seq]?.ok ? "✓" : ""}</span>
                  </span>
                )}
              </div>
            ))}
            <div className="st-scan" data-scan />
            <div className="st-stamp" data-stamp>
              root
            </div>
            <div className="st-term" data-term>
              {COMMANDS.map((c) => (
                <div key={c.text} className="st-term-line">
                  <span className="st-prompt">root@web-prod-01:/var/log#</span> <span data-cmd />
                </div>
              ))}
            </div>
            <div className="st-host-root" data-host-root>
              <span>root recomputed from what the server still holds</span>
              <b className="tabular">{hex(hx?.hostRoot, G.tall ? 24 : 40)}…</b>
            </div>
          </section>

          {/* packets on the wire */}
          {RECORDS.map((r) => (
            <i key={r.seq} className="st-dot" data-dot data-home="0" />
          ))}
          <div className="st-follow" data-follow>
            <div className="st-follow-card">
              <span className="tabular">03:41:09</span> sshd login deploy <b>203.0.113.45</b>
              <small>copied off the server at 03:41:09, the second it was written</small>
            </div>
          </div>

          {/* the evidence vault */}
          <section className="st-vault" data-vault style={{ left: L.vault.x - L.vault.w / 2, top: L.vault.top, width: L.vault.w }}>
            <div className="st-vault-plate" data-system style={{ height: G.vaultFull }} />
            <div className="st-vault-head" style={{ height: L.vault.head }}>
              <span>
                <b>Evidence vault</b> append-only
              </span>
              <span className="tabular">16 records</span>
            </div>
            {RECORDS.map((r, i) => (
              <div key={r.seq} className="st-vrow" data-vrow style={{ height: L.vault.row, top: L.vault.head + i * L.vault.row }}>
                <span className="c-seq tabular">{String(r.seq).padStart(2, "0")}</span>
                <span className="c-time tabular">{r.view.time}</span>
                <span className="c-event">{r.view.event}</span>
                <span className="c-from tabular">{r.view.from}</span>
                <span className="c-leaf tabular">{hex(hx?.leaves[i], 8)}</span>
                {r.seq in RESTORE_AT && (
                  <span className="st-vtag" data-vtag>
                    {r.seq === ALTERED_SEQ ? "altered on host" : "erased on host"}
                  </span>
                )}
              </div>
            ))}
          </section>

          {/* the root, its flight, the chain */}
          <div className="st-rootbox" data-rootbox style={{ left: G.rootP.x, top: G.rootP.y }}>
            <span>Merkle root · batch of 16</span>
            <b className="tabular">{hx ? hx.root.slice(0, 32) : "·".repeat(32)}</b>
            <b className="tabular">{hx ? hx.root.slice(32) : "·".repeat(32)}</b>
          </div>
          <div className="st-rootchip" data-rootchip>
            <b className="tabular">{hex(hx?.root, 12)}…</b>
          </div>
          <div className="st-chain" data-chain>
            {G.blocks.map((b) => (
              <div key={b.no} className={`st-block${b.k === 0 ? " is-ours" : b.k > 0 ? " is-next" : ""}`} style={{ left: b.x - L.chain.bw / 2, top: L.chain.y - L.chain.bh / 2, width: L.chain.bw, height: L.chain.bh }}>
                <span className="st-block-no tabular">#{b.no.toLocaleString("en-US")}</span>
                <span className="st-block-fn">{b.k === 0 ? "anchorBatch · seq 1–16" : b.k > 0 ? "pending" : "anchorBatch"}</span>
                {b.k === 0 && <span className="st-block-root tabular">root {hex(hx?.root, 10)}…</span>}
                {b.k === 0 && (
                  <div className="st-block-lock" data-lock>
                    <span className="st-block-no tabular">#{b.no.toLocaleString("en-US")}</span>
                    <span className="st-block-fn">
                      <Lock className="inline size-3" /> sealed · anchorBatch
                    </span>
                    <span className="st-block-root tabular">root {hex(hx?.root, 10)}…</span>
                  </div>
                )}
                {b.k === 0 && (
                  <span className="st-intact" data-intact>
                    Intact · unchanged since it was sealed
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* the verifier */}
          <div className="st-verifier" data-verifier style={{ left: L.verifier.x, top: L.verifier.y }}>
            <i />
            <span>verifier</span>
          </div>
          <div className="st-compare" data-compare style={{ left: L.verifier.x, top: L.verifier.y }}>
            <span className="tabular">server {hex(hx?.hostRoot, 8)}</span>
            <b>≠</b>
            <span className="tabular">chain {hex(hx?.root, 8)}</span>
          </div>

          {/* arrival: the real console */}
          <figure className="st-plate" data-plate style={{ left: L.plate.x - L.plate.w / 2, top: L.plate.y - L.plate.h / 2, width: L.plate.w }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={L.plate.src} alt="" width={L.plate.w} height={L.plate.h} decoding="async" />
            <figcaption>The live console · Attack Lab</figcaption>
          </figure>
        </div>
        <div className="st-vignette" data-vignette />
        <div className="st-red" data-red />
      </div>

      {/* ------------------------------------------------------------ copy (fixed layer, real reading order) */}
      <div className="st-scrim st-scrim-lead" data-scrim="lead" aria-hidden />
      <div className="st-scrim st-scrim-trail" data-scrim="trail" aria-hidden />
      <div className="st-scrim st-scrim-band" data-scrim="band" aria-hidden />
      <main className="st-copy-layer">
        <div className="st-copy a-lead is-hero" data-sc-copy>
          <h1>The attacker can erase the logs.</h1>
          <p className="st-lede">They cannot erase the proof.</p>
        </div>
        <div className="st-copy a-lead" data-sc-copy>
          <h2>03:12 UTC. A quiet night on web-prod-01.</h2>
          <p>Every login, cron job and sudo lands in the server&apos;s log, one line at a time.</p>
        </div>
        <div className="st-copy a-lead" data-sc-copy>
          <h2>03:41. Three wrong passwords from an address nobody knows.</h2>
          <p>Then one works.</p>
        </div>
        <div className="st-copy a-lead" data-sc-copy>
          <h2 className="is-red">03:41:15. Root.</h2>
          <p>Full control of the server, and of every log on it.</p>
        </div>
        <div className="st-copy a-lead" data-sc-copy>
          <h2>You have root now.</h2>
          <p>Every line you scroll past, you erase.</p>
        </div>
        <div className="st-copy a-low" data-sc-copy>
          <p className="st-quiet">Looking at the server alone, nothing happened.</p>
        </div>
        <div className="st-copy a-trail" data-sc-copy>
          <h2>But every line had already left the server.</h2>
          <p>Each one was copied off the machine the instant it was written, before the attacker could touch it.</p>
        </div>
        <div className="st-copy a-trail" data-sc-copy>
          <h2>The evidence vault.</h2>
          <p>It only appends. It cannot edit or delete, so every original line is still here, including the {ERASED.length} you erased.</p>
        </div>
        <div className="st-copy a-trail" data-sc-copy>
          <h2>Folded into one fingerprint.</h2>
          <p>Each record is hashed. Pairs of hashes are hashed again, all the way up to a single 32-byte Merkle root.</p>
        </div>
        <div className="st-copy a-trail" data-sc-copy>
          <h2>Sealed on a blockchain.</h2>
          <p>Only the fingerprint goes on-chain, never the logs. Once block {BLOCK_NO.toLocaleString("en-US")} is confirmed, nobody can rewrite it, the attacker included.</p>
        </div>
        <div className="st-copy a-top" data-sc-copy>
          <h2>Now verify.</h2>
          <p>Recompute the fingerprint from what the server still holds, and compare it with the one on the chain.</p>
        </div>
        <div className="st-copy a-verdict" data-sc-copy>
          <h2 className="st-verdict">Tampering detected</h2>
          <p>The server&apos;s logs no longer match the fingerprint sealed in block {BLOCK_NO.toLocaleString("en-US")}.</p>
        </div>
        <div className="st-copy a-lead" data-sc-copy>
          <h2>Every line you erased, back.</h2>
          <p>Each original comes from the vault with a Merkle proof checked against the on-chain root. The chain itself never changed.</p>
        </div>
        <div className="st-copy a-lead is-fin" data-sc-copy>
          <h2>The attacker erased the trail. Not the proof.</h2>
          <p>Now do it for real: attack a live host, verify against a local blockchain, and inspect every proof.</p>
          <div className="st-cta-row">
            <Link href="/attack" className="st-cta" onFocus={() => goTo(CHAPTERS.length - 1)}>
              Enter live Attack Lab <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href="/demo" className="st-link" onFocus={() => goTo(CHAPTERS.length - 1)}>
              or watch the guided demo
            </Link>
          </div>
          <p className="st-live tabular" aria-live="polite">
            {live
              ? `Live now: local chain ${live.chain.chain_id} · block ${live.chain.latest_block} · ${live.counts.anchored_events} events anchored`
              : status.error
                ? "The live console is offline. Start it with scripts\\start-all.cmd."
                : " "}
          </p>
        </div>
      </main>

      {/* ------------------------------------------------------------ the scroll track (only thing in document flow) */}
      <div className="st-track" data-track aria-hidden>
        {CHAPTERS.map((c, i) => (
          <div key={c.id} data-sc-act="flow" data-chapter={c.id} style={{ height: `${spans[i] * 100}svh` }} />
        ))}
      </div>
    </div>
  );
}

function wirePath(w: readonly P[]) {
  return `M${w[0].x} ${w[0].y} C ${w[1].x} ${w[1].y}, ${w[2].x} ${w[2].y}, ${w[3].x} ${w[3].y}`;
}
