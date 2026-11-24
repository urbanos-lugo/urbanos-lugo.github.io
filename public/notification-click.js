// Loaded into the service worker (vite.config.ts): a notification it showed opens the app that asked for it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { scope } = self.registration;
  // The page that asked is not this worker's yet on a first visit, and the host may hold other sites.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((pages) => {
      const page = pages.find(({ url }) => url.startsWith(scope));
      return page ? page.focus() : self.clients.openWindow(scope);
    }),
  );
});
