// crearRegistroEnvio() (que adaptador real por canal) y CANALES_AUTOMATICOS (lista
// estatica para validar sin construir adaptadores) se mantienen a mano por separado --
// nada del lenguaje los ata entre si. Esta prueba es la unica defensa contra que
// diverjan (alguien agrega un proveedor real y se olvida de sumar el canal a la lista,
// o al reves).
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearRegistroEnvio, CANALES_AUTOMATICOS, resolverAdaptadorCorreo, agruparPendientesCorreo } from './registro-envio.ts';
import { CANALES } from '../db/validation.ts';

test('crearRegistroEnvio() tiene un adaptador real exactamente para los canales de CANALES_AUTOMATICOS', () => {
  const registro = crearRegistroEnvio();
  const canalesConAdapter = CANALES.filter((c) => registro[c] !== null).sort();

  assert.deepEqual(canalesConAdapter, [...CANALES_AUTOMATICOS].sort());
});

test('todo canal fuera de CANALES_AUTOMATICOS no tiene adaptador (fuerza la via manual)', () => {
  const registro = crearRegistroEnvio();
  const sinProveedor = CANALES.filter((c) => !CANALES_AUTOMATICOS.includes(c));

  for (const canal of sinProveedor) {
    assert.equal(registro[canal], null, `${canal} deberia ser null (sin proveedor automatico)`);
  }
});

test('resolverAdaptadorCorreo: sin idUsuario (dueno viejo, null) cae a Apollo', () => {
  const adapter = resolverAdaptadorCorreo(null);
  assert.equal(typeof adapter.enviarPaso, 'function');
});

test('agruparPendientesCorreo agrupa por adaptador resuelto: gmail aprobado, apollo fallback, gmail sin aprobar se excluye', () => {
  const filas = [
    { idPasoInscripcion: 1, proveedorCampanaId: 'gmail-camp-1', destinatario: { email: 'a@x.com', telefono: null, nombre: null, empresa: null, cargo: null }, paso: { asunto: 'x', cuerpo: 'x', canal: 'correo' }, intentos: 0, owner: 'Ana Gmail', idOrganizacion: 1, aprobadaEnvioGmail: true },
    { idPasoInscripcion: 2, proveedorCampanaId: 'gmail-camp-1', destinatario: { email: 'b@x.com', telefono: null, nombre: null, empresa: null, cargo: null }, paso: { asunto: 'x', cuerpo: 'x', canal: 'correo' }, intentos: 0, owner: 'Ana Gmail', idOrganizacion: 1, aprobadaEnvioGmail: true },
    { idPasoInscripcion: 3, proveedorCampanaId: 'seq-apollo-1', destinatario: { email: 'c@x.com', telefono: null, nombre: null, empresa: null, cargo: null }, paso: { asunto: 'x', cuerpo: 'x', canal: 'correo' }, intentos: 0, owner: 'Beto SinGmail', idOrganizacion: 1, aprobadaEnvioGmail: false },
    { idPasoInscripcion: 4, proveedorCampanaId: 'gmail-camp-2', destinatario: { email: 'd@x.com', telefono: null, nombre: null, empresa: null, cargo: null }, paso: { asunto: 'x', cuerpo: 'x', canal: 'correo' }, intentos: 0, owner: 'Cami SinAprobar', idOrganizacion: 1, aprobadaEnvioGmail: false },
  ];

  const grupos = agruparPendientesCorreo(new Date().toISOString(), {
    pendientes: () => filas,
    idUsuarioDeOwner: (owner) => (owner === 'Ana Gmail' ? 'user-ana' : owner === 'Cami SinAprobar' ? 'user-cami' : null),
    gmailVerificado: (idUsuario) => idUsuario === 'user-ana' || idUsuario === 'user-cami',
    crearGmail: (idUsuario) => ({ enviarPaso: async () => ({ proveedor: 'gmail', proveedorMensajeId: `msg-${idUsuario}` }) }),
    crearApollo: () => ({ enviarPaso: async () => ({ proveedor: 'apollo', proveedorMensajeId: 'msg-apollo' }) }),
  });

  const todasLasFilas = grupos.flatMap((g) => g.filas.map((f) => f.idPasoInscripcion));
  assert.deepEqual(todasLasFilas.sort(), [1, 2, 3]);

  const grupoAna = grupos.find((g) => g.filas.some((f) => f.idPasoInscripcion === 1));
  assert.equal(grupoAna?.filas.length, 2, 'las 2 filas de Ana van al mismo grupo (mismo adaptador)');

  const grupoBeto = grupos.find((g) => g.filas.some((f) => f.idPasoInscripcion === 3));
  assert.equal(grupoBeto?.filas.length, 1);
  assert.notEqual(grupoBeto, grupoAna, 'Beto (Apollo, sin Gmail) va en un grupo distinto al de Ana (Gmail)');
});
