"use client"
import {useCallback,useState} from "react"
import {useRemoteData} from "../dashboard/components/useRemoteData"
import InlineLoader from "../dashboard/components/InlineLoader"
import type {AuditEvent,auditPage} from "@/lib/admin-owners"

type Page=Awaited<ReturnType<typeof auditPage>>
const secondary="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1 disabled:opacity-50"

const actionLabels:Record<string,string>={
 "auth.login":"Inicio de sesión",
 "business.created":"Negocio creado",
 "business.updated":"Negocio actualizado",
 "business.enabled":"Negocio reactivado",
 "business.disabled":"Negocio deshabilitado",
 "legacy_access.enabled":"Acceso clásico habilitado",
 "legacy_access.disabled":"Acceso clásico deshabilitado",
 "legacy_access.credentials_changed":"Credenciales actualizadas",
 "client.created":"Cliente creado",
 "client.updated":"Cliente actualizado",
 "client.archived":"Cliente dado de baja",
 "client.reactivated":"Cliente reactivado",
 "plan.created":"Plan creado",
 "plan.updated":"Plan actualizado",
 "plan.archived":"Plan archivado",
 "subscription.changed":"Suscripción actualizada",
 "membership.added":"Cuenta vinculada",
 "membership.revoked":"Cuenta desvinculada",
 "invite.created":"Invitación creada",
 "invite.revoked":"Invitación revocada",
 "invite.redeemed":"Invitación utilizada",
}
const entityLabels:Record<string,string>={
 business:"Negocio",invite:"Invitación",membership:"Acceso",client:"Cliente",plan:"Plan",subscription:"Suscripción",user:"Usuario"
}
const fieldLabels:Record<string,string>={
 name:"nombre",email:"email",phone:"teléfono",address:"dirección",address_number:"número",due_day:"día de vencimiento",archived_at:"estado",
 contact_email:"email de contacto",country:"país",business_type:"actividad",default_currency:"moneda",timezone:"zona horaria",max_owner_members:"límite de owners",
 status:"estado",amount:"importe",currency:"moneda",plan_id:"plan",interval_unit:"frecuencia",interval_count:"intervalo",billing_anchor_date:"fecha base",
 cancel_at_period_end:"baja al final del período",cancellation_boundary:"fecha de baja",installments_enabled:"cuotas",target_plan_id:"nuevo plan",new_amount:"nuevo importe",
 new_frequency:"nueva frecuencia",effective_from:"vigencia",starts_on:"inicio"
}

function actorLabel(event:AuditEvent){
 if(event.actor_kind==="admin")return "Admin ISIPICI"
 if(event.actor_kind==="legacy")return "Acceso clásico"
 if(event.actor_kind==="system")return "Sistema"
 return event.actor_label??"Usuario vinculado"
}

function detailSummary(event:AuditEvent){
 const metadata=event.metadata??{}
 if(Array.isArray(metadata.changed_fields)&&metadata.changed_fields.length){
  const labels=metadata.changed_fields.filter((field):field is string=>typeof field==="string").map(field=>fieldLabels[field]??field.replaceAll("_"," "))
  return "Cambió "+labels.join(", ")+"."
 }
 if(typeof metadata.subject_user_id==="string")return "Cuenta afectada: "+(event.subject_label??metadata.subject_user_id.slice(0,8)+"…")+"."
 if(metadata.active===false)return "El negocio quedó deshabilitado."
 if(metadata.active===true)return "El negocio quedó activo."
 if(metadata.price_changed===true&&typeof metadata.effective_from==="string")return "Precio actualizado con vigencia desde "+metadata.effective_from+"."
 if(typeof metadata.used_count==="number"&&typeof metadata.max_uses==="number")return `Uso ${metadata.used_count} de ${metadata.max_uses}.`
 return "Sin detalles adicionales."
}

export default function AuditPanel({ownerId}:{ownerId?:string}){
 const [cursor,setCursor]=useState<Page["next"]>(null)
 const query=new URLSearchParams(ownerId?{owner:ownerId}:{})
 if(cursor){query.set("before",cursor.before);query.set("beforeId",cursor.beforeId)}
 const url="/admin/api/audit?"+query.toString()
 const load=useCallback(async(signal:AbortSignal)=>{const r=await fetch(url,{signal});if(r.status===401){window.location.assign("/admin/login");throw new DOMException("Aborted","AbortError")}if(!r.ok)throw new Error();return r.json() as Promise<Page>},[url])
 const remote=useRemoteData<Page>(url,"Cargando auditoría...","No se pudo cargar la auditoría.",true,url,load)

 return (
  <section className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
   <div>
    <h2 className="fs-20 font-semibold text-app">Actividad y auditoría</h2>
    <p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>
     {ownerId?"Historial de acciones relevantes de este negocio.":"Historial de acciones relevantes de toda la plataforma."}
    </p>
   </div>

   {remote.loading&&<InlineLoader text="Cargando actividad..."/>}
   {remote.error&&<button className="btn-primary" onClick={()=>void remote.refresh()}>Reintentar</button>}

   {remote.data&&<>
    {remote.status==="success"&&!remote.data.events.length&&<div className="rounded-br10 border border-n1 p-p20 text-center" style={{backgroundColor:"var(--color-bg-bg0)"}}><p className="fs-14 text-app-secondary">Todavía no hay actividad registrada.</p></div>}
    {!!remote.data.events.length&&<div className="overflow-hidden rounded-br10 border border-n1">
     <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left fs-12">
       <thead style={{backgroundColor:"var(--color-bg-bg8)",color:"var(--color-text-on-primary)"}}>
        <tr>
         {["Fecha",...(ownerId?[]:["Negocio"]),"Evento","Realizado por","Sobre","Resumen"].map(s=><th className="p-p10 font-medium" key={s}>{s}</th>)}
        </tr>
       </thead>
       <tbody>
        {remote.data.events.map(event=><tr key={event.id} className="border-b border-n1 last:border-b-0 hover:bg-bg0">
         <td className="p-p10 text-app-secondary whitespace-nowrap">{new Date(event.created_at).toLocaleString("es-AR",{timeZone:"UTC"})}</td>
         {!ownerId&&<td className="p-p10">{event.owner_id?<a className="font-medium text-app hover:underline" href={"/admin/owners/"+event.owner_id}>{event.owner_name??"Negocio"}</a>:<span className="text-app-secondary">Plataforma</span>}</td>}
         <td className="p-p10"><span className="inline-flex rounded-full px-p10 font-medium" style={{paddingBlock:"var(--p5)",backgroundColor:"var(--color-accent-primary-soft)",color:"var(--color-accent-primary)"}}>{actionLabels[event.action]??event.action}</span></td>
         <td className="p-p10"><span className="text-app">{actorLabel(event)}</span></td>
         <td className="p-p10"><span className="font-medium text-app">{entityLabels[event.entity_type]??event.entity_type}</span>{event.entity_id&&<><br/><span className="text-app-secondary">{event.entity_id.slice(0,8)}…</span></>}</td>
         <td className="p-p10">
          <p className="fs-12 text-app">{detailSummary(event)}</p>
          {Object.keys(event.metadata??{}).length>0&&<details style={{marginTop:"var(--p5)"}}>
           <summary className="cursor-pointer fs-12 text-app-secondary">Ver datos técnicos</summary>
           <code className="mt-1 block max-w-[420px] whitespace-pre-wrap break-words rounded-br5 px-p10 text-app-secondary" style={{paddingBlock:"var(--p5)",backgroundColor:"var(--color-bg-bg0)"}}>{JSON.stringify(event.metadata,null,2)}</code>
          </details>}
         </td>
        </tr>)}
       </tbody>
      </table>
     </div>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-p10">
     <div>{cursor&&<button className={secondary} style={{backgroundColor:"var(--color-bg-bg0)"}} disabled={remote.loading} onClick={()=>setCursor(null)}>Más recientes</button>}</div>
     <div>{remote.data.next&&<button className={secondary} style={{backgroundColor:"var(--color-bg-bg0)"}} disabled={remote.loading} onClick={()=>setCursor(remote.data!.next)}>Más antiguos</button>}</div>
    </div>
   </>}
  </section>
 )
}
