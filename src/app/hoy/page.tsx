import { redirect } from "next/navigation";

import { todayISO } from "@/lib/format";

/** Atajo a la nota de hoy. El link de un día sí es compartible: /2026-09-01. */
export default function Hoy() {
  redirect(`/${todayISO()}`);
}
