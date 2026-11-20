/**
 * The /story scroll experience: sample data, timeline and camera.
 *
 * Everything here is a labelled simulation EXCEPT the hashes: the page computes every leaf, node and root from these
 * records in the browser with lib/verify.ts (the Auditor's browser verifier), following backend/app/merkle.py.
 *
 * Track position `t` is measured in viewport-heights of scroll, 0 at the top of the page.
 */
import type { EventRecord } from "@/lib/types";

export const TRACK = 12; // travel in viewport-heights; the page is TRACK + 1 tall so the close can rest

// ------------------------------------------------------------------ chapters (the map)
export const CHAPTERS = [
  { id: "normal", label: "Normal night", start: 0 },
  { id: "intrusion", label: "Intrusion", start: 1.5 },
  { id: "coverup", label: "Cover-up", start: 3.0 },
  { id: "evidence", label: "Evidence", start: 5.0 },
  { id: "seal", label: "Seal", start: 6.5 },
  { id: "verdict", label: "Verdict", start: 8.1 },
  { id: "prove", label: "Prove it", start: 11.0 },
] as const;

// ------------------------------------------------------------------ sample records
type Row = [seq: number, time: string, proc: string, event: string, user: string, from: string, sev: EventRecord["severity"], type: string, msg: string];

const ROWS: Row[] = [
  [1, "03:12:07", "sshd", "login", "alice", "10.0.4.12", "info", "auth.login", "Accepted publickey for alice from 10.0.4.12 port 50122 ssh2"],
  [2, "03:14:30", "cron", "job", "root", "backup.sh", "info", "cron.run", "(root) CMD (/usr/local/bin/backup.sh)"],
  [3, "03:20:11", "sudo", "reload", "alice", "nginx", "low", "sudo.command", "alice : TTY=pts/0 ; PWD=/home/alice ; USER=root ; COMMAND=/usr/sbin/nginx -s reload"],
  [4, "03:26:44", "sshd", "login", "bob", "10.0.4.19", "info", "auth.login", "Accepted publickey for bob from 10.0.4.19 port 50311 ssh2"],
  [5, "03:31:02", "sudo", "upgrade", "alice", "apt", "low", "sudo.command", "alice : TTY=pts/0 ; PWD=/home/alice ; USER=root ; COMMAND=/usr/bin/apt upgrade -y"],
  [6, "03:38:56", "sshd", "logout", "bob", "10.0.4.19", "info", "auth.logout", "Disconnected from user bob 10.0.4.19 port 50311"],
  [7, "03:41:02", "sshd", "bad password", "root", "203.0.113.45", "medium", "auth.failure", "Failed password for root from 203.0.113.45 port 51522 ssh2"],
  [8, "03:41:03", "sshd", "bad password", "root", "203.0.113.45", "medium", "auth.failure", "Failed password for root from 203.0.113.45 port 51524 ssh2"],
  [9, "03:41:05", "sshd", "bad password", "admin", "203.0.113.45", "medium", "auth.failure", "Failed password for invalid user admin from 203.0.113.45 port 51530 ssh2"],
  [10, "03:41:09", "sshd", "login", "deploy", "203.0.113.45", "high", "auth.login", "Accepted password for deploy from 203.0.113.45 port 51533 ssh2"],
  [11, "03:41:15", "sudo", "root shell", "deploy", "/bin/bash", "critical", "sudo.command", "deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/bin/bash"],
  [12, "03:43:40", "useradd", "new user", "sysbackup", "uid 0", "critical", "account.create", "new user: name=sysbackup, UID=0, GID=0, home=/root, shell=/bin/bash"],
  [13, "03:47:18", "cron", "job", "root", "logrotate", "info", "cron.run", "(root) CMD (/usr/sbin/logrotate /etc/logrotate.conf)"],
  [14, "03:50:31", "sshd", "login", "alice", "10.0.4.12", "info", "auth.login", "Accepted publickey for alice from 10.0.4.12 port 50433 ssh2"],
  [15, "03:55:02", "sudo", "status", "alice", "nginx", "low", "sudo.command", "alice : TTY=pts/0 ; PWD=/home/alice ; USER=root ; COMMAND=/usr/bin/systemctl status nginx"],
  [16, "03:58:44", "sshd", "logout", "alice", "10.0.4.12", "info", "auth.logout", "Disconnected from user alice 10.0.4.12 port 50433"],
];

export interface StoryRow {
  seq: number;
  view: { time: string; proc: string; event: string; user: string; from: string };
  suspicious: boolean;
  record: EventRecord;
}

function toRecord([seq, time, proc, , user, from, severity, type, msg]: Row): EventRecord {
  return {
    v: 1,
    seq,
    id: `story-${String(seq).padStart(4, "0")}`,
    ts: `2026-11-20T${time}Z`,
    host: "web-prod-01",
    source: "auth.log",
    type,
    severity,
    actor: user,
    msg: `${proc}: ${msg}`,
    attrs: { proc, src: from },
  };
}

export const RECORDS: StoryRow[] = ROWS.map((r) => ({
  seq: r[0],
  view: { time: r[1], proc: r[2], event: r[3], user: r[4], from: r[5] },
  suspicious: r[5] === "203.0.113.45" || r[0] === 11 || r[0] === 12,
  record: toRecord(r),
}));

/** Record 10 as the attacker leaves it: the source address rewritten so the login looks routine. */
export const ALTERED_SEQ = 10;
export const ALTERED_FROM = "10.0.4.12";
export const ALTERED_RECORD: EventRecord = {
  ...RECORDS[ALTERED_SEQ - 1].record,
  msg: "sshd: Accepted password for deploy from 10.0.4.12 port 51533 ssh2",
  attrs: { proc: "sshd", src: ALTERED_FROM },
};

// ------------------------------------------------------------------ timeline (track positions)
/** When each line is written to the host log (and forwarded off it). */
export const WRITE_AT: Record<number, number> = {
  1: -1, 2: -1, 3: -1, 4: 0.36, 5: 0.62, 6: 0.9,
  7: 1.62, 8: 1.72, 9: 1.82, 10: 2.08, 11: 2.42, 12: 2.62,
  13: 2.76, 14: 2.82, 15: 2.88, 16: 2.94,
};
/** The visitor's scroll erases these, in this order. */
export const ERASE_AT: Record<number, number> = { 7: 3.46, 8: 3.56, 9: 3.66, 12: 3.96, 11: 4.06 };
export const ALTER_AT: [number, number] = [4.24, 4.38];
/** In the verdict the originals fly home from the vault. */
export const RESTORE_AT: Record<number, number> = { 7: 10.46, 8: 10.53, 9: 10.6, 11: 10.67, 12: 10.74, 10: 10.83 };
export const ERASED = Object.keys(ERASE_AT).map(Number);
export const FLIGHT = 0.26; // track length of one packet flight host <-> vault

/** The attacker's shell, typed by the visitor's scroll during the cover-up. */
export const COMMANDS = [
  { text: "sed -i '/Failed password/d' auth.log", from: 3.2, to: 3.4 },
  { text: "sed -i '/sysbackup\\|bin\\/bash/d' auth.log", from: 3.74, to: 3.92 },
  { text: "sed -i 's/203.0.113.45/10.0.4.12/' auth.log", from: 4.1, to: 4.24 },
  { text: "history -c", from: 4.4, to: 4.46 },
];

export const T = {
  rootStamp: [2.5, 3.0], // seeps in after the root shell line is written (2.42)
  coverupGlow: [2.0, 4.6],
  silence: [4.45, 5.0],
  wire: [5.0, 5.2],
  follow: [5.08, 5.95], // the intruder's login line, followed along the wire into the vault
  vaultLight: [5.8, 6.15],
  tree: [6.55, 7.22],
  rootRise: [7.28, 7.56],
  lock: [7.56, 7.7],
  scan: [8.62, 9.0],
  compare: [8.95, 9.12],
  bloom: [9.1, 9.3],
  unbloom: [10.12, 10.28],
  consoleIn: [11.02, 11.45],
} as const;

export const BLOCK_NO = 1204;

// ------------------------------------------------------------------ copy windows
export type Anchor = "lead" | "trail" | "top" | "verdict" | "low";
export const COPY: { id: string; from: number; to: number; anchor: Anchor; hold?: boolean; ramp?: number }[] = [
  { id: "hero", from: -1, to: 0.72, anchor: "lead" },
  { id: "c1", from: 0.66, to: 1.56, anchor: "lead" },
  { id: "c2a", from: 1.54, to: 2.42, anchor: "lead" },
  { id: "c2b", from: 2.4, to: 3.04, anchor: "lead" },
  { id: "c3a", from: 3.02, to: 4.42, anchor: "lead" },
  { id: "c3b", from: 4.42, to: 5.04, anchor: "low" },
  { id: "c4a", from: 5.02, to: 5.86, anchor: "trail" },
  { id: "c4b", from: 5.84, to: 6.6, anchor: "trail" },
  { id: "c5a", from: 6.56, to: 7.32, anchor: "trail" },
  { id: "c5b", from: 7.3, to: 8.14, anchor: "trail" },
  { id: "c6a", from: 8.1, to: 9.16, anchor: "top" },
  { id: "c6b", from: 9.14, to: 10.16, anchor: "verdict", ramp: 0.1 },
  { id: "c6c", from: 10.42, to: 11.12, anchor: "lead" },
  { id: "fin", from: 11.36, to: 99, anchor: "lead", hold: true },
];

// ------------------------------------------------------------------ world layout and camera
export interface Shot { t: number; x: number; y: number; z: number; ax: number; ay: number; r?: number }
export interface Layout {
  ref: [number, number]; // reference viewport for base scale
  host: { x: number; top: number; w: number; head: number; row: number };
  vault: { x: number; top: number; w: number; head: number; row: number };
  tree: { leafY: number; step: number; spread: number }; // step < 0 grows up
  chain: { y: number; bw: number; bh: number; gap: number; x: number };
  verifier: { x: number; y: number };
  plate: { x: number; y: number; w: number; h: number; src: string };
  shots: Shot[];
}

const WIDE: Omit<Layout, "shots"> = {
  ref: [1440, 900],
  host: { x: 0, top: -270, w: 640, head: 50, row: 30 },
  vault: { x: 1400, top: 150, w: 560, head: 46, row: 26 },
  tree: { leafY: 112, step: -104, spread: 520 },
  chain: { y: -560, bw: 188, bh: 118, gap: 22, x: 1400 },
  verifier: { x: 720, y: -150 },
  plate: { x: 720, y: 1190, w: 920, h: 575, src: "/story/attack-lab.png" },
};

const TALL: Omit<Layout, "shots"> = {
  ref: [390, 844],
  host: { x: 0, top: -250, w: 350, head: 46, row: 26 },
  vault: { x: 0, top: 640, w: 350, head: 42, row: 22 },
  tree: { leafY: 1056, step: 96, spread: 318 },
  chain: { y: 1610, bw: 150, bh: 104, gap: 12, x: 0 },
  verifier: { x: 128, y: 470 },
  plate: { x: 0, y: 2240, w: 300, h: 649, src: "/story/attack-lab-phone.png" },
};

export const LAYOUTS: { wide: Layout; tall: Layout } = {
  wide: {
    ...WIDE,
    shots: [
      { t: 0, x: 0, y: -150, z: 0.92, ax: 0.7, ay: 0.42 },
      { t: 1.5, x: 0, y: -40, z: 0.92, ax: 0.68, ay: 0.44 },
      { t: 2.95, x: 0, y: 40, z: 1, ax: 0.66, ay: 0.46, r: -0.5 },
      { t: 4.3, x: 0, y: 20, z: 1, ax: 0.66, ay: 0.47, r: -0.3 },
      { t: 4.98, x: 0, y: -20, z: 0.6, ax: 0.62, ay: 0.5 },
      { t: 5.3, x: 420, y: 40, z: 0.92, ax: 0.38, ay: 0.5 },
      { t: 5.9, x: 1400, y: 360, z: 0.88, ax: 0.36, ay: 0.5 },
      { t: 6.45, x: 1400, y: 390, z: 0.92, ax: 0.36, ay: 0.5 },
      { t: 7.15, x: 1400, y: -140, z: 0.7, ax: 0.38, ay: 0.52 },
      { t: 7.95, x: 1400, y: -470, z: 0.9, ax: 0.38, ay: 0.5 }, // in on the locking block while the tree steps back
      { t: 8.55, x: 700, y: -60, z: 0.42, ax: 0.54, ay: 0.6 },
      { t: 10.42, x: 700, y: -50, z: 0.45, ax: 0.54, ay: 0.6 },
      { t: 10.68, x: 0, y: 10, z: 0.82, ax: 0.6, ay: 0.5 },
      { t: 11.0, x: 0, y: 10, z: 0.84, ax: 0.6, ay: 0.5 },
      { t: 11.5, x: 720, y: 1190, z: 0.64, ax: 0.66, ay: 0.52 },
      { t: 12, x: 720, y: 1190, z: 0.65, ax: 0.66, ay: 0.52 },
    ],
  },
  tall: {
    ...TALL,
    shots: [
      { t: 0, x: 0, y: -170, z: 0.86, ax: 0.5, ay: 0.3 },
      { t: 1.5, x: 0, y: -60, z: 0.9, ax: 0.5, ay: 0.3 },
      { t: 2.95, x: 0, y: 20, z: 1, ax: 0.5, ay: 0.3, r: -0.5 },
      { t: 4.3, x: 0, y: 0, z: 1, ax: 0.5, ay: 0.3, r: -0.3 },
      { t: 4.98, x: 0, y: -20, z: 0.62, ax: 0.5, ay: 0.3 },
      { t: 5.3, x: 40, y: 300, z: 0.7, ax: 0.5, ay: 0.32 },
      { t: 5.9, x: 0, y: 840, z: 0.92, ax: 0.5, ay: 0.3 },
      { t: 6.45, x: 0, y: 850, z: 0.95, ax: 0.5, ay: 0.3 },
      { t: 7.15, x: 0, y: 1260, z: 0.72, ax: 0.5, ay: 0.3 },
      { t: 7.95, x: 0, y: 1520, z: 0.8, ax: 0.5, ay: 0.3 },
      { t: 8.55, x: 40, y: 706, z: 0.26, ax: 0.5, ay: 0.42 },
      { t: 10.42, x: 40, y: 706, z: 0.27, ax: 0.5, ay: 0.42 },
      { t: 10.68, x: 0, y: -10, z: 0.9, ax: 0.5, ay: 0.3 },
      { t: 11.0, x: 0, y: -10, z: 0.92, ax: 0.5, ay: 0.3 },
      { t: 11.5, x: 0, y: 2250, z: 0.5, ax: 0.5, ay: 0.3 },
      { t: 12, x: 0, y: 2250, z: 0.5, ax: 0.5, ay: 0.3 },
    ],
  },
};
