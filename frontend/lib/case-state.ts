"use client";

import { useSyncExternalStore } from "react";

/** The demo case's one-sentence result: the case card shows it and Wick quotes it. */
export const CASE_RESULT = "The independent record contains a session that is missing from this server log.";

/** The homepage's two places, in scroll order (sections with data-room). */
export const ROOMS = ["gate", "seal"] as const;
export type Room = (typeof ROOMS)[number];

/** What the live verification found (set only after a real verification ran). */
export type SealResult = { seq: number; original: boolean; altered: boolean; block: number | null; chainId: number | null };

/** The homepage's visible state, shared by the page, the 3D rack and Wick, so all three agree. */
export type CaseState = {
  room: Room;
  begun: boolean; // the case card is open: the missing session is on screen
  seal: SealResult | null;
  howOpen: boolean;
};

const INITIAL: CaseState = { room: "gate", begun: false, seal: null, howOpen: false };
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
