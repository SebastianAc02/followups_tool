import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { ejecutarCiclo, construirTareas, tareaSnapshotEstados, espaciadoWhatsapp } = await import('./index.ts');
const { guardarConfiguracionAdmin } = await import('../db/repository.ts');

function leerHeartbeat(proveedor: string) {
  const raw = new Database(dbPath);
  const fila = raw
    .prepare('SELECT ultima_corrida, ultimo_resultado FROM conector WHERE proveedor = ? AND id_usuario IS NULL')
    .get(proveedor) as { ultima_corrida: string | null; ultimo_resultado: string | null } | undefined;
  raw.close();
  return fila;
}

test('tarea que corre bien deja heartbeat "ok"', async () => {
  await ejecutarCiclo([{ nombre: 'outbox', proveedorHeartbeat: 'notion', ejecutar: async () => {} }]);
  const fila = leerHeartbeat('notion');
  assert.ok(fila?.ultima_corrida);
  assert.strictEqual(fila?.ultimo_resultado, 'ok');
});

test('tarea que truena queda aislada: heartbeat de error, no relanza', async () => {
  await assert.doesNotReject(
    ejecutarCiclo([
      {
        nombre: 'tarea-rota',
        proveedorHeartbeat: 'proveedor-roto',
        ejecutar: async () => {
          throw new Error('fallo simulado');
        },
      },
    ]),
  );
  const fila = leerHeartbeat('proveedor-roto');
  assert.ok(fila?.ultima_corrida);
  assert.match(fila?.ultimo_resultado ?? '', /fallo simulado/);
});

// 2026-07-28: el heartbeat tenia solo dos valores posibles, 'ok' y 'error: ...', y una tarea
// que corrio A MEDIAS quedaba en 'ok'. Asi paso desapercibido tres semanas que el poll de
// tracking no leia ni una campana de Gmail.
test('una tarea que devuelve texto lo escribe tal cual en el heartbeat (estado degradado)', async () => {
  await ejecutarCiclo([
    {
      nombre: 'tracking',
      proveedorHeartbeat: 'proveedor-degradado',
      ejecutar: async () => 'degradado: 1 de 3 campanas fallaron (gmail/hilo-1: 404)',
    },
  ]);
  const fila = leerHeartbeat('proveedor-degradado');
  assert.strictEqual(fila?.ultimo_resultado, 'degradado: 1 de 3 campanas fallaron (gmail/hilo-1: 404)');
});

test('una tarea que no devuelve nada sigue quedando en "ok" (las tareas viejas no cambian)', async () => {
  await ejecutarCiclo([{ nombre: 'materializar', proveedorHeartbeat: 'proveedor-mudo', ejecutar: async () => {} }]);
  assert.strictEqual(leerHeartbeat('proveedor-mudo')?.ultimo_resultado, 'ok');
});

test('una tarea rota no bloquea que las demas corran (aislamiento)', async () => {
  await ejecutarCiclo([
    {
      nombre: 'rota',
      proveedorHeartbeat: 'proveedor-a',
      ejecutar: async () => {
        throw new Error('boom');
      },
    },
    { nombre: 'sana', proveedorHeartbeat: 'proveedor-b', ejecutar: async () => {} },
  ]);
  assert.strictEqual(leerHeartbeat('proveedor-a')?.ultimo_resultado, 'error: boom');
  assert.strictEqual(leerHeartbeat('proveedor-b')?.ultimo_resultado, 'ok');
});

// Gate de outbox (2026-07-24): el brain escribe Notion por su cuenta y nunca encola en
// `outbox` -- en produccion la tabla tiene 2 filas, las dos fallidas desde julio. La tarea
// queda en el codigo pero apagada por default; lo que se fija aca es que apagar NO se lleve
// por delante a las otras cinco, que son las que sostienen envios y campanas.
const NUCLEO = ['materializar', 'push:correo', 'push:whatsapp', 'tracking', 'archivar-campanas'];

test('sin OUTBOX_NOTION_ENABLED, outbox no se registra y las otras cinco siguen', () => {
  delete process.env.OUTBOX_NOTION_ENABLED;
  assert.deepStrictEqual(construirTareas().map((t) => t.nombre), NUCLEO);
});

test('con OUTBOX_NOTION_ENABLED=true, outbox vuelve a registrarse y nada mas cambia', () => {
  process.env.OUTBOX_NOTION_ENABLED = 'true';
  try {
    assert.deepStrictEqual(construirTareas().map((t) => t.nombre), ['outbox', ...NUCLEO]);
  } finally {
    delete process.env.OUTBOX_NOTION_ENABLED;
  }
});

test('solo un valor explicito enciende: el resto (vacio, 0, false, yes) queda apagado', () => {
  try {
    for (const valor of ['true', '1', 'TRUE', ' true ']) {
      process.env.OUTBOX_NOTION_ENABLED = valor;
      assert.ok(
        construirTareas().some((t) => t.nombre === 'outbox'),
        `${JSON.stringify(valor)} deberia encender el gate`,
      );
    }
    for (const valor of ['', '0', 'false', 'yes', 'enabled']) {
      process.env.OUTBOX_NOTION_ENABLED = valor;
      assert.ok(
        !construirTareas().some((t) => t.nombre === 'outbox'),
        `${JSON.stringify(valor)} NO deberia encender el gate`,
      );
    }
  } finally {
    delete process.env.OUTBOX_NOTION_ENABLED;
  }
});

// Gate de snapshot_estados (2026-07-25): la tabla `empresa_estado_snapshot` la crea la
// migracion 0014 y todavia no esta en produccion, asi que la tarea entra al codigo apagada.
// Lo que se fija aca es que apagada NO se registre (misma garantia que el gate de outbox) y
// que encendida entre ANTES de materializar, porque la foto es del estado con el que arranco
// el dia.
test('sin SNAPSHOT_ESTADOS_ENABLED, snapshot-estados no se registra', () => {
  delete process.env.SNAPSHOT_ESTADOS_ENABLED;
  assert.deepStrictEqual(construirTareas().map((t) => t.nombre), NUCLEO);
});

test('con SNAPSHOT_ESTADOS_ENABLED=true, entra primera y nada mas cambia', () => {
  process.env.SNAPSHOT_ESTADOS_ENABLED = 'true';
  try {
    assert.deepStrictEqual(construirTareas().map((t) => t.nombre), ['snapshot-estados', ...NUCLEO]);
  } finally {
    delete process.env.SNAPSHOT_ESTADOS_ENABLED;
  }
});

test('snapshot-estados: solo un valor explicito enciende', () => {
  try {
    for (const valor of ['true', '1', 'TRUE', ' true ']) {
      process.env.SNAPSHOT_ESTADOS_ENABLED = valor;
      assert.ok(
        construirTareas().some((t) => t.nombre === 'snapshot-estados'),
        `${JSON.stringify(valor)} deberia encender el gate`,
      );
    }
    for (const valor of ['', '0', 'false', 'yes', 'enabled']) {
      process.env.SNAPSHOT_ESTADOS_ENABLED = valor;
      assert.ok(
        !construirTareas().some((t) => t.nombre === 'snapshot-estados'),
        `${JSON.stringify(valor)} NO deberia encender el gate`,
      );
    }
  } finally {
    delete process.env.SNAPSHOT_ESTADOS_ENABLED;
  }
});

// Los dos gates son independientes: encender uno no arrastra al otro.
test('los dos gates encendidos: outbox primero, luego snapshot, luego el nucleo', () => {
  process.env.OUTBOX_NOTION_ENABLED = 'true';
  process.env.SNAPSHOT_ESTADOS_ENABLED = 'true';
  try {
    assert.deepStrictEqual(
      construirTareas().map((t) => t.nombre),
      ['outbox', 'snapshot-estados', ...NUCLEO],
    );
  } finally {
    delete process.env.OUTBOX_NOTION_ENABLED;
    delete process.env.SNAPSHOT_ESTADOS_ENABLED;
  }
});

// --- comportamiento de tareaSnapshotEstados -------------------------------------------
//
// El gate de arriba solo prueba que la tarea se registre o no. Esto prueba lo que hace, que es
// donde estaba el riesgo real: correrla dos veces el mismo dia NO puede derivar transiciones
// nuevas contra la foto anterior, o inventa movimientos que nunca ocurrieron.

const HORA_ANTES = new Date('2026-07-26T09:00:00Z'); // 04:00 Bogota, antes de las 5
const HORA_DESPUES = new Date('2026-07-26T11:00:00Z'); // 06:00 Bogota, pasada la hora

function sql(query: string, ...params: unknown[]) {
  const raw = new Database(dbPath);
  const filas = raw.prepare(query).all(...(params as [])) as Record<string, unknown>[];
  raw.close();
  return filas;
}

function ejecutar(query: string, ...params: unknown[]) {
  const raw = new Database(dbPath);
  raw.prepare(query).run(...(params as []));
  raw.close();
}

function marcador(): string | null {
  const f = sql("SELECT valor FROM configuracion_admin WHERE clave = 'snapshot_estados_ultima_fecha'");
  return (f[0]?.valor as string) ?? null;
}

test('snapshot-estados: antes de la hora objetivo no hace nada ni marca', async () => {
  await tareaSnapshotEstados(HORA_ANTES);
  assert.strictEqual(marcador(), null, 'no deberia haber marcador todavia');
  assert.strictEqual(sql('SELECT * FROM empresa_estado_snapshot').length, 0);
});

test('snapshot-estados: SNAPSHOT_ESTADOS_HORA ausente o basura cae al default 5, no a 0', async () => {
  // Number('') es 0 y no NaN: sin cortar el vacio antes, la hora objetivo daba 0 y la tarea
  // corria a cualquier hora, incluida la madrugada. Se fija que a las 04:00 Bogota no corra.
  for (const valor of [undefined, '', '  ', 'abc', '25', '-1', '5.5']) {
    if (valor === undefined) delete process.env.SNAPSHOT_ESTADOS_HORA;
    else process.env.SNAPSHOT_ESTADOS_HORA = valor;
    await tareaSnapshotEstados(HORA_ANTES);
    assert.strictEqual(marcador(), null, `con ${JSON.stringify(valor)} no deberia correr a las 4am`);
  }
  delete process.env.SNAPSHOT_ESTADOS_HORA;
});

test('snapshot-estados: SNAPSHOT_ESTADOS_HORA=4 si la deja correr a las 04:00 Bogota', async () => {
  process.env.SNAPSHOT_ESTADOS_HORA = '4';
  try {
    await tareaSnapshotEstados(HORA_ANTES);
    assert.strictEqual(marcador(), '2026-07-26');
  } finally {
    delete process.env.SNAPSHOT_ESTADOS_HORA;
  }
  // Se deshace para que los tests siguientes arranquen sin foto ni marcador.
  ejecutar('DELETE FROM empresa_estado_snapshot');
  ejecutar("DELETE FROM configuracion_admin WHERE clave = 'snapshot_estados_ultima_fecha'");
});

test('snapshot-estados: pasada la hora toma la foto y deja el marcador del dia', async () => {
  ejecutar(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
     VALUES ('E-SNAP-1', 'nit', 'ISP Uno', 'isp uno', 'activo', 'contacto_iniciado', 1)`,
  );

  await tareaSnapshotEstados(HORA_DESPUES);

  assert.strictEqual(marcador(), '2026-07-26');
  const foto = sql('SELECT id_empresa, estado, fecha_snapshot FROM empresa_estado_snapshot');
  assert.strictEqual(foto.length, 1);
  assert.strictEqual(foto[0].estado, 'contacto_iniciado');
  assert.strictEqual(foto[0].fecha_snapshot, '2026-07-26');
  // Primera corrida: hay foto y nada contra que compararla, asi que cero transiciones.
  assert.strictEqual(sql("SELECT * FROM empresa_estado_historial WHERE origen = 'snapshot'").length, 0);
});

test('snapshot-estados: segunda corrida el mismo dia no deriva la transicion de media manana', async () => {
  // La cuenta se mueve DESPUES de que ya se tomo la foto, que es el caso real: alguien la
  // arrastra en Notion a media manana. Sin el marcador, el ciclo de 5 minutos siguiente
  // comparia el estado de ahora contra la foto de AYER y escribiria una transicion mas.
  ejecutar("UPDATE empresa SET estado_notion = 'reunion_agendada' WHERE id_empresa = 'E-SNAP-1'");

  await tareaSnapshotEstados(HORA_DESPUES);

  assert.strictEqual(
    sql("SELECT * FROM empresa_estado_historial WHERE origen = 'snapshot'").length,
    0,
    'la segunda corrida del dia no debe escribir historial',
  );
  assert.strictEqual(sql('SELECT * FROM empresa_estado_snapshot').length, 1, 'la foto del dia no se duplica');
});

test('snapshot-estados: al dia siguiente si deriva la transicion, una sola vez', async () => {
  const diaSiguiente = new Date('2026-07-27T11:00:00Z'); // 06:00 Bogota del 27

  await tareaSnapshotEstados(diaSiguiente);
  // Corre de nuevo el mismo dia: el marcador la para, no se duplica la transicion.
  await tareaSnapshotEstados(diaSiguiente);

  assert.strictEqual(marcador(), '2026-07-27');
  const hist = sql("SELECT estado_anterior, estado_nuevo, fecha FROM empresa_estado_historial WHERE origen = 'snapshot'");
  assert.strictEqual(hist.length, 1);
  assert.deepStrictEqual(hist[0], {
    estado_anterior: 'contacto_iniciado',
    estado_nuevo: 'reunion_agendada',
    fecha: '2026-07-27',
  });
});

test('snapshot-estados: si la tabla no existe, el error llega al heartbeat (no se lo traga)', async () => {
  // Es exactamente el estado de produccion mientras la migracion 0014 no este aplicada, y la
  // razon por la que la tarea entra apagada. Lo que se fija: el fallo se VE.
  ejecutar('DROP TABLE empresa_estado_snapshot');
  ejecutar("DELETE FROM configuracion_admin WHERE clave = 'snapshot_estados_ultima_fecha'");

  await ejecutarCiclo([
    {
      nombre: 'snapshot-estados',
      proveedorHeartbeat: 'snapshot-estados',
      ejecutar: () => tareaSnapshotEstados(HORA_DESPUES),
    },
  ]);

  const fila = leerHeartbeat('snapshot-estados');
  assert.match(fila?.ultimo_resultado ?? '', /error: .*empresa_estado_snapshot/);
  assert.strictEqual(marcador(), null, 'un fallo no puede dejar el dia marcado como hecho');
});

// Cada cuanto sale un WhatsApp del worker, configurable sin desplegar (2026-07-26). Existe
// para poder decir "uno cada dos minutos" mientras se mira como se comporta la linea, y para
// poder bajarlo despues sin tocar codigo ni reiniciar con otra variable de entorno.
test('espaciado de whatsapp: sin config, el 45-90s de siempre', () => {
  assert.deepEqual(espaciadoWhatsapp(), { minMs: 45_000, maxMs: 90_000 });
});

test('espaciado de whatsapp: min 120000 deja "uno cada dos minutos"', () => {
  guardarConfiguracionAdmin('whatsapp_espaciado_min_ms', '120000');
  guardarConfiguracionAdmin('whatsapp_espaciado_max_ms', '150000');
  assert.deepEqual(espaciadoWhatsapp(), { minMs: 120_000, maxMs: 150_000 });
});

// El intervalo EXACTO se permite (2026-07-26): es lo que el operador pidio para ver como se
// comporta la linea con un ritmo predecible. Antes la herramienta lo "corregia" sola y abria el
// maximo un 25%, o sea que desobedecia la config en silencio.
test('espaciado de whatsapp: min y max iguales dan intervalo exacto, sin jitter', () => {
  guardarConfiguracionAdmin('whatsapp_espaciado_min_ms', '120000');
  guardarConfiguracionAdmin('whatsapp_espaciado_max_ms', '120000');
  assert.deepEqual(espaciadoWhatsapp(), { minMs: 120_000, maxMs: 120_000 });
});

// Un max MENOR que el min no es una preferencia, es una config incoherente: no hay intervalo
// que respetar y esperar un rango negativo dejaria el lote saliendo de golpe. Cae al default en
// vez de inventar un numero.
test('espaciado de whatsapp: un max por debajo del min cae al default', () => {
  guardarConfiguracionAdmin('whatsapp_espaciado_min_ms', '120000');
  guardarConfiguracionAdmin('whatsapp_espaciado_max_ms', '60000');
  assert.deepEqual(espaciadoWhatsapp(), { minMs: 45_000, maxMs: 90_000 });
});

test('espaciado de whatsapp: un valor basura cae al default, no a cero', () => {
  guardarConfiguracionAdmin('whatsapp_espaciado_min_ms', 'rapido');
  guardarConfiguracionAdmin('whatsapp_espaciado_max_ms', '-5');
  assert.deepEqual(espaciadoWhatsapp(), { minMs: 45_000, maxMs: 90_000 });
});

test.after(() => borrarDbPrueba(dbPath));
