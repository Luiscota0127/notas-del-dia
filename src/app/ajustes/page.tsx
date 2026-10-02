import Link from "next/link";

import { getProfile, requireUser } from "@/lib/db/queries";
import { ToggleTema } from "@/app/ajustes/ToggleTema";
import { cerrarSesion, guardarAvisos, guardarNombre } from "./acciones";

/**
 * Ajustes personales. Son de la persona, no de la agenda: no cambian al cambiar
 * de agenda, así que viven acá y no en `/[agenda]/ajustes`.
 */
export default async function AjustesPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);

  return (
    <main className="p-4 md:p-8 max-w-lg">
      <Link href="/agendas" className="text-dim text-sm hover:text-accent">
        ← Volver
      </Link>

      <h1 className="text-xl mt-4 mb-6">Ajustes</h1>

      <section className="flex flex-col gap-2 mb-8">
        <label htmlFor="nombre" className="text-sm text-dim">
          Cómo te llamamos
        </label>
        <form action={guardarNombre} className="flex gap-2">
          <input
            id="nombre"
            name="name"
            defaultValue={profile.name}
            className="input flex-1"
            required
          />
          <button type="submit" className="btn shrink-0">
            Guardar
          </button>
        </form>
        <p className="text-dim text-sm">
          Es el nombre que ven los demás en las agendas donde eres parte.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-sm text-dim mb-2 font-normal" id="avisos-titulo">
          Qué avisos recibes
        </h2>
        {/* Botones de radio, no <select>: son tres opciones y un `<select>` en
            iOS abre un picker nativo que tapa media pantalla.

            `role="radiogroup"` + `role="radio"` es lo que hace que un lector de
            pantalla anuncie "grupo, 1 de 3". Antes los `role="radio"` estaban
            sueltos en un `<ul>` sin grupo: el rol no tenía a qué agarrarse.

            La flecha ↑↓ NO se implementa a mano: es comportamiento nativo de un
            grupo de radios real, pero acá cada opción es un `<form>` distinto con
            su propio submit (así cada una manda su valor al servidor). Con
            `role="radio"` sintetizado, el tabulador recorre los tres como
            botones normales, que es predecible y no simula un teclado de flechas
            que no responde. */}
        <div role="radiogroup" aria-labelledby="avisos-titulo" className="flex flex-col gap-1 text-sm">
          {(
            [
              ["all", "Todas, las mías y las suyas"],
              ["mine", "Solo las mías"],
              ["none", "Ninguno"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <form key={valor} action={guardarAvisos}>
              <input type="hidden" name="notify" value={valor} />
              <button
                className="hover:text-accent w-full text-left flex items-center gap-2"
                type="submit"
                role="radio"
                aria-checked={profile.notify === valor}
              >
                <span aria-hidden="true">{profile.notify === valor ? "●" : "○"}</span>
                {etiqueta}
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <p className="text-sm text-dim mb-2">Tema</p>
        <ToggleTema />
      </section>

      <section className="pt-6 border-t border-line">
        <p className="text-sm text-dim mb-2">Cerrar sesión</p>
        <form action={cerrarSesion}>
          <button type="submit" className="btn-ghost text-sm">
            Salir de este teléfono
          </button>
        </form>
        <p className="text-dim text-sm mt-2">
          Borra del teléfono las notas y las páginas que quedaron guardadas. Lo que
          está en la nube no se toca.
        </p>
      </section>
    </main>
  );
}
