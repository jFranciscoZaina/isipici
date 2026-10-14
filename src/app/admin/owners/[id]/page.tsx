import WorkspaceAccessPanel from "../../WorkspaceAccessPanel"
import AuditPanel from "../../AuditPanel"
import ConfirmedForm from "../../ConfirmedForm"
import Link from "next/link"
import {notFound} from "next/navigation"
import {requireAdmin} from "@/lib/admin-auth"
import {ownerSummary,AnalyticsError} from "@/lib/admin-owners"
import {LegacyAccessForm} from "../../BusinessForms"
import {setOwnerStatus,setOwnerCurrency,setBusinessContact} from "../../actions"

const field="w-full rounded-br15 bg-bg0 border border-n1 px-p20 py-p10 fs-14 text-app"
const label="flex flex-col gap-p5 fs-12 text-app-secondary"
const secondary="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1"
const date=(v:string|null)=>v?new Date(v).toLocaleString("es-AR",{timeZone:"UTC"})+" UTC":"Sin actividad registrada"

export default async function OwnerDetails({params}:{params:Promise<{id:string}>}){
 await requireAdmin()
 const {id}=await params
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))notFound()

 let owner
 try{owner=await ownerSummary(id)}catch(e){return <section className="flex flex-col gap-p20"><Link href="/admin" className={secondary} style={{backgroundColor:"var(--n)"}}>Volver al backoffice</Link><div role="alert" className="rounded-br15 border p-p20 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}}>{e instanceof AnalyticsError?e.message:"No se pudo cargar el negocio."}</div></section>}
 if(!owner)notFound()

 const usage=[
  ["Clientes",owner.clientCount],
  ["Pagos",owner.paymentCount],
  ["Recurrentes",owner.recurringCount],
  ["Únicos",owner.oneOffCount],
  ["Owners",owner.modernOwnerCount+" / "+owner.max_owner_members],
  ["Invitaciones",owner.pendingInviteCount],
 ] as const

 return (
  <section className="flex flex-col gap-p20">
   <header className="flex flex-col gap-p20 border-b border-n1" style={{paddingBottom:"var(--p20)"}}>
    <div><Link href="/admin" className={secondary} style={{backgroundColor:"var(--n)"}}>← Volver al backoffice</Link></div>
    <div className="flex flex-col gap-p10 sm:flex-row sm:items-end sm:justify-between">
     <div>
      <p className="fs-12 text-app-secondary">Detalle del negocio</p>
      <h1 className="font-semibold text-app" style={{fontSize:"var(--fs-28)"}}>{owner.name}</h1>
      <p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{owner.contact_email??"Sin email de contacto"} · {owner.country??"País no configurado"}</p>
     </div>
     <span className="inline-flex self-start rounded-full px-p20 py-p10 fs-12 font-semibold" style={owner.is_active?{backgroundColor:"color-mix(in srgb, var(--status-paid) 10%, var(--n) 90%)",color:"var(--status-paid)"}:{backgroundColor:"var(--color-bg-bg1)",color:"var(--color-text-secondary)"}}>
      {owner.is_active?"Negocio activo":"Negocio deshabilitado"}
     </span>
    </div>
   </header>

   <section className="grid grid-cols-2 gap-p10 md:grid-cols-3 xl:grid-cols-6">
    {usage.map(([name,value])=><article key={name} className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}><p className="fs-12 text-app-secondary">{name}</p><p className="fs-20 font-semibold text-app" style={{marginTop:"var(--p5)"}}>{value}</p></article>)}
   </section>

   <section className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
    <div className="flex flex-col gap-p10">
     <div><h2 className="fs-20 font-semibold text-app">Resumen operativo</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Configuración y actividad relevante del negocio.</p></div>
     <dl className="grid grid-cols-1 gap-p10 sm:grid-cols-2 lg:grid-cols-4">
      {[
       ["Actividad comercial",owner.business_type??"—"],
       ["Moneda",owner.default_currency],
       ["Zona horaria",owner.timezone??"—"],
       ["Acceso clásico",owner.legacy_login_enabled?"Habilitado":"Deshabilitado"],
       ["Login clásico",owner.email??"Sin credenciales"],
       ["Último login",date(owner.lastLoginAt)],
       ["Última actividad",date(owner.lastActivityAt)],
       ["Históricos / sin clasificar",owner.unclassifiedCount],
      ].map(([name,value])=><div className="rounded-br10 border border-n1 p-p10" style={{backgroundColor:"var(--color-bg-bg0)"}} key={name}><dt className="fs-12 text-app-secondary">{name}</dt><dd className="fs-14 font-medium text-app" style={{marginTop:"var(--p5)"}}>{value}</dd></div>)}
     </dl>
    </div>
   </section>

   <section className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
    <form action={setBusinessContact} className="flex flex-col gap-p20">
     <input type="hidden" name="id" value={id}/>
     <div><h2 className="fs-20 font-semibold text-app">Información del negocio</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Datos administrativos y configuración general.</p></div>
     <div className="grid grid-cols-1 gap-p20 md:grid-cols-2">
      <label className={label}>Nombre<input name="name" defaultValue={owner.name} required maxLength={200} className={field}/></label>
      <label className={label}>Email de contacto<input name="contactEmail" type="email" required maxLength={254} defaultValue={owner.contact_email??""} className={field}/></label>
      <label className={label}>País<input name="country" maxLength={100} defaultValue={owner.country??""} className={field}/></label>
      <label className={label}>Actividad comercial<input name="businessType" maxLength={200} defaultValue={owner.business_type??""} className={field}/></label>
      <label className={label}>Zona horaria<input name="timezone" maxLength={100} defaultValue={owner.timezone??""} className={field}/></label>
     </div>
     <div><button className="btn-primary">Guardar información</button></div>
    </form>
   </section>

   <LegacyAccessForm id={id} email={owner.email} enabled={owner.legacy_login_enabled}/>

   <section className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
    <ConfirmedForm action={setOwnerCurrency} title="Cambiar moneda" message="La moneda solo puede cambiarse antes de registrar pagos, deuda o configuración de proveedores.">
     <input type="hidden" name="id" value={id}/>
     <div><h2 className="fs-20 font-semibold text-app">Moneda del negocio</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Cambiarla puede estar bloqueado si el negocio ya tiene actividad financiera.</p></div>
     <label className={label}>Moneda<select name="currency" defaultValue={owner.default_currency} className={field}><option value="ARS">ARS — Peso argentino</option><option value="AUD">AUD — Dólar australiano</option></select></label>
     <div><button className="btn-primary">Guardar moneda</button></div>
    </ConfirmedForm>
   </section>

   <WorkspaceAccessPanel key={id} ownerId={id}/>

   <section className="rounded-br15 border p-p20" style={{borderColor:"color-mix(in srgb, var(--color-state-danger) 35%, var(--n1) 65%)",backgroundColor:"var(--n)"}}>
    <ConfirmedForm action={setOwnerStatus} title={owner.is_active?"Deshabilitar negocio":"Reactivar negocio"} message={owner.is_active?"Se bloqueará el acceso moderno y clásico, incluidas las sesiones existentes.":"El negocio volverá a estar disponible para sus accesos autorizados."}>
     <input type="hidden" name="id" value={id}/>
     <input type="hidden" name="active" value={String(!owner.is_active)}/>
     <div><h2 className="fs-20 font-semibold text-app">{owner.is_active?"Zona de riesgo":"Negocio deshabilitado"}</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{owner.is_active?"Deshabilitar bloquea accesos y recordatorios, pero conserva todos los datos.":"Podés reactivar el negocio y recuperar sus accesos autorizados."}</p></div>
     <div><button className={owner.is_active?"inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium text-danger":"btn-primary"} style={owner.is_active?{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}:undefined}>{owner.is_active?"Deshabilitar negocio":"Reactivar negocio"}</button></div>
    </ConfirmedForm>
   </section>

   <AuditPanel key={"audit-"+id} ownerId={id}/>
  </section>
 )
}
