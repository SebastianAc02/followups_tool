import test from 'node:test';
import assert from 'node:assert/strict';
import { avisarAdminPorWhatsapp } from './alerta-admin.ts';

test('avisarAdminPorWhatsapp: sin ADMIN_ALERTA_WHATSAPP_NUMERO configurada, no lanza y no llama a nada', async () => {
  delete process.env.ADMIN_ALERTA_WHATSAPP_NUMERO;
  let llamado = false;
  await avisarAdminPorWhatsapp('mensaje de prueba', {
    lineaWhatsappActiva: () => {
      llamado = true;
      return { referenciaProveedor: 'no-deberia-llegar-aqui' };
    },
    enviarPaso: async () => ({ proveedor: 'evolution', proveedorMensajeId: 'no-deberia-llegar-aqui' }),
  });
  assert.strictEqual(llamado, false, 'no deberia siquiera consultar la linea activa si no hay numero configurado');
});

test('avisarAdminPorWhatsapp: sin linea activa, no lanza y no llama a enviarPaso', async () => {
  process.env.ADMIN_ALERTA_WHATSAPP_NUMERO = '573001234567';
  let enviarPasoLlamado = false;
  await avisarAdminPorWhatsapp('mensaje de prueba', {
    lineaWhatsappActiva: () => null,
    enviarPaso: async () => {
      enviarPasoLlamado = true;
      return { proveedor: 'evolution', proveedorMensajeId: 'x' };
    },
  });
  assert.strictEqual(enviarPasoLlamado, false);
});

test('avisarAdminPorWhatsapp: con env configurada y linea activa, llama enviarPaso con el numero y mensaje correctos', async () => {
  process.env.ADMIN_ALERTA_WHATSAPP_NUMERO = '573001234567';
  const llamadas: { referenciaProveedor: string; destinatario: unknown; paso: unknown }[] = [];

  await avisarAdminPorWhatsapp('Felipe tuvo un error configurando Granola: timeout', {
    lineaWhatsappActiva: () => ({ referenciaProveedor: 'linea-admin-test' }),
    enviarPaso: async (referenciaProveedor, destinatario, paso) => {
      llamadas.push({ referenciaProveedor, destinatario, paso });
      return { proveedor: 'evolution', proveedorMensajeId: 'msg-alerta-1' };
    },
  });

  assert.strictEqual(llamadas.length, 1);
  const llamada = llamadas[0] as { referenciaProveedor: string; destinatario: { telefono: string }; paso: { cuerpo: string } };
  assert.strictEqual(llamada.referenciaProveedor, 'linea-admin-test');
  assert.strictEqual(llamada.destinatario.telefono, '573001234567');
  assert.strictEqual(llamada.paso.cuerpo, 'Felipe tuvo un error configurando Granola: timeout');
});

test('avisarAdminPorWhatsapp: si enviarPaso falla, no propaga la excepcion', async () => {
  process.env.ADMIN_ALERTA_WHATSAPP_NUMERO = '573001234567';
  await assert.doesNotReject(() =>
    avisarAdminPorWhatsapp('mensaje que no debe tumbar nada', {
      lineaWhatsappActiva: () => ({ referenciaProveedor: 'linea-admin-test' }),
      enviarPaso: async () => {
        throw new Error('Evolution caido');
      },
    }),
  );
});

test.after(() => {
  delete process.env.ADMIN_ALERTA_WHATSAPP_NUMERO;
});
