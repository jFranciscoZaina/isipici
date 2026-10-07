import Link from "next/link"
import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/admin-auth"
import { ownerSummary } from "@/lib/admin-owners"
import { setOwnerStatus } from "../../actions"
export default async function OwnerDetails({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const owner = await ownerSummary(id)
  if (!owner) notFound()
  return <section className="space-y-6"><Link href="/admin" className="underline">Volver a cuentas</Link><h1 className="text-[length:var(--fs-28)]">{owner.name}</h1><dl className="space-y-6">{Object.entries({ Email: owner.email, Alta: owner.created_at, Estado: owner.is_active ? "Activa" : "Deshabilitada", Clientes: owner.clientCount, País: owner.country ?? "—", Actividad: owner.business_type ?? "—" }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>Deshabilitar bloquea el acceso, las sesiones existentes y los recordatorios. Los datos se conservan.</p><form action={setOwnerStatus}><input type="hidden" name="id" value={owner.id} /><input type="hidden" name="active" value={String(!owner.is_active)} /><button className="btn-primary">{owner.is_active ? "Deshabilitar cuenta" : "Reactivar cuenta"}</button></form></section>
}
