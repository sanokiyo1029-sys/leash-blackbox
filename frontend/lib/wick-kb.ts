/**
 * Wick's knowledge: a small local source grounded in the repo's docs (README, docs/PITCH.md,
 * docs/handoff/CURRENT_STATE.md) and the site's real routes. No API key, no network, except the live
 * verification status read from this stack's own /api/status when a question needs it.
 *
 * Matching: the question is lower-cased, contractions and a few phrases are expanded, and each word is mapped to
 * a canonical word (ALIASES; words used in a term stay as they are; otherwise a crude plural/-ing/-ed strip).
 * A topic scores the word count of every term whose words are all present. The best score wins; ties go to the
 * earlier topic; zero means "I don't know that". Terms must use canonical words.
 * To add knowledge: add a topic with a few terms and a reply, then a case in e2e/wick.spec.ts.
 */
import type { Status, Verdict } from "@/lib/types";
import { CASE_RESULT, type Room, type SealResult } from "@/lib/case-state";

export type WickAction = { label: string; href: string; openHow?: boolean; openCase?: boolean };
export type WickReply = { text: string; action?: WickAction };
export type LiveState = { ok: true; last: Status["last_verification"] } | { ok: false; error: string };
export type WickContext = { path: string; compared: boolean; room?: Room; seal?: SealResult | null; live?: LiveState };

const PHRASES: Record<string, string> = {
  "reporting gap": "heartbeat",
  "what's": "what is", whats: "what is", "it's": "it is", "that's": "that is", "who's": "who is", "where's": "where is",
  "how's": "how is", "doesn't": "does not", "don't": "do not", "can't": "cannot", "i'm": "i am", "isn't": "is not",
};

const ALIASES: Record<string, string> = {
  it: "this", that: "this", here: "this", page: "page", screen: "page", view: "page",
  blackbox: "leash", product: "leash", tool: "leash", app: "leash", site: "leash", platform: "leash", service: "leash", software: "leash", system: "leash",
  does: "do", did: "do", doing: "do", purpose: "purpose", point: "purpose", goal: "purpose", about: "about",
  useful: "use", usage: "use", using: "use", used: "use", benefit: "use", value: "use", need: "use", care: "use", worth: "use", help: "use",
  company: "team", organisation: "team", organization: "team", org: "team", business: "team", we: "team", us: "team", our: "team", soc: "team",
  price: "pricing", cost: "pricing", buy: "pricing", purchase: "pricing", plan: "pricing", license: "pricing", licence: "pricing",
  subscription: "pricing", paid: "pricing", much: "pricing", quote: "pricing", expensive: "pricing",
  sales: "contact", email: "contact", call: "contact", talk: "contact", reach: "contact", touch: "contact",
  demonstration: "demo", tour: "demo", walkthrough: "demo", guided: "demo", story: "demo", see: "show", watch: "show", open: "show",
  trial: "try", test: "try", pilot: "try", install: "try", setup: "try", started: "try", start: "try",
  missing: "gap", omission: "gap", omitted: "gap", absent: "gap", discrepancy: "gap", difference: "gap", differ: "gap", different: "gap",
  mismatch: "gap", hole: "gap", silence: "gap", silent: "gap", highlighted: "gap", marked: "gap", extra: "gap", unreported: "gap",
  proof: "prove", proves: "prove", demonstrate: "prove", means: "mean", meaning: "mean", signify: "mean", imply: "mean",
  other: "second", independent: "second", gateway: "witness", observer: "witness", records: "record", entry: "record", entries: "record",
  logs: "log", logging: "log", logger: "log", come: "from", came: "from", source: "from", origin: "from",
  verified: "verify", verification: "verify", check: "verify", checked: "verify", validate: "verify", validated: "verify", confirm: "verify", confirmed: "verify",
  verdict: "result", outcome: "result", status: "result", finding: "result", findings: "result", report: "result", clean: "result", tampered: "result",
  find: "result", found: "result",
  blockchain: "chain", ethereum: "chain", evm: "chain", hardhat: "chain", onchain: "chain", ledger: "chain", anchor: "chain", anchored: "chain",
  anchoring: "chain", contract: "chain", crypto: "chain", web3: "chain",
  hashes: "hash", hashing: "hash", sha256: "hash", merkle: "hash", tree: "hash", root: "hash", canonical: "hash", sealed: "hash", seal: "hash",
  auditor: "audit", auditing: "audit", independently: "audit", bundle: "audit", cli: "audit", third: "audit", regulator: "audit",
  attack: "attack", attacker: "attack", hack: "attack", hacker: "attack", intrusion: "attack", tamper: "attack", tampering: "attack",
  erase: "attack", erased: "attack", delete: "attack", deleted: "attack", alter: "attack", altered: "attack", inject: "attack", lab: "attack",
  remove: "attack", removed: "attack", change: "attack", changed: "attack", edit: "attack", edited: "attack",
  heartbeat: "heartbeat", heartbeats: "heartbeat", checkin: "heartbeat", agent: "heartbeat",
  dispute: "dispute", package: "dispute", commit: "dispute",
  limit: "limit", limitation: "limit", weakness: "limit", cannot: "limit", trust: "limit", assumption: "limit", risk: "limit",
  dark: "theme", light: "theme", mode: "theme", appearance: "theme", colour: "theme", color: "theme",
  who: "who", you: "you", wick: "you", yourself: "you", name: "you", knight: "you",
  hi: "hello", hey: "hello", hello: "hello", thanks: "thanks", thank: "thanks", cheers: "thanks",
  looking: "look", explain: "explain", describe: "explain", happening: "happen", happened: "happen",
};

let known: Set<string> | null = null;
function canon(w: string): string {
  known ??= new Set(TOPICS.flatMap((t) => t.terms.flatMap((term) => term.split(" "))));
  if (ALIASES[w]) return ALIASES[w];
  if (known.has(w) || w.length <= 3) return w;
  const stem = w.replace(/(ing|ed|es|s)$/, "");
  return ALIASES[stem] ?? stem;
}

export function words(q: string): Set<string> {
  let s = q.toLowerCase().replace(/[’`]/g, "'");
  for (const [k, v] of Object.entries(PHRASES)) s = s.replace(new RegExp(`\\b${k}(?=\\W|$)`, "g"), v);
  const out = new Set<string>();
  for (const raw of s.replace(/[^a-z0-9' ]+/g, " ").split(/\s+/)) {
    const w = raw.replace(/'/g, "");
    if (w) out.add(canon(w));
  }
  return out;
}

const VERDICT_WORD: Record<Verdict, string> = {
  CLEAN: "Clean",
  TAMPERING_DETECTED: "Tampering detected",
  OBSERVED_OMISSION: "Observed omission",
  CONFLICTING_ATTESTATIONS: "Conflicting attestations",
  REPORTING_GAP: "Reporting gap",
  INCONCLUSIVE: "Inconclusive",
};
const VERDICT_MEANS: Record<Verdict, string> = {
  CLEAN: "every record the host committed still matches the Merkle roots anchored on-chain, and the host reported every session the witnesses signed.",
  TAMPERING_DETECTED: "some host records no longer match what was committed on-chain: they were altered, erased or injected after anchoring. The vault still holds the originals.",
  OBSERVED_OMISSION: "both witnesses, the gateway and the identity plane, signed a session that the host never reported. That proves the records differ, not who caused it or why.",
  CONFLICTING_ATTESTATIONS: "only one of the two witnesses signed a session, and neither the other witness nor the host has a record of it. One witness is wrong or compromised, so nothing is concluded about the host.",
  REPORTING_GAP: "the host's agent missed a signed heartbeat deadline. A gap alone is not called an intrusion; it says the host went quiet.",
  INCONCLUSIVE: "the check could not finish (for example the chain was unreachable or a signature was invalid), so the host was not attested.",
};

const ATTACK: WickAction = { label: "Open the Attack Lab", href: "/attack" };
const DEMO: WickAction = { label: "Open the guided demo", href: "/demo" };
const CASE: WickAction = { label: "Open the missing session", href: "/#top", openCase: true };
const HOW: WickAction = { label: "How was this verified?", href: "/#how-verified", openHow: true };
const VERIFY: WickAction = { label: "Verify a real record", href: "/#seal" };

const PAGES: { prefix: string; name: string; what: string }[] = [
  { prefix: "/attack", name: "Attack Lab", what: "the server's log store on the left, as an attacker can change it, and what was committed on-chain on the right. Run an attack, then press Verify integrity." },
  { prefix: "/dashboard", name: "Security Dashboard", what: "the verdict of the last verification run, one tick per record, and how many records the host, the vault and the chain each hold." },
  { prefix: "/evidence", name: "Evidence Explorer", what: "every record with its status. Pick one to see its fields, its Merkle proof, and to verify it against the chain in your browser." },
  { prefix: "/auditor", name: "Auditor", what: "a place to load an evidence bundle and verify it in your own browser, without trusting the LEASH backend." },
  { prefix: "/proofs", name: "Blockchain Proofs", what: "each anchored batch with its Merkle root, transaction and receipt, read back from the contract." },
  { prefix: "/demo", name: "Guided Demo", what: "seven steps run against the real backend and chain. Press Run the full story, or Next step to go one scene at a time." },
  { prefix: "/validation", name: "Validation", what: "randomized attack trials that measure detection precision, recall, latency and gas." },
  { prefix: "/architecture", name: "Architecture", what: "the trust zones (host, collector, vault, chain, auditor) and how evidence moves between them." },
];
const pageOf = (path: string) => PAGES.find((p) => path.startsWith(p.prefix));
const isVerifyPage = (path: string) => !!pageOf(path);

function liveSummary(c: WickContext): WickReply {
  if (!c.live) return { text: "I couldn't read the verification state yet. Try asking again in a moment." };
  if (!c.live.ok) return { text: `I can't reach the LEASH API (${c.live.error}), so I can't say what was verified. Start the stack with scripts\\start-all.cmd.` };
  const last = c.live.last;
  if (!last) {
    return {
      text: "Nothing has been verified on this stack yet, so there is no result to explain. Press Verify integrity in the Attack Lab, or Verify now on the Dashboard, to run the real check.",
      action: c.path.startsWith("/attack") ? undefined : ATTACK,
    };
  }
  const s = last.summary;
  const witness = s.witness_observations ? ` The witness signed ${s.witness_observations} SSH session${s.witness_observations === 1 ? "" : "s"}.` : "";
  return {
    text: `The last real run (#${last.run_id}) recomputed ${s.total_records} records from the host's log store and compared them with the roots anchored on-chain: ${s.intact} intact, ${s.modified} altered, ${s.deleted} erased, ${s.injected} fabricated.${witness} Verdict: ${VERDICT_WORD[last.verdict]}.`,
    action: { label: "See the records", href: "/evidence" },
  };
}

type Topic = { id: string; terms: string[]; live?: (c: WickContext) => boolean; reply: (c: WickContext) => WickReply };

/** The seal press's real result, in one or two sentences. */
const sealSays = (r: SealResult) =>
  `The verification checked record #${r.seq} from this stack against the root anchored on chain ${r.chainId ?? "?"}${r.block ? ` (block ${r.block})` : ""}. The original ${r.original ? "matches" : "does not match"}; the altered copy ${r.altered ? "matches" : "does not match"}, because changing one detail changes its digest.`;

/** "What am I looking at?" in each part of the homepage (once the case is open, the case answer below). */
const ROOM_HERE: Record<Room, (c: WickContext) => WickReply> = {
  gate: () => ({ text: "You're looking at a server rack. Drag it to turn it: one blade is dark, 02:14:06, a session the network tap signed and the host never logged. Click it, or press Investigate the missing session.", action: CASE }),
  seal: (c) => (c.seal ? { text: sealSays(c.seal), action: HOW } : { text: "This part checks a real record from this stack, and a copy with one detail changed, against the root anchored on-chain. Press Verify evidence." }),
};

export const TOPICS: Topic[] = [
  {
    id: "here",
    terms: ["look at", "what look", "what happen", "this page", "explain page", "explain this", "what page", "where am"],
    live: (c) => isVerifyPage(c.path),
    reply: (c) => {
      if (c.path === "/" && c.compared && c.room !== "seal")
        return { text: `${CASE_RESULT} The marked row at 02:14:06 is a session by deploy from 203.0.113.45: the network tap signed it, the server logged nothing.`, action: VERIFY };
      if (c.path === "/") return ROOM_HERE[c.room ?? "gate"](c);
      const p = pageOf(c.path);
      if (!p) return { text: "This page is part of the LEASH console. Ask me what LEASH does, or where to see the demo." };
      const last = c.live?.ok ? c.live.last : undefined;
      const state = c.live?.ok ? (last ? ` The last verification here says ${VERDICT_WORD[last.verdict]}.` : " Nothing has been verified yet.") : "";
      return { text: `This is the ${p.name}: ${p.what}${state}` };
    },
  },
  {
    id: "gap",
    terms: ["gap", "this gap", "gap prove", "gap mean", "what gap", "prove", "why gap", "who log", "who record", "who attack"],
    reply: (c) => ({
      text:
        c.path === "/" && !c.compared
          ? "The gap is the dark blade in the rack: open the case to see it next to the witness record. It proves the records differ: a signed observer saw a session the server never logged. It does not prove who removed it or why."
          : "It proves the two records differ: a signed observer saw a session that the server never logged. It does not prove who removed the entry or why; a stopped logger, a crash and an attacker look the same until someone investigates.",
      action: c.path === "/" && c.seal ? HOW : c.path === "/" && c.compared ? VERIFY : c.path === "/" ? CASE : undefined,
    }),
  },
  {
    id: "second",
    terms: ["second record", "where from", "record from", "witness", "second"],
    reply: (c) => ({
      text: "It comes from a gateway witness on the network path. It signs each SSH session it sees with its own key and stores it outside the server. In this prototype it is logically isolated (its own key, store and registry) but runs on the same machine.",
      action: c.path !== "/" ? ATTACK : c.compared ? HOW : CASE,
    }),
  },
  {
    id: "verified",
    terms: ["what verify", "verify", "how verify", "who verify", "verify this"],
    live: (c) => isVerifyPage(c.path),
    reply: (c) => {
      if (isVerifyPage(c.path)) return liveSummary(c);
      return {
        text: c.path === "/" && c.seal ? sealSays(c.seal) : "Nothing on the homepage is a live verification except the Verify step: the case is a curated sample. It shows how the real rule works; the Attack Lab runs it against the real witness and chain.",
        action: c.compared ? HOW : ATTACK,
      };
    },
  },
  {
    id: "result",
    terms: ["result", "result mean", "what result", "this mean", "what mean"],
    live: (c) => isVerifyPage(c.path),
    reply: (c) => {
      if (c.path === "/" && c.seal) return { text: sealSays(c.seal), action: HOW };
      if (c.path === "/") return { text: `${CASE_RESULT} That is a sample result, not a live one.`, action: c.compared ? HOW : CASE };
      if (c.live?.ok && c.live.last) return { text: `The last run says ${VERDICT_WORD[c.live.last.verdict]}: ${VERDICT_MEANS[c.live.last.verdict]}`, action: { label: "Open the Dashboard", href: "/dashboard" } };
      if (c.live?.ok) return { text: "There is no result yet: nothing has been verified on this stack. Run Verify integrity in the Attack Lab first.", action: c.path.startsWith("/attack") ? undefined : ATTACK };
      return liveSummary(c);
    },
  },
  {
    id: "pricing",
    terms: ["pricing", "contact", "how pricing", "pricing team"],
    reply: () => ({
      text: "This project has no pricing page or sales contact yet, so I can't quote anything. The way to try LEASH today is the live demo, which runs on your own machine.",
      action: DEMO,
    }),
  },
  {
    id: "try",
    terms: ["try", "team try", "how try", "try this", "try leash", "get try", "how run", "run this", "run leash"],
    reply: () => ({
      text: "Run scripts\\start-all.cmd on Windows: it starts a local chain, the API and this site. Then use the Attack Lab or the guided demo; there is no hosted trial or sales contact yet.",
      action: ATTACK,
    }),
  },
  {
    id: "demo",
    terms: ["demo", "show demo", "show me", "show leash"],
    reply: () => ({ text: "The guided demo runs the whole story in seven steps against the real backend and chain: collect, anchor, attack, detect and recover.", action: DEMO }),
  },
  {
    id: "about",
    terms: ["what this for", "what is this", "what leash", "what leash do", "what this do", "purpose", "why use", "team use", "use leash", "use this", "explain leash", "what about", "leash"],
    reply: (c) => ({
      text: "LEASH BLACKBOX keeps an independent, tamper-evident copy of a server's security logs. If an attacker later edits or deletes lines on the server, or the server never reports a session, your team can show exactly what differs.",
      action: c.path === "/" ? CASE : ATTACK,
    }),
  },
  {
    id: "chain",
    terms: ["chain", "why chain", "chain use"],
    reply: () => ({
      text: "Only Merkle roots go on-chain (a local Hardhat EVM in this demo); the events stay off-chain in the vault. The chain gives an append-only, timestamped commitment that the server's admin cannot rewrite.",
      action: { label: "See the anchored batches", href: "/proofs" },
    }),
  },
  {
    id: "hash",
    terms: ["hash", "how hash", "how work", "how leash work", "how this work"],
    reply: () => ({
      text: "Each event is canonicalized and hashed with SHA-256, linked into a hash chain, and sealed into Merkle batches whose roots are anchored on-chain. Changing one byte of one record changes its leaf and breaks the proof.",
      action: { label: "Open Blockchain Proofs", href: "/proofs" },
    }),
  },
  {
    id: "audit",
    terms: ["audit", "verify myself", "audit verify"],
    reply: () => ({
      text: "Yes: the Auditor page verifies an evidence bundle in your own browser, and verifier/leash_verify.py is a standalone stdlib-only CLI that needs no LEASH code.",
      action: { label: "Open the Auditor", href: "/auditor" },
    }),
  },
  {
    id: "attack",
    terms: ["attack", "what attack", "attack detect", "attack catch", "show attack"],
    reply: () => ({
      text: "It catches host records that were altered, erased or injected after anchoring, sessions the host never reported (the witness), and host agents that go quiet (signed heartbeats).",
      action: ATTACK,
    }),
  },
  {
    id: "heartbeat",
    terms: ["heartbeat"],
    reply: () => ({
      text: "The host's agent signs a heartbeat every 15 seconds. If one is late or missing by the collector's clock, the verdict is Reporting gap. That says the host went quiet; it is not called an intrusion on its own.",
      action: ATTACK,
    }),
  },
  {
    id: "dispute",
    terms: ["dispute"],
    reply: () => ({
      text: "After an omission or a gap, Commit dispute on-chain freezes the findings into a canonical package and puts only its SHA-256 on-chain. Anyone can later re-derive the digest from the package and compare.",
      action: ATTACK,
    }),
  },
  {
    id: "limit",
    terms: ["limit", "what limit", "limit prove"],
    reply: () => ({
      text: "Honest limits: the witness runs on the same machine in this prototype, an omission shows silence rather than its cause, and events not yet anchored are protected only by the vault being separate.",
      action: { label: "See the architecture", href: "/architecture" },
    }),
  },
  {
    id: "theme",
    terms: ["theme", "theme switch", "change theme"],
    reply: () => ({ text: "Use the System, Light and Dark control at the top right, or in the menu on a phone. I change armour with the theme." }),
  },
  { id: "you", terms: ["who you", "what you", "you name"], reply: () => ({ text: "I'm Wick, this site's guide. I answer from this site's own documentation, right here in your browser; no AI service is involved." }) },
  ...PAGES.filter((p) => ["/evidence", "/dashboard", "/validation", "/architecture"].includes(p.prefix)).map(
    (p): Topic => ({
      id: p.prefix.slice(1),
      terms: [p.prefix.slice(1), `${p.prefix.slice(1)} show`],
      reply: () => ({ text: `The ${p.name} shows ${p.what}`, action: { label: `Open the ${p.name}`, href: p.prefix } }),
    }),
  ),
  { id: "hello", terms: ["hello"], reply: (c) => ({ text: "Hello! Ask me what LEASH does, or what you're looking at on this page.", action: c.path === "/" ? CASE : undefined }) },
  { id: "thanks", terms: ["thanks"], reply: () => ({ text: "Glad to help. I'll be here in the corner." }) },
];

/** Topic for a question, or null when nothing matches. */
export function match(question: string): Topic | null {
  const w = words(question);
  let best: Topic | null = null;
  let bestScore = 0;
  for (const t of TOPICS) {
    let score = 0;
    for (const term of t.terms) {
      const parts = term.split(" ");
      if (parts.every((p) => w.has(p))) score += parts.length;
    }
    if (score > bestScore) [best, bestScore] = [t, score];
  }
  return best;
}

export const FALLBACK = (c: WickContext): WickReply => ({
  text: "I don't have that in this project's documentation, so I won't guess. I can explain what LEASH does, the sample case, or what a verification result means.",
  action: c.path === "/" ? CASE : DEMO,
});

/** Suggested prompts change with the page and the case state. */
export function suggestions(c: WickContext): string[] {
  if (c.path === "/" && c.room === "seal") return ["What was verified?", "What does this result mean?", "How can my team try this?"];
  if (c.path === "/") return c.compared ? ["What does this gap prove?", "Where did the second record come from?", "How can my team try this?"] : ["What does LEASH do?", "Show me the demo.", "What am I looking at?"];
  if (["/attack", "/dashboard", "/auditor", "/evidence", "/proofs"].some((p) => c.path.startsWith(p))) return ["What was verified?", "What does this result mean?", "What am I looking at?"];
  return ["What am I looking at?", "What does LEASH do?", "How can my team try this?"];
}
