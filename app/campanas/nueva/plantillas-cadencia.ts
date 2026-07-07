// Biblioteca de secuencias de ejemplo para la vista de importar cadencia. Son
// plantillas de EJEMPLO/TEST (arrancar rápido o probar el flujo), no cadencias
// reales de campaña. Mismo formato Markdown que espera parsearCadenciaMarkdown
// (ver app/core/cadencia-parser.ts): "# Nombre", luego "## Día N · canal · asunto"
// por paso, con el cuerpo debajo hasta el siguiente encabezado.

export type PlantillaCadencia = {
  id: string;
  nombre: string;
  descripcion: string;
  contenido: string;
};

export const PLANTILLAS_CADENCIA: PlantillaCadencia[] = [
  {
    id: 'corta-prueba',
    nombre: 'Cadencia corta de prueba',
    descripcion: 'Plantilla de ejemplo (uso interno/testing). 3 toques en día 0, 3 y 7, correo y llamada.',
    contenido: [
      '# Cadencia corta de prueba',
      'Ejemplo de 3 toques para probar el flujo de importación rápido.',
      '',
      '## Día 0 · correo · Hola [nombre], una pregunta rápida sobre [empresa]',
      'Hola [nombre],',
      '',
      'Te escribo porque vimos que [empresa] podría estar pagando de más por el servicio de internet.',
      'Quería preguntarte si tiene sentido revisarlo 15 minutos esta semana.',
      '',
      '[[firma]]',
      '',
      '## Día 3 · llamada',
      'Llamar para confirmar si vio el correo y agendar la revisión de 15 minutos.',
      '',
      '## Día 7 · whatsapp · Seguimiento',
      'Hola [nombre], te dejo por acá el mismo mensaje del correo por si se te pasó.',
      'Cualquier duda me cuentas.',
    ].join('\n'),
  },
  {
    id: 'estandar-isp-frio',
    nombre: 'Cadencia estándar ISP frío',
    descripcion: 'Plantilla de ejemplo (uso interno/testing). 5 toques mezclando correo, llamada y whatsapp en dos semanas.',
    contenido: [
      '# Cadencia estándar ISP frío',
      'Secuencia de ejemplo para un primer contacto en frío con un ISP, dos semanas de duración.',
      '',
      '## Día 0 · correo · [empresa]: una revisión rápida de tu costo de internet',
      'Hola [nombre],',
      '',
      'Trabajamos con proveedores de internet como [empresa] ayudándolos a bajar costos de tránsito y peering.',
      'Si tiene sentido, te propongo una llamada corta esta semana.',
      '',
      '[[firma]]',
      '',
      '## Día 2 · llamada',
      'Primer intento de llamada. Objetivo: confirmar que [nombre] recibió el correo y agendar la reunión.',
      '',
      '## Día 5 · whatsapp · Seguimiento correo',
      'Hola [nombre], te escribí por correo el [dia_envio] sobre optimizar costos de internet en [empresa].',
      'Te aviso que sigo pendiente por si prefieres coordinar por acá.',
      '',
      '## Día 9 · correo · Última idea antes de seguir',
      'Hola [nombre],',
      '',
      'Sé que las agendas se llenan rápido. Te dejo un caso concreto de un ISP similar a [empresa] que bajó su costo de tránsito en el primer trimestre.',
      'Si quieres lo revisamos juntos.',
      '',
      '[[firma]]',
      '',
      '## Día 14 · llamada',
      'Cierre del ciclo: última llamada antes de mover la cuenta a seguimiento frío.',
    ].join('\n'),
  },
  {
    id: 'reactivacion-dos-toques',
    nombre: 'Reactivación express',
    descripcion: 'Plantilla de ejemplo (uso interno/testing). 2 toques para reabrir una cuenta que quedó fría.',
    contenido: [
      '# Reactivación express',
      'Ejemplo mínimo de 2 toques para retomar contacto con una cuenta fría.',
      '',
      '## Día 0 · whatsapp · Retomar contacto',
      'Hola [nombre], hace un tiempo hablamos sobre el servicio de internet de [empresa].',
      'Quería saber si sigue siendo un buen momento para retomar la conversación.',
      '',
      '## Día 4 · llamada',
      'Llamar si no hubo respuesta al whatsapp. Objetivo: confirmar interés o cerrar la cuenta.',
    ].join('\n'),
  },
];
