/**
 * `**negrita**` y `*cursiva*` en línea.
 *
 * El texto sigue siendo la fuente de verdad: en la textarea hay
 * `**negrita**`, y en la base también. Lo que interpreta las marcas es la capa
 * de display, igual que ya hace con `☐` o con `7:30am`. Por eso esto no toca el
 * schema, ni el cache, ni Realtime, ni nada de la sincronización.
 *
 * Solo en línea y solo estos dos. Listas, headers y blocks quedan para otro día:
 * son cosas que cambian la estructura de la línea, y el parser de la app es
 * justamente de línea.
 *
 * Lo difícil no es encontrar las marcas. Es que las dos capas midan igual. La
 * textarea muestra `**negrita**` en normal; la de display la muestra en
 * negrita, y la negrita mide más. Medido: 7.6% más de ancho en 17px, o sea 14px
 * de desvío en una frase de 23 caracteres. Todo lo que sigue en esa línea queda
 * corrido, y con él el caret.
 *
 * Por eso el parser devuelve los marcadores como segmentos aparte: el renderer
 * los oculta con `visibility: hidden` en fuente normal, que es la misma técnica
 * que ya usa `.prefijo`. Oculto mide lo mismo que en la textarea; en negrita no.
 */

export type Segmento =
  | { tipo: "texto" | "negrita" | "cursiva"; valor: string }
  /** El `**` o el `*`. Se renderiza invisible y en fuente normal. */
  | { tipo: "marca"; valor: string; largo: 2 | 1 };

/** Un solo `*`, sin tocar nada más de la línea. */
const CURSIVA_RE = /(?<!\*)\*([^*\n]+)\*(?!\*)/g;
/** `**` primero, para que no se lean como dos cursivas. */
const NEGRITA_RE = /\*\*([^*\n]+)\*\*/g;

/**
 * Parte una línea en segmentos.
 *
 * La invariante que manda sobre todo lo demás: **al volver a juntar los
 * segmentos tiene que dar la línea exacta**. Si al partir se pierde un
 * asterisco, la pantalla muestra texto que nadie escribió y el caret se corre.
 * Es un test, y es el que de verdad protege.
 */
export function partirEnSegmentos(linea: string): Segmento[] {
  // Se buscan las negritas primero y se tapan, para que sus `**` no se lean
  // después como dos cursivas vacías.
  const negritas: Array<{ ini: number; fin: number; cuerpo: string }> = [];
  for (const m of linea.matchAll(NEGRITA_RE)) {
    const ini = m.index!;
    negritas.push({ ini, fin: ini + m[0].length, cuerpo: m[1] });
  }

  const tapadas = (i: number) => negritas.some((n) => i >= n.ini && i < n.fin);

  const cursivas: Array<{ ini: number; fin: number; cuerpo: string }> = [];
  for (const m of linea.matchAll(CURSIVA_RE)) {
    if (tapadas(m.index!)) continue;
    cursivas.push({ ini: m.index!, fin: m.index! + m[0].length, cuerpo: m[1] });
  }

  if (negritas.length === 0 && cursivas.length === 0) {
    return [{ tipo: "texto", valor: linea }];
  }

  const trozos: Segmento[] = [];
  let i = 0;

  while (i < linea.length) {
    const negrita = negritas.find((n) => n.ini === i);
    const cursiva = cursivas.find((c) => c.ini === i);

    if (negrita) {
      trozos.push({ tipo: "marca", valor: "**", largo: 2 });
      trozos.push({ tipo: "negrita", valor: negrita.cuerpo });
      trozos.push({ tipo: "marca", valor: "**", largo: 2 });
      i = negrita.fin;
      continue;
    }

    if (cursiva) {
      trozos.push({ tipo: "marca", valor: "*", largo: 1 });
      trozos.push({ tipo: "cursiva", valor: cursiva.cuerpo });
      trozos.push({ tipo: "marca", valor: "*", largo: 1 });
      i = cursiva.fin;
      continue;
    }

    // Texto normal hasta la próxima marca. Si no hay ninguna más, hasta el final.
    const siguiente = Math.min(
      ...[...negritas, ...cursivas]
        .map((m) => m.ini)
        .filter((ini) => ini > i)
        .concat([linea.length]),
    );

    const pedazo = linea.slice(i, siguiente);
    const ultimo = trozos[trozos.length - 1];

    if (ultimo && ultimo.tipo === "texto") {
      // Dos trozos de texto pegados, para no fragmentar la capa de display.
      trozos.pop();
      trozos.push({ tipo: "texto", valor: ultimo.valor + pedazo });
    } else {
      trozos.push({ tipo: "texto", valor: pedazo });
    }

    i = siguiente;
  }

  return trozos;
}

/**
 * Cuánto hay que compensarle al ancho a un tramo en negrita o cursiva.
 *
 * Es la parte que hace que esto no rompa el caret: el tramo con estilo tiene que
 * ocupar EXACTAMENTE el ancho que ocupa en la textarea, que es en normal.
 *
 * El número sale de una medición real en el navegador —el editor mide el texto
 * en normal y con el estilo aplicado y guarda la diferencia— y no de una
 * constante inventada acá. Un 7.6% aproximado no sirve: a lo largo de una línea
 * el error se acumula y el caret vuelve a irse.
 */
export function compensacion(anchoNormal: number, anchoConEstilo: number): number {
  return anchoNormal - anchoConEstilo;
}
