// Demo de cierre de Fase 4 (V4.8). Corre el flujo completo EN SECO contra la DB que
// apunte ISPS_DB_PATH (usar SIEMPRE una copia, nunca isps.db real). No envia nada.
//   1. sube una cadencia real (import estilo Markdown ya parseado)
//   2. guarda el segmento on-hold
//   3. crea la campana (cadencia + segmento) e inscribe
//   4. demuestra "una activa por empresa" (cambio de campana deja historial)
//   5. calcula los toques de manana EN SECO
//
// Correr: ISPS_DB_PATH=/ruta/a/copia.db node --experimental-strip-types \
//   --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/demo_fase4.ts

import {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  inscribirCampana,
  historialInscripciones,
  agendaEnSeco,
  empresasDeSegmentoGuardado,
} from '../app/db/repository.ts';
import { plusDias } from '../app/lib/date-utils.ts';

// Guard duro, no solo el comentario de arriba: esta demo hace escrituras reales. Si
// ISPS_DB_PATH no esta o apunta a un archivo isps.db (la base real), aborta antes de
// tocar nada. La convencion sola no basta: un env var olvidado mutaria produccion.
const dbPath = process.env.ISPS_DB_PATH;
if (!dbPath || /(^|\/)isps\.db$/.test(dbPath)) {
  throw new Error('ISPS_DB_PATH debe apuntar a una COPIA (nunca isps.db real). Aborta la demo.');
}

function h(titulo: string) {
  console.log('\n== ' + titulo + ' ==');
}

h('1. Subir la cadencia (una vez)');
const idCadencia = crearCadencia({
  nombre: 'ISP outbound Tier 1',
  descripcion: 'cadencia real de outbound',
  pasos: [
    { orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Me presento', cuerpo: 'Hola, soy Sebastian de OnePay.' },
    { orden: 2, diaOffset: 3, canal: 'whatsapp', cuerpo: 'Segui por aca, avisame.' },
    { orden: 3, diaOffset: 6, canal: 'correo', asunto: 'Un ultimo intento', cuerpo: 'Te dejo esto por si acaso.' },
    { orden: 4, diaOffset: 7, canal: 'llamada', asunto: 'Cierre', cuerpo: 'Guion de la llamada.' },
  ],
});
console.log('cadencia creada id=', idCadencia, '(4 pasos, cada uno con su version default)');

h('2. Guardar el segmento on-hold');
const idSegmento = guardarSegmento({
  nombre: 'on-hold',
  definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] },
  descripcionNatural: 'los que estan en on-hold',
});
const empresas = empresasDeSegmentoGuardado(idSegmento) ?? [];
console.log('segmento on-hold id=', idSegmento, '->', empresas.length, 'empresas');

h('3. Crear la campana e inscribir el segmento');
const idCampana = crearCampana({ nombre: 'On-hold reactivacion', idCadencia, idSegmento });
const res = inscribirCampana(idCampana);
console.log('inscritas (activas):', res.inscritas);
console.log('bloqueadas (sin email, cola de revision):', res.bloqueadas);
console.log('reemplazos:', res.reemplazos, '| saltadas:', res.saltadas);

h('4. Una activa por empresa: cambio de campana deja historial');
const conActiva = empresas.find((e) => historialInscripciones(e.id).some((i) => i.estado === 'activa'));
if (conActiva) {
  const idCampana2 = crearCampana({ nombre: 'On-hold experimento B', idCadencia, idSegmento });
  inscribirCampana(idCampana2);
  const h2 = historialInscripciones(conActiva.id);
  console.log('empresa', conActiva.nombre);
  console.log('  activas ahora:', h2.filter((i) => i.estado === 'activa').length, '(debe ser 1)');
  console.log('  finalizadas:', h2.filter((i) => i.estado === 'finalizada').length, 'con motivo:', h2.find((i) => i.estado === 'finalizada')?.motivoFin);
}

h('5. Toques de MANANA en seco (domingo bloqueado, corrimiento siguiente)');
const manana = plusDias(1);
const agenda = agendaEnSeco(manana, { diasBloqueados: [0], corrimiento: 'siguiente' });
console.log('fecha:', manana, '->', agenda.length, 'toques debidos');
for (const t of agenda.slice(0, 8)) {
  console.log('  ', t.empresa, '· paso', t.orden, '· objetivo', t.fecha);
}
if (agenda.length > 8) console.log('   ... y', agenda.length - 8, 'mas');

console.log('\nDemo OK. Nada se envio; todo son filas calculadas en seco.');
