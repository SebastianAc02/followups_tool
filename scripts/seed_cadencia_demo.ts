// Siembra en pruebas.db la cadencia de la demo: 8 toques intercalados (3 correos, 3
// WhatsApp, 2 llamadas), un toque por dia. Idempotente: si ya existe una cadencia con el
// mismo nombre, la borra con sus pasos y versiones antes de rehacerla.
//
// OFFSETS CONSECUTIVOS (0..7) A PROPOSITO. Una cadencia real deja aire entre toques (la
// de importacion usa 0/3/7) para no quemar al prospecto; esta existe para hacer VISIBLE
// el motor: con un toque por dia, cada clic de "Siguiente dia" dispara exactamente un
// paso y los 8 se ven en 8 clics. Lo que se demuestra igual que en produccion: el orden,
// la alternancia de canales, el re-anclaje y el corte por respuesta.
//
// Correr: node --experimental-strip-types \
//   --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/seed_cadencia_demo.ts
import { eq, inArray } from 'drizzle-orm';
import { marcarModoPrueba } from '../app/lib/modo-prueba.ts';
import { marcarSoloLectura } from '../app/lib/read-only.ts';
import { dbPruebas } from '../app/db/index.ts';
import { cadencia, pasoCadencia, versionPaso } from '../app/db/schema.ts';
import type { CadenciaParseada } from '../app/core/cadencia-parser.ts';

marcarModoPrueba(true);
marcarSoloLectura(false);

const { crearCadencia } = await import('../app/db/repository.ts');

const NOMBRE = 'Demo 8 toques intercalados';

// [nombre] es la variable de personalizacion (un corchete), igual que la cadencia de
// importacion. El copy dice "prueba" en el asunto a proposito: estos correos llegan de
// verdad a buzones reales y tienen que ser reconocibles de un vistazo.
const CADENCIA: CadenciaParseada = {
  nombre: NOMBRE,
  descripcion: 'Cadencia de demo: 3 correos, 3 WhatsApp y 2 llamadas intercalados, un toque por dia.',
  pasos: [
    {
      orden: 1,
      diaOffset: 0,
      canal: 'correo',
      asunto: '[prueba] Hola [nombre], una pregunta rapida',
      cuerpo: 'Hola [nombre],\n\nTe escribo para validar el flujo de seguimiento de OnePay. Este es el toque 1 de 8.\n\nSi respondes a este correo, la secuencia se corta sola.',
    },
    {
      orden: 2,
      diaOffset: 1,
      canal: 'whatsapp',
      cuerpo: 'Hola [nombre], te dejo por aca el mismo mensaje del correo. Toque 2 de 8 (WhatsApp).',
    },
    {
      orden: 3,
      diaOffset: 2,
      canal: 'llamada',
      objetivo: 'Confirmar si vio el correo y agendar 15 minutos',
      cuerpo: 'Toque 3 de 8 (llamada). Preguntar si le llego el correo del dia 0 y si tiene 15 minutos esta semana.',
    },
    {
      orden: 4,
      diaOffset: 3,
      canal: 'correo',
      asunto: '[prueba] [nombre], te dejo un caso concreto',
      cuerpo: 'Hola [nombre],\n\nToque 4 de 8. Segundo correo de la secuencia, ya con el re-anclaje del motor en juego.',
    },
    {
      orden: 5,
      diaOffset: 4,
      canal: 'whatsapp',
      cuerpo: 'Hola [nombre], toque 5 de 8. Segundo WhatsApp.',
    },
    {
      orden: 6,
      diaOffset: 5,
      canal: 'llamada',
      objetivo: 'Segundo intento de contacto telefonico',
      cuerpo: 'Toque 6 de 8 (llamada). Segundo intento; si no contesta, queda el ultimo correo y el cierre por WhatsApp.',
    },
    {
      orden: 7,
      diaOffset: 6,
      canal: 'correo',
      asunto: '[prueba] [nombre], cierro el ciclo',
      cuerpo: 'Hola [nombre],\n\nToque 7 de 8. Ultimo correo de la secuencia.',
    },
    {
      orden: 8,
      diaOffset: 7,
      canal: 'whatsapp',
      cuerpo: 'Hola [nombre], toque 8 de 8. Ultimo mensaje: aca termina la cadencia.',
    },
  ],
};

// Idempotencia: borra la version anterior de ESTA cadencia (por nombre) con sus pasos y
// versiones. version_paso cuelga de paso_cadencia y paso_cadencia de cadencia, pero
// SQLite corre con foreign_keys = 0 (ver el spec), asi que el borrado en cascada es a
// mano y en orden hijo -> padre.
const previa = dbPruebas.select({ id: cadencia.idCadencia }).from(cadencia).where(eq(cadencia.nombre, NOMBRE)).all();
for (const c of previa) {
  const pasos = dbPruebas.select({ id: pasoCadencia.idPaso }).from(pasoCadencia).where(eq(pasoCadencia.idCadencia, c.id)).all();
  const ids = pasos.map((p) => p.id);
  if (ids.length > 0) dbPruebas.delete(versionPaso).where(inArray(versionPaso.idPaso, ids)).run();
  dbPruebas.delete(pasoCadencia).where(eq(pasoCadencia.idCadencia, c.id)).run();
  dbPruebas.delete(cadencia).where(eq(cadencia.idCadencia, c.id)).run();
}

const idCadencia = crearCadencia(CADENCIA);

const porCanal = CADENCIA.pasos.reduce<Record<string, number>>((acc, p) => {
  acc[p.canal] = (acc[p.canal] ?? 0) + 1;
  return acc;
}, {});
console.log(`Cadencia "${NOMBRE}" creada en pruebas.db con id ${idCadencia}`);
console.log(`${CADENCIA.pasos.length} toques:`, JSON.stringify(porCanal));
console.log('Dias:', CADENCIA.pasos.map((p) => `d${p.diaOffset} ${p.canal}`).join(' -> '));
