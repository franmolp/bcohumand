import type { Pregunta } from '@/lib/fiesta'

// Trivias listas para cargar desde el editor ("+ Trivia de ejemplo"). Las imágenes y las canciones se
// buscan al momento de agregarlas: `wiki` = artículo de Wikipedia (en inglés) del que se toma la foto
// principal; `busqueda` = tema a buscar en Apple Music (fragmento de 30 s) y `artista` = parte del nombre
// del artista que tiene que coincidir, para no agarrar un cover.
export type PreguntaEjemplo = Omit<Pregunta, 'id' | 'imagen' | 'audio' | 'cancion'> & { wiki?: string; busqueda?: string; artista?: string }
export interface Plantilla { nombre: string; desc: string; preguntas: PreguntaEjemplo[] }

const que = '¿Qué canción es?', quien = '¿Quién la canta?'

const VARIADA: PreguntaEjemplo[] = [
  { tipo: 'texto', texto: '¿En qué año abrió Beauty Co.?', opciones: ['2015', '2016', '2017', '2018'], correcta: 2, duracion: 20 },
  { tipo: 'imagen', wiki: 'Machu_Picchu', texto: '¿En qué país queda este lugar?', opciones: ['Bolivia', 'Perú', 'México', 'Chile'], correcta: 1, duracion: 20 },
  { tipo: 'texto', texto: '¿Qué significa “balayage” en francés?', opciones: ['Iluminar', 'Pintar', 'Barrer', 'Ondular'], correcta: 2, duracion: 20 },
  { tipo: 'musica', busqueda: 'Soda Stereo De música ligera', artista: 'soda stereo', texto: que, opciones: ['Persiana americana', 'De música ligera', 'Cuando pase el temblor', 'Té para tres'], correcta: 1, duracion: 30 },
  { tipo: 'revelar', wiki: 'Mona_Lisa', texto: '¿Qué obra de arte es?', opciones: ['La joven de la perla', 'El nacimiento de Venus', 'La Gioconda', 'La última cena'], correcta: 2, duracion: 30 },
  { tipo: 'texto', texto: '¿Qué vitamina es el retinol?', opciones: ['Vitamina A', 'Vitamina C', 'Vitamina D', 'Vitamina E'], correcta: 0, duracion: 20 },
  { tipo: 'votacion', texto: 'Si tuvieras un servicio gratis toda la vida, ¿cuál elegís?', opciones: ['Uñas', 'Pelo', 'Masajes', 'Depilación'], correcta: 0, duracion: 20 },
  { tipo: 'imagen', wiki: 'Taj_Mahal', texto: '¿En qué país queda este lugar?', opciones: ['Turquía', 'Egipto', 'Irán', 'India'], correcta: 3, duracion: 20 },
  { tipo: 'texto', texto: '¿De qué país viene la tendencia “K-beauty”?', opciones: ['Japón', 'Corea del Sur', 'China', 'Tailandia'], correcta: 1, duracion: 20 },
  { tipo: 'musica', busqueda: 'Bizarrap Shakira Bzrp Music Sessions 53', artista: 'shakira', texto: '¿Qué tema es?', opciones: ['Karol G — TQG', 'Rosalía — Despechá', 'Tini — Miénteme', 'Shakira — Bzrp Session #53'], correcta: 3, duracion: 30 },
  { tipo: 'texto', texto: '¿Qué indica el “FPS” de un protector solar?', opciones: ['Cuánto hidrata', 'La protección contra rayos UVB', 'Si es resistente al agua', 'Cuánto tarda en secarse'], correcta: 1, duracion: 20 },
  { tipo: 'revelar', wiki: 'The_Starry_Night', texto: '¿Qué pintura es?', opciones: ['El grito', 'Los girasoles', 'La noche estrellada', 'Impresión, sol naciente'], correcta: 2, duracion: 30 },
  { tipo: 'imagen', wiki: 'Perito_Moreno_Glacier', texto: '¿Cómo se llama este glaciar?', opciones: ['Upsala', 'Perito Moreno', 'Viedma', 'Grey'], correcta: 1, duracion: 20 },
  { tipo: 'texto', texto: '¿Cuál es la capa más externa de la piel?', opciones: ['Dermis', 'Hipodermis', 'Epidermis', 'Fascia'], correcta: 2, duracion: 20 },
  { tipo: 'musica', busqueda: 'Gilda No me arrepiento de este amor', artista: 'gilda', texto: que, opciones: ['Fuiste', 'Corazón valiente', 'Paisaje', 'No me arrepiento de este amor'], correcta: 3, duracion: 30 },
  { tipo: 'texto', texto: '¿En qué año ganó Argentina su tercera Copa del Mundo?', opciones: ['1986', '2014', '2018', '2022'], correcta: 3, duracion: 20 },
  { tipo: 'revelar', wiki: 'Obelisco_de_Buenos_Aires', texto: '¿Qué monumento es?', opciones: ['Monumento a la Bandera', 'Obelisco de Buenos Aires', 'Torre Monumental', 'Cabildo'], correcta: 1, duracion: 30 },
  { tipo: 'votacion', texto: '¿Qué es lo primero que hacés un sábado libre?', opciones: ['Dormir hasta tarde', 'Ir de compras', 'Juntarme con amigos', 'Maratón de series'], correcta: 0, duracion: 20 },
  { tipo: 'imagen', wiki: 'Iguazu_Falls', texto: '¿Qué maravilla natural es esta?', opciones: ['Cataratas del Niágara', 'Salto Ángel', 'Cataratas Victoria', 'Cataratas del Iguazú'], correcta: 3, duracion: 20 },
  { tipo: 'texto', texto: '¿Cuál es el músculo más grande del cuerpo humano?', opciones: ['Cuádriceps', 'Glúteo mayor', 'Dorsal ancho', 'Bíceps'], correcta: 1, duracion: 20 },
]

const m = (busqueda: string, artista: string, texto: string, opciones: string[], correcta: number): PreguntaEjemplo =>
  ({ tipo: 'musica', busqueda, artista, texto, opciones, correcta, duracion: 30 })

const MUSICAL: PreguntaEjemplo[] = [
  m('Gilda No me arrepiento de este amor', 'gilda', que, ['Fuiste', 'Corazón valiente', 'No me arrepiento de este amor', 'Paisaje'], 2),
  m('Los Palmeras Bombón asesino', 'palmeras', quien, ['Los Palmeras', 'Ráfaga', 'Amar Azul', 'Los del Fuego'], 0),
  m('Rodrigo Lo mejor del amor', 'rodrigo', que, ['La mano de Dios', 'Lo mejor del amor', 'Soy cordobés', 'Fuego y pasión'], 1),
  m('Damas Gratis Se te ve la tanga', 'damas gratis', quien, ['Pibes Chorros', 'Los Wachiturros', 'Damas Gratis', 'Supermerk2'], 2),
  m('Amar Azul Yo tomo licor', 'amar azul', que, ['Una cerveza', 'Yo tomo licor', 'Quién se tomó todo el vino', 'Borracho y loco'], 1),
  m('Ráfaga Mentirosa', 'rafaga', quien, ['Grupo Green', 'Los del Fuego', 'Karina', 'Ráfaga'], 3),
  m('La Mona Jiménez Quién se tomó todo el vino', 'mona', quien, ['Rodrigo', 'La Mona Jiménez', 'Ulises Bueno', 'Banda XXI'], 1),
  m('Agapornis Mil horas', 'agapornis', quien, ['Agapornis', 'Los Auténticos Decadentes', 'Karina', 'Rombai'], 0),
  m('Antonio Ríos Nunca me faltes', 'antonio r', que, ['Mil horas', 'Ámame', 'Nunca me faltes', 'Mentirosa'], 2),
  { tipo: 'votacion', texto: '¿Qué es lo que más se baila en la fiesta?', opciones: ['Cumbia', 'Cuarteto', 'Reggaetón', 'Rock nacional'], correcta: 0, duracion: 20 },
  m('Los Wachiturros Tirate un paso', 'wachiturros', quien, ['Damas Gratis', 'Los Wachiturros', 'Pibes Chorros', 'Mala Fama'], 1),
  m('Karina Corazón mentiroso', 'karina', quien, ['Gilda', 'Ángela Leiva', 'Karina', 'Tini'], 2),
  m('Los Auténticos Decadentes La guitarra', 'decadentes', que, ['El murguero', 'Loco (tu forma de ser)', 'Corazón', 'La guitarra'], 3),
  m('L-Gante Bzrp Music Sessions 38', 'l-gante', quien, ['L-Gante', 'Duki', 'Callejero Fino', 'Trueno'], 0),
  m('Los del Fuego Ámame', 'del fuego', que, ['Ámame', 'Mentirosa', 'Nunca me faltes', 'Una cerveza'], 0),
  m('Rodrigo La mano de Dios', 'rodrigo', que, ['Soy cordobés', 'Lo mejor del amor', 'La mano de Dios', 'Como olvidarla'], 2),
  m('Damas Gratis No te creas tan importante', 'damas gratis', que, ['Se te ve la tanga', 'No te creas tan importante', 'Tirate un paso', 'Yo tomo licor'], 1),
  m('Soda Stereo De música ligera', 'soda stereo', que, ['Persiana americana', 'Cuando pase el temblor', 'De música ligera', 'Té para tres'], 2),
  m('Los Fabulosos Cadillacs Matador', 'cadillacs', quien, ['Los Pericos', 'Los Fabulosos Cadillacs', 'Bersuit Vergarabat', 'Divididos'], 1),
  m('Abel Pintos Sin principio ni final', 'abel pintos', quien, ['Luciano Pereyra', 'Axel', 'Abel Pintos', 'Soledad'], 2),
]

export const PLANTILLAS: Plantilla[] = [
  { nombre: 'Trivia de ejemplo', desc: '20 preguntas variadas: belleza, lugares, obras de arte, música y votaciones', preguntas: VARIADA },
  { nombre: 'Trivia musical argentina', desc: '19 temas de cumbia, cuarteto y rock nacional + 1 votación', preguntas: MUSICAL },
]
