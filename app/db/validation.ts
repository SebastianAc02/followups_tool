import { z } from 'zod';

// Regla de dominio (no de UI): las 4 salidas cerradas de un toque, y razonPerdida es
// obligatoria cuando resultado = 'contesto_no'. Vive junto al Repository porque es la
// fuente de verdad que CUALQUIER caller (server action, ingest worker de Fase 3,
// EnvioAdapter de Fase 5) debe cumplir. Un solo export reusable, no se duplica en otro lado.

export const CANALES = ['llamada', 'whatsapp', 'correo'] as const;
export type Canal = (typeof CANALES)[number];

export const RESULTADOS = [
  'contesto_reunion',
  'contesto_sigue_seguimiento',
  'contesto_no',
  'no_contesto',
] as const;
export type Resultado = (typeof RESULTADOS)[number];

// Labels legibles de las 4 salidas (voz-onepay: sin emojis, sin em dash, directo).
// Un solo export reusable: CaptureForm.tsx (botones) y page.tsx (historial de toques) lo
// comparten para no duplicar el mapeo de texto en dos lugares.
export const RESULTADO_LABELS: Record<Resultado, string> = {
  contesto_reunion: 'Reunión agendada',
  contesto_sigue_seguimiento: 'Sigue en follow-up',
  contesto_no: 'No sigue',
  no_contesto: 'No contestó',
};

// V3.4: variantes de "hubo conversacion real", disparan la busqueda en Granola.
// no_contesto nunca la dispara (nunca hubo con quien hablar, nada que buscar).
export const RESULTADOS_CONTESTO: readonly Resultado[] = ['contesto_reunion', 'contesto_sigue_seguimiento', 'contesto_no'];

export const kdmSchema = z.object({
  nombre: z.string().min(1),
  // Normaliza "" a undefined ANTES de exigir min(1): la garantía "string vacío = no vino
  // telefono" vive aquí, en el dominio, no en cada caller (server action, ingest worker de
  // Fase 3, EnvioAdapter de Fase 5).
  telefono: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
});

export const registrarToqueSchema = z
  .object({
    idEmpresa: z.string().min(1),
    canal: z.enum(CANALES),
    resultado: z.enum(RESULTADOS),
    quePaso: z.string().min(1).optional(),
    proximoFollowUp: z.string().min(1).optional(),
    proximoCanal: z.string().min(1).optional(),
    usuarios: z.number().optional(),
    crm: z.string().min(1).optional(),
    pasarela: z.string().min(1).optional(),
    razonPerdida: z.string().min(1).optional(),
    objecion: z.string().min(1).optional(),
    kdm: kdmSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.resultado === 'contesto_no' && !data.razonPerdida) {
      ctx.addIssue({
        code: 'custom',
        path: ['razonPerdida'],
        message: "razonPerdida es obligatoria cuando resultado es 'contesto_no'",
      });
    }
  });

export type RegistrarToqueInput = z.infer<typeof registrarToqueSchema>;
