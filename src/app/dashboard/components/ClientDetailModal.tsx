"use client"
import {useSubmissionLock} from "./useSubmissionLock"
import InlineLoader from "./InlineLoader"
import React,{useEffect,useMemo,useState} from "react"
import type {ClientRow,Payment} from "../page"
import {useRemoteData} from "./useRemoteData"
import {useToast} from "./ToastProvider"
import Modal from "./Modal"
import SubscriptionPanel from "./SubscriptionPanel"
import {formatCalendarDate,formatPaymentPeriod} from "@/lib/payments/schedule"
import {formatPaymentMoney} from "@/lib/payments/format"
import {dateLocale} from "@/lib/i18n"
import {useI18n} from "../../I18nProvider"
import {User as UserIcon,DollarSign,Mail as MailIcon} from "react-feather"

type EmailLog={
 id:string
 sent_at:string|null
 created_at?:string
 delivery_status?:string|null
 type:string
 subject:string
 due_date:string|null
 status:string
}

const emptyPayments:Payment[]=[]
const emptyEmails:EmailLog[]=[]
export type TabId="data"|"payments"|"emails"

type Props={client:ClientRow;onClose:()=>void;onChanged:()=>void;initialTab?:TabId}

export default function ClientDetailModal({client,onClose,onChanged,initialTab="data"}:Props){
 const {t,locale}=useI18n()
 const [email,setEmail]=useState(client.email??"")
 const [phone,setPhone]=useState(client.phone??"")
 const [address,setAddress]=useState(client.address??"")
 const [addressNumber,setAddressNumber]=useState(client.addressNumber??"")
 const [activeTab,setActiveTab]=useState<TabId>(initialTab)

 useEffect(()=>{
  setActiveTab(initialTab)
  setEmail(client.email??"")
  setPhone(client.phone??"")
  setAddress(client.address??"")
  setAddressNumber(client.addressNumber??"")
 },[initialTab,client.id,client.email,client.phone,client.address,client.addressNumber])

 const originalEmail=client.email??"",originalPhone=client.phone??"",originalAddress=client.address??"",originalAddressNumber=client.addressNumber??""
 const isDirty=email!==originalEmail||phone!==originalPhone||address!==originalAddress||addressNumber!==originalAddressNumber
 const submission=useSubmissionLock(),toast=useToast()
 const paymentRemote=useRemoteData<Payment[]>(`/api/payments?clientId=${client.id}`,t("detail.paymentHistoryLoading"),t("detail.paymentHistoryError"),activeTab==="payments")
 const emailRemote=useRemoteData<EmailLog[]>(`/api/clients/emails?clientId=${client.id}`,t("detail.emailLoading"),t("detail.emailError"),activeTab==="emails")
 const payments=paymentRemote.data??emptyPayments,emails=emailRemote.data??emptyEmails
 const [saving,setSaving]=useState(false)

 const handleSave=async()=>{
  if(!isDirty||activeTab!=="data"||saving||!submission.acquire())return
  const operation=toast.start(t("detail.savingClient"))
  setSaving(true)
  try{
   const res=await fetch(`/api/clients/${client.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,phone,address,addressNumber})})
   if(res.status===401){window.location.href="/login";operation.close();return}
   if(!res.ok)throw new Error(t("detail.updateError"))
   operation.success(t("detail.updated"))
   onChanged();onClose()
  }catch(err){
   console.error(err);operation.error(t("detail.updateError"))
  }finally{
   submission.release();operation.close();setSaving(false)
  }
 }

 const paymentLines=useMemo(()=>payments.map(p=>{
  const fecha=new Date(p.created_at).toLocaleDateString(dateLocale(locale))
  const monto=formatPaymentMoney(p.amount??0,p.currency)
  const plan=p.concept??p.plan??t("detail.payment")
  const deuda=p.payment_type!=="one_off"&&p.debt&&p.debt>0?`${t("detail.owes")} ${formatPaymentMoney(p.debt,p.currency)}.`:""
  const periodText=formatPaymentPeriod(p.period_from,p.period_to,p.service_date)
  const vencimiento=p.payment_type!=="one_off"&&p.next_payment_date?`${t("detail.nextDue")} ${formatCalendarDate(p.next_payment_date)}.`:""
  return <div key={p.id??p.created_at} className="pb-p10">
   {fecha} – {t("detail.paid")} {monto} {t("detail.by")} {plan}.{p.payment_type==="one_off"?` ${t("detail.oneOff")}.`:""}
   {p.payment_allocations?.map((allocation,index)=><React.Fragment key={index}><br/>{t("detail.installment")}: {formatPaymentPeriod(allocation.installment?.period_from,allocation.installment?.period_to)} · {t("detail.applied")}: {formatPaymentMoney(allocation.amount_applied,p.currency)} · {t("detail.bonus")}: {formatPaymentMoney(allocation.discount_applied,p.currency)}</React.Fragment>)}
   {periodText&&<><br/>{p.period_from&&p.period_to&&p.period_from!==p.period_to?t("detail.period"):t("detail.service")}: {periodText}.</>}
   {p.receipt_note&&<p className="fs-12 text-app-secondary whitespace-pre-wrap break-words">{p.receipt_note}</p>}
   {deuda&&<><br/>{deuda}</>}
   {vencimiento&&<><br/>{vencimiento}</>}
  </div>
 }),[payments,locale,t])

 const emailLines=useMemo(()=>emails.map(mail=>{
  const timestamp=mail.sent_at??mail.created_at
  const fecha=timestamp?new Date(timestamp).toLocaleDateString(dateLocale(locale)):t("detail.noDate")
  const tipo=mail.type==="payment_receipt"?t("detail.paymentReceipt"):mail.type==="upcoming_due"?t("detail.paymentReminder"):mail.type
  const labels:Record<string,string>={
   pending:t("detail.pending"),sent:t("detail.sent"),delivered:t("detail.delivered"),delivery_delayed:t("detail.deliveryDelayed"),
   opened:t("detail.opened"),clicked:t("detail.clicked"),bounced:t("detail.bounced"),complained:t("detail.complained"),failed:t("detail.failed")
  }
  const status=mail.delivery_status??mail.status
  const vencimiento=mail.due_date?` ${t("detail.nextDue")} ${formatCalendarDate(mail.due_date)}.`:""
  return `${fecha} – ${tipo}: ${labels[status]??t("detail.unknownStatus")}. ${mail.subject}.${vencimiento}`
 }),[emails,locale,t])

 const header=<div className="flex flex-col items-center w-full gap-p10">
  <div className="flex items-center justify-center gap-p10 w-full">
   <TabButton icon={UserIcon} label={t("detail.profile")} isActive={activeTab==="data"} onClick={()=>setActiveTab("data")}/>
   <TabButton icon={DollarSign} label={t("detail.payments")} isActive={activeTab==="payments"} onClick={()=>setActiveTab("payments")}/>
   <TabButton icon={MailIcon} label={t("detail.emails")} isActive={activeTab==="emails"} onClick={()=>setActiveTab("emails")}/>
  </div>
  <p className="fs-12 text-app-secondary">{activeTab==="data"?t("detail.profileHelp"):activeTab==="payments"?t("detail.paymentsHelp"):t("detail.emailsHelp")}</p>
 </div>

 return <Modal
  size="normal"
  onClose={()=>{if(!saving)onClose()}}
  header={header}
  secondaryAction={{label:t("common.back"),onClick:onClose}}
  primaryAction={{label:saving?t("detail.saving"):t("detail.save"),onClick:handleSave,disabled:saving||!isDirty||activeTab!=="data"}}
 >
  {activeTab==="data"&&<SubscriptionPanel clientId={client.id} onChanged={onChanged}/>}
  {activeTab==="data"&&<div className="flex flex-col gap-p10">
   <Field label={t("common.name")}><input value={client.name} readOnly className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app-secondary"/></Field>
   <Field label={t("common.email")}><input className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={email} onChange={e=>setEmail(e.target.value)}/></Field>
   <Field label={t("common.phone")}><input className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={phone} onChange={e=>setPhone(e.target.value)}/></Field>
   <Field label={t("common.address")}><input className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={address} onChange={e=>setAddress(e.target.value)}/></Field>
   <Field label={t("detail.addressExtra")}><input className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={addressNumber} onChange={e=>setAddressNumber(e.target.value)}/></Field>
  </div>}

  {activeTab==="payments"&&<div className="space-y-p20 fs-14 text-app">
   {paymentRemote.loading&&paymentRemote.data&&<InlineLoader text={t("detail.paymentHistoryRefresh")}/>}
   {paymentRemote.error&&<button className="btn-secondary" onClick={()=>void paymentRemote.refresh()}>{t("common.retry")}</button>}
   {!paymentRemote.data?(paymentRemote.loading?<InlineLoader text={t("detail.paymentHistoryLoading")}/>:null):paymentRemote.status==="success"&&paymentLines.length===0?<p className="text-app-secondary">{t("detail.noPayments")}</p>:<div className="space-y-p10">{paymentLines.map((line,idx)=><div key={`payment-${idx}`} className="rounded-br10 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>{line}</div>)}</div>}
  </div>}

  {activeTab==="emails"&&<div className="space-y-p20 fs-14 text-app">
   {emailRemote.loading&&emailRemote.data&&<InlineLoader text={t("detail.emailRefresh")}/>}
   {emailRemote.error&&<button className="btn-secondary" onClick={()=>void emailRemote.refresh()}>{t("common.retry")}</button>}
   {!emailRemote.data?(emailRemote.loading?<InlineLoader text={t("detail.emailLoading")}/>:null):emailRemote.status==="success"&&emailLines.length===0?<p className="text-app-secondary">{t("detail.noEmails")}</p>:<div className="space-y-p10">{emailLines.map((line,idx)=><div key={`email-${idx}`} className="rounded-br10 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>{line}</div>)}</div>}
  </div>}
 </Modal>
}

type TabButtonProps={icon:React.ComponentType<React.SVGProps<SVGSVGElement>>;label:string;isActive:boolean;onClick:()=>void}
function TabButton({icon:Icon,label,isActive,onClick}:TabButtonProps){
 return <button type="button" onClick={onClick} aria-pressed={isActive} className={`flex min-w-0 flex-1 items-center justify-center gap-p10 rounded-full border px-p20 py-p10 fs-14 font-medium transition-colors ${isActive?"text-app":"border-transparent text-app-secondary hover:bg-bg1 hover:text-app"}`} style={isActive?{borderColor:"var(--color-accent-primary)",backgroundColor:"var(--color-accent-primary-soft)",color:"var(--color-accent-primary)"}:undefined}><Icon className="h-5 w-5 shrink-0"/><span>{label}</span></button>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="flex flex-col gap-p5"><label className="fs-12 text-app-secondary">{label}</label>{children}</div>}
