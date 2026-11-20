"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowDown, ArrowRight, PlayCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Homepage art, from the owner's reference images in public/art (one scene per theme, swapped by CSS, so a theme
 * switch never remounts anything). Webtoon pacing: a wide establishing shot, a scroll-driven push toward the one
 * lit archive window, and the close-up panel, then the case. Scrolling stays native (sticky + scroll-linked
 * transforms); reduced motion gets the still wide shot.
 */
export function Hero({ onOpen }: { onOpen: (e?: React.MouseEvent) => void }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const copyOut = useTransform(scrollYProgress, [0, 0.5], [1, reduce ? 1 : 0]);
  const copyY = useTransform(scrollYProgress, [0, 0.5], [0, reduce ? 0 : -40]);

  return (
    <section ref={ref} aria-labelledby="hero-title" className="relative h-[140svh] motion-reduce:h-auto">
      <div className="sticky top-14 h-[calc(100svh-56px)] overflow-hidden motion-reduce:static">
        {/* Placeholder sky until the animated castle (docs/design/CASTLE_DIRECTION.md) replaces it */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--sky-top),var(--sky-low))]" />
        {/* Readability: a scrim behind the copy (top on phones, left on desktop) */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,var(--hero-scrim)_0%,var(--hero-scrim)_34%,transparent_62%)] lg:bg-[linear-gradient(90deg,var(--hero-scrim)_0%,var(--hero-scrim)_30%,transparent_62%)]" />

        <motion.div style={{ opacity: copyOut, y: copyY }} className="pointer-events-none relative mx-auto flex h-full w-full max-w-[1320px] px-[clamp(20px,4vw,56px)] pt-8 lg:items-center lg:pt-0">
          <div className="pointer-events-auto max-w-[560px]">
            <p className="label-caps text-muted-foreground">Tamper-evident security evidence</p>
            <h1 id="hero-title" className="mt-3 font-display text-[clamp(38px,5.6vw,80px)] leading-[1.02] font-semibold text-balance lg:mt-4">
              The server log says nothing happened.
            </h1>
            <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-foreground/85 sm:text-[17px] lg:mt-5">
              LEASH BLACKBOX helps your security team compare a server&apos;s logs with independently preserved evidence.
            </p>
            <a href="#case" onClick={onOpen} className={cn(buttonVariants({ size: "lg" }), "mt-6 h-12 gap-2 px-5 text-[15px] lg:mt-8")}>
              Inspect the missing session. <ArrowDown className="size-4" />
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

const PANELS = [
  { title: "Sealed as it arrives", text: "Each event is hashed and linked to the one before it, then sealed into batches whose Merkle roots are anchored on-chain." },
  { title: "Kept off the server", text: "The collector copies every event into an append-only vault that the server's own admin cannot edit." },
  { title: "Watched from outside", text: "A gateway witness signs the sessions it sees, and the host's agent signs a heartbeat every 15 seconds." },
];

/** How the second record is kept: three panels, read left to right like a strip. */
export function HowPanels() {
  return (
    <section aria-labelledby="how-title" className="border-t border-border">
      <div className="mx-auto w-full max-w-[1120px] px-[clamp(20px,4vw,56px)] py-16">
        <h2 id="how-title" className="font-display text-[clamp(30px,3.6vw,44px)] leading-tight font-semibold">
          How LEASH keeps the second record
        </h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {PANELS.map((p, i) => (
            <li key={p.title}>
              <h3 className="text-[17px] font-semibold">
                <span className="mr-2 font-hash text-sm text-muted-foreground">0{i + 1}</span>
                {p.title}
              </h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{p.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** The conversion step. There is no pricing or contact destination in this project, so it is the live demo. */
export function NextStep() {
  return (
    <section aria-labelledby="next-title" className="border-t border-border">
      <div className="mx-auto w-full max-w-[1120px] px-[clamp(20px,4vw,56px)] pt-20 pb-28">
        <h2 id="next-title" className="max-w-[18ch] font-display text-[clamp(32px,4vw,52px)] leading-[1.05] font-semibold">
          See it happen for real
        </h2>
        <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-foreground/85">
          In the Attack Lab, <b>Go silent</b> stops the server&apos;s logger and logs in as deploy from 203.0.113.45. Then <b>Verify integrity</b> reports
          an observed omission from the real, signed witness record.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href="/attack" className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 px-5 text-[15px]")}>
            Run it in the Attack Lab <ArrowRight className="size-4" />
          </Link>
          <Link href="/demo" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 gap-2 px-5 text-[15px]")}>
            <PlayCircle className="size-4" /> Take the guided demo
          </Link>
        </div>
      </div>
    </section>
  );
}
