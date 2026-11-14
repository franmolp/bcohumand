import type { Pregunta } from '@/lib/fiesta'

// Trivias listas para cargar desde el editor. El botón desaparece cuando ya hay una trivia con ese nombre.
// `wiki` = artículo de Wikipedia (en inglés) del que se toma la foto principal al cargarla.
// Las preguntas sin `wiki` de tipo imagen quedan "abiertas" para que se cargue la foto a mano.
export type PreguntaEjemplo = Omit<Pregunta, 'id' | 'imagen' | 'audio' | 'cancion'> & { wiki?: string }
export interface Plantilla { nombre: string; desc: string; preguntas: PreguntaEjemplo[] }

const t = (texto: string, opciones: string[], correcta: number): PreguntaEjemplo => ({ tipo: 'texto', texto, opciones, correcta, duracion: 20 })
const img = (wiki: string, texto: string, opciones: string[], correcta: number): PreguntaEjemplo => ({ tipo: 'imagen', wiki, texto, opciones, correcta, duracion: 20 })
const oculta = (wiki: string, texto: string, opciones: string[], correcta: number): PreguntaEjemplo => ({ tipo: 'revelar', wiki, texto, opciones, correcta, duracion: 30 })
// Para completar en el editor: foto + nombres de las opciones
const abierta = (): PreguntaEjemplo => ({ tipo: 'revelar', texto: '¿Quién es?', opciones: ['', '', '', ''], correcta: 0, duracion: 30 })

const PROVINCIA = '¿En qué provincia queda este lugar?'
const QUIEN = '¿Quién es?'

const LA_PLATA_ARGENTINA: PreguntaEjemplo[] = [
  t('¿En qué año se fundó La Plata?', ['1810', '1853', '1882', '1910'], 2),
  oculta('Lionel_Messi', QUIEN, ['Ángel Di María', 'Lionel Messi', 'Sergio Agüero', 'Paulo Dybala'], 1),
  img('Iguazu_Falls', PROVINCIA, ['Corrientes', 'Misiones', 'Entre Ríos', 'Salta'], 1),
  t('¿Qué se conmemora el 9 de julio?', ['La Revolución de Mayo', 'El Día de la Bandera', 'La Declaración de la Independencia', 'El Día de la Soberanía'], 2),
  abierta(),
  t('¿Quién fundó la ciudad de La Plata?', ['Dardo Rocha', 'Julio A. Roca', 'Domingo F. Sarmiento', 'Bartolomé Mitre'], 0),
  img('Mirtha_Legrand', QUIEN, ['Susana Giménez', 'Graciela Borges', 'Mirtha Legrand', 'Moria Casán'], 2),
  img('Perito_Moreno_Glacier', PROVINCIA, ['Tierra del Fuego', 'Chubut', 'Neuquén', 'Santa Cruz'], 3),
  t('Según el trazado original de La Plata, ¿cada cuántas cuadras hay una plaza o parque?', ['Cada 3', 'Cada 6', 'Cada 10', 'Cada 12'], 1),
  img('La_Plata_Cathedral', '¿Qué edificio es?', ['Catedral de Buenos Aires', 'Basílica de Luján', 'Catedral de La Plata', 'Catedral de Córdoba'], 2),
  abierta(),
  t('¿En qué año fue la Revolución de Mayo?', ['1806', '1810', '1816', '1820'], 1),
  oculta('Ricardo_Darín', QUIEN, ['Guillermo Francella', 'Ricardo Darín', 'Oscar Martínez', 'Diego Peretti'], 1),
  img('Cerro_de_los_Siete_Colores', PROVINCIA, ['Jujuy', 'Mendoza', 'Catamarca', 'San Juan'], 0),
  t('¿Qué arquitecto famoso diseñó la Casa Curutchet, en La Plata?', ['Clorindo Testa', 'Le Corbusier', 'César Pelli', 'Frank Lloyd Wright'], 1),
  img('Susana_Giménez', QUIEN, ['Susana Giménez', 'Mirtha Legrand', 'Valeria Mazza', 'Nacha Guevara'], 0),
  abierta(),
  oculta('Estadio_Ciudad_de_La_Plata', '¿Qué estadio es?', ['Estadio Jorge Luis Hirschi', 'Estadio Juan Carmelo Zerillo', 'Estadio Monumental', 'Estadio Único de La Plata'], 3),
  t('¿Quién creó la bandera argentina?', ['José de San Martín', 'Manuel Belgrano', 'Mariano Moreno', 'Cornelio Saavedra'], 1),
  img('Talampaya_National_Park', PROVINCIA, ['San Luis', 'Salta', 'La Rioja', 'Tucumán'], 2),
  oculta('Lali_Espósito', QUIEN, ['Tini Stoessel', 'Lali Espósito', 'Nicki Nicole', 'Emilia Mernes'], 1),
  t('En La Plata, ¿qué noche se queman los muñecos gigantes?', ['El 24 de diciembre', 'El 31 de diciembre', 'El 6 de enero', 'El día del aniversario de la ciudad'], 1),
  abierta(),
  img('Les_Eclaireurs_Lighthouse', PROVINCIA, ['Santa Cruz', 'Chubut', 'Río Negro', 'Tierra del Fuego'], 3),
  t('¿En qué provincia está el Aconcagua, la montaña más alta de América?', ['San Juan', 'Mendoza', 'Neuquén', 'Salta'], 1),
]

export const PLANTILLAS: Plantilla[] = [
  { nombre: 'Trivia La Plata y Argentina', desc: '25 preguntas: La Plata, fechas patrias, famosos, lugares de Argentina y 4 fotos para completar', preguntas: LA_PLATA_ARGENTINA },
]
