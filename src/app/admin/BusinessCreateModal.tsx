"use client"
import {useState} from "react"
import Modal from "../dashboard/components/Modal"
import {BusinessCreateForm} from "./BusinessForms"
import {useI18n} from "../I18nProvider"

export default function BusinessCreateModal(){
 const {t}=useI18n()
 const [open,setOpen]=useState(false),[pending,setPending]=useState(false)
 return <>
  <button className="btn-primary" onClick={()=>setOpen(true)}>{t("admin.createBusiness")}</button>
  {open&&<Modal
   size="large"
   header={<div className="text-center"><h2 className="fs-20 font-semibold text-app">{t("admin.createTitle")}</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.createSubtitle")}</p></div>}
   onClose={()=>{if(!pending)setOpen(false)}}
   secondaryAction={{label:t("common.cancel"),onClick:()=>setOpen(false),disabled:pending}}
  ><BusinessCreateForm onPendingChange={setPending}/></Modal>}
 </>
}
