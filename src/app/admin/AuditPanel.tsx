"use client"
import {useCallback,useState} from "react"
import {useRemoteData} from "../dashboard/components/useRemoteData"
import InlineLoader from "../dashboard/components/InlineLoader"
import type {auditPage} from "@/lib/admin-owners"
type Page=Awaited<ReturnType<typeof auditPage>>
export default function AuditPanel({ownerId}:{ownerId?:string}){
 const [cursor,setCursor]=useState<Page["next"]>(null)
 const query=new URLSearchParams(ownerId?{owner:ownerId}:{})
 if(cursor){query.set("before",cursor.before);query.set("beforeId",cursor.beforeId)}
 const url="/admin/api/audit?"+query.toString()
 const load=useCallback(async(signal:AbortSignal)=>{const r=await fetch(url,{signal});if(r.status===401){window.location.assign("/admin/login");throw new DOMException("Aborted","AbortError")}if(!r.ok)throw new Error();return r.json() as Promise<Page>},[url])
 const remote=useRemoteData<Page>(url,"Cargando auditoría...","No se pudo cargar la auditoría. Revisá M21.",true,url,load)
 return <section className="space-y-p20"><h2 className="fs-20">Actividad y auditoría</h2>{remote.loading&&<InlineLoader text="Cargando actividad..."/>}{remote.error&&<button className="btn-secondary" onClick={()=>void remote.refresh()}>Reintentar</button>}
 {remote.data&&<>{remote.status==="success"&&!remote.data.events.length&&<p>No hay eventos registrados en esta página.</p>}<div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{["Fecha UTC","Negocio","Acción","Actor","Entidad","Detalles"].map(s=><th className="p-p10" key={s}>{s}</th>)}</tr></thead><tbody>{remote.data.events.map(e=><tr key={e.id}><td className="p-p10">{new Date(e.created_at).toLocaleString("es-AR",{timeZone:"UTC"})}</td><td className="p-p10">{e.owner_id?<a className="underline" href={"/admin/owners/"+e.owner_id}>{e.owner_id}</a>:"Plataforma"}</td><td className="p-p10">{e.action}</td><td className="p-p10">{e.actor_kind}{e.actor_user_id&&" · "+e.actor_user_id}</td><td className="p-p10">{e.entity_type} · {e.entity_id??"—"}</td><td className="p-p10 break-words">{JSON.stringify(e.metadata)}</td></tr>)}</tbody></table></div><div className="flex gap-p20">{cursor&&<button className="btn-secondary" disabled={remote.loading} onClick={()=>setCursor(null)}>Más recientes</button>}{remote.data.next&&<button className="btn-secondary" disabled={remote.loading} onClick={()=>setCursor(remote.data!.next)}>Más antiguos</button>}</div></>}
 </section>
}
