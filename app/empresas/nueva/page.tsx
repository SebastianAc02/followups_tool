import { requireSession } from '../../lib/session';
import { esModoPrueba } from '../../lib/modo-prueba';
import { AppShell } from '../../ui/shell/AppShell';
import { CATEGORIAS_ESCRIBIBLES, CATEGORIA_PRUEBA, categoriaPorDefecto } from '../../core/empresa-identidad';
import { FormularioCuenta } from './FormularioCuenta';

// Alta de una cuenta desde la web. La pantalla que faltaba: hasta hoy el unico camino para
// crear una empresa era el MCP, que corre siempre contra isps.db, asi que con el modo prueba
// prendido no habia forma de sembrar nada desde la interfaz.
//
// La pagina no decide contra que base escribe (no puede saberlo): requireSession marca el modo
// de la request y el Proxy de app/db/index.ts resuelve la conexion. Lo unico que el modo
// cambia aca es el DEFAULT de la categoria y que 'test' aparezca como opcion.
export default async function NuevaCuenta() {
  const usuario = await requireSession();
  // Despues de requireSession: la caja del ALS ya esta llena. Antes seria false siempre.
  const modoPrueba = esModoPrueba();

  // 'test' solo se ofrece en modo prueba. Es la marca con la que el wizard de campanas separa
  // lo sembrado de lo real (la vista empresa_categoria de pruebas.db tiene una rama para ese
  // valor y la de isps.db no), asi que fuera del modo prueba no significa nada.
  const categorias = modoPrueba ? [...CATEGORIAS_ESCRIBIBLES] : [...CATEGORIAS_ESCRIBIBLES].filter((c) => c !== CATEGORIA_PRUEBA);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1 className="font-serif text-2xl font-medium text-ink">Cuenta nueva</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            La cuenta y su contacto principal en un solo paso. Queda a nombre de {usuario.owner} y entra como lead.
          </p>
          {modoPrueba && (
            <p className="mt-2 text-[13px] text-today">
              Modo prueba: se escribe en pruebas.db y la categoría viene marcada como test, que es por donde el
              armador de campañas separa las cuentas sembradas.
            </p>
          )}
        </div>

        <FormularioCuenta
          categorias={categorias}
          categoriaInicial={categoriaPorDefecto(modoPrueba)}
          owner={usuario.owner}
          soloLectura={usuario.soloLectura}
        />
      </div>
    </AppShell>
  );
}
