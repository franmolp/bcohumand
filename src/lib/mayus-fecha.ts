// Regla: los días de la semana y los meses van siempre con la inicial en mayúscula ("Lun", "Enero").
// toLocaleDateString en español los devuelve en minúscula ("lunes, 5 de enero"): pasarlos por mayusFecha.
const NOMBRES = /(^|[^\p{L}])(lunes|martes|miércoles|jueves|viernes|sábado|domingo|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|lun|mar|mié|jue|vie|sáb|dom|ene|feb|abr|may|jun|jul|ago|sept|sep|oct|nov|dic)(?=[^\p{L}]|$)/gu
export const mayusFecha = (s: string) => s.replace(NOMBRES, (_, antes: string, p: string) => antes + p[0].toUpperCase() + p.slice(1))
