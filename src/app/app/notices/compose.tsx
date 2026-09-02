"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone, MessageCircle, Send, Smartphone } from "lucide-react";
import type { MessageChannel } from "@prisma/client";
import { Button } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/core/money";
import { publishCircular } from "./actions";

const AUDIENCES = [
  { value: "ALL", label: "Everyone" },
  { value: "PARENTS", label: "Parents" },
  { value: "TEACHERS", label: "Teachers" },
  { value: "STAFF", label: "All staff" },
  { value: "STUDENTS", label: "Students" },
];

const CHANNELS: Array<{ value: MessageChannel; label: string; cost: string; icon: React.ElementType }> = [
  { value: "IN_APP", label: "In the app", cost: "Free", icon: Send },
  { value: "WHATSAPP", label: "WhatsApp", cost: "₹0.25 each", icon: MessageCircle },
  { value: "SMS", label: "SMS", cost: "₹0.18 each", icon: Smartphone },
];

export function Compose({ classes }: { classes: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("PARENTS");
  const [isPublic, setIsPublic] = useState(false);
  const [channels, setChannels] = useState<MessageChannel[]>(["IN_APP"]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleChannel(c: MessageChannel) {
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function submit() {
    setError(null);
    setResult(null);
    start(async () => {
      const r = await publishCircular({ title, body, audience, isPublic, channels });
      if (r.error) {
        setError(r.error);
        return;
      }
      setResult(
        `Sent to ${r.inApp} people in the app${r.queued ? `, ${r.queued} messages queued costing ${formatMoney(r.costPaise ?? 0)}` : ""}${r.noPhone ? ` · ${r.noPhone} had no mobile on record` : ""}.`,
      );
      setTitle("");
      setBody("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Megaphone className="size-4" /> New circular
      </Button>
    );
  }

  return (
    <div className="card mb-5 overflow-hidden">
      <header className="border-b border-line px-5 py-3">
        <h2 className="text-[15px] font-semibold">New circular</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          In-app delivery is free. Paid channels show their cost before you send.
        </p>
      </header>

      <div className="space-y-4 px-5 py-4">
        <div>
          <label htmlFor="title" className="eyebrow text-ink-3 mb-1 block">
            Title
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Half Yearly examination datesheet"
            className="h-10 w-full rounded-md border border-line-2 bg-white px-3 text-[14.5px] outline-none focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor="body" className="eyebrow text-ink-3 mb-1 block">
            Message
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Write it the way you would say it to a parent."
            className="w-full rounded-md border border-line-2 bg-white px-3 py-2 text-[14px] outline-none focus:border-brand"
          />
          <p className="mt-1 text-[11.5px] text-ink-3">
            {body.length} characters · SMS is billed per 160 characters
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="audience" className="eyebrow text-ink-3 mb-1 block">
              Who should get this?
            </label>
            <select
              id="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
              {classes.map((c) => (
                <option key={c.id} value={`CLASS:${c.id}`}>
                  Parents of {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="eyebrow text-ink-3 mb-1">How should it go out?</p>
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => {
                const Icon = c.icon;
                const on = channels.includes(c.value);
                return (
                  <button
                    key={c.value}
                    onClick={() => toggleChannel(c.value)}
                    className={`inline-flex items-center gap-1.5 rounded-md border-2 px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                      on ? "border-brand bg-brand-light text-brand-ink" : "border-line bg-white text-ink-3 hover:bg-paper-2"
                    }`}
                  >
                    <Icon className="size-3.5" /> {c.label}
                    <span className="font-normal opacity-70">{c.cost}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="size-3.5 accent-[var(--color-brand)]"
          />
          Also show this on the school&rsquo;s public page
        </label>

        {error ? (
          <p className="rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13px] text-overdue">
            {error}
          </p>
        ) : null}
        {result ? (
          <p className="rounded-md border border-good/25 bg-good-light px-3 py-2 text-[13px] text-good">
            {result}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={submit} disabled={pending || !title.trim() || !body.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Publish circular
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
