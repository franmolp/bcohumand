import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { PDFDocument } from 'pdf-lib'
import { inflateSync, inflateRawSync } from 'zlib'

export const maxDuration = 60

const MESES    = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MESES_RE = MESES.join('|')

function decompress(buf: Buffer): Buffer {
  try { return inflateSync(buf) }    catch { /* continúa */ }
  try { return inflateRawSync(buf) } catch { /* continúa */ }
  return buf
}

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

function buildCidMap(pdfBytes: Buffer): Map<number, string> {
  const merged = new Map<number, string>()
  for (const raw of iterStreams(pdfBytes)) {
    let text = ''
    try { text = decompress(raw).toString('latin1') } catch { text = raw.toString('latin1') }
    if (text.includes('begincmap')) {
      for (const [k, v] of parseCmap(text)) merged.set(k, v)
    }
  }
  return merged
}

function decodeCIDHex(hex: string, cidMap: Map<number, string>): string {
  let text = ''
  for (let i = 0; i < hex.length; i += 4) {
    const cid = parseInt(hex.slice(i, i + 4), 16)
    text += cidMap.get(cid) ?? ''
  }
  return text
}

function streamToText(content: string, cidMap: Map<number, string>): string {
  let text = ''
  let m: RegExpExecArray | null
  const reTJ = /\[([^\]]{0,8000})\]\s*TJ/g
  while ((m = reTJ.exec(content)) !== null) {
    const inner = m[1]
    const hexRe = /<([0-9a-fA-F]+)>/g
    let hm: RegExpExecArray | null
    while ((hm = hexRe.exec(inner)) !== null) text += decodeCIDHex(hm[1], cidMap)
    const litRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g
    while ((hm = litRe.exec(inner)) !== null) text += hm[1].replace(/\\[nrt]/g, ' ').replace(/\\(.)/g, '$1')
    text += ' '
  }
  const reTj = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*[Tj'"]/g
  while ((m = reTj.exec(content)) !== null) text += m[1].replace(/\\[nrt]/g, ' ').replace(/\\(.)/g, '$1') + ' '
  const reTjHex = /<([0-9a-fA-F]+)>\s*Tj/g
  while ((m = reTjHex.exec(content)) !== null) text += decodeCIDHex(m[1], cidMap) + ' '
  return text
}

function extractTextFromBytes(pdfBytes: Buffer): string {
  const cidMap = buildCidMap(pdfBytes)
  let allText = ''
  for (const raw of iterStreams(pdfBytes)) {
    const decoded = decompress(raw)
    const content = decoded.toString('binary')
    if (content.includes('Tj') || content.includes('TJ')) {
      allText += streamToText(content, cidMap)
    }
  }
  if (!allText.trim()) {
    const rawStr = pdfBytes.toString('latin1')
    for (const match of rawStr.matchAll(/[ -~\t]{5,}/g)) allText += match[0] + ' '
  }
  return allText
}

function parsearNombreMes(text: string, strs: string[]): { nombre: string; mesStr: string | null } {
  const mesM =
    text.match(new RegExp(`Per[ií]odo[\\s:]+(${MESES_RE})\\s+20\\d{2}`, 'i')) ??
    text.match(new RegExp(`Liquidaci[oó]n[\\s:]+(${MESES_RE})\\s+20\\d{2}`, 'i')) ??
    text.match(new RegExp(`\\b(${MESES_RE})\\s+20\\d{2}\\b`, 'i'))

  let nombre = ''

  if (!nombre) {
    const m = text.match(
      /(?:Apellido\s+y\s+Nombre[s]?|Nombre[s]?\s+y\s+Apellido)\s*[:\-]?\s*(.{1,80}?)(?=\s{2,}|\s+CUIL|\s+DNI|\s+\d{2}[-.\s]\d|\s+Per[ií]|\s+Concepto)/i
    )
    if (m?.[1]) {
      const c = m[1].trim().replace(/\s+/g, ' ')
      if (/[A-ZÁÉÍÓÚÜÑ]{2,}/.test(c) && !/^\d/.test(c)) nombre = c
    }
  }

  if (!nombre) {
    const cuilM = text.match(/\b(\d{2}[-.\s]\d{7,8}[-.\s]\d)\b/)
    if (cuilM) {
      const before = text.slice(Math.max(0, cuilM.index! - 220), cuilM.index!)
        .replace(/\bCUIL\s*[:\-]?\s*$/, '').trimEnd()
      const m = before.match(/\b([A-ZÁÉÍÓÚÜÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÜÑ]{2,}){1,3})\s*$/)
      if (m?.[1]) nombre = m[1].trim()
    }
  }

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

  if (!nombre) {
    const ap = text.match(/\bApellido\s*[:\-]\s*([A-ZÁÉÍÓÚÜÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÜÑ]{2,})*)/i)
    const nm = text.match(/\bNombres?\s*[:\-]\s*([A-ZÁÉÍÓÚÜÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÜÑ]{2,})*)/i)
    if (ap?.[1] && nm?.[1]) nombre = ap[1].trim() + ' ' + nm[1].trim()
    else if (ap?.[1]) nombre = ap[1].trim()
  }

  return { nombre, mesStr: mesM ? mesM[1] : null }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Error al leer el formulario' }, { status: 400 }) }

  const pdfFile = formData.get('pdf') as File | null
  if (!pdfFile) return NextResponse.json({ error: 'Falta PDF' }, { status: 400 })

  const rawBuf = Buffer.from(await pdfFile.arrayBuffer())

  let srcDoc: PDFDocument
  try { srcDoc = await PDFDocument.load(rawBuf) }
  catch { return NextResponse.json({ error: 'PDF inválido' }, { status: 400 }) }

  const numPages = srcDoc.getPageCount()
  const pages: Array<{ nombre: string; mesStr: string | null }> = []

  for (let i = 0; i < numPages; i++) {
    try {
      // Crear mini-PDF de una sola página para extraer su texto de forma aislada
      const miniDoc = await PDFDocument.create()
      const [copied] = await miniDoc.copyPages(srcDoc, [i])
      miniDoc.addPage(copied)
      const miniBytes = Buffer.from(await miniDoc.save())

      const text   = extractTextFromBytes(miniBytes)
      const strs   = text.split(/\s+/).filter(Boolean)
      const parsed = parsearNombreMes(text, strs)
      console.log(`[extraer p${i+1}] nombre="${parsed.nombre}" mes="${parsed.mesStr}"`)
      pages.push({ nombre: parsed.nombre, mesStr: parsed.mesStr })
    } catch (e) {
      console.error(`[extraer p${i+1}] error:`, e instanceof Error ? e.message : e)
      pages.push({ nombre: '', mesStr: null })
    }
  }

  return NextResponse.json({ pages, total: numPages })
}
