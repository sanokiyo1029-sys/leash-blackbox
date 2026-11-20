"use client";

import { motion } from "motion/react";
import { dur, ease } from "@/lib/motion";

/** Re-mounted on every navigation: a short, GPU-only fade/slide between pages. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.base, ease: ease.out }}>
      {children}
    </motion.div>
  );
}
