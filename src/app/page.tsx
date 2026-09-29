import { redirect } from "next/navigation";

import { todayISO } from "@/lib/format";

/** "/" y "/hoy" van a la nota de hoy. El link de un día sí es compartible. */
export default function Home() {
  redirect(`/${todayISO()}`);
}
