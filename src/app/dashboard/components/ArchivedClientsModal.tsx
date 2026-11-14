"use client"
import {useEffect,useMemo,useState} from "react"
import {Archive,Search} from "react-feather"
import Modal from "./Modal"
import InlineLoader from "./InlineLoader"
import {useI18n} from "../../I18nProvider"

type ArchivedClient={
 id:string
 name:string
 email:string|null
 phone:string|null
 archivedAt?:string|null
}

export default function ArchivedClientsModal({onClose}:{onClose:()=>void}){
 const {t}=useI18n()
 const [clients,setClients]=useState<ArchivedClient[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState("")
 const [search,setSearch]=useState("")

 useEffect(()=>{
  const controller=new AbortController()
  fetch("/api/clients?status=archived",{signal:controller.signal})
   .then(async response=>{
    if(response.status===401){window.location.href="/login";return null}
    const body=await response.json()
    if(!response.ok)throw new Error(body.error??t("archived.loadError"))
    setClients(Array.isArray(body)?body:[])
    return null
   })
   .catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:t("archived.loadError"))})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[t])

 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase()
  if(!q)return clients
  return clients.filter(client=>client.name.toLowerCase().includes(q)||(client.email??"").toLowerCase().includes(q)||(client.phone??"").toLowerCase().includes(q))
 },[clients,search])

 return <Modal
  size="normal"
  onClose={onClose}
  header={<div className="text-center"><h2 className="fs-20 font-semibold text-app">{t("archived.title")}</h2><p className="mt-p5 fs-12 text-app-secondary">{t("archived.subtitle")}</p></div>}
  secondaryAction={{label:t("common.close"),onClick:onClose}}
 >
  <div className="flex flex-col gap-p20">
   <label className="flex min-h-11 items-center gap-p10 rounded-br15 border border-n1 bg-bg1 px-p20">
    <Search className="h-4 w-4 text-app-secondary"/>
    <input className="w-full border-none bg-transparent fs-14 text-app outline-none placeholder:text-app-secondary" value={search} onChange={event=>setSearch(event.target.value)} placeholder={t("search.placeholder")}/>
   </label>
   {loading?<InlineLoader text={t("archived.loading")}/>:error?<div role="alert" className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"color-mix(in srgb, var(--color-state-danger) 6%, var(--n) 94%)"}}>{error}</div>:filtered.length?<div className="flex flex-col overflow-hidden rounded-br15 border border-n1 bg-bg0">
    {filtered.map((client,index)=><article key={client.id} className={`flex items-center justify-between gap-p20 px-p20 py-p15 ${index<filtered.length-1?"border-b border-n1":""}`}>
     <div className="min-w-0">
      <p className="truncate fs-14 font-semibold text-app">{client.name}</p>
      <p className="mt-p5 truncate fs-12 text-app-secondary">{client.email??client.phone??t("archived.noContact")}</p>
     </div>
     <Archive className="h-4 w-4 flex-shrink-0 text-app-secondary"/>
    </article>)}
   </div>:<div className="rounded-br15 border border-n1 bg-bg0 p-p30 text-center"><Archive className="mx-auto h-6 w-6 text-app-secondary"/><h3 className="mt-p10 fs-14 font-semibold text-app">{t("archived.empty")}</h3><p className="mt-p5 fs-12 text-app-secondary">{t("archived.emptyHelp")}</p></div>}
  </div>
 </Modal>
}
