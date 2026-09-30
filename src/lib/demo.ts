/**
 * La nota de la referencia, en un solo lugar.
 *
 * La usan el modo demo de /[date] y el de /semana, y los tests. Antes estaba
 * duplicada en la página y en el env; dos copias de la referencia_impl es
 * exactamente la forma de que dejen de coincidir.
 *
 * Copia literal de .opencode/skills/notas-formato/references/ejemplo-real.md
 */

/**
 * ¿Entró por el atajo de desarrollo `?demo=1`?
 *
 * El chequeo de NODE_ENV va ACÁ y no en cada página porque el otro día se olvidó
 * en una de las tres: el atajo es `q.demo === "1"`, la nota de producción venía
 * vacía de `notaDePrueba()`, y la página renderizaba igual — con nombres falsos
 * y sin pasar por el login. Con el repo público, `/mandado?demo=1` abría una
 * lista de ejemplo a cualquiera que visitara la URL. Acá no hay forma de que
 * production se cuele: si no es desarrollo, no hay demo.
 */
export function esDemo(param: string | string[] | undefined): boolean {
  return param === "1" && process.env.NODE_ENV !== "production";
}

export const NOTA_DEMO = `SEPTIEMBRE

☐ 08 sep (dosis 3 de anti pulgas mishibu)
☐ Ya volver a reuniones PT . (Ya que esté establecido la venta desayunos)
☐ Buscar tratar celulitis  Nahomi
☐ Tapar drenaje con cemento. (Luis)
☐ Pintar cuarto  nuestro (Luis raspar/ Nahomi pintar)

MARTES 01 SEP

•  inicia campaña vacuna vph (buscar entro de salud)

7:30am publicar ventas y promo

•  preparar comida del día

1:00pm publicar comida el día.

6:00pm hacer ejercicio/ ir gym caminar y masaje.

7:00pm a 9:00pm luis didi

11:00pm dormir 😴`;
