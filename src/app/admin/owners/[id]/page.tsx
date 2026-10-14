import WorkspaceAccessPanel from "../../WorkspaceAccessPanel"
import AuditPanel from "../../AuditPanel"
import ConfirmedForm from "../../ConfirmedForm"
import Link from "next/link"
import {notFound} from "next/navigation"
import {requireAdmin} from "@/lib/admin-auth"
import {ownerSummary,AnalyticsError} from "@/lib/admin-owners"
import {LegacyAccessForm} from "../../BusinessForms"
import {setOwnerStatus,setOwnerCurrency,setBusinessContact} from "../../actions"
const field="block w-full rounded-br15 bg-bg1 border border-n1 px-p20 py-p10"
const date=(v:string|null)=>v?new Date(v).toLocaleString("es-AR",{timeZone:"UTC"})+" UTC":"Sin actividad registrada"
export default async function OwnerDetails({params}:{params:Promise<{id:string}>}){
 await requireAdmin()
 const {id}=await params
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))notFound()
 let owner
 try{owner=await ownerSummary(id)}catch(e){return <section><Link href="/admin">Volver</Link><p role="alert">{e instanceof AnalyticsError?e.message:"No se pudo cargar el negocio."}</p></section>}
 if(!owner)notFound()
 const info={"Email de contacto":owner.contact_email??"—","País":owner.country??"—","Actividad comercial":owner.business_type??"—","Moneda":owner.default_currency,"Zona horaria":owner.timezone??"—","Estado":owner.is_active?"Activo":"Deshabilitado","Owners modernos":owner.modernOwnerCount+" / "+owner.max_owner_members,"Acceso clásico":owner.legacy_login_enabled?"Habilitado":"Deshabilitado","Login clásico":owner.email??"Sin credenciales","Invitaciones pendientes":owner.pendingInviteCount,"Clientes":owner.clientCount,"Pagos":owner.paymentCount,"Recurrentes":owner.recurringCount,"Únicos":owner.oneOffCount,"Históricos / sin clasificar":owner.unclassifiedCount,"Último login":date(owner.lastLoginAt),"Última actividad significativa":date(owner.lastActivityAt)}
 return <section className="space-y-p20"><Link href="/admin" className="underline">Volver al backoffice</Link><h1 className="text-[length:var(--fs-28)]">{owner.name}</h1>
 <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-p20">{Object.entries(info).map(([label,value])=><div className="rounded-br15 bg-bg1 p-p20" key={label}><dt className="text-app-secondary">{label}</dt><dd>{value}</dd></div>)}</dl>
 <form action={setBusinessContact} className="space-y-p20"><input type="hidden" name="id" value={id}/><h2 className="fs-20">Información del negocio</h2>
 <label className="block">Nombre<input name="name" defaultValue={owner.name} required maxLength={200} className={field}/></label>
 <label className="block">Email de contacto<input name="contactEmail" type="email" required maxLength={254} defaultValue={owner.contact_email??""} className={field}/></label>
 <label className="block">País<input name="country" maxLength={100} defaultValue={owner.country??""} className={field}/></label>
 <label className="block">Actividad comercial<input name="businessType" maxLength={200} defaultValue={owner.business_type??""} className={field}/></label>
 <label className="block">Zona horaria<input name="timezone" maxLength={100} defaultValue={owner.timezone??""} className={field}/></label><button className="btn-primary">Guardar información</button></form>
 <LegacyAccessForm id={id} email={owner.email} enabled={owner.legacy_login_enabled}/>
 <ConfirmedForm action={setOwnerCurrency} title="Cambiar moneda" message="La moneda solo puede cambiarse antes de registrar pagos, deuda o configuración de proveedores."><input type="hidden" name="id" value={id}/><label className="block">Moneda<select name="currency" defaultValue={owner.default_currency} className={field}><option value="ARS">ARS</option><option value="AUD">AUD</option></select></label><button className="btn-primary">Guardar moneda</button></ConfirmedForm>
 <p>Deshabilitar bloquea acceso y recordatorios. Los datos se conservan.</p>
 <ConfirmedForm action={setOwnerStatus} title={owner.is_active?"Deshabilitar negocio":"Reactivar negocio"} message={owner.is_active?"Se bloqueará el acceso moderno y clásico, incluidas las sesiones existentes.":"El negocio volverá a estar disponible para sus accesos autorizados."}><input type="hidden" name="id" value={id}/><input type="hidden" name="active" value={String(!owner.is_active)}/><button className="btn-primary">{owner.is_active?"Deshabilitar negocio":"Reactivar negocio"}</button></ConfirmedForm>
 <WorkspaceAccessPanel key={id} ownerId={id}/><AuditPanel key={"audit-"+id} ownerId={id}/>
 </section>
}
