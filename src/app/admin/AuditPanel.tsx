"use client"
import {useCallback,useState} from "react"
import {useRemoteData} from "../dashboard/components/useRemoteData"
import InlineLoader from "../dashboard/components/InlineLoader"
import type {auditPage} from "@/lib/admin-owners"

type Page=Awaited<ReturnType<typeof auditPage>>
const secondary="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1 disabled:opacity-50"

export default function AuditPanel({ownerId}:{ownerId?:string}){
 const [cursor,setCursor]=useState<Page["next"]>(null)
 const query=new URLSearchParams(ownerId?{owner:ownerId}:{})
 if(cursor){query.set("before",cursor.before);query.set("beforeId",cursor.beforeId)}
 const url="/admin/api/audit?"+query.toString()
 const load=useCallback(async(signal:AbortSignal)=>{const r=await fetch(url,{signal});if(r.status===401){window.location.assign("/admin/login");throw new DOMException("Aborted","AbortError")}if(!r.ok)throw new Error();return r.json() as Promise<Page>},[url])
 const remote=useRemoteData<Page>(url,"Cargando auditoría...","No se pudo cargar la auditoría. Revisá M21.",true,url,load)

 return (
  <section className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
   <div>
    <h2 className="fs-20 font-semibold text-app">Actividad y auditoría</h2>
    <p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{ownerId?"Eventos relevantes de este negocio.":"Eventos relevantes de toda la plataforma."}</p>
   </div>

   {remote.loading&&<InlineLoader text="Cargando actividad..."/>}
   {remote.error&&<button className="btn-primary" onClick={()=>void remote.refresh()}>Reintentar</button>}

   {remote.data&&<>
    {remote.status==="success"&&!remote.data.events.length&&<div className="rounded-br10 border border-n1 p-p20 text-center" style={{backgroundColor:"var(--color-bg-bg0)"}}><p className="fs-14 text-app-secondary">No hay eventos registrados en esta página.</p></div>}
    {!!remote.data.events.length&&<div className="overflow-hidden rounded-br10 border border-n1">
     <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] text-left fs-12">
       <thead style={{backgroundColor:"var(--color-bg-bg8)",color:"var(--color-text-on-primary)"}}>
        <tr>{["Fecha UTC","Negocio","Acción","Actor","Entidad","Detalles"].map(s=><th className="p-p10 font-medium" key={s}>{s}</th>)}</tr>
       </thead>
       <tbody>
        {remote.data.events.map(e=><tr key={e.id} className="border-b border-n1 last:border-b-0 hover:bg-bg0">
         <td className="p-p10 text-app-secondary whitespace-nowrap">{new Date(e.created_at).toLocaleString("es-AR",{timeZone:"UTC"})}</td>
         <td className="p-p10">{e.owner_id?<a className="font-medium text-app hover:underline" href={"/admin/owners/"+e.owner_id}>{e.owner_id.slice(0,8)}…</a>:<span className="text-app-secondary">Plataforma</span>}</td>
         <td className="p-p10"><span className="inline-flex rounded-full px-p10 py-p5 font-medium" style={{backgroundColor:"var(--color-accent-primary-soft)",color:"var(--color-accent-primary)"}}>{e.action}</span></td>
         <td className="p-p10"><span className="text-app">{e.actor_kind}</span>{e.actor_user_id&&<><br/><span className="text-app-secondary">{e.actor_user_id.slice(0,8)}…</span></>}</td>
         <td className="p-p10"><span className="text-app">{e.entity_type}</span><br/><span className="text-app-secondary">{e.entity_id?e.entity_id.slice(0,8)+"…":"—"}</span></td>
         <td className="p-p10"><code className="block max-w-[360px] whitespace-pre-wrap break-words rounded-br5 px-p10 py-p5 text-app-secondary" style={{backgroundColor:"var(--color-bg-bg0)"}}>{JSON.stringify(e.metadata)}</code></td>
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
