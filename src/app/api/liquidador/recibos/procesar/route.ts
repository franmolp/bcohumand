import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { PDFDocument } from 'pdf-lib'
import { inflateSync, inflateRawSync } from 'zlib'

export const maxDuration = 60

const MESES    = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MESES_RE = MESES.join('|')

function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '' }
function formatearNombrePDF(raw: string): string {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return raw
  if (parts.length === 1) return cap(parts[0])
  return cap(parts[1]) + ' ' + parts[0][0].toUpperCase()
}

// ── Descompresor ─────────────────────────────────────────────────────────────
function decompress(buf: Buffer): Buffer {
  try { return inflateSync(buf) }    catch { /* continúa */ }
  try { return inflateRawSync(buf) } catch { /* continúa */ }
  return buf
}

// ── Iterador de streams ───────────────────────────────────────────────────────
function* iterStreams(pdfBytes: Buffer): Generator<Buffer> {
  let pos = 0
  while (pos < pdfBytes.length) {
    let si = -1, from = pos
    while (from < pdfBytes.length) {
      const idx = pdfBytes.indexOf(Buffer.from('stream'), from)
      if (idx === -1) break
      if (idx === 0 || pdfBytes[idx - 1] !== 100 /* 'd' */) { si = idx; break }
      from = idx + 1
    }
    if (si === -1) break
    let start = si + 6
    if (pdfBytes[start] === 13) start++
    if (pdfBytes[start] === 10) start++
    const ei = pdfBytes.indexOf(Buffer.from('endstream'), start)
    if (ei === -1) break
    let end = ei
    while (end > start && (pdfBytes[end - 1] === 13 || pdfBytes[end - 1] === 10)) end--
    const raw = pdfBytes.slice(start, end)
    pos = ei + 9
    if (raw.length > 10) yield raw
  }
}

// ── Parsear ToUnicode CMap (beginbfchar / beginbfrange) ───────────────────────
function parseCmap(cmapText: string): Map<number, string> {
  const map = new Map<number, string>()

  const bfcharRe = /beginbfchar([\s\S]*?)endbfchar/g
  let m: RegExpExecArray | null
  while ((m = bfcharRe.exec(cmapText)) !== null) {
    const tokens = m[1].trim().split(/\s+/)
    for (let i = 0; i + 1 < tokens.length; i += 2) {
      const cid = parseInt(tokens[i].replace(/[<>]/g, ''), 16)
      const uni = parseInt(tokens[i + 1].replace(/[<>]/g, ''), 16)
      if (!isNaN(cid) && !isNaN(uni)) map.set(cid, String.fromCodePoint(uni))
    }
  }

  const bfrangeRe = /beginbfrange([\s\S]*?)endbfrange/g
  while ((m = bfrangeRe.exec(cmapText)) !== null) {
    const tokens = m[1].trim().split(/\s+/)
    for (let i = 0; i + 2 < tokens.length; i += 3) {
      const start    = parseInt(tokens[i].replace(/[<>]/g, ''), 16)
      const end      = parseInt(tokens[i + 1].replace(/[<>]/g, ''), 16)
      const startUni = parseInt(tokens[i + 2].replace(/[<>]/g, ''), 16)
      for (let c = start; c <= end; c++) map.set(c, String.fromCodePoint(startUni + (c - start)))
    }
  }

  return map
}

// ── Construir mapa CID→Unicode escaneando todos los CMap del PDF ──────────────
function buildCidMap(pdfBytes: Buffer): Map<number, string> {
  const merged = new Map<number, string>()
  for (const raw of iterStreams(pdfBytes)) {
    let text = ''
    try { text = decompress(raw).toString('latin1') } catch { text = raw.toString('latin1') }
    if (text.includes('begincmap')) {
      const cm = parseCmap(text)
      for (const [k, v] of cm) merged.set(k, v)
    }
  }
  return merged
}

// ── Decodificar string hex CID ─────────────────────────────────────────────────
function decodeCIDHex(hex: string, cidMap: Map<number, string>): string {
  let text = ''
  for (let i = 0; i < hex.length; i += 4) {
    const cid = parseInt(hex.slice(i, i + 4), 16)
    text += cidMap.get(cid) ?? ''
  }
  return text
}

// ── Extraer texto de un stream descomprimido (soporta CID hex + literales) ────
function streamToText(content: string, cidMap: Map<number, string>): string {
  let text = ''
  let m: RegExpExecArray | null

  // Array TJ: puede contener <hex> (CID) o (literal)
  const reTJ = /\[([^\]]{0,8000})\]\s*TJ/g
  while ((m = reTJ.exec(content)) !== null) {
    const inner  = m[1]
    const hexRe  = /<([0-9a-fA-F]+)>/g
    let hm: RegExpExecArray | null
    while ((hm = hexRe.exec(inner)) !== null) text += decodeCIDHex(hm[1], cidMap)
    const litRe  = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g
    while ((hm = litRe.exec(inner)) !== null) text += hm[1].replace(/\\[nrt]/g, ' ').replace(/\\(.)/g, '$1')
    text += ' '
  }

  // Tj simple literal: (string)Tj
  const reTj = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*[Tj'"]/g
  while ((m = reTj.exec(content)) !== null) text += m[1].replace(/\\[nrt]/g, ' ').replace(/\\(.)/g, '$1') + ' '

  // Tj hex: <hex>Tj
  const reTjHex = /<([0-9a-fA-F]+)>\s*Tj/g
  while ((m = reTjHex.exec(content)) !== null) text += decodeCIDHex(m[1], cidMap) + ' '

  return text
}

// ── Extraer todo el texto de un PDF (buffer) usando el CID map ────────────────
function extractPdfText(pdfBytes: Buffer, cidMap: Map<number, string>): string {
  let allText = ''
  for (const raw of iterStreams(pdfBytes)) {
    const decoded  = decompress(raw)
    const content  = decoded.toString('binary')
    if (content.includes('Tj') || content.includes('TJ')) {
      allText += streamToText(content, cidMap)
    }
  }

  // Fallback: secuencias ASCII imprimibles (para PDFs sin CID ni Tj literales)
  if (!allText.trim()) {
    const rawStr = pdfBytes.toString('latin1')
    for (const m of rawStr.matchAll(/[ -~\t]{5,}/g)) allText += m[0] + ' '
  }

  return allText
}

// ── Extraer nombre y mes del texto ───────────────────────────────────────────
function parsearNombreMes(text: string, strs: string[]): { nombre: string; mesStr: string | null } {
  const mesM =
    text.match(new RegExp(`Per[ií]odo[\\s:]+(${MESES_RE})\\s+20\\d{2}`, 'i')) ??
    text.match(new RegExp(`Liquidaci[oó]n[\\s:]+(${MESES_RE})\\s+20\\d{2}`, 'i')) ??
    text.match(new RegExp(`\\b(${MESES_RE})\\s+20\\d{2}\\b`, 'i'))

  let nombre = ''

  // S1: etiqueta "Nombre y Apellido:" / "Apellido y Nombre:"
  if (!nombre) {
    const m = text.match(
      /(?:Apellido\s+y\s+Nombre[s]?|Nombre[s]?\s+y\s+Apellido)\s*[:\-]?\s*(.{1,80}?)(?=\s{2,}|\s+CUIL|\s+DNI|\s+\d{2}[-.\s]\d|\s+Per[ií]|\s+Concepto)/i
    )
    if (m?.[1]) {
      const c = m[1].trim().replace(/\s+/g, ' ')
      if (/[A-ZÁÉÍÓÚÜÑ]{2,}/.test(c) && !/^\d/.test(c)) nombre = c
    }
  }

  // S2: texto antes del CUIL
  if (!nombre) {
    const cuilM = text.match(/\b(\d{2}[-.\s]\d{7,8}[-.\s]\d)\b/)
    if (cuilM) {
      const before = text.slice(Math.max(0, cuilM.index! - 220), cuilM.index!)
        .replace(/\bCUIL\s*[:\-]?\s*$/, '').trimEnd()
      const m = before.match(/\b([A-ZÁÉÍÓÚÜÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÜÑ]{2,}){1,3})\s*$/)
      if (m?.[1]) nombre = m[1].trim()
    }
  }

  // S3: token "CUIL" → tokens ALL-CAPS anteriores
  if (!nombre) {
    for (let j = 0; j < strs.length; j++) {
      if (/^CUIL\s*:?$/i.test(strs[j].trim())) {
        const parts: string[] = []
        for (let k = j - 1; k >= Math.max(0, j - 12); k--) {
          const c = strs[k].trim()
          if (!c || /^[:\-\/·\s]+$/.test(c)) continue
          if (/^[A-ZÁÉÍÓÚÜÑ]{2,}(?: [A-ZÁÉÍÓÚÜÑ]{2,})*$/.test(c)) parts.unshift(...c.split(/\s+/))
          else break
        }
        if (parts.length >= 2) { nombre = parts.join(' '); break }
      }
    }
  }

  // S4: token con "apellido" → tokens ALL-CAPS siguientes
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

  // S5: "Apellido:" y "Nombre:" separados
  if (!nombre) {
    const ap = text.match(/\bApellido\s*[:\-]\s*([A-ZÁÉÍÓÚÜÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÜÑ]{2,})*)/i)
    const nm = text.match(/\bNombres?\s*[:\-]\s*([A-ZÁÉÍÓÚÜÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÜÑ]{2,})*)/i)
    if (ap?.[1] && nm?.[1]) nombre = ap[1].trim() + ' ' + nm[1].trim()
    else if (ap?.[1]) nombre = ap[1].trim()
  }

  return { nombre, mesStr: mesM ? mesM[1] : null }
}

// ── Extraer metadatos de cada página ─────────────────────────────────────────
async function extractarPaginas(
  srcDoc:   PDFDocument,
  numPages: number,
  cidMap:   Map<number, string>
): Promise<Array<{ nombre: string; mesStr: string | null }>> {
  const out: Array<{ nombre: string; mesStr: string | null }> = []

  for (let i = 0; i < numPages; i++) {
    try {
      const pageDoc = await PDFDocument.create()
      const [copied] = await pageDoc.copyPages(srcDoc, [i])
      pageDoc.addPage(copied)
      const pageBytes = Buffer.from(await pageDoc.save())
      const text = extractPdfText(pageBytes, cidMap)
      const strs = text.split(/\s+/).filter(Boolean)
      console.log(`[pdf p${i+1}] len=${text.length} preview="${text.substring(0, 200).replace(/\s+/g,' ')}"`)
      out.push(parsearNombreMes(text, strs))
    } catch (e) {
      console.error(`[pdf p${i+1}] error:`, e instanceof Error ? e.message : e)
      out.push({ nombre: '', mesStr: null })
    }
  }

  return out
}

// ── Handler principal ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Error al leer el formulario' }, { status: 400 }) }

  const pdfFile     = formData.get('pdf')      as File | null
  const firmaBlob   = formData.get('firma')    as Blob | null
  const mes         = parseInt(formData.get('mes')  as string || '') || (new Date().getMonth() + 1)
  const anio        = parseInt(formData.get('anio') as string || '') || new Date().getFullYear()
  const pageMetaRaw = formData.get('pageMeta') as string | null

  if (!pdfFile || !firmaBlob) return NextResponse.json({ error: 'Faltan archivos' }, { status: 400 })

  // Metadatos opcionales del cliente (pdfjs)
  let clientMeta: Array<{ nombre: string; mesStr: string | null }> = []
  try { if (pageMetaRaw) clientMeta = JSON.parse(pageMetaRaw) } catch {}

  const rawBuf     = await pdfFile.arrayBuffer()
  const firmaBytes = new Uint8Array(await firmaBlob.arrayBuffer())

  let srcDoc: PDFDocument
  try { srcDoc = await PDFDocument.load(rawBuf) }
  catch { return NextResponse.json({ error: 'PDF inválido o corrupto' }, { status: 400 }) }

  const numPages    = srcDoc.getPageCount()
  const fallbackMes = MESES[mes - 1]
  const anioStr     = String(anio)

  // Construir mapa CID→Unicode desde el PDF completo (antes de separar páginas)
  const cidMap = buildCidMap(Buffer.from(rawBuf))
  console.log(`[cidMap] entries=${cidMap.size}`)

  // Extracción server-side con soporte CID
  const serverPaginas = await extractarPaginas(srcDoc, numPages, cidMap)

  // Recargar srcDoc limpio: extractarPaginas hace copyPages múltiples veces
  // lo que puede corromper el estado interno de pdf-lib para el loop de firma
  srcDoc = await PDFDocument.load(rawBuf)

  // Combinar: cliente tiene prioridad si extrajo algo, server como fallback
  const paginas = serverPaginas.map((server, i) => {
    const client = clientMeta[i]
    return {
      nombre: client?.nombre || server.nombre,
      mesStr: client?.mesStr || server.mesStr,
    }
  })

  const results = []

  for (let i = 0; i < numPages; i++) {
    const info             = paginas[i]
    const nombreRaw        = info?.nombre || ''
    const mesStr           = info?.mesStr || fallbackMes
    const nombreFormateado = nombreRaw ? formatearNombrePDF(nombreRaw) : ''
    const nombreArchivo    = `${nombreFormateado || `Pagina ${i + 1}`} Liquidacion ${mesStr}.pdf`

    const newDoc = await PDFDocument.create()
    const [copied] = await newDoc.copyPages(srcDoc, [i])
    newDoc.addPage(copied)

    const page              = newDoc.getPages()[0]
    const { width, height } = page.getSize()
    const sigImage          = await newDoc.embedPng(firmaBytes)
    const sigWidth          = width * 0.11
    const sigHeight         = sigWidth * (sigImage.height / sigImage.width)
    page.drawImage(sigImage, { x: width * 0.57, y: height * 0.085, width: sigWidth, height: sigHeight, opacity: 0.92 })

    const signedBytes = await newDoc.save()

    results.push({
      pageIndex:        i,
      nombreRaw:        nombreRaw || '',
      nombreFormateado,
      mesStr,
      anioStr,
      pdfBase64:        Buffer.from(signedBytes).toString('base64'),
      nombreArchivo,
    })
  }

  return NextResponse.json({ pages: results, total: numPages })
}
