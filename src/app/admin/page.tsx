import Link from "next/link"
import {requireAdmin} from "@/lib/admin-auth"
import {platformSummary,businessPage,AnalyticsError,type PlatformSummary,type BusinessPage} from "@/lib/admin-owners"
import BusinessCreateModal from "./BusinessCreateModal"
import AuditPanel from "./AuditPanel"
import {logoutAdmin} from "./actions"
const format=(v:string|null)=>v?new Date(v).toLocaleString("es-AR",{timeZone:"UTC"})+" UTC":"Sin actividad registrada"
export default async function AdminPage({searchParams}:{searchParams:Promise<{q?:string;page?:string;error?:string}>}){
 await requireAdmin()
 const params=await searchParams,q=(params.q??"").trim().slice(0,100),page=Math.max(1,Math.min(100000,Math.floor(Number(params.page)||1)))
 let summary:PlatformSummary|null=null,list:BusinessPage|null=null,loadError:string|null=null
 try{[summary,list]=await Promise.all([platformSummary(),businessPage(page,20,q)])}catch(e){loadError=e instanceof AnalyticsError?e.message:"No se pudo cargar el backoffice."}
 const kpis=summary?{"Negocios registrados":summary.businesses,"Negocios activos":summary.activeBusinesses,"Usuarios registrados":summary.users,"Memberships owner activas":summary.activeMemberships,"Negocios sin owner moderno":summary.zeroOwnerBusinesses,"Invitaciones pendientes":summary.pendingInvites,"Clientes totales":summary.clients,"Pagos totales":summary.payments,"Pagos recurrentes":summary.recurringPayments,"Pagos únicos":summary.oneOffPayments}:null
 return <>
  <header className="flex flex-wrap justify-between gap-p20"><h1 className="text-[length:var(--fs-28)]">ISIPICI · Backoffice</h1><div className="flex gap-p20"><BusinessCreateModal/><form action={logoutAdmin}><button className="btn-primary">Salir</button></form></div></header>
  {params.error&&<p role="alert">{params.error}</p>}
  {loadError&&<p role="alert">{loadError}</p>}
  {kpis&&<section aria-label="Métricas globales" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-p20">{Object.entries(kpis).map(([label,count])=><div className="bg-bg1 rounded-br15 p-p20" key={label}><p className="fs-14 text-app-secondary">{label}</p><strong className="text-[length:var(--fs-28)]">{count.toLocaleString("es-AR")}</strong></div>)}</section>}
  {summary&&<p className="fs-12 text-app-secondary">Pagos históricos o sin tipo reconocido: {summary.unclassifiedPayments}. No se asignan a recurrentes ni únicos. Usuarios: identidades registradas en Supabase Auth; perfiles completados: {summary.profiles}.</p>}
  <form className="flex flex-wrap gap-p20"><label>Buscar por nombre o email<input name="q" defaultValue={q} maxLength={100} className="block rounded-br15 bg-bg1 p-p10"/></label><button className="btn-primary">Buscar</button></form>
  {list&&<><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{["Nombre","Estado","Contacto","País","Actividad comercial","Clientes","Owners / máximo","Acceso clásico","Última actividad"].map(label=><th className="p-p10" key={label}>{label}</th>)}</tr></thead><tbody>{list.businesses.map(b=><tr key={b.id}><td className="p-p10"><Link className="underline" href={"/admin/owners/"+b.id}>{b.name}</Link></td><td className="p-p10">{b.is_active?"Activo":"Deshabilitado"}</td><td className="p-p10">{b.contact_email??"—"}</td><td className="p-p10">{b.country??"—"}</td><td className="p-p10">{b.business_type??"—"}</td><td className="p-p10">{b.clientCount}</td><td className="p-p10">{b.modernOwnerCount} / {b.max_owner_members}</td><td className="p-p10">{b.legacy_login_enabled?"Habilitado":"Deshabilitado"}</td><td className="p-p10">{format(b.lastActivityAt)}</td></tr>)}</tbody></table>{!list.businesses.length&&<p>No hay negocios para esta búsqueda.</p>}</div>
  <nav className="flex gap-p20" aria-label="Paginación">{page>1&&<Link href={"/admin?q="+encodeURIComponent(q)+"&page="+(page-1)}>Anterior</Link>}<span>Página {page} · {list.total} negocios</span>{page*20<list.total&&<Link href={"/admin?q="+encodeURIComponent(q)+"&page="+(page+1)}>Siguiente</Link>}</nav></>}
  <AuditPanel/>
 </>
}
