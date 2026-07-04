import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { PDFDocument } from 'pdf-lib'

export const maxDuration = 60

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MESES_RE = MESES.join('|')

function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '' }
function formatearNombrePDF(raw: string): string {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return raw
  if (parts.length === 1) return cap(parts[0])
  return cap(parts[1]) + ' ' + parts[0][0].toUpperCase()
}

// Extracción server-side con pdfjs legacy build (diseñado para Node.js)
async function extractarPaginas(buf: ArrayBuffer): Promise<Array<{ nombre: string; mesStr: string | null }>> {
  try {
    const { join } = await import('path')
    // El build principal (pdf.mjs) usa DOMMatrix y otras APIs de browser — falla en Node.js
    // El legacy build está específicamente preparado para Node.js
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

    const workerPath = join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs')
    ;(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
      `file://${workerPath}`

    const doc = await pdfjs.getDocument({ data: buf }).promise
    const out: Array<{ nombre: string; mesStr: string | null }> = []

    for (let i = 1; i <= doc.numPages; i++) {
      const page    = await doc.getPage(i)
      const content = await page.getTextContent()
      const strs    = (content.items as Array<{ str: string }>).map(it => it.str)
      const text    = strs.join(' ')

      // ── Mes ──────────────────────────────────────────────────────────────
      const mesM =
        text.match(new RegExp(`Per[ií]odo[\\s:]+(${MESES_RE})\\s+20\\d{2}`, 'i')) ??
        text.match(new RegExp(`Liquidaci[oó]n[\\s:]+(${MESES_RE})\\s+20\\d{2}`, 'i')) ??
        text.match(new RegExp(`\\b(${MESES_RE})\\s+20\\d{2}\\b`, 'i'))

      // ── Nombre — 5 estrategias ────────────────────────────────────────────
      let nombre = ''

      // S1: etiqueta "Apellido y Nombre:" → valor
      if (!nombre) {
        const m = text.match(
          /(?:Apellido\s+y\s+Nombre[s]?|Nombre[s]?\s+y\s+Apellido)\s*[:\-]?\s*(.{1,80}?)(?=\s{2,}|\s+CUIL|\s+DNI|\s+\d{2}[-.\s]\d|\s+Per[ií])/i
        )
        if (m?.[1]) {
          const c = m[1].trim().replace(/\s+/g, ' ')
          if (/[A-ZÁÉÍÓÚÜÑ]{2,}/.test(c) && !/^\d/.test(c)) nombre = c
        }
      }

      // S2: texto justo antes del número de CUIL (XX-XXXXXXXX-X o XX.XXXXXXXX.X)
      if (!nombre) {
        const cuilM = text.match(/\b(\d{2}[-.\s]\d{7,8}[-.\s]\d)\b/)
        if (cuilM) {
          const before = text
            .slice(Math.max(0, cuilM.index! - 220), cuilM.index!)
            .replace(/\bCUIL\s*[:\-]?\s*$/, '')
            .trimEnd()
          const m = before.match(/\b([A-ZÁÉÍÓÚÜÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÜÑ]{2,}){1,3})\s*$/)
          if (m?.[1]) nombre = m[1].trim()
        }
      }

      // S3: ítem "CUIL" en array → ítems ALL-CAPS anteriores
      if (!nombre) {
        for (let j = 0; j < strs.length; j++) {
          if (/^CUIL\s*:?$/i.test(strs[j].trim())) {
            const parts: string[] = []
            for (let k = j - 1; k >= Math.max(0, j - 12); k--) {
              const c = strs[k].trim()
              if (!c || /^[:\-\/·\s]+$/.test(c)) continue
              if (/^[A-ZÁÉÍÓÚÜÑ]{2,}(?: [A-ZÁÉÍÓÚÜÑ]{2,})*$/.test(c)) {
                parts.unshift(...c.split(/\s+/))
              } else break
            }
            if (parts.length >= 2) { nombre = parts.join(' '); break }
          }
        }
      }

      // S4: ítem con "apellido" → ítems ALL-CAPS siguientes
      if (!nombre) {
        const lower = strs.map(s => s.toLowerCase())
        for (let j = 0; j < lower.length; j++) {
          if (lower[j].includes('apellido')) {
            const parts: string[] = []
            for (let k = j + 1; k < Math.min(j + 25, strs.length); k++) {
              const c = strs[k].trim()
              if (!c || /^[:\-\/·\s]+$/.test(c)) continue
              if (/^[A-ZÁÉÍÓÚÜÑ]{2,}(?: [A-ZÁÉÍÓÚÜÑ]{2,})*$/.test(c) && !/^(CUIL|DNI)$/.test(c)) {
                parts.push(...c.split(/\s+/))
              } else if (parts.length > 0) break
            }
            if (parts.length >= 2) { nombre = parts.join(' '); break }
          }
        }
      }

      // S5: campos "Apellido:" y "Nombre:" separados
      if (!nombre) {
        const ap = text.match(/\bApellido\s*[:\-]\s*([A-ZÁÉÍÓÚÜÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÜÑ]{2,})*)/i)
        const nm = text.match(/\bNombres?\s*[:\-]\s*([A-ZÁÉÍÓÚÜÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÜÑ]{2,})*)/i)
        if (ap?.[1] && nm?.[1]) nombre = ap[1].trim() + ' ' + nm[1].trim()
        else if (ap?.[1]) nombre = ap[1].trim()
      }

      out.push({ nombre, mesStr: mesM ? mesM[1] : null })
    }
    return out
  } catch (e) {
    console.error('[extractarPaginas]', e)
    return []
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Error al leer el formulario' }, { status: 400 }) }

  const pdfFile   = formData.get('pdf')    as File | null
  const firmaBlob = formData.get('firma')  as Blob | null
  const mes       = parseInt(formData.get('mes')  as string || '') || (new Date().getMonth() + 1)
  const anio      = parseInt(formData.get('anio') as string || '') || new Date().getFullYear()

  if (!pdfFile || !firmaBlob) return NextResponse.json({ error: 'Faltan archivos' }, { status: 400 })

  const rawBuf     = await pdfFile.arrayBuffer()
  const firmaBytes = new Uint8Array(await firmaBlob.arrayBuffer())

  let srcDoc: PDFDocument
  try { srcDoc = await PDFDocument.load(rawBuf.slice(0)) }
  catch { return NextResponse.json({ error: 'PDF inválido o corrupto' }, { status: 400 }) }

  const numPages    = srcDoc.getPageCount()
  const fallbackMes = MESES[mes - 1]
  const anioStr     = String(anio)

  // Extracción server-side (funciona en iOS y en todo device porque ocurre en el servidor)
  const paginas = await extractarPaginas(rawBuf.slice(0))

  const results = []

  for (let i = 0; i < numPages; i++) {
    const info     = paginas[i]
    const nombreRaw        = info?.nombre || ''
    const mesStr           = info?.mesStr || fallbackMes
    const nombreFormateado = nombreRaw ? formatearNombrePDF(nombreRaw) : `Pagina ${i + 1}`
    const nombreArchivo    = `${nombreFormateado} Liquidacion ${mesStr}.pdf`

    const newDoc = await PDFDocument.create()
    const [copied] = await newDoc.copyPages(srcDoc, [i])
    newDoc.addPage(copied)

    const page = newDoc.getPages()[0]
    const { width, height } = page.getSize()
    const sigImage  = await newDoc.embedPng(firmaBytes)
    const sigWidth  = width * 0.11
    const sigHeight = sigWidth * (sigImage.height / sigImage.width)
    page.drawImage(sigImage, { x: width * 0.57, y: height * 0.085, width: sigWidth, height: sigHeight, opacity: 0.92 })

    const signedBytes = await newDoc.save()

    results.push({
      pageIndex: i,
      nombreRaw: nombreRaw || `Página ${i + 1}`,
      nombreFormateado,
      mesStr,
      anioStr,
      pdfBase64: Buffer.from(signedBytes).toString('base64'),
      nombreArchivo,
    })
  }

  return NextResponse.json({ pages: results, total: numPages })
}
