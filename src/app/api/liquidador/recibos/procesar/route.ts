import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { PDFDocument } from 'pdf-lib'

export const maxDuration = 60

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '' }
function formatearNombrePDF(raw: string): string {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return raw
  if (parts.length === 1) return cap(parts[0])
  return cap(parts[1]) + ' ' + parts[0][0].toUpperCase()
}

async function extractPageText(pdfBytes: Uint8Array, pageNum: number): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = ''
    const doc = await pdfjs.getDocument({
      data: pdfBytes,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    return content.items.map((i: { str: string }) => i.str).join(' ')
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Error al leer el formulario' }, { status: 400 }) }

  const pdfFile  = formData.get('pdf')   as File | null
  const firmaBlob = formData.get('firma') as Blob | null
  const mes  = parseInt(formData.get('mes')  as string || '') || (new Date().getMonth() + 1)
  const anio = parseInt(formData.get('anio') as string || '') || new Date().getFullYear()

  if (!pdfFile || !firmaBlob) return NextResponse.json({ error: 'Faltan archivos' }, { status: 400 })

  const pdfBytes  = new Uint8Array(await pdfFile.arrayBuffer())
  const firmaBytes = new Uint8Array(await firmaBlob.arrayBuffer())

  let srcDoc: PDFDocument
  try { srcDoc = await PDFDocument.load(pdfBytes.buffer as ArrayBuffer) }
  catch { return NextResponse.json({ error: 'PDF inválido o corrupto' }, { status: 400 }) }

  const numPages = srcDoc.getPageCount()
  const results = []

  for (let i = 0; i < numPages; i++) {
    let nombreRaw = ''
    let mesStr = MESES[mes - 1]
    let anioStr = String(anio)

    const text = await extractPageText(pdfBytes, i + 1)
    if (text) {
      const nameMatch =
        text.match(/Nombre\s+y\s+Apellido[\s:]+([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]+?)(?:\s{2,}|CUIL|DNI|Per[ií]|$)/i) ??
        text.match(/Apellido\s+y\s+Nombre[\s:]+([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]+?)(?:\s{2,}|CUIL|DNI|Per[ií]|$)/i)
      const periodMatch = text.match(/Per[ií]odo[\s:]+([A-Za-záéíóúüñ]+)\s+(\d{4})/i)
      if (nameMatch) nombreRaw = nameMatch[1].trim()
      if (periodMatch) { mesStr = periodMatch[1]; anioStr = periodMatch[2] }
    }

    // Build individual signed page
    const newDoc = await PDFDocument.create()
    const [copied] = await newDoc.copyPages(srcDoc, [i])
    newDoc.addPage(copied)

    const page = newDoc.getPages()[0]
    const { width, height } = page.getSize()
    const sigImage  = await newDoc.embedPng(firmaBytes)
    const sigWidth  = width * 0.12
    const sigHeight = sigWidth * (sigImage.height / sigImage.width)
    page.drawImage(sigImage, { x: width * 0.61, y: height * 0.04, width: sigWidth, height: sigHeight, opacity: 0.92 })

    const signedBytes = await newDoc.save()
    const nombreFormateado = nombreRaw ? formatearNombrePDF(nombreRaw) : `Pág. ${i + 1}`
    const nombreArchivo = `${nombreFormateado} Liquidacion ${mesStr}.pdf`

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
