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

// Más difícil: datos poco conocidos y opciones parecidas (con alguna trampa)
const LA_PLATA_ARGENTINA: PreguntaEjemplo[] = [
  t('¿En qué año se fundó La Plata?', ['1880', '1882', '1884', '1886'], 1),
  oculta('Gustavo_Cerati', QUIEN, ['Charly García', 'Fito Páez', 'Gustavo Cerati', 'Andrés Calamaro'], 2),
  t('¿Quién diseñó el trazado de la ciudad de La Plata?', ['Carlos Thays', 'Pedro Benoit', 'Francesco Tamburini', 'Juan A. Buschiazzo'], 1),
  img('Ischigualasto_Provincial_Park', PROVINCIA, ['La Rioja', 'San Juan', 'Catamarca', 'Mendoza'], 1),
  abierta(),
  t('¿Qué nombre tuvo La Plata entre 1952 y 1955?', ['Ciudad Evita', 'Ciudad Presidente Perón', 'Ciudad Eva Perón', 'Ciudad 17 de Octubre'], 2),
  t('¿Quién presidía el Congreso de Tucumán el 9 de julio de 1816?', ['Juan José Paso', 'Francisco N. de Laprida', 'Fray Justo Santa María de Oro', 'Juan M. de Pueyrredón'], 1),
  oculta('Julio_Cortázar', QUIEN, ['Jorge Luis Borges', 'Ernesto Sabato', 'Adolfo Bioy Casares', 'Julio Cortázar'], 3),
  t('¿En qué año se terminaron las torres de la Catedral de La Plata?', ['1932', '1965', '1999', '2012'], 2),
  img('Iberá_Wetlands', PROVINCIA, ['Misiones', 'Corrientes', 'Entre Ríos', 'Chaco'], 1),
  abierta(),
  t('¿Qué le pasó en 1977 al edificio original del Teatro Argentino de La Plata?', ['Lo demolieron para ampliar la avenida', 'Se derrumbó en una tormenta', 'Se incendió', 'Lo cerraron y quedó abandonado'], 2),
  t('¿Quién compuso la música del Himno Nacional Argentino?', ['Vicente López y Planes', 'Blas Parera', 'Juan Pedro Esnaola', 'Carlos Guastavino'], 1),
  img('Quino', QUIEN, ['Roberto Fontanarrosa', 'Liniers', 'Quino', 'Caloi'], 2),
  t('¿En qué localidad del Gran La Plata está la República de los Niños?', ['City Bell', 'Villa Elisa', 'Tolosa', 'Manuel B. Gonnet'], 3),
  img('Valdes_Peninsula', PROVINCIA, ['Río Negro', 'Chubut', 'Santa Cruz', 'Buenos Aires'], 1),
  abierta(),
  t('¿Quién fundó el Museo de Ciencias Naturales de La Plata?', ['Florentino Ameghino', 'Hermann Burmeister', 'Francisco P. Moreno', 'Eduardo Holmberg'], 2),
  t('¿En qué año votaron las mujeres por primera vez en una elección nacional?', ['1912', '1947', '1951', '1958'], 2),
  oculta('Luciana_Aymar', QUIEN, ['Paula Pareto', 'Luciana Aymar', 'Gabriela Sabatini', 'Delfina Merino'], 1),
  t('¿A qué equipo le ganó Estudiantes la Copa Intercontinental de 1968?', ['Milan', 'Real Madrid', 'Manchester United', 'Ajax'], 2),
  img('Curutchet_House', '¿Qué edificio de La Plata es?', ['Pasaje Dardo Rocha', 'Casa Curutchet', 'Teatro Argentino', 'Palacio Legislativo'], 1),
  abierta(),
  oculta('Puente_del_Inca', PROVINCIA, ['San Juan', 'Mendoza', 'Neuquén', 'Salta'], 1),
  t('¿Cuál es el punto más bajo de la Argentina?', ['Salinas Grandes', 'Bajo del Gualicho', 'Laguna Mar Chiquita', 'Laguna del Carbón'], 3),
]

export const PLANTILLAS: Plantilla[] = [
  { nombre: 'Trivia La Plata y Argentina (difícil)', desc: '25 preguntas difíciles: La Plata, historia, famosos, lugares de Argentina y 4 fotos para completar', preguntas: LA_PLATA_ARGENTINA },
]
