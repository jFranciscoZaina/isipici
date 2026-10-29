"use client"
import {useCallback,useState} from "react"
import {useRemoteData} from "../dashboard/components/useRemoteData"
import InlineLoader from "../dashboard/components/InlineLoader"
import {useI18n} from "../I18nProvider"
import {auditActionLabel,auditEntityLabel,auditFieldLabel} from "@/lib/audit-i18n"
import type {AuditEvent,auditPage} from "@/lib/admin-owners"

type Page=Awaited<ReturnType<typeof auditPage>>
const secondary="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1 disabled:opacity-50"

export default function AuditPanel({ownerId}:{ownerId?:string}){
 const {t,locale}=useI18n()
 const [cursor,setCursor]=useState<Page["next"]>(null)
 const query=new URLSearchParams(ownerId?{owner:ownerId}:{})
 if(cursor){query.set("before",cursor.before);query.set("beforeId",cursor.beforeId)}
 const url="/admin/api/audit?"+query.toString()
 const load=useCallback(async(signal:AbortSignal)=>{const r=await fetch(url,{signal});if(r.status===401){window.location.assign("/admin/login");throw new DOMException("Aborted","AbortError")}if(!r.ok)throw new Error();return r.json() as Promise<Page>},[url])
 const remote=useRemoteData<Page>(url,t("admin.auditLoading"),t("admin.loadError"),true,url,load)
 const actorLabel=(event:AuditEvent)=>event.actor_kind==="admin"?t("admin.adminActor"):event.actor_kind==="legacy"?t("admin.legacyActor"):event.actor_kind==="system"?t("admin.systemActor"):event.actor_label??t("admin.userActor")
 const detailSummary=(event:AuditEvent)=>{
  const metadata=event.metadata??{}
  if(Array.isArray(metadata.changed_fields)&&metadata.changed_fields.length){const labels=metadata.changed_fields.filter((field):field is string=>typeof field==="string").map(field=>auditFieldLabel(locale,field));return t("admin.changed")+" "+labels.join(", ")+"."}
  if(typeof metadata.subject_user_id==="string")return t("admin.accountAffected")+" "+(event.subject_label??metadata.subject_user_id.slice(0,8)+"…")+"."
  if(metadata.active===false)return t("admin.businessNowDisabled")
  if(metadata.active===true)return t("admin.businessNowActive")
  if(metadata.price_changed===true&&typeof metadata.effective_from==="string")return t("admin.priceChanged")+" "+metadata.effective_from+"."
  if(typeof metadata.used_count==="number"&&typeof metadata.max_uses==="number")return `${t("admin.useCount")} ${metadata.used_count} / ${metadata.max_uses}.`
  return t("admin.noExtra")
 }
 return <section className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
  <div><h2 className="fs-20 font-semibold text-app">{t("admin.auditTitle")}</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{ownerId?t("admin.auditBusiness"):t("admin.auditPlatform")}</p></div>
  {remote.loading&&<InlineLoader text={t("admin.auditLoading")}/>}
  {remote.error&&<button className="btn-primary" onClick={()=>void remote.refresh()}>{t("common.retry")}</button>}
  {remote.data&&<>
   {remote.status==="success"&&!remote.data.events.length&&<div className="rounded-br10 border border-n1 p-p20 text-center" style={{backgroundColor:"var(--color-bg-bg0)"}}><p className="fs-14 text-app-secondary">{t("admin.auditEmpty")}</p></div>}
   {!!remote.data.events.length&&<div className="overflow-hidden rounded-br10 border border-n1"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left fs-12">
    <thead style={{backgroundColor:"var(--color-bg-bg8)",color:"var(--color-text-on-primary)"}}><tr>{[t("admin.date"),...(ownerId?[]:[t("admin.business")]),t("admin.event"),t("admin.performedBy"),t("admin.subject"),t("admin.summary")].map(label=><th className="p-p10 font-medium" key={label}>{label}</th>)}</tr></thead>
    <tbody>{remote.data.events.map(event=><tr key={event.id} className="border-b border-n1 last:border-b-0 hover:bg-bg0">
     <td className="p-p10 text-app-secondary whitespace-nowrap">{new Date(event.created_at).toLocaleString(locale==="es"?"es-AR":"en-AU",{timeZone:"UTC"})}</td>
     {!ownerId&&<td className="p-p10">{event.owner_id?<a className="font-medium text-app hover:underline" href={"/admin/owners/"+event.owner_id}>{event.owner_name??t("admin.business")}</a>:<span className="text-app-secondary">{t("admin.platformActor")}</span>}</td>}
     <td className="p-p10"><span className="inline-flex rounded-full px-p10 font-medium" style={{paddingBlock:"var(--p5)",backgroundColor:"var(--color-accent-primary-soft)",color:"var(--color-accent-primary)"}}>{auditActionLabel(locale,event.action)}</span></td>
     <td className="p-p10"><span className="text-app">{actorLabel(event)}</span></td>
     <td className="p-p10"><span className="font-medium text-app">{auditEntityLabel(locale,event.entity_type)}</span>{event.entity_id&&<><br/><span className="text-app-secondary">{event.entity_id.slice(0,8)}…</span></>}</td>
     <td className="p-p10"><p className="fs-12 text-app">{detailSummary(event)}</p>{Object.keys(event.metadata??{}).length>0&&<details style={{marginTop:"var(--p5)"}}><summary className="cursor-pointer fs-12 text-app-secondary">{t("admin.technical")}</summary><code className="mt-1 block max-w-[420px] whitespace-pre-wrap break-words rounded-br5 px-p10 text-app-secondary" style={{paddingBlock:"var(--p5)",backgroundColor:"var(--color-bg-bg0)"}}>{JSON.stringify(event.metadata,null,2)}</code></details>}</td>
    </tr>)}</tbody>
   </table></div></div>}
   <div className="flex flex-wrap items-center justify-between gap-p10"><div>{cursor&&<button className={secondary} style={{backgroundColor:"var(--color-bg-bg0)"}} disabled={remote.loading} onClick={()=>setCursor(null)}>{t("admin.moreRecent")}</button>}</div><div>{remote.data.next&&<button className={secondary} style={{backgroundColor:"var(--color-bg-bg0)"}} disabled={remote.loading} onClick={()=>setCursor(remote.data!.next)}>{t("admin.older")}</button>}</div></div>
  </>}
 </section>
}
