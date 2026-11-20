"use client";

import { useSyncExternalStore } from "react";

/** The demo case's one-sentence result: the courtyard shows it and Wick quotes it. */
export const CASE_RESULT = "The independent record contains a session that is missing from this server log.";

/** The tour's rooms, in scroll order (each is a section with data-room on the homepage). */
export const ROOMS = ["gate", "case", "maze", "undercroft", "seal"] as const;
export type Room = (typeof ROOMS)[number];

/** What the seal press found for the live sample (set only after a real verification ran). */
export type SealResult = { seq: number; original: boolean; altered: boolean; block: number | null; chainId: number | null };

/** The homepage tour's visible state, shared by the page, the 3D fortress and Wick, so all three agree. */
export type CaseState = {
  room: Room;
  begun: boolean; // the visitor pressed "Investigate": Wick's lantern is up
  towerLit: boolean; // the watchtower lamp (the witness)
  replayAt: number | null; // performance.now() when "Replay crossing" started
  witnessSeen: boolean; // the replayed crossing reached the observed threshold
  removed: string | null; // host ledger row removed in the undercroft demo (its time)
  revealAt: number | null; // the surviving witness row was selected: flash the crossing
  seal: SealResult | null;
  pulseAt: number | null; // evidence just became available: the lantern reacts
  howOpen: boolean;
};

const INITIAL: CaseState = {
  room: "gate", begun: false, towerLit: true, replayAt: null, witnessSeen: false,
  removed: null, revealAt: null, seal: null, pulseAt: null, howOpen: false,
};
let state = INITIAL;
const listeners = new Set<() => void>();

export function setCase(patch: Partial<CaseState>) {
  state = { ...state, ...patch };
  listeners.forEach((f) => f());
}
/** "Replay case": back to the opening state. */
export const resetCase = () => setCase({ ...INITIAL });

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
const get = () => state;

export const useCase = () => useSyncExternalStore(subscribe, get, get);
