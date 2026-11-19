// Worker de PDF.js (versión legacy, para navegadores menos nuevos como Safari del iPhone) con el complemento
// para los que no tienen Map.getOrInsertComputed (se carga primero)
import './pdf-compat.mjs'
import './pdf.worker.legacy.min.mjs'
