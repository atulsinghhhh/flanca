"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { removePushSubscription, savePushSubscription } from "./actions";

type State = "checking" | "unsupported" | "blocked" | "off" | "on";

/**
 * "Notify me on this device."
 *
 * Per device, not per account: a parent's phone and their laptop are two separate
 * agreements, and revoking one must not silence the other. The browser holds the
 * real permission, so this reads the browser's state rather than remembering a
 * setting of its own — the two would drift the moment somebody cleared their site
 * data, and then the school would think a parent was reachable when they were not.
 */
export function NotifyToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function read() {
      if (!publicKey) return setState("unsupported");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");

      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setState(existing ? "on" : "off");
      } catch {
        if (!cancelled) setState("unsupported");
      }
    }

    read();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  function turnOn() {
    setError(null);
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          return;
        }

        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey as string,
        });

        const json = sub.toJSON();
        const r = await savePushSubscription({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          userAgent: navigator.userAgent,
        });
        if ("error" in r && r.error) {
          setError(r.error);
          return;
        }
        setState("on");
      } catch (e) {
        setError(e instanceof Error ? e.message : "This browser refused to subscribe.");
      }
    });
  }

  function turnOff() {
    setError(null);
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    });
  }

  if (state === "checking") return null;

  if (state === "unsupported") {
    return (
      <p className="text-[12.5px] text-ink-3">
        This browser cannot show notifications. You will still see everything here when you open the app.
      </p>
    );
  }

  if (state === "blocked") {
    return (
      <p className="text-[12.5px] text-ink-3">
        Notifications are blocked for this site in your browser settings. Unblock them there and reload to
        be told when a message arrives.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={state === "on" ? turnOff : turnOn}
        disabled={pending}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:text-brand-dark disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : state === "on" ? (
          <BellOff className="size-3.5" />
        ) : (
          <Bell className="size-3.5" />
        )}
        {state === "on" ? "Stop notifying this device" : "Notify me on this device"}
      </button>
      <span className="text-[12px] text-ink-3">
        {state === "on"
          ? "This device will be told when a message arrives. No SMS, nothing to pay for."
          : "Free — it goes straight to this browser, not through WhatsApp or SMS."}
      </span>
      {error ? <span className="text-[12px] text-overdue">{error}</span> : null}
    </div>
  );
}
