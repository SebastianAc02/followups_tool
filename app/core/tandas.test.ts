// La clasificacion en tandas (propuesta de tandas, 2026-08-04, paso 5). Pura: recibe la cuenta ya
// armada y devuelve en que tanda cae, con la regla que la clasifico.
//
// EL ORDEN DE LAS REGLAS ES LA DECISION DE FONDO, no un detalle de implementacion. Una cuenta
// cumple varias condiciones a la vez casi siempre (esta en etapa de cierre Y ya se toco hoy Y es de
// un aliado), y la tanda que sale decide si el operador la llama o no. Por eso cada salto de
// prioridad de este archivo tiene su prueba: sin ellas, reordenar dos lineas cambia a quien se
// llama manana y nada se pone rojo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clasificarTanda, TANDAS, type CuentaParaTanda } from './tandas.ts';

const HOY = '2026-08-04';

// Una cuenta neutra: nadie la descarto, nadie verifico su aliado, tiene cadencia, sin toques.
function cuenta(over: Partial<CuentaParaTanda> = {}): CuentaParaTanda {
  return {
    idEmpresa: 'x1',
    nombre: 'Cuenta X',
    owner: 'Sebastian Acosta Molina',
    estadoNotion: 'contacto_iniciado',
    usuarios: 2000,
    usuariosFuente: 'notion',
    aliado: { aliado: 'sin_verificar', verificado: false, advertencia: 'nadie verifico', heredadoDe: null,
              evidencia: { campo: 'aliado', valor: null, fuente: null, fecha: null, quien: null } },
    descarte: { descartada: false, motivo: null, nota: null, fechaRetorno: null, vigente: false,
                evidencia: { campo: 'motivo_descarte', valor: null, fuente: null, fecha: null, quien: null } },
    tareaBloqueante: null,
    tareaBloqueanteDesde: null,
    tieneCadencia: true,
    canalMuerto: false,
    toques: [],
    ultimoToqueDia: null,
    ...over,
  };
}

const toque = (fechaDia: string, resultado: string | null = 'no_contesto', fuente = 'cockpit') =>
  ({ fechaDia, fecha: `${fechaDia}T12:00:00.000Z`, resultado, fuente }) as CuentaParaTanda['toques'][number];

test('las doce tandas son las de la propuesta', () => {
  assert.deepEqual(
    [...TANDAS],
    ['fuera', 'esperar', 'bloqueado_por_tarea', 'cierre', 'reunion', 'respondio', 'agotada', 'enfriandose', 'rellamada', 'frio', 'cadencia', 'sin_campana'],
  );
});

// --- fuera: lo primero que se pregunta ---------------------------------------------------
//
// Va de primera porque si la cuenta no es nuestra, nada de lo demas importa: su etapa, sus toques
// y su tamano son irrelevantes. Los cuatro fallos del 4-ago fueron cuentas que debieron salir por
// aca y salieron en la lista de llamadas.

test('un aliado confirmado sale fuera, aunque este en etapa de cierre y sin tocar hoy', () => {
  const r = clasificarTanda(
    cuenta({
      estadoNotion: 'cierre_documentacion',
      aliado: { aliado: 'ultimo_kilometro', verificado: true, advertencia: null, heredadoDe: null,
                evidencia: { campo: 'aliado', valor: 'ultimo_kilometro', fuente: 'operador', fecha: HOY, quien: 'Sebastian Acosta Molina' } },
    }),
    { hoy: HOY, piso: 1000 },
  );

  assert.equal(r.tanda, 'fuera');
  assert.equal(r.regla, 'aliado');
  assert.equal(r.evidencia.valor, 'ultimo_kilometro', 'la evidencia dice cual aliado, no solo que es uno');
  assert.equal(r.evidencia.quien, 'Sebastian Acosta Molina');
});

// El fallo exacto de Fiesta Telecomunicaciones y Tunortetv, convertido en prueba. La cuenta ENTRA,
// que es lo correcto (nadie verifico que sea de un aliado), pero entra con la advertencia encima.
test('una cuenta sin verificar NO sale fuera, entra marcada', () => {
  const r = clasificarTanda(cuenta(), { hoy: HOY, piso: 1000 });

  assert.notEqual(r.tanda, 'fuera');
  assert.ok(r.advertencias.some((a) => a.includes('aliado')), 'la advertencia de aliado sin verificar viaja con la cuenta');
});

test('una congelada vigente sale fuera; el dia que vence deja de salir', () => {
  const congelada = (vigente: boolean) =>
    cuenta({
      descarte: { descartada: vigente, motivo: 'congelada', nota: 'no antes de octubre', fechaRetorno: '2026-10-01', vigente,
                  evidencia: { campo: 'motivo_descarte', valor: 'congelada', fuente: 'herramienta', fecha: '2026-08-04', quien: 'Sebastian Acosta Molina' } },
    });

  assert.equal(clasificarTanda(congelada(true), { hoy: HOY, piso: 1000 }).tanda, 'fuera');
  assert.notEqual(clasificarTanda(congelada(false), { hoy: '2026-10-01', piso: 1000 }).tanda, 'fuera');
});

test('una cuenta de otro dueno sale fuera cuando se pide la lista de un dueno', () => {
  const c = cuenta({ owner: 'Felipe Castro' });

  assert.equal(clasificarTanda(c, { hoy: HOY, piso: 1000, owner: 'Sebastian Acosta Molina' }).tanda, 'fuera');
  assert.notEqual(clasificarTanda(c, { hoy: HOY, piso: 1000 }).tanda, 'fuera', 'sin filtro de dueno no se descarta a nadie por dueno');
});

// --- esperar: le gana a la etapa ---------------------------------------------------------
//
// Va antes que cierre y que reunion a proposito. La tanda responde "que hago AHORA", y una cuenta
// que ya se toco hoy no se vuelve a tocar hoy por mas que este en cierre. Si la etapa ganara, la
// cuenta mas caliente del pipeline saldria todos los dias en la lista y se quemaria.
test('un toque real de hoy manda a esperar, aunque la cuenta este en cierre', () => {
  const r = clasificarTanda(
    cuenta({ estadoNotion: 'cierre_documentacion', ultimoToqueDia: HOY, toques: [toque(HOY)] }),
    { hoy: HOY, piso: 1000 },
  );

  assert.equal(r.tanda, 'esperar');
  assert.equal(r.regla, 'tocada_hoy');
});

// Intel Go: cuatro toques marcando una linea fuera de servicio. Con el canal muerto la cuenta deja
// de salir a llamar en vez de gastar el quinto.
test('un canal muerto manda a esperar aunque no se haya tocado hoy', () => {
  const r = clasificarTanda(cuenta({ canalMuerto: true, ultimoToqueDia: '2026-07-20', toques: [toque('2026-07-20')] }), { hoy: HOY, piso: 1000 });

  assert.equal(r.tanda, 'esperar');
  assert.equal(r.regla, 'canal_muerto');
});

// --- bloqueado_por_tarea -----------------------------------------------------------------
//
// Jigartel llevaba desde el 22-jul quieta porque faltaba conseguir un numero de gerente. Hoy eso se
// esconde entre las que no contestan, y son cosas distintas: una espera al prospecto, la otra es
// deuda propia. Va antes que la etapa porque el trabajo que desbloquea no es un toque.
test('una cuenta bloqueada por una tarea del operador se separa de las que no contestan', () => {
  const r = clasificarTanda(
    cuenta({ tareaBloqueante: 'conseguir el numero del gerente', tareaBloqueanteDesde: '2026-07-22', toques: [toque('2026-07-22')] }),
    { hoy: HOY, piso: 1000 },
  );

  assert.equal(r.tanda, 'bloqueado_por_tarea');
  assert.equal(r.evidencia.valor, 'conseguir el numero del gerente');
  assert.equal(r.evidencia.fecha, '2026-07-22', 'la fecha dice cuanto lleva quieta, que es la mitad del dato');
});

// --- etapa -------------------------------------------------------------------------------

test('la etapa de cierre y la de reunion tienen su propia tanda', () => {
  assert.equal(clasificarTanda(cuenta({ estadoNotion: 'cierre_documentacion' }), { hoy: HOY, piso: 1000 }).tanda, 'cierre');
  assert.equal(clasificarTanda(cuenta({ estadoNotion: 'reunion_agendada' }), { hoy: HOY, piso: 1000 }).tanda, 'reunion');
});

// --- respuesta y racha -------------------------------------------------------------------

test('si el ultimo toque tuvo respuesta, la cuenta va a respondio', () => {
  const r = clasificarTanda(
    cuenta({ ultimoToqueDia: '2026-08-01', toques: [toque('2026-07-30'), toque('2026-08-01', 'contesto_sigue_seguimiento')] }),
    { hoy: HOY, piso: 1000 },
  );

  assert.equal(r.tanda, 'respondio');
});

// El WhatsApp entrante reinicia la racha. Es respuesta del prospecto aunque no sea un toque nuestro,
// y 143 mensajes entrantes en 15 cuentas hoy no entran en ninguna metrica.
test('un whatsapp entrante cuenta como respuesta y saca a la cuenta de la racha', () => {
  const r = clasificarTanda(
    cuenta({ ultimoToqueDia: '2026-07-30', toques: [toque('2026-07-28'), toque('2026-07-29'), toque('2026-07-30'), toque('2026-08-01', null, 'whatsapp_entrante')] }),
    { hoy: HOY, piso: 1000 },
  );

  assert.equal(r.tanda, 'respondio');
});

test('una o dos sin respuesta es rellamada', () => {
  const conRacha = (n: number) =>
    cuenta({ ultimoToqueDia: '2026-08-01', toques: Array.from({ length: n }, (_, i) => toque(`2026-07-2${i + 1}`)) });

  assert.equal(clasificarTanda(conRacha(1), { hoy: HOY, piso: 1000 }).tanda, 'rellamada');
  assert.equal(clasificarTanda(conRacha(2), { hoy: HOY, piso: 1000 }).tanda, 'rellamada');
});

// UNA CONSECUENCIA DEL UMBRAL QUE NO ES OBVIA Y QUE CONVIENE TENER FIJADA. 'enfriandose' es "3 o
// mas sin respuesta, BAJO el umbral", asi que solo existe donde el umbral es mayor que 3: en
// seguimiento con respuesta previa (4) y en cierre (5). En frio, reactivacion y reunion el umbral
// ES 3, asi que la cuenta pasa de rellamada directo a agotada y nunca se enfria.
//
// No es un hueco, es el diseno: una cuenta fria tiene tres intentos y se acabo. Enfriarse es un
// privilegio de la cuenta que alguna vez contesto, que es la unica sobre la que vale la pena
// insistir un cuarto toque cambiando de canal.
test('enfriandose solo existe donde el umbral pasa de 3; en frio se salta de rellamada a agotada', () => {
  const conRacha = (n: number, over = {}) =>
    cuenta({ ultimoToqueDia: '2026-08-01', toques: Array.from({ length: n }, (_, i) => toque(`2026-07-2${i + 1}`)), ...over });

  assert.equal(clasificarTanda(conRacha(3), { hoy: HOY, piso: 1000 }).tanda, 'agotada', 'segmento frio, umbral 3');

  // La misma racha sobre una cuenta que ya contesto alguna vez: umbral 4, asi que 3 es enfriandose.
  const conRespuestaPrevia = cuenta({
    ultimoToqueDia: '2026-08-01',
    toques: [toque('2026-07-10', 'contesto_sigue_seguimiento'), toque('2026-07-21'), toque('2026-07-22'), toque('2026-07-23')],
  });
  const r = clasificarTanda(conRespuestaPrevia, { hoy: HOY, piso: 1000 });
  assert.equal(r.tanda, 'enfriandose');
  assert.match(r.evidencia.valor ?? '', /umbral 4/);
});

// El umbral por segmento decide donde para el enfriamiento y empieza el agotamiento. La evidencia
// tiene que decir contra que umbral se comparo: sin eso, "esta agotada" no se puede discutir.
test('pasado el umbral del segmento la cuenta esta agotada, y la evidencia dice con que umbral', () => {
  const r = clasificarTanda(
    cuenta({ ultimoToqueDia: '2026-08-01', toques: Array.from({ length: 5 }, (_, i) => toque(`2026-07-2${i + 1}`)) }),
    { hoy: HOY, piso: 1000 },
  );

  assert.equal(r.tanda, 'agotada');
  assert.match(r.evidencia.valor ?? '', /5/);
  assert.ok(r.regla.includes('umbral'));
});

// --- sin toques --------------------------------------------------------------------------

test('sin toques: pasa el piso va a frio, no lo pasa va a cadencia', () => {
  assert.equal(clasificarTanda(cuenta({ usuarios: 3000 }), { hoy: HOY, piso: 1000 }).tanda, 'frio');
  assert.equal(clasificarTanda(cuenta({ usuarios: 200 }), { hoy: HOY, piso: 1000 }).tanda, 'cadencia');
});

// El caso invisible: ni cadencia ni toques. Nada le va a pasar nunca a esta cuenta si nadie la ve.
test('sin cadencia y sin toques la cuenta es invisible, y esa es su propia tanda', () => {
  const r = clasificarTanda(cuenta({ tieneCadencia: false, usuarios: 3000 }), { hoy: HOY, piso: 1000 });

  assert.equal(r.tanda, 'sin_campana');
});

// El tamano decide si una cuenta se llama, y produccion trae numeros inventados: UICOM figuraba con
// 3.000 y tiene 60. Un piso aplicado sobre el numero equivocado no desordena una lista, cambia a
// quien se llama, asi que de donde salio el numero viaja siempre.
test('un tamano que no viene de Notion entra con advertencia, no como dato', () => {
  const r = clasificarTanda(cuenta({ usuarios: 3000, usuariosFuente: 'produccion' }), { hoy: HOY, piso: 1000 });

  assert.equal(r.usuarios.valor, 3000);
  assert.equal(r.usuarios.confirmado, false);
  assert.ok(r.advertencias.some((a) => a.includes('usuarios')));
});

// Sin tamano tampoco se descarta a ciegas: una cuenta sin usuarios no es una cuenta chica, es una
// cuenta que nadie midio. AVIDTEL y JASZ tienen 5.000 cada una en Notion y produccion no les tiene
// tamano, asi que las dos cuentas de on hold mas grandes eran invisibles en una lista armada desde
// la herramienta.
test('sin tamano la cuenta no cae a cadencia por descarte: entra a frio marcada', () => {
  const r = clasificarTanda(cuenta({ usuarios: null, usuariosFuente: null }), { hoy: HOY, piso: 1000 });

  assert.equal(r.tanda, 'frio');
  assert.equal(r.usuarios.confirmado, false);
  assert.ok(r.advertencias.some((a) => a.includes('usuarios')));
});
