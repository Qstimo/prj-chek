// Service worker уведомлений CAIRN.
//
// Собирать его компонентом нельзя: браузер требует отдельный файл в
// корневой области видимости. Логики здесь нет намеренно — всё, что
// можно решить на сервере, решено там: заголовок, текст, адрес перехода
// и метка замены приходят готовыми.

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  const payload = event.data.json();

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // Метка равна адресу: новый пуш о том же адресе заменяет прежний,
      // а не копится рядом с ним.
      tag: payload.tag,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data && event.notification.data.url;

  if (!url) {
    return;
  }

  // Уже открытое окно приложения переиспользуется: второй таб CAIRN
  // человеку не нужен.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }

      return self.clients.openWindow(url);
    }),
  );
});
