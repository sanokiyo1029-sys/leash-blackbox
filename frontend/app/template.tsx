"use client";

import { motion } from "motion/react";
import { dur, ease } from "@/lib/motion";

/** Re-mounted on every navigation: a portcullis lifts over the page as it fades in (GPU-only; never blocks clicks). */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <>
      <motion.div
        aria-hidden
        className="portcullis pointer-events-none fixed inset-0 z-[60] origin-top"
        initial={{ scaleY: 1 }}
        animate={{ scaleY: 0 }}
        transition={{ duration: 0.55, ease: ease.inOut, delay: 0.05 }}
      />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.base, ease: ease.out }}>
        {children}
      </motion.div>
    </>
  );
}
