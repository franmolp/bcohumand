self.addEventListener('push', (event) => {
  if (!event.data) return
  let data = {}
  try { data = event.data.json() } catch { data = { titulo: event.data.text(), mensaje: '' } }
  const title = 'BCOHumand'
  const body  = data.titulo + (data.mensaje ? ' · ' + data.mensaje : '')
  const options = {
    body,
    icon:  '/api/icons/192',
    badge: '/api/icons/72',
    data:  { url: data.url || '/dashboard/notificaciones' },
    vibrate: [200, 100, 200],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard/notificaciones'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
