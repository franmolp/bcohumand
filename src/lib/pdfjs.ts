// Carga PDF.js con su worker local (sin CDN, anda en Safari del iPhone) y el complemento para navegadores que
// todavía no tienen Map.getOrInsertComputed (lo usa PDF.js 6): en la página acá y en el worker con pdf.worker.compat.mjs
function completarMap() {
  for (const C of [Map, WeakMap] as unknown as { prototype: object }[]) {
    const pr = C.prototype as { has(k: unknown): boolean; get(k: unknown): unknown; set(k: unknown, v: unknown): void; getOrInsertComputed?: unknown; getOrInsert?: unknown }
    if (!pr.getOrInsertComputed) Object.defineProperty(pr, 'getOrInsertComputed', { configurable: true, writable: true, value(this: typeof pr, k: unknown, f: (k: unknown) => unknown) { if (!this.has(k)) this.set(k, f(k)); return this.get(k) } })
    if (!pr.getOrInsert) Object.defineProperty(pr, 'getOrInsert', { configurable: true, writable: true, value(this: typeof pr, k: unknown, v: unknown) { if (!this.has(k)) this.set(k, v); return this.get(k) } })
  }
}

let cargado: unknown = null
export async function cargarPdfjs<T>(): Promise<T> {
  if (cargado) return cargado as T
  completarMap()
  const m = await import('pdfjs-dist') as unknown as { GlobalWorkerOptions: { workerSrc: string } }
  m.GlobalWorkerOptions.workerSrc = '/pdf.worker.compat.mjs'
  return (cargado = m) as T
}
