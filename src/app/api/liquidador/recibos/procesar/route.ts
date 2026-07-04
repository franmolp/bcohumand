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
  const results     = []

  for (let i = 0; i < numPages; i++) {
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

    const client  = clientMeta[i]
    const nombre  = client?.nombre  || ''
    const mesStr  = client?.mesStr  || fallbackMes

    const nombreFormateado = nombre ? formatearNombrePDF(nombre) : ''
    const nombreArchivo    = `${nombreFormateado || `Pagina ${i + 1}`} Liquidacion ${mesStr}.pdf`

    results.push({
      pageIndex:        i,
      nombreRaw:        nombre || '',
      nombreFormateado,
      mesStr,
      anioStr,
      pdfBase64:        Buffer.from(signedBytes).toString('base64'),
      nombreArchivo,
    })
  }

  return NextResponse.json({ pages: results, total: numPages })
}
