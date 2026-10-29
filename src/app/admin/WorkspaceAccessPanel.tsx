"use client"
import {useCallback,useEffect,useState} from "react"
import {useRemoteData} from "../dashboard/components/useRemoteData"
import {useToast} from "../dashboard/components/ToastProvider"
import {useConfirm} from "../dashboard/components/ConfirmProvider"
import {useSubmissionLock} from "../dashboard/components/useSubmissionLock"
import InlineLoader from "../dashboard/components/InlineLoader"
import {useI18n} from "../I18nProvider"
import type {listWorkspaceAccess} from "@/lib/workspace-access"

type Access=Awaited<ReturnType<typeof listWorkspaceAccess>>
const field="w-full rounded-br15 border border-n1 bg-bg0 px-p20 py-p10 fs-14 text-app"
const secondary="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1 disabled:opacity-50 disabled:cursor-not-allowed"
const danger="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium text-danger disabled:opacity-50 disabled:cursor-not-allowed"

export default function WorkspaceAccessPanel({ownerId}:{ownerId:string}){
 const {t,locale}=useI18n()
 const url="/admin/api/workspaces/"+ownerId+"/access"
 const load=useCallback(async(signal:AbortSignal)=>{const r=await fetch(url,{signal});if(r.status===401){window.location.href="/admin/login";throw new DOMException("Aborted","AbortError")}if(!r.ok)throw new Error();return r.json() as Promise<Access>},[url])
 const remote=useRemoteData<Access>(url,t("admin.accessLoading"),t("admin.accessError"),true,url,load)
 const toast=useToast(),confirm=useConfirm(),lock=useSubmissionLock()
 const [busy,setBusy]=useState(false),[limit,setLimit]=useState(""),[code,setCode]=useState(""),[copied,setCopied]=useState(false)
 useEffect(()=>{if(remote.data)setLimit(String(remote.data.maxOwners))},[remote.data])

 async function mutate(action:string,extra:Record<string,unknown>={}){
  if(!lock.acquire())return
  setBusy(true)
  const operation=toast.start(t("admin.accessRefreshing"))
  try{
   const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...extra})})
   if(r.status===401){operation.close();window.location.href="/admin/login";return}
   const b=await r.json()
   if(!r.ok)throw new Error()
   if(action==="createInvite"){setCode(b.code);setCopied(false)}
   operation.success(action==="createInvite"?t("admin.inviteCreated"):action==="setLimit"?t("admin.limitUpdated"):action==="revokeInvite"?t("admin.inviteRevoked"):action==="revokeMembership"?t("admin.membershipRevoked"):t("admin.accessUpdated"))
   await remote.refresh()
  }catch{
   operation.error(action==="setLimit"?t("admin.limitError"):t("admin.accessUpdateError"))
  }finally{operation.close();lock.release();setBusy(false)}
 }
 const pending=busy||remote.loading
 return <section className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
  <div><h2 className="fs-20 font-semibold text-app">{t("admin.accessTitle")}</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.accessHelp")}</p></div>
  {remote.loading&&<InlineLoader text={remote.data?t("admin.accessRefreshing"):t("admin.accessLoading")}/>}
  {remote.error&&<div className="rounded-br10 border border-n1 p-p20" style={{backgroundColor:"var(--color-bg-bg0)"}}><p className="fs-14 text-app-secondary">{t("admin.accessError")}</p><button className="btn-primary" style={{marginTop:"var(--p10)"}} onClick={()=>void remote.refresh()}>{t("common.retry")}</button></div>}
  {remote.data&&<>
   <div className="grid grid-cols-1 gap-p10 sm:grid-cols-2">
    <div className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--color-bg-bg0)"}}><p className="fs-12 text-app-secondary">{t("admin.activeOwners")}</p><p className="fs-20 font-semibold text-app" style={{marginTop:"var(--p5)"}}>{remote.data.memberships.length} / {remote.data.maxOwners}</p><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.classicNoSlot")}</p></div>
    <div className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--color-bg-bg0)"}}><label className="flex flex-col gap-p5 fs-12 text-app-secondary">{t("admin.ownerLimit")}<input className={field} type="number" min={0} max={1000} value={limit} disabled={pending} onChange={e=>setLimit(e.target.value)}/></label><button className={secondary} style={{backgroundColor:"var(--n)",marginTop:"var(--p10)"}} disabled={pending||limit===""||!Number.isInteger(Number(limit))||Number(limit)<0||Number(limit)>1000||Number(limit)<remote.data.memberships.length} onClick={async()=>{if(Number(limit)<remote.data!.maxOwners&&!await confirm({title:t("admin.reduceLimit"),message:t("admin.reduceLimitMessage"),confirmLabel:t("admin.reduceLimit")}))return;void mutate("setLimit",{limit:Number(limit)})}}>{t("admin.saveLimit")}</button></div>
   </div>
   <section className="flex flex-col gap-p10 border-t border-n1" style={{paddingTop:"var(--p20)"}}>
    <div className="flex flex-col gap-p10 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="fs-16 font-semibold text-app">{t("admin.invites")}</h3><p className="fs-12 text-app-secondary">{t("admin.invitesHelp")}</p></div><button className="btn-primary justify-center" disabled={pending} onClick={()=>{setCode("");void mutate("createInvite")}}>{t("admin.createInvite")}</button></div>
    {code&&<div className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--color-accent-primary-soft)"}}><p className="fs-14 font-semibold text-app">{t("admin.codeCreated")}</p><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.codeCreatedHelp")}</p><div className="flex flex-col gap-p10 sm:flex-row" style={{marginTop:"var(--p10)"}}><input aria-label={t("admin.codeCreated")} readOnly value={code} className={field+" flex-1 font-mono"}/><button className={secondary} style={{backgroundColor:"var(--n)"}} onClick={async()=>{await navigator.clipboard.writeText(code);setCopied(true)}}>{copied?t("team.copied"):t("admin.copyCode")}</button><button className={secondary} style={{backgroundColor:"var(--n)"}} onClick={()=>setCode("")}>{t("admin.hide")}</button></div></div>}
    {remote.status==="success"&&!remote.data.invites.length?<div className="rounded-br10 border border-n1 p-p20 text-center" style={{backgroundColor:"var(--color-bg-bg0)"}}><p className="fs-14 text-app-secondary">{t("team.none")}</p></div>:<div className="flex flex-col gap-p10">{remote.data.invites.map(i=><div key={i.id} className="flex flex-col gap-p10 rounded-br10 border border-n1 p-p10 sm:flex-row sm:items-center sm:justify-between" style={{backgroundColor:"var(--color-bg-bg0)"}}><div><p className="fs-14 font-medium text-app">{t("admin.invitePending")}</p><p className="fs-12 text-app-secondary">{t("admin.expires")} {new Date(i.expires_at).toLocaleDateString(locale==="es"?"es-AR":"en-AU")} · {t("admin.uses")} {i.used_count}/{i.max_uses}</p></div><button className={danger} style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}} disabled={pending} onClick={async()=>{if(await confirm({title:t("admin.revokeInvite"),message:t("admin.revokeInviteMessage"),confirmLabel:t("admin.revoke")}))void mutate("revokeInvite",{id:i.id})}}>{t("admin.revoke")}</button></div>)}</div>}
   </section>
   <section className="flex flex-col gap-p10 border-t border-n1" style={{paddingTop:"var(--p20)"}}>
    <div><h3 className="fs-16 font-semibold text-app">{t("admin.businessOwners")}</h3><p className="fs-12 text-app-secondary">{t("admin.businessOwnersHelp")}</p></div>
    {remote.status==="success"&&!remote.data.memberships.length?<div className="rounded-br10 border border-n1 p-p20 text-center" style={{backgroundColor:"var(--color-bg-bg0)"}}><p className="fs-14 text-app-secondary">{t("admin.noOwners")}</p></div>:<div className="flex flex-col gap-p10">{remote.data.memberships.map(m=><div key={m.id} className="flex flex-col gap-p10 rounded-br10 border border-n1 p-p10 sm:flex-row sm:items-center sm:justify-between" style={{backgroundColor:"var(--color-bg-bg0)"}}><div><p className="fs-14 font-medium text-app">{m.displayName??m.email??m.userId}</p><p className="fs-12 text-app-secondary">Owner · {m.email??m.userId}</p></div><button className={danger} style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}} disabled={pending} onClick={async()=>{if(await confirm({title:t("admin.unlinkAccount"),message:t("admin.unlinkMessage"),confirmLabel:t("team.unlink")}))void mutate("revokeMembership",{id:m.id})}}>{t("admin.unlinkAccount")}</button></div>)}</div>}
   </section>
  </>}
 </section>
}
