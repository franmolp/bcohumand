const GAS_URL    = process.env.GAS_DRIVE_URL ?? ''
const GAS_SECRET = process.env.GAS_SECRET ?? ''

export function gasReady(): boolean {
  return !!GAS_URL && !GAS_URL.includes('PENDING_DEPLOY')
}

export type FolderType = 'certificados' | 'liquidaciones' | 'monotributo' | 'compras'

export async function gasUpload(opts: {
  bytes: ArrayBuffer
  mimeType: string
  fileName: string
  folderType: FolderType
  anio: number
  mes: number
}): Promise<string> {
  if (!gasReady()) throw new Error('Integración con Drive no configurada')
  const base64 = Buffer.from(opts.bytes).toString('base64')
  const res = await fetch(GAS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      secret:     GAS_SECRET,
      action:     'upload_file',
      data:       base64,
      mimeType:   opts.mimeType,
      fileName:   opts.fileName,
      folderType: opts.folderType,
      anio:       opts.anio,
      mes:        opts.mes,
    }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  if (!json.url) throw new Error('GAS no devolvió URL')
  return json.url as string
}
