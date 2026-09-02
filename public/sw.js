/*
 * Flanca's service worker. It does exactly two things, on purpose.
 *
 * There is no offline caching here. The attendance sheet already handles its own
 * offline case in localStorage (src/app/app/attendance/[sectionId]/mark-sheet.tsx),
 * and a half-cached school record is worse than an honest "you are offline" — a
 * clerk must never be shown a fee balance that was true yesterday.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let note;
  try {
    note = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(note.title || "Flanca", {
      body: note.body || "",
      // The tag collapses repeats: five messages in one conversation replace each
      // other rather than stacking five notifications on a parent's lock screen.
      tag: note.tag || "flanca",
      renotify: true,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: note.url || "/app/chat" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app/chat";

  // Reuse a tab that is already on the school rather than opening a fourth one.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("/app") && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
