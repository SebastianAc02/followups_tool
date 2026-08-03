'use server';

import { revalidatePath } from 'next/cache';
import { crearEmpresa, crearContacto } from '../../db/repository';
import { requireEscritura } from '../../lib/session';
import { esModoPrueba } from '../../lib/modo-prueba';
import { categoriaAceptada } from '../../core/empresa-identidad';

// Alta de una cuenta desde la WEB, con su contacto principal en el mismo gesto.
//
// Por que existe: crearEmpresa y crearContacto tenian un solo consumidor, el MCP, y el MCP
// corre siempre contra isps.db (CLAUDE.md, "Donde corre el MCP"). O sea que con el modo prueba
// prendido no habia forma de sembrar una empresa desde la interfaz, y la alternativa era
// pedirle a alguien que corriera un script en el VPS. Esta action pasa por el mismo Proxy de
// app/db/index.ts que todo lo demas, asi que escribe en la base del MODO de la sesion sin
// saber cual es.
//
// EMPRESA Y CONTACTO NO VAN EN UNA TRANSACCION, y es deliberado: son dos funciones de dominio
// que ya traen su propia transaccion y su propio antidupe. Si el contacto choca con uno que ya
// existe, la cuenta igual queda creada y se dice cual fue el choque -- deshacer el alta seria
// perder trabajo bueno por un dato repetido. El resultado dice siempre las dos mitades.

export type AltaCuentaInput = {
  nombre: string;
  ciudad?: string;
  categoria: string;
  contacto: { nombre?: string; telefono?: string; email?: string };
  // Unica salida cuando el antidupe de crearEmpresa encuentra una cuenta de confianza alta.
  // Explicito y por envio, igual que en el MCP: no hay forma de apagarlo de fabrica.
  forzar?: boolean;
};

export type AltaCuentaResultado =
  | {
      ok: true;
      idEmpresa: string;
      nombre: string;
      categoria: string;
      // Que paso con el contacto, aparte de la cuenta. 'sin_datos' = no se mando ni correo ni
      // telefono, asi que no se creo ninguno (y la cuenta no tiene a quien escribirle).
      contacto: 'creado' | 'duplicado' | 'sin_datos';
      avisoContacto?: string;
    }
  | { ok: false; error: string; duplicados?: { idEmpresa: string; nombreOficial: string }[] };

export async function crearCuentaAction(input: AltaCuentaInput): Promise<AltaCuentaResultado> {
  const { owner, idOrganizacion } = await requireEscritura();

  // esModoPrueba() y no la cookie: es la MISMA caja que el Proxy del db acaba de usar para
  // resolver contra que base corre esta request. Validar contra otra fuente abriria la puerta
  // a que la validacion diga una cosa y la escritura caiga en otra base.
  const modoPrueba = esModoPrueba();

  const nombre = input.nombre.trim();
  if (nombre === '') return { ok: false, error: 'La cuenta necesita un nombre' };
  if (!categoriaAceptada(input.categoria, modoPrueba)) {
    return {
      ok: false,
      error:
        input.categoria === 'test'
          ? 'La categoría "test" solo se puede escribir con el modo prueba prendido: en la base real sería basura.'
          : `Categoría no válida: ${input.categoria}`,
    };
  }

  try {
    const alta = crearEmpresa(
      {
        nombreOficial: nombre,
        categoria: input.categoria,
        ciudad: input.ciudad,
        // La etapa no se pregunta en el formulario: una cuenta que nace aca todavia no se ha
        // tocado. 'lead' es donde de verdad esta, y mover_estado es el unico camino que
        // escribe la transicion al historial.
        estadoNotion: 'lead',
        // El owner sale de la sesion, nunca del formulario: nadie da de alta cuentas a nombre
        // de otro. Ademas es lo que decide si la cuenta le sale a alguien en Toques.
        owner,
        forzar: input.forzar,
      },
      idOrganizacion,
    );

    if (!alta.creada) {
      return {
        ok: false,
        error: alta.mensaje,
        duplicados: alta.candidatos.map((c) => ({ idEmpresa: c.idEmpresa, nombreOficial: c.nombreOficial })),
      };
    }

    const idEmpresa = alta.empresa.idEmpresa;
    const tieneDatos = Boolean(input.contacto.email?.trim() || input.contacto.telefono?.trim());
    let contacto: 'creado' | 'duplicado' | 'sin_datos' = 'sin_datos';
    let avisoContacto: string | undefined;

    if (tieneDatos) {
      const alta2 = crearContacto(
        {
          idEmpresa,
          nombre: input.contacto.nombre?.trim() || undefined,
          email: input.contacto.email?.trim() || undefined,
          telefono: input.contacto.telefono?.trim() || undefined,
          // Principal: es el que elige elegirDestinatarioDefault cuando la cuenta entra a una
          // cadencia. Una cuenta recien creada no tiene otro que degradar.
          esPrincipal: true,
          fuente: 'web',
        },
        idOrganizacion,
      );
      contacto = alta2.creado ? 'creado' : 'duplicado';
      if (!alta2.creado) avisoContacto = alta2.mensaje;
    } else {
      avisoContacto =
        'La cuenta quedó creada sin contacto. Sin correo ni teléfono no hay a quién mandarle: la inscripción a una campaña nacería bloqueada.';
    }

    // Las pantallas que listan cuentas y las que arman segmentos leen esta cuenta nueva.
    revalidatePath('/cola');
    revalidatePath('/seguimiento');
    revalidatePath('/pipeline');
    revalidatePath('/campanas/nueva');

    return { ok: true, idEmpresa, nombre: alta.empresa.nombreOficial, categoria: alta.empresa.categoria ?? '', contacto, avisoContacto };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo crear la cuenta' };
  }
}
