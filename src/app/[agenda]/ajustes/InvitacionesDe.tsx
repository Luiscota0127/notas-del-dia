/**
 * Las invitaciones pendientes de una agenda, con su botón de revocar.
 *
 * Es un componente aparte y no un `.map` en la page porque necesita el `action`
 * del server dentro de un form, y porque la lista puede crecer sin tocar la
 * página.
 */
export function InvitacionesDe({
  agendaId,
  invitaciones,
  revocar,
}: {
  agendaId: string;
  invitaciones: Array<{ id: string; email: string; created_at: string }>;
  revocar: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="mb-8">
      <p className="text-sm text-dim mb-2">Invitaciones pendientes</p>
      <ul className="flex flex-col gap-1">
        {invitaciones.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{i.email}</span>
            <form action={revocar}>
              <input type="hidden" name="agendaId" value={agendaId} />
              <input type="hidden" name="email" value={i.email} />
              <button type="submit" className="btn-ghost text-sm text-dim shrink-0">
                Revocar
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
