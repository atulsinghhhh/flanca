"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button, Card, CardHead } from "@/components/ui/primitives";
import { getMyNotificationPreference, updateNotificationPreference } from "./actions";

const HOUR_LABEL = (h: number) => {
  const period = h < 12 ? "AM" : "PM";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${period}`;
};

/**
 * A person's own delivery preference — whether a push buzzes their phone at
 * all, and a window where it never should. It never touches the in-app
 * notification: that is always written, always here to read; this only
 * decides whether a device outside the app is disturbed.
 */
export function PreferencesCard() {
  const [loaded, setLoaded] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [quietOn, setQuietOn] = useState(false);
  const [start, setStart] = useState(22);
  const [end, setEnd] = useState(7);
  const [pending, start_] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyNotificationPreference().then((p) => {
      setPushEnabled(p.pushEnabled);
      setQuietOn(p.quietHoursStart != null && p.quietHoursEnd != null);
      if (p.quietHoursStart != null) setStart(p.quietHoursStart);
      if (p.quietHoursEnd != null) setEnd(p.quietHoursEnd);
      setLoaded(true);
    });
  }, []);

  function save() {
    setError(null);
    setSaved(false);
    start_(async () => {
      const r = await updateNotificationPreference({
        pushEnabled,
        quietHoursStart: quietOn ? start : null,
        quietHoursEnd: quietOn ? end : null,
      });
      if ("error" in r && r.error) {
        setError(r.error);
        return;
      }
      setSaved(true);
    });
  }

  if (!loaded) return null;

  return (
    <Card>
      <CardHead title="Notification settings" hint="Yours alone — this does not change what anyone else sees." />
      <div className="space-y-4 px-5 py-4">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[13.5px] font-medium">Push notifications</span>
          <input
            type="checkbox"
            checked={pushEnabled}
            onChange={(e) => setPushEnabled(e.target.checked)}
            className="size-4 accent-brand"
          />
        </label>

        <label className="flex items-center justify-between gap-3 border-t border-line pt-3.5">
          <span className="text-[13.5px] font-medium">Quiet hours</span>
          <input
            type="checkbox"
            checked={quietOn}
            onChange={(e) => setQuietOn(e.target.checked)}
            className="size-4 accent-brand"
          />
        </label>

        {quietOn ? (
          <div className="flex items-center gap-2.5 text-[13px]">
            <span className="text-ink-3">From</span>
            <select
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
              className="h-8.5 rounded-md border border-line-2 bg-white px-2 outline-none focus:border-brand"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{HOUR_LABEL(h)}</option>
              ))}
            </select>
            <span className="text-ink-3">to</span>
            <select
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
              className="h-8.5 rounded-md border border-line-2 bg-white px-2 outline-none focus:border-brand"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{HOUR_LABEL(h)}</option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-3">No quiet hours — push can arrive any time.</p>
        )}

        {error ? <p className="text-[12.5px] text-overdue">{error}</p> : null}

        <div className="flex items-center gap-3 border-t border-line pt-3.5">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Save
          </Button>
          {saved ? <span className="text-[12.5px] text-good">Saved.</span> : null}
        </div>
      </div>
    </Card>
  );
}
