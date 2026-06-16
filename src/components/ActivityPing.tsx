'use client'

import { useEffect } from 'react'

export default function ActivityPing() {
  useEffect(() => {
    fetch('/api/ping', { method: 'POST' }).catch(() => {})
  }, [])

  return null
}
