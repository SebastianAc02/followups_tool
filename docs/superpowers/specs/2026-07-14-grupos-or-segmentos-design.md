# Grupos OR en segmentos de campañas

## Contexto

El modelo de segmentación (`DefinicionSegmento.condiciones`, [app/db/validation.ts](../../../app/db/validation.ts))
solo soporta AND entre condiciones. El Copiloto ([app/campanas/nueva/copiloto.ts](../../../app/campanas/nueva/copiloto.ts))
lo respeta correctamente: cuando el usuario pide algo tipo "owner Sebastian Acosta o sin owner",
lo lista en `noMapeado` en vez de inventar una condición que no expresa lo pedido (ver el caso
real documentado en el comentario "Bug real 2026-07-14" del mismo archivo, que ya cubrió el caso
análogo de `es_null`/`no_null`).

Se evaluaron tres formas de cerrar este hueco: un operador angosto `en_o_null` (cubre solo
"valor o vacío"), un árbol booleano recursivo (AND/OR anidado sin límite), y un array plano con
union (condición suelta o grupo OR de un nivel). Se eligió la tercera: es el cambio mínimo que
cubre el caso real, no cierra la puerta a agregar más adelante, y el blast radius es acotado
(Zod + un caso en el compilador de queries + el prompt del Copiloto).

## Alcance

- El Copiloto puede generar grupos OR de un nivel dentro del AND de siempre.
- `FiltroWall.tsx` (edición manual de filtros) **no** gana controles para armar grupos OR a
  mano. Si un segmento ya trae un grupo OR (creado por el Copiloto), lo muestra como un chip
  de solo lectura.
- Sin anidación: un grupo OR no puede contener otro grupo OR.

## Diseño

### 1. Schema (`app/db/validation.ts`)

```ts
const condicionSimpleSchema = z.union([
  condicionEnSchema,
  condicionNullSchema,
  condicionEntreSchema,
  condicionComparaSchema,
]);

const grupoOrSchema = z.object({
  or: z.array(condicionSimpleSchema).min(2, 'un grupo OR necesita al menos 2 condiciones'),
});

export const definicionSegmentoSchema = z.object({
  condiciones: z
    .array(z.union([condicionSimpleSchema, grupoOrSchema]))
    .min(1, 'un segmento necesita al menos una condicion'),
  orden: z.object({ campo: z.enum(CAMPOS_SEGMENTO_NUMERICOS), dir: z.enum(['asc', 'desc']) }).optional(),
  limite: z.number().int().positive().optional(),
});
```

`min(2)` en el grupo evita el caso degenerado de un OR de una sola condición (equivalente a la
condición suelta, solo ruido). La union sobre `condicionSimpleSchema` (no sobre
`definicionSegmentoSchema.condiciones`) es lo que impide anidar un grupo OR dentro de otro.

### 2. Repository (`compilarSegmento`, `app/db/repository.ts`)

Extraer la lógica que hoy vive inline en el `switch` de `compilarSegmento` a una función
`compilarCondicion(c: CondicionSimple): SQL`, sin cambiar su comportamiento. `compilarSegmento`
gana un caso: si el item del array es `{or: [...]}`, mapea cada condición interna con
`compilarCondicion` y las envuelve en `or(...)` de drizzle. El `and(...conds)` final no cambia.

`condicionRol` y `condicionPersonas` (subconsultas EXISTS/COUNT correlacionadas) funcionan igual
dentro de un `or()` de drizzle — son solo `SQL` compuesto, no hay nada especial de OR que las
rompa.

### 3. Copiloto (`app/campanas/nueva/copiloto.ts`)

Nueva regla en `construirPrompt`: "X o sin X" / "X o vacío" → grupo
`{or: [{campo, op:'en', valores:[...]}, {campo, op:'es_null'}]}`, en vez de listarlo en
`noMapeado`. Actualizar el comentario "Bug real 2026-07-14" — este era justo el caso que
quedaba fuera de esa regla.

### 4. FiltroWall (`app/campanas/nueva/FiltroWall.tsx`)

`condiciones.map` hoy asume que cada item es una condición simple (`c.campo`, `c.op`). Con el
union nuevo, TS marca error de tipos en `valorTexto`, `camposUsados` y el JSX del chip — hay que
agregar una rama:

- Si el item es `{or: [...]}`, se renderiza como un chip no editable con texto tipo
  `"Owner: Sebastian o vacío"` (unir `LABELS[c.campo]` + `valorTexto(c)` de cada condición
  interna con `" o "`).
- Sin botón de editar, solo el de quitar (borra el grupo completo).
- No entra en `camposUsados` porque no es un campo único (para no bloquear que se agregue otra
  condición sobre el mismo campo del grupo desde los desplegables normales).

## Testing

- `validation.test.ts`: grupo OR válido pasa; grupo de 1 condición falla; grupo anidado (`or`
  dentro de `or`) falla en tiempo de tipos/parse.
- Repository: `empresasDeSegmento` con un grupo OR trae las filas esperadas (caso owner=X o
  null, contra fixtures reales) — nuevo test o extensión de
  `repository.ordenLimite.test.ts`.
- `copiloto.test.ts`: nuevo test tipo el de `es_null` — el prompt debe traer la regla de grupos
  OR; `pedirAlCopiloto` acepta un `estadoNuevo` con `{or:[...]}` vía `IAFake`.

## Fuera de alcance

- Controles de UI en FiltroWall para armar OR a mano.
- Anidación de más de un nivel (OR dentro de OR, AND dentro de OR).
- El operador angosto `en_o_null` (queda subsumido por el grupo OR genérico).
