"use client";

import { motion, useTransform, type MotionValue } from "motion/react";

/*
 * The homepage castle: original layered SVG art, no photographs. Every plane shares one 1600×1000 geometry
 * (.castle-frame in globals.css), so the planes stay registered while each one scales around the lit archive
 * window at a different rate: the scroll is a push-in toward that window. Colours are theme tokens, so a
 * theme switch repaints without remounting. Only transform and opacity move.
 */

/** The lit archive window, in viewBox units; every plane scales around it. */
const WX = 1130;
const WY = 509;
const ORIGIN = `${(WX / 1600) * 100}% ${(WY / 1000) * 100}%`;

/** A wall with merlons along its top edge. */
function crenel(x0: number, x1: number, top: number, bottom: number, mw = 12, gap = 9, mh = 10) {
  let d = `M${x0} ${bottom}V${top}`;
  for (let x = x0 + 2; x + mw <= x1 - 2; x += mw + gap) d += `H${x}V${top - mh}H${x + mw}V${top}`;
  return `${d}H${x1}V${bottom}Z`;
}
const cone = (x: number, w: number, top: number, h: number, ov = 6) => `M${x - ov} ${top}L${x + w / 2} ${top - h}L${x + w + ov} ${top}Z`;
const rect = (x0: number, x1: number, top: number, bottom: number) => `M${x0} ${top}H${x1}V${bottom}H${x0}Z`;
/** A pointed (lancet) arch. */
function lancet(cx: number, top: number, w: number, h: number) {
  const r = w / 2;
  return `M${cx - r} ${top + h}V${top + w * 0.7}Q${cx - r} ${top + w * 0.12} ${cx} ${top}Q${cx + r} ${top + w * 0.12} ${cx + r} ${top + w * 0.7}V${top + h}Z`;
}

// Deterministic stars (same on the server and in the browser).
const STARS = (() => {
  let s = 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 96 }, () => [Math.round(r() * 1600), Math.round(r() * 540), +(0.5 + r() * 1.1).toFixed(2), +(0.25 + r() * 0.65).toFixed(2)]);
})();

const BACK_TOWERS: [number, number, number, number][] = [
  [826, 44, 480, 70],
  [1000, 52, 372, 124],
  [1238, 66, 296, 150],
  [1456, 58, 392, 110],
  [1548, 46, 458, 84],
];

const KEEP_WINDOWS = [1262, 1302, 1342].flatMap((cx) => [430, 520, 612].map((top) => lancet(cx, top, 14, 34)));
const HALL_WINDOWS = [888, 933, 990, 1035].map((cx) => lancet(cx, 548, 16, 56));
const SLITS = [880, 1020, 1060, 1420, 1510].map((x) => rect(x, x + 4, 660, 682));

/** The bridge over the ravine: a deck on tall piers with pointed arches, running off the left edge. */
const BRIDGE = (() => {
  const piers = [600, 430, 260, 90];
  let d = "M-20 704H752V720H715";
  let x = 715;
  for (const p of piers) {
    const right = p + 36;
    const mid = (x + right) / 2;
    d += `V800Q${x} 758 ${mid} 742Q${right} 758 ${right} 800V1000H${p}V800`;
    x = p;
  }
  return `${d}Q-20 758 -20 742Z`;
})();

function Plane({ scale, y, interactive, children }: { scale: MotionValue<number>; y?: MotionValue<string>; interactive?: boolean; children: React.ReactNode }) {
  return (
    <motion.div className={`absolute inset-0 ${interactive ? "pointer-events-none [&_a]:pointer-events-auto" : "pointer-events-none"}`} style={{ scale, y, transformOrigin: ORIGIN }}>
      <svg viewBox="0 0 1600 1000" className="absolute inset-0 size-full overflow-visible" aria-hidden={interactive ? undefined : true}>
        {children}
      </svg>
    </motion.div>
  );
}

export function CastleScene({ progress, still, onOpen }: { progress: MotionValue<number>; still: boolean; onOpen: (e?: React.MouseEvent) => void }) {
  const k = (to: number) => (still ? [1, 1] : [1, to]);
  const sky = useTransform(progress, [0, 1], k(1.08));
  const far = useTransform(progress, [0, 1], k(1.3));
  const back = useTransform(progress, [0, 1], k(1.8));
  const castle = useTransform(progress, [0, 1], k(3.4));
  const near = useTransform(progress, [0, 1], k(3.6));
  const nearY = useTransform(progress, [0, 1], still ? ["0%", "0%"] : ["0%", "22%"]);
  const mistOut = useTransform(progress, [0, 0.8], still ? [1, 1] : [1, 0.2]);
  const mistScale = useTransform(progress, [0, 1], k(2.4));

  return (
    <div className="castle-stage absolute inset-0 overflow-hidden bg-[linear-gradient(180deg,var(--sky-top),var(--sky-low))]">
      <div className="castle-frame">
        {/* Sky: stars and moon at midnight, a low sun behind the walls at dawn */}
        <Plane scale={sky}>
          <defs>
            <radialGradient id="cs-sun">
              <stop offset="0" stopColor="var(--sun)" stopOpacity="0.9" />
              <stop offset="1" stopColor="var(--sun)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="cs-moon-halo">
              <stop offset="0.35" stopColor="var(--moon)" stopOpacity="0.35" />
              <stop offset="1" stopColor="var(--moon)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="1190" cy="560" r="560" fill="url(#cs-sun)" style={{ opacity: "var(--sun-o)" }} />
          <g style={{ opacity: "var(--stars-o)" }} fill="var(--moon)">
            {STARS.map(([x, y, r, o], i) => (
              <circle key={i} cx={x} cy={y} r={r} opacity={o} />
            ))}
          </g>
          <g style={{ opacity: "var(--moon-o)" }}>
            <circle cx="1360" cy="118" r="90" fill="url(#cs-moon-halo)" />
            <circle cx="1360" cy="118" r="28" fill="var(--moon)" />
          </g>
        </Plane>

        {/* Far ridge with the two watchtowers outside the walls (the witness and the heartbeats) */}
        <Plane scale={far}>
          <path
            fill="var(--far)"
            d="M0 700L90 640L180 590L260 620L340 600L430 640L520 590L600 540L660 520L720 560L800 600L880 580L960 610L1060 570L1160 600L1260 560L1380 590L1480 570L1580 560L1600 566V1000H0Z"
          />
          <g fill="var(--far-dark)">
            <path d={`${rect(645, 659, 462, 526)}${cone(642, 20, 462, 22, 0)}`} />
            <path d={`${rect(1574, 1588, 500, 564)}${cone(1571, 20, 500, 20, 0)}`} />
          </g>
          <g fill="var(--beacon)">
            <rect x="649" y="472" width="6" height="8" />
            <rect x="1578" y="510" width="6" height="8" />
          </g>
        </Plane>

        {/* The high wall behind: paler, it sits further back in the haze */}
        <Plane scale={back}>
          <g fill="var(--castle-back)">
            <path d="M800 760V560L1600 548V760Z" />
            {BACK_TOWERS.map(([x, w, top, h]) => (
              <path key={x} d={`${rect(x, x + w, top, 760)}${cone(x - 4, w + 8, top, h, 0)}`} />
            ))}
            <path d={`${rect(1040, 1240, 470, 760)}M1036 470L1140 398L1244 470Z`} />
          </g>
        </Plane>

        {/* The castle: gatehouse, curtain wall, great hall, the archive tower and the keep */}
        <Plane scale={castle} interactive>
          <defs>
            <radialGradient id="cs-glow">
              <stop offset="0" stopColor="var(--glass-core)" stopOpacity="0.85" />
              <stop offset="0.3" stopColor="var(--glass)" stopOpacity="0.38" />
              <stop offset="1" stopColor="var(--glass)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="cs-glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--glass-core)" />
              <stop offset="1" stopColor="var(--glass)" />
            </linearGradient>
          </defs>
          <path
            fill="var(--rock)"
            d="M640 1000L652 880L668 800L690 748L720 728L800 722L900 730L1000 724L1100 732L1200 726L1300 734L1420 728L1520 736L1600 730V1000Z"
          />
          <path fill="var(--rock-shade)" d="M652 880L690 760L706 1000H640ZM760 1000L790 820L840 780L820 1000ZM1180 1000L1230 800L1290 760L1260 1000Z" />

          {/* Great hall, behind the curtain wall */}
          <path fill="var(--stone-shade)" d={rect(860, 1062, 518, 690)} />
          <path fill="var(--roof)" d="M848 520L961 402L1074 520ZM953 420L961 296L969 420Z" />
          <path fill="var(--stone)" d={[858, 908, 958, 1008, 1052].map((x) => `M${x} 690V548L${x + 10} 538V690Z`).join("")} />
          <path fill="var(--window-dark)" d={HALL_WINDOWS.join("")} />

          {/* Curtain wall and its towers */}
          <path fill="var(--stone)" d={crenel(838, 1560, 628, 740)} />
          <path fill="var(--stone)" d={crenel(955, 1002, 590, 740)} />
          <path fill="var(--stone)" d={`${rect(1440, 1492, 560, 740)}${rect(1534, 1580, 600, 740)}`} />
          <path fill="var(--roof)" d={`${cone(1440, 52, 560, 82)}${cone(1534, 46, 600, 64)}`} />
          <path fill="var(--window-dark)" d={SLITS.join("")} />

          {/* Archive tower: the one room with a light on */}
          <path fill="var(--stone)" d={rect(1075, 1185, 330, 740)} />
          <path fill="var(--stone-shade)" d={rect(1160, 1185, 330, 740)} />
          <g stroke="var(--stone-dark)" strokeWidth="1.2" opacity="0.35">
            {Array.from({ length: 22 }, (_, i) => 346 + i * 18).map((y) => (
              <line key={y} x1="1077" x2="1183" y1={y} y2={y} />
            ))}
          </g>
          <path fill="var(--stone-dark)" d={`${rect(1068, 1192, 320, 334)}${rect(1078, 1182, 558, 565)}`} />
          <path fill="var(--roof)" d={`M1062 322L1130 166L1198 322Z${cone(1062, 14, 322, 40, 2)}${cone(1184, 14, 322, 40, 2)}`} />
          <path fill="var(--window-dark)" d={`${lancet(1110, 370, 12, 26)}${lancet(1150, 370, 12, 26)}${lancet(1130, 622, 14, 34)}`} />

          {/* Keep with corner turrets */}
          <path fill="var(--stone)" d={crenel(1205, 1398, 384, 740)} />
          <path fill="var(--stone)" d={crenel(1262, 1342, 330, 390)} />
          <path fill="var(--stone-shade)" d={rect(1372, 1398, 384, 740)} />
          <path fill="var(--stone)" d={`${rect(1190, 1232, 352, 742)}${rect(1372, 1414, 352, 742)}`} />
          <path fill="var(--roof)" d={`${cone(1190, 42, 352, 92)}${cone(1372, 42, 352, 92)}M1301 330V282L1338 291L1303 300V330Z`} />
          <path fill="var(--window-dark)" d={KEEP_WINDOWS.join("")} />

          {/* Gatehouse and the bridge into it */}
          <path fill="var(--stone)" d={`${rect(688, 734, 568, 736)}${rect(792, 838, 568, 736)}`} />
          <path fill="var(--stone-shade)" d={crenel(734, 792, 606, 736)} />
          <path fill="var(--roof)" d={`${cone(688, 46, 568, 70)}${cone(792, 46, 568, 70)}`} />
          <path fill="var(--window-dark)" d={lancet(763, 640, 32, 80)} />
          <path fill="var(--bridge)" d={BRIDGE} />
          <path fill="var(--bridge)" d={crenel(-20, 715, 704, 712, 8, 10, 7)} />

          {/* The lit archive window: a second entrance to the case */}
          <a href="#case" onClick={onOpen} aria-label="Lit archive window: open the missing session case" className="cs-window outline-none">
            <circle className="cs-glow" cx={WX} cy={WY} r="170" fill="url(#cs-glow)" />
            <path fill="var(--stone-dark)" d={lancet(WX, 456, 62, 104)} />
            <g className="cs-light">
              <path fill="url(#cs-glass)" d={lancet(WX, 466, 44, 86)} />
              <path fill="var(--stone-dark)" d={`${rect(WX - 1.6, WX + 1.6, 486, 552)}${rect(WX - 22, WX + 22, 517, 520)}`} />
              <circle cx={WX} cy="482" r="5" fill="none" stroke="var(--stone-dark)" strokeWidth="2.4" />
            </g>
            <path className="cs-ring" d={lancet(WX, 446, 82, 122)} fill="none" stroke="var(--ring)" strokeWidth="4" />
            <rect x={WX - 60} y="430" width="120" height="150" fill="transparent" />
          </a>
        </Plane>

        {/* Mist in the ravine: its own plane, thinning as the camera passes through it */}
        <motion.div className="castle-mist pointer-events-none absolute inset-0" style={{ opacity: mistOut, scale: mistScale, transformOrigin: ORIGIN }} />

        {/* The ledge the visitor stands on */}
        <Plane scale={near} y={nearY}>
          <path
            fill="var(--near)"
            d="M0 752C60 744 120 766 170 796C232 834 300 860 360 900C410 934 450 968 480 1000H0ZM0 1000V968C200 958 420 976 640 966C900 956 1200 972 1400 960C1500 956 1560 962 1600 958V1000Z"
          />
          <path fill="var(--near)" d="M20 752l6-26 4 24 7-30 3 32 8-22 2 22 9-18 1 20Z M150 784l5-20 3 18 6-24 2 26 7-16 2 18Z" />
        </Plane>
      </div>
    </div>
  );
}
