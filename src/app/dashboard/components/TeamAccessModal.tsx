"use client"

import {useCallback,useState} from "react"
import Modal from "./Modal"
import InlineLoader from "./InlineLoader"
import {useRemoteData} from "./useRemoteData"
import {useToast} from "./ToastProvider"
import {useConfirm} from "./ConfirmProvider"
import {useSubmissionLock} from "./useSubmissionLock"
import {useI18n} from "../../I18nProvider"

type Access={
 maxOwners:number
 currentUserId:string
 memberships:{id:string;userId:string;email:string|null;displayName:string|null;role:string}[]
 invites:{id:string;expires_at:string;max_uses:number;used_count:number}[]
}

const secondary="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1 disabled:opacity-50"
const danger="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium text-danger disabled:opacity-50"

export default function TeamAccessModal({onClose}:{onClose:()=>void}){
 const {t,locale}=useI18n()
 const url="/api/workspaces/access"
 const load=useCallback(async(signal:AbortSignal)=>{
  const response=await fetch(url,{signal})
  if(response.status===401||response.status===403)throw new Error(t("team.error"))
  if(!response.ok)throw new Error(t("team.error"))
  return response.json() as Promise<Access>
 },[t])
 const remote=useRemoteData<Access>(url,t("team.loading"),t("team.error"),true,url,load)
 const toast=useToast(),confirm=useConfirm(),lock=useSubmissionLock()
 const [busy,setBusy]=useState(false),[code,setCode]=useState(""),[copied,setCopied]=useState(false)

 async function mutate(action:"createInvite"|"revokeInvite"|"revokeMembership",id?:string){
  if(!lock.acquire())return
  setBusy(true)
  const operation=toast.start(action==="createInvite"?t("team.creating"):t("team.updating"))
  try{
   const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...(id?{id}:{})})})
   const body=await response.json()
   if(!response.ok)throw new Error(body.error??t("team.updateError"))
   if(action==="createInvite"){setCode(body.code);setCopied(false);operation.success(t("team.created"))}
   else operation.success(action==="revokeInvite"?t("team.revoked"):t("team.unlinked"))
   await remote.refresh()
  }catch(error){
   operation.error(error instanceof Error?error.message:t("team.updateError"))
  }finally{
   operation.close();lock.release();setBusy(false)
  }
 }

 const data=remote.data,full=Boolean(data&&data.memberships.length>=data.maxOwners)

 return (
  <Modal
   size="normal"
   onClose={()=>{if(!busy)onClose()}}
   header={<div className="text-center"><h2 className="fs-20 font-semibold text-app">{t("team.title")}</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("team.subtitle")}</p></div>}
   secondaryAction={{label:t("common.close"),onClick:onClose,disabled:busy}}
  >
   <div className="flex flex-col gap-p20">
    {remote.loading&&<InlineLoader text={data?t("team.refreshing"):t("team.loading")}/>}
    {remote.error&&<div className="rounded-br10 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}><p className="fs-14 text-app-secondary">{remote.error}</p><button className="btn-primary" style={{marginTop:"var(--p10)"}} onClick={()=>void remote.refresh()}>{t("common.retry")}</button></div>}

    {data&&<>
     <section className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
      <div className="flex flex-col gap-p10 sm:flex-row sm:items-center sm:justify-between">
       <div>
        <p className="fs-16 font-semibold text-app">{t("team.owners")}</p>
        <p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{data.memberships.length} de {data.maxOwners} {t("team.used")}</p>
       </div>
       <button className="btn-primary justify-center" disabled={busy||full} onClick={()=>void mutate("createInvite")}>{t("team.generate")}</button>
      </div>
      {full&&<p className="fs-12 text-app-secondary" style={{marginTop:"var(--p10)"}}>{t("team.limit")}</p>}
     </section>

     {code&&<section className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--color-accent-primary-soft)"}}>
      <p className="fs-14 font-semibold text-app">{t("team.invite")}</p>
      <p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("team.inviteHelp")}</p>
      <div className="flex flex-col gap-p10 sm:flex-row" style={{marginTop:"var(--p10)"}}>
       <input readOnly value={code} className="min-w-0 flex-1 rounded-br15 border border-n1 bg-bg0 px-p20 py-p10 fs-14 font-mono text-app"/>
       <button className={secondary} style={{backgroundColor:"var(--n)"}} onClick={async()=>{await navigator.clipboard.writeText(code);setCopied(true)}}>{copied?t("team.copied"):t("team.copy")}</button>
      </div>
     </section>}

     <section className="flex flex-col gap-p10">
      <div><p className="fs-16 font-semibold text-app">{t("team.accounts")}</p><p className="fs-12 text-app-secondary">{t("team.accountsHelp")}</p></div>
      {data.memberships.map(member=>{
       const self=member.userId===data.currentUserId
       return <div key={member.id} className="flex flex-col gap-p10 rounded-br10 border border-n1 p-p10 sm:flex-row sm:items-center sm:justify-between" style={{backgroundColor:"var(--n)"}}>
        <div>
         <div className="flex flex-wrap items-center gap-p10">
          <p className="fs-14 font-medium text-app">{member.displayName??member.email??t("team.linked")}</p>
          {self&&<span className="rounded-full px-p10 fs-12 font-medium" style={{paddingBlock:"var(--p5)",backgroundColor:"var(--color-accent-primary-soft)",color:"var(--color-accent-primary)"}}>{t("team.yours")}</span>}
         </div>
         <p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{member.email??member.userId}</p>
        </div>
        {!self&&<button className={danger} style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}} disabled={busy} onClick={async()=>{if(await confirm({title:t("team.unlinkTitle"),message:t("team.unlinkMessage"),confirmLabel:t("team.unlink")}))void mutate("revokeMembership",member.id)}}>{t("team.unlink")}</button>}
       </div>
      })}
     </section>

     <section className="flex flex-col gap-p10 border-t border-n1" style={{paddingTop:"var(--p20)"}}>
      <div><p className="fs-16 font-semibold text-app">{t("team.pending")}</p><p className="fs-12 text-app-secondary">{t("team.pendingHelp")}</p></div>
      {!data.invites.length?<p className="fs-14 text-app-secondary">{t("team.none")}</p>:data.invites.map(invite=><div key={invite.id} className="flex flex-col gap-p10 rounded-br10 border border-n1 p-p10 sm:flex-row sm:items-center sm:justify-between" style={{backgroundColor:"var(--n)"}}><p className="fs-12 text-app-secondary">{t("team.expires")} {new Date(invite.expires_at).toLocaleDateString(locale==="es"?"es-AR":"en-AU")} · {t("team.uses")} {invite.used_count}/{invite.max_uses}</p><button className={danger} style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}} disabled={busy} onClick={async()=>{if(await confirm({title:t("team.revokeTitle"),message:t("team.revokeMessage"),confirmLabel:t("team.revoke")}))void mutate("revokeInvite",invite.id)}}>{t("team.revoke")}</button></div>)}
     </section>
    </>}
   </div>
  </Modal>
 )
}
