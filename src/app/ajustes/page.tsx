import Link from "next/link";

import { getProfile, requireUser } from "@/lib/db/queries";
import { ToggleTema } from "@/app/ajustes/ToggleTema";
import { guardarAvisos, guardarNombre } from "./acciones";

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
          Es el nombre que ven los demás en las agendas donde sos parte.
        </p>
      </section>

      <section className="mb-8">
        <p className="text-sm text-dim mb-2">Qué avisos recibís</p>
        {/* Botones de radio, no <select>: son tres opciones y un `<select>` en
            iOS abre un picker nativo que tapa media pantalla. */}
        <ul className="flex flex-col gap-1 text-sm">
          {(
            [
              ["all", "Todas, las mías y las suyas"],
              ["mine", "Solo las mías"],
              ["none", "Ninguno"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <li key={valor}>
              <form action={guardarAvisos}>
                <input type="hidden" name="notify" value={valor} />
                <button
                  className="hover:text-accent w-full text-left"
                  type="submit"
                  role="radio"
                  aria-checked={profile.notify === valor}
                >
                  {profile.notify === valor ? "●" : "○"} {etiqueta}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <p className="text-sm text-dim mb-2">Tema</p>
        <ToggleTema />
      </section>
    </main>
  );
}
