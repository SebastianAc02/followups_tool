// Opciones validas de preferencias.vistaInicio (Fase 2 del perfil). Lista corta a
// proposito: solo las dos pantallas de trabajo diario, no cada ruta del cockpit.
export const VISTA_INICIO_OPCIONES = [
  { id: '/', nombre: 'Resumen' },
  { id: '/cola', nombre: 'Cola del día' },
] as const;
