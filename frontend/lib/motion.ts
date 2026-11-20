/** Central motion tokens. Durations in seconds; easings as cubic-bezier tuples. */

export const ease = {
  out: [0.22, 1, 0.36, 1] as const, // expo-out: quick start, soft landing
  inOut: [0.65, 0, 0.35, 1] as const,
  sharp: [0.4, 0, 0.2, 1] as const,
};

export const dur = {
  instant: 0.12,
  fast: 0.18,
  base: 0.28,
  slow: 0.45,
  dramatic: 0.7,
};

export const spring = {
  snappy: { type: "spring" as const, stiffness: 520, damping: 38, mass: 0.8 },
  soft: { type: "spring" as const, stiffness: 260, damping: 30 },
};

export const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: dur.base, ease: ease.out },
};

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: dur.fast, ease: ease.out },
};

/** Stagger helper for list entrances; capped so long lists never feel slow. */
export function stagger(index: number, step = 0.035, max = 0.4) {
  return { duration: dur.base, ease: ease.out, delay: Math.min(index * step, max) };
}
