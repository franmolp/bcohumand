// Completa Map/WeakMap.getOrInsertComputed (lo usa PDF.js y todavía no está en todos los navegadores, p. ej. Safari)
for (const C of [Map, WeakMap]) {
  const p = C.prototype
  if (!p.getOrInsertComputed) Object.defineProperty(p, 'getOrInsertComputed', { configurable: true, writable: true, value(k, f) { if (!this.has(k)) this.set(k, f(k)); return this.get(k) } })
  if (!p.getOrInsert) Object.defineProperty(p, 'getOrInsert', { configurable: true, writable: true, value(k, v) { if (!this.has(k)) this.set(k, v); return this.get(k) } })
}
