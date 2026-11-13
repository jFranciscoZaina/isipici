"use client"
import {useEffect,useMemo,useState} from "react"
import Modal from "./Modal"
import InlineLoader from "./InlineLoader"
import {useToast} from "./ToastProvider"
import {useSubmissionLock} from "./useSubmissionLock"
import BusinessToolsSelector from "../../components/BusinessToolsSelector"
import {BUSINESS_TOOLS,DEFAULT_BUSINESS_TOOLS,type BusinessTool} from "@/lib/business-tools"
import {useI18n} from "../../I18nProvider"

export default function BusinessToolsModal({onClose,onSaved}:{onClose:()=>void;onSaved?:(tools:BusinessTool[])=>void}){
 const {t}=useI18n()
 const toast=useToast()
 const lock=useSubmissionLock()
 const [tools,setTools]=useState<BusinessTool[]>([...DEFAULT_BUSINESS_TOOLS])
 const [initial,setInitial]=useState<BusinessTool[]>([...DEFAULT_BUSINESS_TOOLS])
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState("")

 useEffect(()=>{
  const controller=new AbortController()
  fetch("/api/business/tools",{signal:controller.signal})
   .then(async response=>{
    if(response.status===401){window.location.href="/login";return null}
    const body=await response.json()
    if(!response.ok)throw new Error(body.error??t("tools.error"))
    const next=BUSINESS_TOOLS.filter(tool=>Array.isArray(body.tools)&&body.tools.includes(tool))
    const value=next.length?next:[...DEFAULT_BUSINESS_TOOLS]
    setTools(value);setInitial(value)
    return null
   })
   .catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:t("tools.error"))})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[t])

 const dirty=useMemo(()=>BUSINESS_TOOLS.some(tool=>tools.includes(tool)!==initial.includes(tool)),[tools,initial])

 async function save(){
  if(saving||!dirty||!tools.length||!lock.acquire())return
  const operation=toast.start(t("tools.saving"))
  setSaving(true);setError("")
  try{
   const response=await fetch("/api/business/tools",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tools})})
   if(response.status===401){window.location.href="/login";operation.close();return}
   const body=await response.json()
   if(!response.ok)throw new Error(body.error??t("tools.error"))
   const next=BUSINESS_TOOLS.filter(tool=>Array.isArray(body.tools)&&body.tools.includes(tool))
   setInitial(next);setTools(next);onSaved?.(next)
   operation.success(t("tools.updated"))
   onClose()
  }catch(reason){
   const message=reason instanceof Error?reason.message:t("tools.error")
   setError(message);operation.error(message)
  }finally{
   lock.release();operation.close();setSaving(false)
  }
 }

 return <Modal
  size="normal"
  onClose={()=>{if(!saving)onClose()}}
  header={<div className="text-center"><h2 className="fs-20 font-semibold text-app">{t("tools.title")}</h2><p className="mt-p5 fs-12 text-app-secondary">{t("tools.subtitle")}</p></div>}
  secondaryAction={{label:t("common.back"),onClick:onClose,disabled:saving}}
  primaryAction={{label:saving?t("tools.saving"):t("tools.save"),onClick:save,disabled:loading||saving||!dirty||!tools.length}}
 >
  <div className="flex flex-col gap-p20">
   {loading?<InlineLoader text={t("common.loading")}/>:<BusinessToolsSelector value={tools} onChange={setTools} disabled={saving}/>}
   {error&&<div role="alert" className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"color-mix(in srgb, var(--color-state-danger) 6%, var(--n) 94%)"}}>{error}</div>}
   {!tools.length&&<p className="fs-12 text-danger">{t("tools.atLeastOne")}</p>}
  </div>
 </Modal>
}
