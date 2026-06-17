// ============================================
// DRIVE_BRIDGE.GS — Web App REST para BCO HUMAND
// Deploy: Extensiones → Apps Script → Deploy → New deployment
//   Tipo: Web app | Execute as: Me | Access: Anyone
// Script Properties requeridas:
//   BCOHUMAND_SECRET   (token que compartís con Next.js para Drive)
//   SUPABASE_URL       (https://xxx.supabase.co)
//   SUPABASE_SERVICE_KEY
//   APP_URL            (https://tu-app.vercel.app  — sin barra final)
//   APP_SECRET         (mismo valor que CRON_SECRET en Vercel)
//   HIK_EMAIL_QUERY    (query Gmail para encontrar mails de HIKVISION,
//                       ej: "subject:Daily Report from:hikvision")
// ============================================

const FOLDERS = {
  CERTIFICADOS: '1gyrheZ7SD51CXHI8Ft_T8PirgPPGcmpr',
  LIQUIDACIONES: '16ofN3Ie6cMbwkkCwNn0XcAdV41kuoC1Z',
  COMPRAS: '1JHhi5c0kol3PDrPZQ9KZVvC7xQ87tKjl',
  MONOTRIBUTO: '1MNn36w13o4iZbRheE1RHDzLvL4c8SsY0',
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ─── Helpers ─────────────────────────────────────────────────────

function getSecret() {
  return PropertiesService.getScriptProperties().getProperty('BCOHUMAND_SECRET')
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}

function getOrCreatePath(rootId, parts) {
  let folder = DriveApp.getFolderById(rootId)
  for (const part of parts.filter(Boolean)) {
    const iter = folder.getFoldersByName(part)
    folder = iter.hasNext() ? iter.next() : folder.createFolder(part)
  }
  return folder
}

function getOrCreateFolder(parent, name) {
  const it = parent.getFoldersByName(name)
  return it.hasNext() ? it.next() : parent.createFolder(name)
}

function saveFile(folder, base64, mimeType, filename) {
  const existing = folder.getFilesByName(filename)
  while (existing.hasNext()) existing.next().setTrashed(true)

  const bytes = Utilities.base64Decode(base64)
  const blob  = Utilities.newBlob(bytes, mimeType, filename)
  const file  = folder.createFile(blob)
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)
  return {
    id:   file.getId(),
    url:  'https://drive.google.com/file/d/' + file.getId() + '/view',
    name: file.getName()
  }
}

function normStr(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim()
}

// ─── Entry points ─────────────────────────────────────────────────

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents)
    if (payload.secret !== getSecret()) return jsonResponse({ error: 'No autorizado' })

    if (payload.action === 'upload_file')  return handleUploadFile(payload)
    if (payload.action === 'sync_drive')   return handleSyncDrive(payload)
    if (payload.action === 'sync_hik')     return jsonResponse(hikDailySync())

    return jsonResponse({ error: 'Acción desconocida' })
  } catch (err) {
    return jsonResponse({ error: err.message })
  }
}

function handleUploadFile(payload) {
  const { data, mimeType, fileName, folderType, anio, mes } = payload

  // Mapeo folderType → FOLDERS global
  const folderMap = {
    certificados:  FOLDERS.CERTIFICADOS,
    liquidaciones: FOLDERS.LIQUIDACIONES,
    monotributo:   FOLDERS.MONOTRIBUTO,
    compras:       FOLDERS.COMPRAS,
  }

  const rootId = folderMap[folderType]
  if (!rootId) return jsonResponse({ error: 'folderType inválido: ' + folderType })

  const root      = DriveApp.getFolderById(rootId)
  const anioFolder = getOrCreateFolder(root, String(anio))
  const mesFolder  = getOrCreateFolder(anioFolder, MESES[mes - 1])

  const bytes = Utilities.base64Decode(data)
  const blob  = Utilities.newBlob(bytes, mimeType, fileName)

  const existing = mesFolder.getFilesByName(fileName)
  if (existing.hasNext()) existing.next().setTrashed(true)

  const file = mesFolder.createFile(blob)
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)

  return jsonResponse({ url: 'https://drive.google.com/uc?export=download&id=' + file.getId() })
}

function handleSyncDrive(payload) {
  const tipo = payload.tipo || 'liquidaciones'
  if (tipo === 'liquidaciones') return syncLiquidaciones()
  return jsonResponse({ error: 'tipo no soportado: ' + tipo })
}

function syncLiquidaciones() {
  const props    = PropertiesService.getScriptProperties()
  const SUPA_URL = props.getProperty('SUPABASE_URL')
  const SUPA_KEY = props.getProperty('SUPABASE_SERVICE_KEY')

  const MESES_NUM = {
    'Enero':1,'Febrero':2,'Marzo':3,'Abril':4,'Mayo':5,'Junio':6,
    'Julio':7,'Agosto':8,'Septiembre':9,'Octubre':10,'Noviembre':11,'Diciembre':12
  }

  // Usa FOLDERS.LIQUIDACIONES (global)
  const rootFolder = DriveApp.getFolderById(FOLDERS.LIQUIDACIONES)
  let inserted = 0, skipped = 0, errors = []

  const anioIter = rootFolder.getFolders()
  while (anioIter.hasNext()) {
    const anioFolder = anioIter.next()
    const anio = parseInt(anioFolder.getName())
    if (isNaN(anio)) continue

    const mesIter = anioFolder.getFolders()
    while (mesIter.hasNext()) {
      const mesFolder = mesIter.next()
      const mes = MESES_NUM[mesFolder.getName()]
      if (!mes) continue

      const fileIter = mesFolder.getFiles()
      while (fileIter.hasNext()) {
        const file = fileIter.next()
        const fileName = file.getName()
        if (fileName.toLowerCase().indexOf('.pdf') === -1) continue

        // "Rocio O Liquidacion Junio.pdf" → nombre_empleada = "Rocio O"
        const nombreEmpleada = fileName.replace(/\s+Liquidaci[oó]n\s+\w+(\s+\d{4})?\.pdf$/i, '').trim()

        try {
          const checkResp = UrlFetchApp.fetch(
            SUPA_URL + '/rest/v1/recibos_sueldo?select=id&nombre_archivo=eq.' + encodeURIComponent(fileName),
            { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }, muteHttpExceptions: true }
          )
          if (JSON.parse(checkResp.getContentText()).length > 0) { skipped++; continue }

          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)
          const driveUrl = 'https://drive.google.com/uc?export=download&id=' + file.getId()

          UrlFetchApp.fetch(SUPA_URL + '/rest/v1/recibos_sueldo', {
            method: 'post',
            headers: {
              apikey: SUPA_KEY,
              Authorization: 'Bearer ' + SUPA_KEY,
              'Content-Type': 'application/json',
              Prefer: 'resolution=ignore-duplicates'
            },
            payload: JSON.stringify({
              anio: anio,
              mes: mes,
              nombre_empleada: nombreEmpleada,
              nombre_archivo: fileName,
              storage_url: driveUrl,
              estado: 'disponible',
              subido_el: new Date().toISOString()
            }),
            muteHttpExceptions: true
          })
          inserted++
        } catch(e) {
          errors.push(fileName + ': ' + e.message)
        }
      }
    }
  }

  return jsonResponse({ inserted: inserted, skipped: skipped, errors: errors, tipo: 'liquidaciones' })
}

function doGet(e) {
  try {
    const p = e.parameter
    if (p.secret !== getSecret()) return json({ error: 'No autorizado' })
    switch (p.action) {
      case 'list_liquidaciones': return json(listLiquidaciones(p))
      case 'list_monotributo':   return json(listMonotributo(p))
      case 'list_compras':       return json(listCompras(p))
      case 'get_certificado':    return json(getCertificado(p))
      default: return json({ error: 'Acción desconocida' })
    }
  } catch(err) { return json({ error: err.message }) }
}

// ─── Certificados ────────────────────────────────────────────────

function uploadCertificado(body) {
  const { solicitudId, anio, mes, base64, mimeType, ext } = body
  const folder = getOrCreatePath(FOLDERS.CERTIFICADOS, [
    String(anio), MESES[parseInt(mes) - 1]
  ])
  return saveFile(folder, base64, mimeType || 'image/jpeg', solicitudId + '.' + (ext || 'jpg'))
}

function getCertificado(p) {
  const { solicitudId, anio, mes } = p
  const folder = getOrCreatePath(FOLDERS.CERTIFICADOS, [
    String(anio), MESES[parseInt(mes) - 1]
  ])
  const iter = folder.getFiles()
  while (iter.hasNext()) {
    const file = iter.next()
    if (file.getName().startsWith(solicitudId)) {
      return { url: 'https://drive.google.com/file/d/' + file.getId() + '/view', id: file.getId() }
    }
  }
  return { url: null }
}

// ─── Compras ─────────────────────────────────────────────────────

function uploadCompra(body) {
  const { compraId, base64, mimeType, ext } = body
  const folder   = DriveApp.getFolderById(FOLDERS.COMPRAS)
  const filename = 'Factura_' + compraId + '_' + Date.now() + '.' + (ext || 'jpg')
  return saveFile(folder, base64, mimeType || 'image/jpeg', filename)
}

function listCompras(p) {
  const { compraId } = p
  const root = DriveApp.getFolderById(FOLDERS.COMPRAS)
  const files = []
  const iter  = root.getFiles()
  while (iter.hasNext()) {
    const file = iter.next()
    const name = file.getName()
    if (!compraId || name.includes('Factura_' + compraId + '_')) {
      files.push({
        id:   file.getId(),
        name,
        url:  'https://drive.google.com/file/d/' + file.getId() + '/view',
        date: file.getDateCreated().toISOString()
      })
    }
  }
  return { files }
}

// ─── Monotributo ─────────────────────────────────────────────────

function uploadMonotributo(body) {
  const { empleadaNombre, anio, mes, base64, mimeType, ext, tipo } = body
  const folder = getOrCreatePath(FOLDERS.MONOTRIBUTO, [
    String(anio), MESES[parseInt(mes) - 1], empleadaNombre
  ])
  const filename = (tipo || 'archivo') + '_' + MESES[parseInt(mes) - 1] + '_' + Date.now() + '.' + (ext || 'pdf')
  return saveFile(folder, base64, mimeType || 'application/pdf', filename)
}

function listMonotributo(p) {
  const { empleadaNombre } = p
  const root    = DriveApp.getFolderById(FOLDERS.MONOTRIBUTO)
  const results = []
  const years   = root.getFolders()
  while (years.hasNext()) {
    const yf = years.next()
    const months = yf.getFolders()
    while (months.hasNext()) {
      const mf = months.next()
      const emps = mf.getFolders()
      while (emps.hasNext()) {
        const ef = emps.next()
        if (empleadaNombre && !normStr(ef.getName()).includes(normStr(empleadaNombre))) continue
        const fi = ef.getFiles()
        while (fi.hasNext()) {
          const file = fi.next()
          results.push({
            id:   file.getId(),
            name: file.getName(),
            url:  'https://drive.google.com/file/d/' + file.getId() + '/view',
            path: yf.getName() + '/' + mf.getName() + '/' + ef.getName(),
            date: file.getDateCreated().toISOString()
          })
        }
      }
    }
  }
  return { files: results.sort((a,b) => b.date.localeCompare(a.date)) }
}

// ─── Liquidaciones ────────────────────────────────────────────────

function uploadLiquidacion(body) {
  const { empleadaNombre, anio, mes, base64, mimeType } = body
  const mesNombre = MESES[parseInt(mes) - 1]
  const folder   = getOrCreatePath(FOLDERS.LIQUIDACIONES, [String(anio), mesNombre])
  const filename = empleadaNombre + ' Liquidación ' + mesNombre + '.pdf'
  return saveFile(folder, base64, mimeType || 'application/pdf', filename)
}

function listLiquidaciones(p) {
  const { empleadaNombre } = p
  const root    = DriveApp.getFolderById(FOLDERS.LIQUIDACIONES)
  const results = []
  const years   = root.getFolders()
  while (years.hasNext()) {
    const yf = years.next()
    const months = yf.getFolders()
    while (months.hasNext()) {
      const mf = months.next()
      const fi = mf.getFiles()
      while (fi.hasNext()) {
        const file = fi.next()
        const name = file.getName()
        if (!empleadaNombre || normStr(name).includes(normStr(empleadaNombre))) {
          results.push({
            id:   file.getId(),
            name,
            url:  'https://drive.google.com/file/d/' + file.getId() + '/view',
            anio: yf.getName(),
            mes:  mf.getName(),
            date: file.getDateCreated().toISOString()
          })
        }
      }
    }
  }
  return { files: results.sort((a,b) => b.date.localeCompare(a.date)) }
}

// ─── HikVision — lector de emails y push a Next.js ───────────────

// Parsea fecha DD/MM/YYYY → YYYY-MM-DD
function hikDate(s) {
  const parts = (s || '').trim().split('/')
  if (parts.length !== 3) return ''
  return parts[2] + '-' + parts[1] + '-' + parts[0]
}

// Parsea hora "09:30 AM" o "09:30:00" → "09:30"
function hikTime(s) {
  const m = (s || '').trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return (s || '').trim().substring(0, 5)
  let h = parseInt(m[1])
  if (m[3].toUpperCase() === 'AM') { if (h === 12) h = 0 }
  else { if (h !== 12) h += 12 }
  return (h < 10 ? '0' + h : '' + h) + ':' + m[2]
}

// Parsea el CSV de HIKVISION (separador auto-detectado ; o ,)
function parseHikCsv(text) {
  const preview = text.substring(0, 2000)
  const sep = (preview.match(/;/g) || []).length > (preview.match(/,/g) || []).length ? ';' : ','
  const lines = text.split(/\r?\n/)

  let hdrIdx = -1, hdr = []
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const cols = lines[i].split(sep).map(function(c) {
      return c.trim().toLowerCase().replace(/^["']|["']$/g, '')
    })
    if (cols.indexOf('id') >= 0) { hdrIdx = i; hdr = cols; break }
  }
  if (hdrIdx < 0) return []

  const iId = hdr.indexOf('id')
  const iF  = hdr.indexOf('fecha') >= 0 ? hdr.indexOf('fecha') : hdr.indexOf('date')
  const iT  = hdr.indexOf('tiempo') >= 0 ? hdr.indexOf('tiempo') : hdr.indexOf('time')
  if (iId < 0 || iF < 0 || iT < 0) return []

  const out = []
  for (let i = hdrIdx + 1; i < lines.length; i++) {
    const r = lines[i].split(sep).map(function(c) { return c.trim().replace(/^["']|["']$/g, '') })
    const reloj = r[iId] || ''
    const fecha = hikDate(r[iF] || '')
    const hora  = hikTime(r[iT] || '')
    if (!reloj || !fecha || !hora) continue
    out.push({ reloj: reloj, fecha: fecha, hora: hora })
  }
  return out
}

// Lee los emails de HIKVISION de los últimos N días y pushea al Next.js API
function hikDailySync(daysBack) {
  daysBack = daysBack || 2
  const props      = PropertiesService.getScriptProperties()
  const APP_URL    = props.getProperty('APP_URL')
  const APP_SECRET = props.getProperty('APP_SECRET')
  const HIK_QUERY  = props.getProperty('HIK_EMAIL_QUERY') || 'subject:Daily Report'

  if (!APP_URL || !APP_SECRET) {
    Logger.log('[HIK] Faltan APP_URL o APP_SECRET en Script Properties')
    return { ok: false, error: 'APP_URL o APP_SECRET no configurados' }
  }

  // Fecha límite para buscar emails (format yyyy/MM/dd)
  const since = new Date(Date.now() - daysBack * 24 * 3600 * 1000)
  const sinceStr = Utilities.formatDate(since, 'America/Argentina/Buenos_Aires', 'yyyy/MM/dd')
  const query = HIK_QUERY + ' after:' + sinceStr

  Logger.log('[HIK] Buscando emails: ' + query)
  const threads = GmailApp.search(query, 0, 50)
  Logger.log('[HIK] Threads encontrados: ' + threads.length)

  let allRows = []

  for (let t = 0; t < threads.length; t++) {
    const messages = threads[t].getMessages()
    for (let m = 0; m < messages.length; m++) {
      const msg = messages[m]
      const atts = msg.getAttachments()

      // Primero buscar adjuntos CSV
      let found = false
      for (let a = 0; a < atts.length; a++) {
        const att = atts[a]
        const name = att.getName().toLowerCase()
        if (name.indexOf('.csv') < 0 && name.indexOf('.txt') < 0) continue
        const csv = att.getDataAsString('ISO-8859-1')
        const rows = parseHikCsv(csv)
        if (rows.length) {
          Logger.log('[HIK] ' + rows.length + ' fichadas del adjunto: ' + att.getName())
          allRows = allRows.concat(rows)
          found = true
        }
      }

      // Si no hay adjunto, intentar parsear el cuerpo del email
      if (!found) {
        const body = msg.getPlainBody()
        if (body && body.indexOf('id') >= 0) {
          const rows = parseHikCsv(body)
          if (rows.length) {
            Logger.log('[HIK] ' + rows.length + ' fichadas del cuerpo del email')
            allRows = allRows.concat(rows)
          }
        }
      }
    }
  }

  if (!allRows.length) {
    Logger.log('[HIK] No se encontraron fichadas en los emails')
    return { ok: true, rows: 0, message: 'Sin fichadas nuevas' }
  }

  // Deduplicar por reloj|fecha|hora
  const seen = {}
  const unique = []
  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i]
    const key = r.reloj + '|' + r.fecha + '|' + r.hora
    if (!seen[key]) { seen[key] = true; unique.push(r) }
  }
  Logger.log('[HIK] Total únicas: ' + unique.length + ' (de ' + allRows.length + ')')

  // Llamar al Next.js API
  const res = UrlFetchApp.fetch(
    APP_URL + '/api/importar/fichadas-hik/push?secret=' + encodeURIComponent(APP_SECRET),
    {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({ rows: unique }),
      muteHttpExceptions: true
    }
  )

  const status = res.getResponseCode()
  const data   = JSON.parse(res.getContentText())
  Logger.log('[HIK] API response ' + status + ': ' + JSON.stringify(data))
  return { ok: status < 300, status: status, result: data }
}

// Ejecutar manualmente una vez para instalar el trigger diario
function installHikDailyTrigger() {
  // Eliminar triggers existentes de hikDailySync para no duplicar
  const triggers = ScriptApp.getProjectTriggers()
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'hikDailySync') {
      ScriptApp.deleteTrigger(triggers[i])
    }
  }
  // Crear trigger diario a las 9:00 AM (hora Argentina)
  ScriptApp.newTrigger('hikDailySync')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .inTimezone('America/Argentina/Buenos_Aires')
    .create()
  Logger.log('[HIK] Trigger diario instalado (9 AM Argentina)')
}
