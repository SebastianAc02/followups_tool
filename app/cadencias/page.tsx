import { redirect } from "next/navigation";

// Parte 4 campanas: /cadencias (constructor viejo, calendario suelto) queda retirado.
// Campañas es la puerta de entrada real: segmento -> revisión -> cadencia con copy ->
// ejecución. No se borra ConstructorCadencia.tsx/actions.ts por si la vista calendario
// se reusa mas adelante dentro de /campanas.
export default function Cadencias() {
  redirect("/campanas");
}
