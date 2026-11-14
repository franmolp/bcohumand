// Palabras para el juego del impostor, por categoría. "Mis palabras" las escribe la laptop.
export const CATEGORIAS_IMPOSTOR: { nombre: string; palabras: string[] }[] = [
  { nombre: 'Comidas', palabras: ['Asado', 'Empanada', 'Milanesa', 'Pizza', 'Sushi', 'Choripán', 'Ñoquis', 'Locro', 'Alfajor', 'Medialuna', 'Hamburguesa', 'Tarta', 'Flan', 'Helado', 'Provoleta', 'Fideos', 'Tacos', 'Ensalada', 'Panqueque', 'Pochoclo'] },
  { nombre: 'Lugares', palabras: ['Playa', 'Hospital', 'Aeropuerto', 'Escuela', 'Cine', 'Supermercado', 'Gimnasio', 'Estadio', 'Biblioteca', 'Banco', 'Iglesia', 'Zoológico', 'Peluquería', 'Boliche', 'Shopping', 'Cementerio', 'Hotel', 'Farmacia', 'Plaza', 'Museo'] },
  { nombre: 'Animales', palabras: ['Perro', 'Gato', 'Elefante', 'Jirafa', 'León', 'Pingüino', 'Tiburón', 'Caballo', 'Vaca', 'Mono', 'Delfín', 'Cocodrilo', 'Águila', 'Serpiente', 'Conejo', 'Oso', 'Tortuga', 'Hormiga', 'Loro', 'Ballena'] },
  { nombre: 'Objetos', palabras: ['Paraguas', 'Celular', 'Llave', 'Espejo', 'Almohada', 'Reloj', 'Tijera', 'Mate', 'Guitarra', 'Bicicleta', 'Heladera', 'Control remoto', 'Anteojos', 'Mochila', 'Vela', 'Escoba', 'Termo', 'Cepillo de dientes', 'Lámpara', 'Billetera'] },
  { nombre: 'Profesiones', palabras: ['Médico', 'Bombero', 'Docente', 'Policía', 'Cocinero', 'Peluquero', 'Abogado', 'Piloto', 'Albañil', 'Veterinario', 'Dentista', 'Taxista', 'Periodista', 'Astronauta', 'Electricista', 'Mozo', 'Futbolista', 'Plomero', 'Contador', 'Cajero'] },
  { nombre: 'Deportes', palabras: ['Fútbol', 'Tenis', 'Básquet', 'Vóley', 'Natación', 'Boxeo', 'Rugby', 'Hockey', 'Golf', 'Ciclismo', 'Pádel', 'Esquí', 'Surf', 'Ajedrez', 'Atletismo', 'Polo', 'Handball', 'Yoga', 'Patinaje', 'Pesca'] },
  { nombre: 'Belleza', palabras: ['Esmalte', 'Planchita', 'Secador', 'Tintura', 'Pestañas', 'Labial', 'Rímel', 'Depilación', 'Masaje', 'Manicura', 'Corte', 'Brushing', 'Keratina', 'Perfume', 'Crema', 'Maquillaje', 'Cejas', 'Peine', 'Mascarilla', 'Uñas esculpidas'] },
  { nombre: 'Fiestas', palabras: ['Cumpleaños', 'Casamiento', 'Navidad', 'Año Nuevo', 'Egresados', 'Baby shower', 'Despedida de soltero', 'Halloween', 'Carnaval', 'Quince', 'Bautismo', 'Asado del domingo', 'Mundial', 'Graduación', 'Día de la Madre', 'Reencuentro', 'Karaoke', 'Pijamada', 'After office', 'Picnic'] },
]
export const MIS_PALABRAS = 'Mis palabras'
export const TODAS = 'Todas mezcladas'

// Elige categoría y palabra para una ronda (sin repetir palabras ya usadas mientras queden)
export function elegirPalabra(categoria: string, propias: string, usadas: string[], rnd: () => number) {
  const lista: { cat: string; p: string }[] =
    categoria === MIS_PALABRAS ? propias.split(/[\n,]/).map(p => p.trim()).filter(Boolean).map(p => ({ cat: '', p }))
    : CATEGORIAS_IMPOSTOR.filter(c => categoria === TODAS || c.nombre === categoria).flatMap(c => c.palabras.map(p => ({ cat: c.nombre, p })))
  if (!lista.length) return null
  const libres = lista.filter(x => !usadas.includes(x.p))
  const pool = libres.length ? libres : lista
  return pool[Math.floor(rnd() * pool.length)]
}
