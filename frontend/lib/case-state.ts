"use client";

import { useSyncExternalStore } from "react";

/**
 * The one incident the homepage is built around: a session the gateway witness signed and the server never logged.
 * Its id and time persist through every chapter. This case is labelled sample data on screen; the desk chapter runs
 * the same incident for real against this stack (silent_login, then verification).
 */
export const SESSION = { id: "ssh-7c41e2a9", time: "02:14:06", user: "deploy", ip: "203.0.113.45", host: "web-prod-01" } as const;

/** The case's one-sentence result: the guard desk shows it and Wick quotes it. */
export const CASE_RESULT = "The independent record contains a session that is missing from this server log.";

/** The homepage's chapters, in scroll order (sections with data-room). */
export const ROOMS = ["bridge", "gatehouse", "witness", "missing", "seal", "desk"] as const;
export type Room = (typeof ROOMS)[number];

/** What the live verification found (set only after a real verification ran). */
export type SealResult = { seq: number; original: boolean; altered: boolean; block: number | null; chainId: number | null };

/** The homepage's visible state, shared by the page, the 3D fortress and Wick, so all three agree. */
export type CaseState = {
  room: Room;
  revealed: boolean; // "Show altered server log" is on: the gap is on screen (Wick raises his lantern)
  seal: SealResult | null;
  howOpen: boolean;
};

const INITIAL: CaseState = { room: "bridge", revealed: false, seal: null, howOpen: false };
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
