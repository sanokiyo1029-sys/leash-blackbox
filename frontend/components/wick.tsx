"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, MessageSquareText, X } from "lucide-react";
import { api } from "@/lib/api";
import { setCase, useCase } from "@/lib/case-state";
import type { Status } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FALLBACK, match, suggestions, type WickAction, type WickContext, type WickReply } from "@/lib/wick-kb";

type Msg = { id: number; from: "you" | "wick"; text: string; action?: WickAction };


/** iOS keeps fixed elements under the keyboard; lift the sheet by the part of the layout viewport it covers. */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/** One shared assistant for the whole site (mounted once in the app shell, so it survives navigation and theme switches). */
export function Wick() {
  const path = usePathname();
  const { room, seal, begun } = useCase();
  const compared = begun; // the case card is open: the discrepancy is on screen
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [announce, setAnnounce] = useState("");
  const launcher = useRef<HTMLButtonElement>(null);
  const nextId = useRef(0);

  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || pending) return;
    setMsgs((m) => [...m, { id: nextId.current++, from: "you", text }]);
    const ctx: WickContext = { path, compared, room, seal };
    const topic = match(text);
    if (topic?.live?.(ctx)) {
      setPending(true);
      try {
        ctx.live = { ok: true, last: (await api<Status>("/api/status")).last_verification };
      } catch (e) {
        ctx.live = { ok: false, error: e instanceof Error ? e.message : String(e) };
      } finally {
        setPending(false);
      }
    }
    const reply: WickReply = topic ? topic.reply(ctx) : FALLBACK(ctx);
    setMsgs((m) => [...m, { id: nextId.current++, from: "wick", ...reply }]);
    setAnnounce(`Wick: ${reply.text}${reply.action ? ` Link: ${reply.action.label}.` : ""}`);
  };

  return (
    <>
      {open && (
        <WickPanel
          msgs={msgs}
          draft={draft}
          setDraft={setDraft}
          pending={pending}
          chips={suggestions({ path, compared, room })}
          onAsk={(q, fromDraft) => {
            if (fromDraft) setDraft("");
            void ask(q);
          }}
          onClose={close}
          onFollow={(a) => {
            if (a.openHow) setCase({ howOpen: true });
            if (a.openCase) setCase({ begun: true });
            if (matchMedia("(max-width: 639px)").matches) setOpen(false); // phones: get the sheet out of the way of the page it opens
          }}
        />
      )}
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
      <button
        ref={launcher}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls="wick-panel"
        className={cn(
          "fixed right-[max(12px,env(safe-area-inset-right))] bottom-[max(12px,env(safe-area-inset-bottom))] z-[35] flex h-11 items-center gap-2 rounded-md border border-border bg-card px-3.5 text-foreground shadow-[var(--shadow-pop)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:right-5 sm:bottom-5",
          open && "max-sm:hidden",
        )}
      >
        <MessageSquareText className="size-4 text-primary" aria-hidden />
        <span className="text-sm font-semibold whitespace-nowrap">Ask Wick</span>
      </button>
    </>
  );
}

function WickPanel({
  msgs,
  draft,
  setDraft,
  pending,
  chips,
  onAsk,
  onClose,
  onFollow,
}: {
  msgs: Msg[];
  draft: string;
  setDraft: (v: string) => void;
  pending: boolean;
  chips: string[];
  onAsk: (q: string, fromDraft: boolean) => void;
  onClose: () => void;
  onFollow: (a: WickAction) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLOListElement>(null);
  const kb = useKeyboardInset();

  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [msgs.length, pending]);

  return (
    <section
      id="wick-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="wick-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      style={kb ? { bottom: kb } : undefined}
      className="fixed inset-x-0 bottom-0 z-[35] flex max-h-[85dvh] flex-col rounded-t-xl border border-border bg-popover pb-[env(safe-area-inset-bottom)] text-popover-foreground shadow-[var(--shadow-pop)] sm:inset-x-auto sm:right-5 sm:bottom-[72px] sm:max-h-[min(560px,calc(100dvh-150px))] sm:w-[380px] sm:rounded-xl sm:pb-0"
    >
      <header className="flex items-end gap-3 border-b border-border px-4 pt-3 pb-2.5">
        <div className="min-w-0 flex-1 pb-0.5">
          <h2 id="wick-title" className="font-display text-xl leading-none font-semibold">
            Wick
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Guide · answers from this site&apos;s own docs, no AI service</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Wick" className="mb-1 rounded-md p-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-4" />
        </button>
      </header>

      <ol ref={log} aria-label="Conversation with Wick" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 text-[14px] leading-relaxed">
        {msgs.length === 0 && <li className="text-muted-foreground">Hello, I&apos;m Wick. Ask me about LEASH, this page, or the sample case.</li>}
        {msgs.map((m) =>
          m.from === "you" ? (
            <li key={m.id} className="ml-8 rounded-lg bg-muted px-3 py-2">
              <span className="sr-only">You: </span>
              {m.text}
            </li>
          ) : (
            <li key={m.id} className="mr-4">
              <span className="sr-only">Wick: </span>
              {m.text}
              {m.action && (
                <Link
                  href={m.action.href}
                  onClick={() => onFollow(m.action!)}
                  className="mt-1.5 flex w-fit items-center gap-1 rounded-sm font-semibold text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {m.action.label} →
                </Link>
              )}
            </li>
          ),
        )}
        {pending && (
          <li className="text-muted-foreground" aria-hidden>
            Checking this stack&apos;s verification state…
          </li>
        )}
      </ol>

      <div className="border-t border-border px-4 pt-2.5 pb-3">
        <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Suggested questions" role="group">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onAsk(c, false)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground outline-none hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {c}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAsk(draft, true);
          }}
          className="flex items-center gap-2"
        >
          <label htmlFor="wick-input" className="sr-only">
            Ask Wick a question
          </label>
          <input
            ref={input}
            id="wick-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a question…"
            autoComplete="off"
            enterKeyHint="send"
            maxLength={300}
            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-[16px] outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim() || pending}
            className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </form>
      </div>
    </section>
  );
}
