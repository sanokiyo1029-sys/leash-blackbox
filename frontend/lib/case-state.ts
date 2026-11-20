"use client";

import { useSyncExternalStore } from "react";

/** The sample case's one-sentence result: the homepage shows it and Wick quotes it. */
export const CASE_RESULT = "The independent record contains a session that is missing from this server log.";

/** The homepage sample case's visible state, shared with Wick so its answers match what is on screen. */
export type CaseState = { compared: boolean; howOpen: boolean };

let state: CaseState = { compared: false, howOpen: false };
const listeners = new Set<() => void>();

export function setCase(patch: Partial<CaseState>) {
  state = { ...state, ...patch };
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
const get = () => state;

export const useCase = () => useSyncExternalStore(subscribe, get, get);
