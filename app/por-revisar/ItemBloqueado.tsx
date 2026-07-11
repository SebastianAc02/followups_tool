'use client';

import { useState } from 'react';
import { completarContactoAction, agregarContactoAction } from './actions';
import { cn } from '../ui/cn';
import { button } from '../ui/button.variants.ts';
import type { InscripcionBloqueadaConContactos } from '../db/repository';

// Sesion 2026-07-10: reemplaza a ToqueRevisar.tsx -- "Por revisar" ya no personaliza
// copy (eso vive en /llamada), completa el dato de contacto que le falta a una
// inscripcion bloqueada. Cada contacto existente de la empresa se edita in-line;
// "Guardar y activar" corre completarContactoAction con ESE contacto. Si la empresa no
// tiene ningun contacto, se ofrece crear uno nuevo (agregarContactoAction).
export default function ItemBloqueado({ item }: { item: InscripcionBloqueadaConContactos }) {
  const [resuelto, setResuelto] = useState(false);

  if (resuelto) return null;

  return (
    <div className="border-b border-line py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ink">{item.empresa}</span>
        {item.fecha && <span className="mono text-[12px] text-faint">inscrita {item.fecha.slice(0, 10)}</span>}
      </div>

      {item.contactos.length > 0 ? (
        <div className="mt-2 flex flex-col gap-3">
          {item.contactos.map((c) => (
            <FormularioContacto
              key={c.idContacto}
              idInscripcion={item.id}
              idContacto={c.idContacto}
              nombre={c.nombre}
              emailInicial={c.email ?? ''}
              telefonoInicial={c.telefono ?? ''}
              onResuelto={() => setResuelto(true)}
            />
          ))}
        </div>
      ) : (
        <FormularioContactoNuevo idInscripcion={item.id} idEmpresa={item.idEmpresa} onResuelto={() => setResuelto(true)} />
      )}
    </div>
  );
}

function FormularioContacto({
  idInscripcion,
  idContacto,
  nombre,
  emailInicial,
  telefonoInicial,
  onResuelto,
}: {
  idInscripcion: number;
  idContacto: number;
  nombre: string | null;
  emailInicial: string;
  telefonoInicial: string;
  onResuelto: () => void;
}) {
  const [email, setEmail] = useState(emailInicial);
  const [telefono, setTelefono] = useState(telefonoInicial);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEnviando(true);
    setError(null);
    const resultado = await completarContactoAction(idInscripcion, idContacto, { email, telefono });
    if (resultado.ok) {
      onResuelto();
    } else {
      setError(resultado.error);
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-line bg-hover px-3 py-2.5">
      <p className="text-[12.5px] text-muted">{nombre ?? 'Contacto sin nombre'}</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="correo@empresa.com"
          className="min-w-0 flex-1 rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
        />
        <input
          type="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="teléfono"
          className="w-[140px] rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
        />
      </div>
      {error && <p className="mt-1.5 text-[12.5px] text-overdue">{error}</p>}
      <button
        type="button"
        onClick={guardar}
        disabled={enviando || email.trim() === ''}
        className={cn(button({ variant: 'pill' }), 'mt-2 text-[12.5px]')}
      >
        {enviando ? 'Guardando...' : 'Guardar y activar'}
      </button>
    </div>
  );
}

function FormularioContactoNuevo({
  idInscripcion,
  idEmpresa,
  onResuelto,
}: {
  idInscripcion: number;
  idEmpresa: string;
  onResuelto: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setEnviando(true);
    setError(null);
    const resultado = await agregarContactoAction(idInscripcion, idEmpresa, { nombre, email, telefono });
    if (resultado.ok) {
      onResuelto();
    } else {
      setError(resultado.error);
      setEnviando(false);
    }
  }

  return (
    <div className="mt-2 rounded-[10px] border border-line bg-hover px-3 py-2.5">
      <p className="text-[12.5px] text-muted">Esta cuenta no tiene ningún contacto registrado</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="nombre"
          className="w-[140px] rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="correo@empresa.com"
          className="min-w-0 flex-1 rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
        />
        <input
          type="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="teléfono"
          className="w-[140px] rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
        />
      </div>
      {error && <p className="mt-1.5 text-[12.5px] text-overdue">{error}</p>}
      <button
        type="button"
        onClick={crear}
        disabled={enviando || email.trim() === ''}
        className={cn(button({ variant: 'pill' }), 'mt-2 text-[12.5px]')}
      >
        {enviando ? 'Creando...' : 'Crear y activar'}
      </button>
    </div>
  );
}
