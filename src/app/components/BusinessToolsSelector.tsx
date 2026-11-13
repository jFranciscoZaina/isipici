"use client"
import {Calendar,Check,DollarSign,Repeat} from "react-feather"
import {BUSINESS_TOOLS,type BusinessTool} from "@/lib/business-tools"
import {useI18n} from "../I18nProvider"

type Props={
 value:BusinessTool[]
 onChange:(value:BusinessTool[])=>void
 disabled?:boolean
}

export default function BusinessToolsSelector({value,onChange,disabled=false}:Props){
 const {t}=useI18n()
 const content={
  plans:{title:t("tools.plans"),description:t("tools.plansHelp"),icon:Repeat},
  events:{title:t("tools.events"),description:t("tools.eventsHelp"),icon:Calendar},
  payments:{title:t("tools.payments"),description:t("tools.paymentsHelp"),icon:DollarSign},
 } satisfies Record<BusinessTool,{title:string;description:string;icon:typeof Repeat}>

 const toggle=(tool:BusinessTool)=>{
  if(disabled)return
  if(value.includes(tool)){
   if(value.length===1)return
   onChange(value.filter(item=>item!==tool))
   return
  }
  onChange([...value,tool])
 }

 return <div className="grid grid-cols-1 gap-p10 sm:grid-cols-3">
  {BUSINESS_TOOLS.map(tool=>{
   const selected=value.includes(tool)
   const item=content[tool]
   const Icon=item.icon
   return <button
    key={tool}
    type="button"
    disabled={disabled}
    aria-pressed={selected}
    onClick={()=>toggle(tool)}
    className="flex min-h-[132px] flex-col justify-between rounded-br15 border p-p20 text-left transition-colors disabled:opacity-50"
    style={{
     borderColor:selected?"var(--color-accent-primary)":"var(--n1)",
     backgroundColor:selected?"var(--color-accent-primary-soft)":"var(--n)",
    }}
   >
    <div className="flex w-full items-start justify-between gap-p10">
     <span className="flex h-9 w-9 items-center justify-center rounded-full border border-n1 bg-bg0">
      <Icon className="h-4 w-4" strokeWidth={2}/>
     </span>
     <span
      className="flex h-6 w-6 items-center justify-center rounded-full border"
      style={{
       borderColor:selected?"var(--color-accent-primary)":"var(--n2)",
       backgroundColor:selected?"var(--color-accent-primary)":"var(--n)",
       color:selected?"var(--color-text-on-primary)":"transparent",
      }}
     >
      <Check className="h-3.5 w-3.5" strokeWidth={3}/>
     </span>
    </div>
    <div>
     <span className="block fs-14 font-semibold text-app">{item.title}</span>
     <span className="mt-p5 block fs-12 text-app-secondary">{item.description}</span>
    </div>
   </button>
  })}
 </div>
}
