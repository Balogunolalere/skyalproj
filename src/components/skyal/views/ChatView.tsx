"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type ViewId } from "../data";
import { Coord, Heading } from "../primitives";
import { Logo } from "../Logo";
import { Send, Trash2, Loader2, AlertCircle, RotateCcw, Paperclip, X } from "lucide-react";

interface Msg {
  id: string;
  who: "support" | "customer";
  text: string;
  time: string;
  error?: boolean;
  image?: string;
}

const SUGGESTIONS = [
  "What services do you offer?",
  "How much does fabric cutting cost?",
  "How long does an order take?",
  "What materials can you cut?",
];

const WELCOME =
  "Hi! I'm the Skyal assistant. I can help with quotes, order tracking, materials and turnaround times. What are you cutting?";

function now() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function ChatView({
  onNavigate: _onNavigate,
}: {
  onNavigate: (v: ViewId) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMsgs([{ id: "w", who: "support", text: WELCOME, time: now() }]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if ((!clean && !pendingImage) || busy) return;
      const userMsg: Msg = {
        id: `u-${Date.now()}`,
        who: "customer",
        text: clean || "(image attached)",
        time: now(),
        image: pendingImage ?? undefined,
      };
      const history = [...msgs, userMsg];
      setMsgs(history);
      setInput("");
      const image = pendingImage;
      setPendingImage(null);
      setBusy(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history
              .filter((m) => !m.error && m.id !== "w")
              .map((m) => ({ role: m.who === "support" ? "assistant" : "user", content: m.text })),
          }),
        });
        const data = await res.json();
        setMsgs((prev) => [
          ...prev,
          {
            id: `s-${Date.now()}`,
            who: "support",
            text: data.reply || "(no response)",
            time: now(),
            error: data.error,
          },
        ]);
      } catch {
        setMsgs((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            who: "support",
            text: "Connection dropped. Try again.",
            time: now(),
            error: true,
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, msgs, pendingImage],
  );

  const clear = () => {
    setMsgs([{ id: "w2", who: "support", text: WELCOME, time: now() }]);
    setInput("");
    setPendingImage(null);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPendingImage(r.result as string);
    r.readAsDataURL(f);
    e.target.value = "";
  };

  return (
    <div className="max-w-[860px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
      <Coord>AI CUSTOMER SUPPORT</Coord>
      <Heading className="text-4xl sm:text-5xl lg:text-6xl mt-4">
        We&apos;re here to help
      </Heading>
      <p className="text-base text-thread mt-6 max-w-[460px] leading-relaxed">
        Chat with the Skyal assistant about quotes, materials, tracking and
        more. Powered by a real LLM — available 24/7.
      </p>

      <div className="mt-8 bg-vellum border border-hairline">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-hairline">
          <div className="flex items-center gap-3 min-w-0">
            <Logo className="text-xl -mb-0.5" />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] px-1.5 py-0.5 bg-ink text-bone">
              AI
            </span>
            <span className="text-xs text-laser flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 bg-laser rounded-full animate-laser-pulse" />
              <span className="truncate">online · quotes prices, tracks orders</span>
            </span>
          </div>
          <button
            onClick={clear}
            className="inline-flex items-center gap-1.5 text-xs text-thread hover:text-ink transition-colors shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Clear</span>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="min-h-[380px] max-h-[560px] overflow-y-auto p-5 space-y-4 bg-bone">
          {msgs.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.who === "customer" ? "flex-row-reverse" : ""}`}>
              <div
                className={`w-8 h-8 shrink-0 flex items-center justify-center text-[11px] font-bold ${
                  m.who === "support" ? "bg-laser text-white" : "bg-ink text-bone"
                }`}
              >
                {m.who === "support" ? "S" : "You"}
              </div>
              <div className={`max-w-[78%] ${m.who === "customer" ? "text-right" : ""}`}>
                {m.image && (
                  <img src={m.image} alt="attachment" className={`mb-1.5 max-w-[200px] border border-hairline ${m.who === "customer" ? "ml-auto" : ""}`} />
                )}
                <div
                  className={`inline-block px-4 py-2.5 text-sm leading-relaxed text-left ${
                    m.error
                      ? "bg-oxblood/10 text-oxblood border border-oxblood/30"
                      : m.who === "support"
                        ? "bg-vellum text-ink border border-hairline"
                        : "bg-ink text-bone"
                  }`}
                >
                  {m.error && <AlertCircle className="w-4 h-4 inline mr-1.5 align-text-bottom" />}
                  <span className="whitespace-pre-wrap">{m.text}</span>
                </div>
                <div className={`text-[10px] text-thread mt-1 font-mono ${m.who === "customer" ? "text-right" : ""}`}>
                  {m.time}
                </div>
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex gap-3">
              <div className="w-8 h-8 shrink-0 bg-laser flex items-center justify-center text-[11px] font-bold text-white">S</div>
              <div className="bg-vellum border border-hairline px-4 py-3 flex items-center gap-1.5">
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 bg-thread rounded-full animate-bounce"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Suggestions */}
        <div className="px-5 pt-3 pb-2 border-t border-hairline flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={busy}
              className="text-xs text-thread border border-hairline bg-bone px-3 py-1.5 hover:border-laser hover:text-ink transition-colors disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Pending image */}
        {pendingImage && (
          <div className="px-5 pt-2 flex">
            <div className="inline-flex items-center gap-2 border border-hairline bg-bone p-1.5 pr-3">
              <img src={pendingImage} alt="pending" className="w-10 h-10 object-cover" />
              <span className="text-xs text-thread">attached</span>
              <button onClick={() => setPendingImage(null)} className="text-thread hover:text-ink">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 px-5 py-3.5 border-t border-hairline"
        >
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="w-9 h-9 flex items-center justify-center text-thread hover:text-ink transition-colors disabled:opacity-40"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message…"
            className="flex-1 bg-transparent border-0 text-ink text-sm py-2 px-0 focus:outline-none placeholder:text-thread/50"
          />
          <button
            type="submit"
            disabled={busy || (!input.trim() && !pendingImage)}
            className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-4 py-2.5 hover:bg-laser hover:text-white transition-colors disabled:opacity-30"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">{busy ? "Sending" : "Send"}</span>
          </button>
        </form>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
        <div className="bg-vellum border border-hairline p-5">
          <Coord>OPERATING HOURS</Coord>
          <p className="text-sm text-thread mt-3 leading-relaxed">
            06:00–22:00 WAT · quotes within 4 hours during the window.
          </p>
        </div>
        <div className="bg-vellum border border-hairline p-5">
          <Coord>OTHER WAYS TO REACH US</Coord>
          <p className="text-sm text-thread mt-3 leading-relaxed">
            skyalservices@gmail.com · 0803 500 3068
          </p>
        </div>
      </div>
    </div>
  );
}
