'use client';

import { useState } from 'react';
import Link from 'next/link';
import { crearCuentaAction, type AltaCuentaResultado } from './actions';
import { cn } from '../../ui/cn';
import { button } from '../../ui/button.variants.ts';

// Formulario minimo a proposito: nombre, ciudad, categoria y el contacto principal. Todo lo
// demas de una cuenta (NIT, page id de Notion, prioridad) se completa despues por su camino;
// pedirlo aca convertiria el gesto de sembrar una cuenta de prueba en un tramite.
//
// No redirige al terminar: quien esta probando crea varias seguidas. La confirmacion queda a
// la vista con el id que quedo escrito (relectura del dominio, no eco del formulario) y el
// formulario se vacia para la siguiente.

const ETIQUETA_CATEGORIA: Record<string, string> = {
  isp: 'ISP',
  utility: 'Utility',
  otro: 'Otro',
  test: 'Test (cuenta sembrada)',
};

const CLASE_INPUT =
  'w-full rounded-[10px] border border-line bg-hover px-3 py-2.5 text-[13.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong';

function Campo({ etiqueta, children, nota }: { etiqueta: string; children: React.ReactNode; nota?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] text-muted">{etiqueta}</span>
      {children}
      {nota && <span className="mt-1 block text-[11.5px] text-faint">{nota}</span>}
    </label>
  );
}

export function FormularioCuenta({
  categorias,
  categoriaInicial,
  owner,
  soloLectura,
}: {
  categorias: string[];
  categoriaInicial: string;
  owner: string;
  soloLectura: boolean;
}) {
  const [nombre, setNombre] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [categoria, setCategoria] = useState(categoriaInicial);
  const [contactoNombre, setContactoNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<AltaCuentaResultado | null>(null);

  // El antidupe de crearEmpresa se pasa por alto una sola vez y a mano: el boton de forzar
  // aparece SOLO despues de que rechazo el alta, con los candidatos a la vista.
  const duplicados = resultado && !resultado.ok ? (resultado.duplicados ?? []) : [];

  async function guardar(forzar: boolean) {
    setGuardando(true);
    const r = await crearCuentaAction({
      nombre,
      ciudad,
      categoria,
      contacto: { nombre: contactoNombre, telefono, email },
      forzar,
    });
    setResultado(r);
    setGuardando(false);
    if (r.ok) {
      setNombre('');
      setCiudad('');
      setContactoNombre('');
      setTelefono('');
      setEmail('');
    }
  }

  if (soloLectura) {
    return (
      <p className="rounded-[14px] border border-line bg-card px-5 py-4 text-[13.5px] text-muted">
        Tu sesión es de solo lectura: no puede crear cuentas.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[14px] border border-line bg-card px-5 py-4">
        <div className="mb-3 text-[10.5px] uppercase tracking-[0.16em] text-faint">La cuenta</div>
        <div className="flex flex-col gap-3">
          <Campo etiqueta="Nombre de la empresa">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Redes del Valle SAS"
              className={CLASE_INPUT}
            />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Ciudad" nota="Por acá filtra el armador de segmentos">
              <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Cali" className={CLASE_INPUT} />
            </Campo>
            <Campo etiqueta="Categoría">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={CLASE_INPUT}>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CATEGORIA[c] ?? c}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <p className="text-[11.5px] text-faint">Queda como lead, a nombre de {owner}.</p>
        </div>
      </div>

      <div className="rounded-[14px] border border-line bg-card px-5 py-4">
        <div className="mb-3 text-[10.5px] uppercase tracking-[0.16em] text-faint">Contacto principal</div>
        <div className="flex flex-col gap-3">
          <Campo etiqueta="Nombre">
            <input
              value={contactoNombre}
              onChange={(e) => setContactoNombre(e.target.value)}
              placeholder="Ana Gómez"
              className={CLASE_INPUT}
            />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Teléfono" nota="Con indicativo, para WhatsApp">
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+573001234567"
                className={CLASE_INPUT}
              />
            </Campo>
            <Campo etiqueta="Correo" nota="Sin correo, la campaña no sabe a quién escribirle">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ana@empresa.com"
                className={CLASE_INPUT}
              />
            </Campo>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => guardar(false)}
          disabled={guardando || nombre.trim() === ''}
          className={cn(button({ variant: 'pill' }), 'text-[13px]')}
        >
          {guardando ? 'Creando...' : 'Crear cuenta'}
        </button>
        {duplicados.length > 0 && (
          <button
            type="button"
            onClick={() => guardar(true)}
            disabled={guardando}
            className={cn(button({ variant: 'quiet' }), 'text-[12.5px]')}
          >
            Crearla igual, es otra empresa
          </button>
        )}
      </div>

      {resultado && !resultado.ok && (
        <div className="rounded-[14px] border border-overdue/30 bg-overdue/5 px-5 py-4">
          <p className="text-[13px] text-overdue">{resultado.error}</p>
          {duplicados.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {duplicados.map((d) => (
                <li key={d.idEmpresa} className="text-[12.5px] text-muted">
                  <Link href={`/llamada/${d.idEmpresa}`} className="underline underline-offset-2 hover:text-ink">
                    {d.nombreOficial}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {resultado && resultado.ok && (
        <div className="rounded-[14px] border border-done/30 bg-done/5 px-5 py-4">
          <p className="text-[13px] text-ink">
            {resultado.nombre} quedó creada ({ETIQUETA_CATEGORIA[resultado.categoria] ?? resultado.categoria}).{' '}
            {resultado.contacto === 'creado' && 'Su contacto principal también.'}
            {resultado.contacto === 'duplicado' && 'El contacto no se creó.'}
          </p>
          {resultado.avisoContacto && <p className="mt-1.5 text-[12.5px] text-muted">{resultado.avisoContacto}</p>}
          <div className="mt-2.5 flex flex-wrap gap-3 text-[12.5px]">
            <Link href={`/llamada/${resultado.idEmpresa}`} className="text-muted underline underline-offset-2 hover:text-ink">
              Abrir la cuenta
            </Link>
            <Link href="/campanas/nueva" className="text-muted underline underline-offset-2 hover:text-ink">
              Armar una campaña con ella
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
