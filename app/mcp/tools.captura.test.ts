// Los huecos de captura que se cerraron el 2026-07-25 (canal reunion, duracion, punteros de
// transcript, taxonomia de resultados, vocabulario cerrado de perdida y objecion, ejecutor por
// defecto, no-show, dia real del toque). Mismo patron que tools.write.test.ts: DB de archivo,
// ISPS_DB_PATH antes de importar el modulo, ids unicos por test.
//
// La prueba de aceptacion que persigue este archivo: un toque registrado el lunes tiene que
// poder responder solo las preguntas de ciclo -- cuando paso, que paso, cuanto duro, quien lo
// hizo, y si fue reunion, cuando estaba y cuando ocurrio.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { registrarToqueTool, marcarPerdidaTool, actividadTool, snapshotEstadosTool, moverEstadoTool, cambiarCadenciaTool, aplazarSeguimientoTool } =
  await import('./tools.ts');

test.after(() => borrarDbPrueba(dbPath));

function seedEmpresa(id: string, estado: string | null, idOrganizacion = 1, owner: string | null = null) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, organizacion_activa_id, owner)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?)`,
    )
    .run(id, `Empresa ${id}`, id, estado, idOrganizacion, owner);
  raw.close();
}

function leerToque(idEmpresa: string) {
  const raw = new Database(dbPath);
  const t = raw.prepare(`SELECT * FROM toque WHERE id_empresa = ? ORDER BY id_toque DESC`).get(idEmpresa) as any;
  raw.close();
  return t;
}

// --- canal reunion ----------------------------------------------------------------------

test('registrar_toque acepta canal reunion, que es el toque mas caro del dia y no cabia en el enum', () => {
  seedEmpresa('cap-reunion', 'contacto_iniciado');
  const r = registrarToqueTool(
    {
      idEmpresa: 'cap-reunion',
      canal: 'reunion',
      resultado: 'reunion_buena',
      duracionSegundos: 2700,
      reunionFechaPropuesta: '2026-07-27',
      reunionFechaOcurrida: '2026-07-27',
    } as any,
    1,
  );

  const t = leerToque('cap-reunion');
  assert.equal(t.canal, 'reunion');
  assert.equal(t.resultado, 'reunion_buena');
  assert.equal(t.duracion_segundos, 2700);
  // Lo que devuelve la tool sale de releer la fila, no de repetir el input.
  assert.equal(r.toque.canal, 'reunion');
  assert.equal(r.toque.duracionSegundos, 2700);
  assert.equal(r.toque.reunionFechaOcurrida, '2026-07-27');
});

// --- duracion ---------------------------------------------------------------------------

test('la duracion es opcional y se guarda tal cual; sin ella la columna queda en NULL, no en 0', () => {
  seedEmpresa('cap-dur', 'contacto_iniciado');
  registrarToqueTool({ idEmpresa: 'cap-dur', canal: 'llamada', resultado: 'no_contesto' } as any, 1);

  const t = leerToque('cap-dur');
  // NULL y 0 no son lo mismo: 0 seria una llamada de duracion cero, NULL es "no se sabe".
  assert.equal(t.duracion_segundos, null);
});

// --- punteros de transcript --------------------------------------------------------------

test('registrar_toque enlaza la grabacion: tldv para reuniones, granola para llamadas', () => {
  seedEmpresa('cap-tldv', 'reunion_agendada');
  registrarToqueTool(
    {
      idEmpresa: 'cap-tldv',
      canal: 'reunion',
      resultado: 'se_presento',
      reunionFechaOcurrida: '2026-07-27',
      transcriptProveedor: 'tldv',
      transcriptId: 'tldv-123',
      transcriptUrl: 'https://tldv.io/app/meetings/tldv-123',
    } as any,
    1,
  );
  const reunion = leerToque('cap-tldv');
  assert.equal(reunion.transcript_proveedor, 'tldv');
  assert.equal(reunion.transcript_id, 'tldv-123');
  assert.equal(reunion.transcript_url, 'https://tldv.io/app/meetings/tldv-123');

  seedEmpresa('cap-granola', 'contacto_iniciado');
  registrarToqueTool(
    {
      idEmpresa: 'cap-granola',
      canal: 'llamada',
      resultado: 'gerente_interesado_sin_agenda',
      transcriptProveedor: 'granola',
      transcriptId: 'gr-9',
    } as any,
    1,
  );
  const llamada = leerToque('cap-granola');
  assert.equal(llamada.transcript_proveedor, 'granola');
  assert.equal(llamada.transcript_id, 'gr-9');
});

test('un toque sin grabacion se registra igual: los tres punteros pueden quedar vacios', () => {
  seedEmpresa('cap-sin-grab', 'contacto_iniciado');
  // Una llamada por telefono o un WhatsApp pueden no quedar grabados en ningun lado. Eso no
  // invalida el toque ni bloquea la escritura.
  const r = registrarToqueTool({ idEmpresa: 'cap-sin-grab', canal: 'whatsapp', resultado: 'no_contesto' } as any, 1);
  assert.equal(r.toque.transcriptProveedor, null);
  assert.equal(r.toque.transcriptId, null);
  assert.equal(r.toque.transcriptUrl, null);
});

// --- taxonomia de resultados --------------------------------------------------------------

test('los resultados nuevos se escriben, y los cinco viejos siguen siendo validos', () => {
  seedEmpresa('cap-tax', 'contacto_iniciado');
  for (const resultado of ['pbx_sin_decisor', 'pbx_paso_gerente', 'reprogramar', 'ghosting', 'no_contesto']) {
    registrarToqueTool({ idEmpresa: 'cap-tax', canal: 'llamada', resultado } as any, 1);
  }
  const raw = new Database(dbPath);
  const filas = raw.prepare(`SELECT resultado FROM toque WHERE id_empresa = 'cap-tax'`).all() as any[];
  raw.close();
  assert.deepEqual(
    filas.map((f) => f.resultado).sort(),
    ['ghosting', 'no_contesto', 'pbx_paso_gerente', 'pbx_sin_decisor', 'reprogramar'],
  );
});

test('un resultado fuera del vocabulario NO se escribe: la tool lanza en vez de guardarlo', () => {
  seedEmpresa('cap-tax-mala', 'contacto_iniciado');
  assert.throws(() => registrarToqueTool({ idEmpresa: 'cap-tax-mala', canal: 'llamada', resultado: 'le_fue_bien' } as any, 1));
  const raw = new Database(dbPath);
  const n = raw.prepare(`SELECT count(*) n FROM toque WHERE id_empresa = 'cap-tax-mala'`).get() as any;
  raw.close();
  assert.equal(n.n, 0, 'no debe quedar rastro de un toque que no paso la validacion');
});

test('los resultados nuevos que AGENDAN mueven el embudo igual que contesto_reunion', () => {
  seedEmpresa('cap-agenda', 'contacto_iniciado');
  const r = registrarToqueTool(
    { idEmpresa: 'cap-agenda', canal: 'llamada', resultado: 'gerente_interesado_agenda', reunionFechaPropuesta: '2026-07-30' } as any,
    1,
  );
  assert.deepEqual(r.transicion, { de: 'contacto_iniciado', a: 'reunion_agendada' });
  assert.equal(r.empresa.estadoNotion, 'reunion_agendada');

  // Y la transicion queda marcada como venida de un toque, no de un barrido.
  const raw = new Database(dbPath);
  const h = raw.prepare(`SELECT origen FROM empresa_estado_historial WHERE id_empresa = 'cap-agenda'`).get() as any;
  raw.close();
  assert.equal(h.origen, 'toque');
});

// --- razon de perdida y objecion -----------------------------------------------------------

test('razonPerdida es obligatoria en los tres resultados de perdida, no solo en contesto_no', () => {
  seedEmpresa('cap-perd', 'oportunidad');
  for (const resultado of ['contesto_no', 'no_interesado', 'perdido']) {
    assert.throws(
      () => registrarToqueTool({ idEmpresa: 'cap-perd', canal: 'llamada', resultado } as any, 1),
      /razonPerdida/,
      `${resultado} debe exigir razonPerdida`,
    );
  }
});

test('razonPerdida y objecion son vocabulario cerrado, con la prosa aparte en su nota', () => {
  seedEmpresa('cap-voc', 'oportunidad');
  registrarToqueTool(
    {
      idEmpresa: 'cap-voc',
      canal: 'llamada',
      resultado: 'perdido',
      razonPerdida: 'no_califica_icp',
      razonPerdidaNota: 'Tamano insuficiente, el ISP es muy pequeno para el pricing actual.',
      objecion: 'precio',
      objecionNota: 'el costo fijo de 600 mil le pesa sobre 15 millones facturados',
    } as any,
    1,
  );
  const t = leerToque('cap-voc');
  assert.equal(t.razon_perdida, 'no_califica_icp');
  assert.equal(t.razon_perdida_nota, 'Tamano insuficiente, el ISP es muy pequeno para el pricing actual.');
  assert.equal(t.objecion, 'precio');
  assert.ok(t.objecion_nota.includes('600 mil'));

  // Un valor fuera de la lista no entra por la puerta del valor acotado.
  assert.throws(() =>
    registrarToqueTool(
      { idEmpresa: 'cap-voc', canal: 'llamada', resultado: 'perdido', razonPerdida: 'muy caro' } as any,
      1,
    ),
  );
});

test('marcar_perdida devuelve la empresa releida en on_hold y el toque con la razon acotada', () => {
  seedEmpresa('cap-mp', 'oportunidad');
  const r = marcarPerdidaTool(
    { idEmpresa: 'cap-mp', canal: 'llamada', razonPerdida: 'timing_malo', razonPerdidaNota: 'vuelve en enero' } as any,
    1,
  );
  assert.equal(r.empresa.estadoNotion, 'on_hold');
  assert.equal(r.toque.razonPerdida, 'timing_malo');
  assert.equal(r.toque.razonPerdidaNota, 'vuelve en enero');
  assert.deepEqual(r.transicion, { de: 'oportunidad', a: 'on_hold' });
});

// --- ejecutor por defecto -------------------------------------------------------------------

test('sin ejecutadoPor el toque queda a nombre de Sebastian; con el, a nombre de quien lo hizo', () => {
  seedEmpresa('cap-ejec', 'contacto_iniciado');
  const solo = registrarToqueTool({ idEmpresa: 'cap-ejec', canal: 'llamada', resultado: 'no_contesto' } as any, 1);
  assert.equal(solo.toque.ejecutadoPor, 'Sebastian Acosta Molina');

  const otro = registrarToqueTool(
    { idEmpresa: 'cap-ejec', canal: 'llamada', resultado: 'no_contesto', ejecutadoPor: 'Felipe Castro' } as any,
    1,
  );
  assert.equal(otro.toque.ejecutadoPor, 'Felipe Castro', 'el default no pisa a quien de verdad ejecuto');
});

// --- fecha real del toque ---------------------------------------------------------------------

test('el toque se puede fechar en el dia en que PASO, no en el dia en que se registro', () => {
  seedEmpresa('cap-fecha', 'contacto_iniciado');
  const r = registrarToqueTool(
    { idEmpresa: 'cap-fecha', canal: 'llamada', resultado: 'no_contesto', fecha: '2026-07-20' } as any,
    1,
  );
  assert.equal(r.toque.fechaDia, '2026-07-20');
  // El timestamp completo cae en el MISMO dia: las dos columnas no pueden contradecirse.
  assert.equal((r.toque.fecha ?? '').slice(0, 10), '2026-07-20');
});

test('una fecha que no es un dia real se rechaza: el campo dejo de ser texto libre', () => {
  seedEmpresa('cap-fecha-mala', 'contacto_iniciado');
  for (const fecha of ['inicios de junio', '2026-13-01', '20/07/2026', '2026-02-31']) {
    assert.throws(
      () => registrarToqueTool({ idEmpresa: 'cap-fecha-mala', canal: 'llamada', resultado: 'no_contesto', fecha } as any, 1),
      `"${fecha}" no deberia entrar`,
    );
  }
});

// --- no-show --------------------------------------------------------------------------------

test('no_llego se escribe con canal reunion y actividad lo devuelve distinguible, con su fecha incumplida', () => {
  const ORG = 7701;
  seedEmpresa('cap-noshow', 'reunion_agendada', ORG);
  seedEmpresa('cap-siok', 'reunion_agendada', ORG);

  registrarToqueTool(
    {
      idEmpresa: 'cap-noshow',
      canal: 'reunion',
      resultado: 'no_llego',
      fecha: '2026-07-27',
      reunionFechaPropuesta: '2026-07-27',
    } as any,
    ORG,
  );
  registrarToqueTool(
    {
      idEmpresa: 'cap-siok',
      canal: 'reunion',
      resultado: 'se_presento',
      fecha: '2026-07-27',
      reunionFechaPropuesta: '2026-07-27',
      reunionFechaOcurrida: '2026-07-27',
      duracionSegundos: 1800,
    } as any,
    ORG,
  );

  const r = actividadTool({ desde: '2026-07-27', hasta: '2026-07-27', idOrganizacion: ORG });
  assert.equal(r.totalToques, 2);

  const noShow = r.toques.find((t) => t.idEmpresa === 'cap-noshow')!;
  assert.equal(noShow.resultado, 'no_llego');
  assert.equal(noShow.reunionFechaPropuesta, '2026-07-27');
  assert.equal(noShow.reunionFechaOcurrida, null, 'la reunion no ocurrio: no puede tener fecha de ocurrida');

  // El par que da el no-show rate, ya contado: 1 de 2 reuniones agendadas se cayo.
  assert.equal(r.conteos.reuniones.conFechaPropuesta, 2);
  assert.equal(r.conteos.reuniones.ocurridas, 1);
  assert.equal(r.conteos.reuniones.noShow, 1);
  assert.equal(r.conteos.porResultado.no_llego, 1);
  assert.equal(r.conteos.porCanal.reunion, 2);
  assert.equal(r.conteos.duracion.toquesConDuracion, 1);
  assert.equal(r.conteos.duracion.segundosTotales, 1800);
  assert.equal(r.toquesSinAtribuir, 0, 'con el default, ningun toque nuevo queda sin atribuir');
  assert.equal(r.toquesSinFecha, 0);
});

// --- snapshot diario ---------------------------------------------------------------------------

test('el snapshot deriva la transicion del dia en que se vio el cambio, no del dia de la corrida', () => {
  const ORG = 7702;
  seedEmpresa('snap-1', 'cierre_documentacion', ORG);

  // Lunes: la foto solo retrata, no hay contra que comparar.
  const lunes = snapshotEstadosTool({ fecha: '2026-07-27' }, ORG);
  assert.equal(lunes.fechaAnterior, null);
  assert.equal(lunes.filasEscritas, 1);
  assert.deepEqual(lunes.transiciones, [], 'la primera corrida no inventa transiciones desde la nada');

  // El operador mueve la cuenta a mano en Notion; el barrido baja el cambio (aca se simula el
  // efecto: la fila viva ya dice firma_pago).
  const raw = new Database(dbPath);
  raw.prepare(`UPDATE empresa SET estado_notion = 'firma_pago' WHERE id_empresa = 'snap-1'`).run();
  raw.close();

  // Martes: la foto ve el cambio y lo fecha el MARTES, con la etapa anterior tomada de la foto
  // del lunes y no de la fila viva.
  const martes = snapshotEstadosTool({ fecha: '2026-07-28' }, ORG);
  assert.equal(martes.fechaAnterior, '2026-07-27');
  assert.equal(martes.transiciones.length, 1);
  assert.deepEqual(
    { de: martes.transiciones[0].de, a: martes.transiciones[0].a },
    { de: 'cierre_documentacion', a: 'firma_pago' },
  );

  const db2 = new Database(dbPath);
  const h = db2.prepare(`SELECT fecha, origen FROM empresa_estado_historial WHERE id_empresa = 'snap-1'`).get() as any;
  db2.close();
  assert.equal(h.fecha, '2026-07-28', 'fechada el dia de la foto donde aparecio, nunca el dia en que corrio el barrido');
  assert.equal(h.origen, 'snapshot', 'observada, no inferida por barrido');
});

test('correr el snapshot dos veces el mismo dia no pisa la foto ni duplica transiciones', () => {
  const ORG = 7703;
  seedEmpresa('snap-2', 'oportunidad', ORG);
  snapshotEstadosTool({ fecha: '2026-07-27' }, ORG);

  const raw = new Database(dbPath);
  raw.prepare(`UPDATE empresa SET estado_notion = 'cierre_documentacion' WHERE id_empresa = 'snap-2'`).run();
  raw.close();

  const primera = snapshotEstadosTool({ fecha: '2026-07-28' }, ORG);
  assert.equal(primera.transiciones.length, 1);

  // Segunda corrida del mismo dia: la foto ya esta (no se re-retrata con el estado de la tarde)
  // y la transicion no se duplica.
  const segunda = snapshotEstadosTool({ fecha: '2026-07-28' }, ORG);
  assert.equal(segunda.filasEscritas, 0);
  assert.equal(segunda.filasYaExistian, 1);
  assert.equal(segunda.transiciones.length, 1, 'sigue siendo UNA transicion, la misma');

  const db2 = new Database(dbPath);
  const n = db2.prepare(`SELECT count(*) n FROM empresa_estado_historial WHERE id_empresa = 'snap-2'`).get() as any;
  db2.close();
  assert.equal(n.n, 1);
});

test('el snapshot no duplica una transicion que ya escribio un toque ese dia', () => {
  const ORG = 7704;
  seedEmpresa('snap-3', 'contacto_iniciado', ORG);
  snapshotEstadosTool({ fecha: '2026-07-27' }, ORG);

  // El toque gradua la cuenta y escribe su propia fila de historico, con origen 'toque'.
  registrarToqueTool(
    { idEmpresa: 'snap-3', canal: 'llamada', resultado: 'contesto_reunion', fecha: '2026-07-28' } as any,
    ORG,
  );

  const martes = snapshotEstadosTool({ fecha: '2026-07-28' }, ORG);
  assert.equal(martes.transicionesYaRegistradas, 1, 'la vio y la dejo quieta, no la duplico');
  assert.equal(martes.transiciones.length, 0);

  const db2 = new Database(dbPath);
  const filas = db2.prepare(`SELECT origen FROM empresa_estado_historial WHERE id_empresa = 'snap-3'`).all() as any[];
  db2.close();
  assert.equal(filas.length, 1);
  assert.equal(filas[0].origen, 'toque', 'gana la fila con mejor procedencia');
});

test('si el snapshot no corre un dia, el siguiente igual detecta el cambio contra la ultima foto', () => {
  const ORG = 7705;
  seedEmpresa('snap-4', 'lead', ORG);
  snapshotEstadosTool({ fecha: '2026-07-27' }, ORG);

  const raw = new Database(dbPath);
  raw.prepare(`UPDATE empresa SET estado_notion = 'oportunidad' WHERE id_empresa = 'snap-4'`).run();
  raw.close();

  // Se salta el 28 y el 29: la comparacion es contra la ULTIMA foto anterior, no contra "ayer".
  const jueves = snapshotEstadosTool({ fecha: '2026-07-30' }, ORG);
  assert.equal(jueves.fechaAnterior, '2026-07-27');
  assert.equal(jueves.transiciones.length, 1);
  assert.deepEqual(
    { de: jueves.transiciones[0].de, a: jueves.transiciones[0].a },
    { de: 'lead', a: 'oportunidad' },
  );
});

// --- regla 18: ninguna escritura responde { ok: true } (2026-07-25) ---------------------------

test('mover_estado devuelve la empresa releida y la transicion con su origen', () => {
  const ORG = 7706;
  seedEmpresa('mov-1', 'contacto_iniciado', ORG);
  const r = moverEstadoTool({ idEmpresa: 'mov-1', estado: 'oportunidad', fecha: '2026-07-28', origen: 'herramienta' }, ORG);

  assert.equal(r.empresa?.estadoNotion, 'oportunidad');
  assert.equal(r.transicion?.de, 'contacto_iniciado');
  assert.equal(r.transicion?.a, 'oportunidad');
  assert.equal(r.transicion?.fecha, '2026-07-28');
  // El origen sale releido de la fila, no del parametro que entro: 'herramienta' es la decision
  // de si viaja a Notion, 'manual' es lo que queda escrito en el historico.
  assert.equal(r.transicion?.origen, 'manual');
});

test('mover_estado distingue "ya estaba en esa etapa" de "no la encontre", que antes eran el mismo ok', () => {
  const ORG = 7707;
  seedEmpresa('mov-2', 'oportunidad', ORG);

  const sinCambio = moverEstadoTool({ idEmpresa: 'mov-2', estado: 'oportunidad', fecha: '2026-07-28' }, ORG);
  assert.equal(sinCambio.motivo, 'sin_cambio');
  assert.equal(sinCambio.transicion, null, 'no se escribe una fila de historico redundante');
  assert.equal(sinCambio.empresa?.estadoNotion, 'oportunidad', 'la empresa se devuelve igual: el estado que se queria ES el que hay');

  const ajena = moverEstadoTool({ idEmpresa: 'mov-2', estado: 'firma_pago', fecha: '2026-07-28' }, 999);
  assert.equal(ajena.motivo, 'empresa_no_encontrada');
  assert.equal(ajena.empresa, null);
});

test('mover_estado con origen notion marca la transicion como reconciliacion, no como movimiento', () => {
  const ORG = 7708;
  seedEmpresa('mov-3', 'contacto_iniciado', ORG);
  const r = moverEstadoTool({ idEmpresa: 'mov-3', estado: 'firma_pago', fecha: '2026-07-28', origen: 'notion' }, ORG);
  assert.equal(r.transicion?.origen, 'reconciliacion', 'su fecha es la de la corrida, no la del cambio');
});

test('cambiar_cadencia devuelve la empresa releida con la fecha que quedo escrita', () => {
  const ORG = 7709;
  seedEmpresa('cad-1', 'contacto_iniciado', ORG);
  const r = cambiarCadenciaTool(
    { idEmpresa: 'cad-1', proximoFollowUp: '2026-08-15', proximoCanal: 'whatsapp', proximoPaso: 'reintentar' } as any,
    ORG,
  );

  assert.equal(r.empresa.proximoFollowUpFecha, '2026-08-15');
  assert.equal(r.empresa.proximoCanal, 'whatsapp');
  assert.equal(r.empresa.proximoPaso, 'reintentar');
  // Sin cadencia pedida, no hay inscripcion que reportar: null, no un objeto vacio.
  assert.equal(r.inscripcion, null);
  assert.deepEqual(r.cadencias, []);
});

test('aplazar_seguimiento sin aplazadoPor queda a nombre de Sebastian, igual que un toque', () => {
  const ORG = 7710;
  seedEmpresa('apl-1', 'contacto_iniciado', ORG);
  const raw = new Database(dbPath);
  raw.prepare(`UPDATE empresa SET proximo_follow_up_fecha = '2026-07-27' WHERE id_empresa = 'apl-1'`).run();
  raw.close();

  const r = aplazarSeguimientoTool({ idEmpresa: 'apl-1', fechaNueva: '2026-07-30', motivo: 'dia_atravesado' } as any, ORG);
  assert.equal(r.aplazo.aplazadoPor, 'Sebastian Acosta Molina');
  assert.equal(r.aplazo.fechaIncumplida, '2026-07-27');
  assert.equal(r.empresa.proximoFollowUpFecha, '2026-07-30');

  // Y sigue pudiendo ser otra persona cuando se dice explicito.
  const raw2 = new Database(dbPath);
  raw2.prepare(`UPDATE empresa SET proximo_follow_up_fecha = '2026-07-30' WHERE id_empresa = 'apl-1'`).run();
  raw2.close();
  const otro = aplazarSeguimientoTool(
    { idEmpresa: 'apl-1', fechaNueva: '2026-08-05', aplazadoPor: 'Camilo Fonseca' } as any,
    ORG,
  );
  assert.equal(otro.aplazo.aplazadoPor, 'Camilo Fonseca');
});
