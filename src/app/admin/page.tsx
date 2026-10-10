import Link from "next/link"
import { requireAdmin } from "@/lib/admin-auth"
import { supabase } from "@/lib/supabaseClient"
import { ownerSummary } from "@/lib/admin-owners"
import { addOwner, logoutAdmin } from "./actions"

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; error?: string }> }) {
  await requireAdmin()
  const params = await searchParams
  const q = (params.q ?? "").trim().slice(0, 100)
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.page) || 1)))
  let query = supabase.from("owners").select("id", { count: "exact" }).order("created_at", { ascending: false }).order("id")
  if (q) {
    const term = q.replace(/[^\p{L}\p{N}@ ._-]/gu, "").replaceAll("_", "\\_")
    query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%`)
  }
  const { data, error, count } = await query.range((page - 1) * 20, page * 20 - 1)
  if (error) throw new Error("No se pudieron consultar las cuentas")
  const owners = await Promise.all((data ?? []).map(row => ownerSummary(row.id)))
  return <>
    <header className="flex flex-wrap justify-between gap-4"><h1 className="text-[length:var(--fs-28)]">ISIPICI · Cuentas</h1><form action={logoutAdmin}><button className="btn-primary">Salir</button></form></header>
    {params.error && <p role="alert">{params.error}</p>}
    <form className="flex gap-4"><label>Buscar por nombre o email<input name="q" defaultValue={q} className="block border p-p10" /></label><button className="btn-primary">Buscar</button></form>
    <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{["Nombre", "Email", "Alta", "Estado", "Clientes", "País", "Actividad"].map(label => <th className="p-p10" key={label}>{label}</th>)}</tr></thead><tbody>{owners.map(owner => owner && <tr key={owner.id}><td className="p-p10"><Link className="underline" href={`/admin/owners/${owner.id}`}>{owner.name}</Link></td><td className="p-p10">{owner.email}</td><td className="p-p10">{owner.created_at ? new Date(owner.created_at).toLocaleDateString("es-AR", { timeZone: "UTC" }) : "—"}</td><td className="p-p10">{owner.is_active ? "Activa" : "Deshabilitada"}</td><td className="p-p10">{owner.clientCount}</td><td className="p-p10">{owner.country ?? "—"}</td><td className="p-p10">{owner.business_type ?? "—"}</td></tr>)}</tbody></table>{!owners.length && <p>No hay cuentas para esta búsqueda.</p>}</div>
    <nav className="flex gap-4" aria-label="Paginación">{page > 1 && <Link href={`/admin?q=${encodeURIComponent(q)}&page=${page - 1}`}>Anterior</Link>}<span>Página {page} · {count ?? 0} cuentas</span>{page * 20 < (count ?? 0) && <Link href={`/admin?q=${encodeURIComponent(q)}&page=${page + 1}`}>Siguiente</Link>}</nav>
    <section className="p-p20 bg-[var(--n)] rounded-[var(--br20)] space-y-6"><h2 className="text-[length:var(--fs-20)]">Crear cuenta</h2><p>Entregá la contraseña inicial mediante un canal seguro.</p><form action={addOwner} className="space-y-6"><label className="block">Nombre<input name="name" required maxLength={200} className="block border p-p10" /></label><label className="block">Email<input name="email" type="email" required maxLength={254} className="block border p-p10" /></label><label className="block">Contraseña inicial<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required className="block border p-p10" /></label><label className="block">PIN de acceso al dashboard<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4}" autoComplete="off" minLength={4} maxLength={4} required className="block border p-p10" /></label><label className="block">Moneda<select name="currency" required defaultValue="ARS" className="block border p-p10"><option value="ARS">ARS — Peso argentino</option><option value="AUD">AUD — Dólar australiano</option></select></label><button className="btn-primary">Crear cuenta</button></form></section>
  </>
}
