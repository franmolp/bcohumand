'use client'

import { useEffect } from 'react'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function PushSubscriber() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    // Si el usuario bloqueó notificaciones, no insistir
    if (Notification.permission === 'denied') return

    async function subscribe() {
      try {
        const res = await fetch('/api/push/vapid-public-key')
        if (!res.ok) return
        const { publicKey } = await res.json()
        if (!publicKey) return

        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        await navigator.serviceWorker.ready

        let subscription = await registration.pushManager.getSubscription()
        const isNew = !subscription

        if (!subscription) {
          // Solo pedir permiso si todavía no fue decidido
          if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission()
            if (permission !== 'granted') return
          } else if (Notification.permission !== 'granted') {
            return
          }

          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
          })
        }

        // Guardar/actualizar suscripción en el servidor
        const saveRes = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription),
        })

        if (!saveRes.ok) {
          console.warn('[push] No se pudo guardar la suscripción:', await saveRes.text())
          return
        }

        // Si la suscripción es nueva, enviar notificación de prueba para confirmar
        if (isNew) {
          await fetch('/api/push/test', { method: 'POST' })
        }
      } catch (e) {
        console.warn('[push] Error al suscribir:', e)
      }
    }

    subscribe()
  }, [])

  return null
}
