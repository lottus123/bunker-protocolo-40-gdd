self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() || "Você recebeu uma atualização." };
  }

  const title = data.title || "Production Hub";
  const options = {
    body: data.body || "Você recebeu uma atualização.",
    icon: "./icons/icon.svg",
    badge: "./icons/icon.svg",
    data: { url: data.url || "./" },
    tag: data.tag || "production-hub",
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "./";

  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: "window", includeUncontrolled: true });

    for (const client of clientsList) {
      if ("focus" in client) {
        try {
          await client.navigate(target);
        } catch {}
        return client.focus();
      }
    }

    if (clients.openWindow) return clients.openWindow(target);
  })());
});
