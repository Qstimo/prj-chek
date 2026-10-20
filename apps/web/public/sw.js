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

  // Сравнивается путь, а не вхождение подстроки: адрес сводки — «/», и
  // он входит в любой адрес, поэтому `includes` фокусировал первое же
  // открытое окно CAIRN вместо страницы, на которую сам указывает.
  const target = new URL(url, self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).pathname === target.pathname && 'focus' in client) {
          return client.focus();
        }
      }

      // Нужной страницы нет ни в одном окне — открыть её.
      return self.clients.openWindow(target.href);
    }),
  );
});
