"use client"
import {useEffect,useMemo,useState} from "react"
import {Calendar,MapPin,Users} from "react-feather"
import Modal from "./Modal"
import InlineLoader from "./InlineLoader"
import {useToast} from "./ToastProvider"
import {useConfirm} from "./ConfirmProvider"
import {useSubmissionLock} from "./useSubmissionLock"
import {formatPaymentMoney} from "@/lib/payments/format"
import {useI18n} from "../../I18nProvider"

type EventRow={
 id:string
 name:string
 description:string|null
 starts_at:string
 ends_at:string|null
 timezone:string
 location:string|null
 capacity:number|null
 status:string
}

type EventClient={id:string;name:string;email:string|null}
type EventParticipant={
 id:string
 event_id:string
 client_id:string
 amount_due:number
 currency:"ARS"|"AUD"
 status:"pending"|"paid"
 payment_id:string|null
 paid_at:string|null
 created_at:string
 client:EventClient|EventClient[]|null
}

const inputClass="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"

function zonedLocalToIso(value:string,timeZone:string){
 const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
 if(!match)throw new Error("INVALID_DATE")
 const [,y,m,d,h,min]=match
 const target=Date.UTC(Number(y),Number(m)-1,Number(d),Number(h),Number(min))
 const formatter=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})
 const wall=(date:Date)=>{
  const parts=Object.fromEntries(formatter.formatToParts(date).filter(part=>part.type!=="literal").map(part=>[part.type,part.value]))
  return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute))
 }
 let instant=target
 for(let i=0;i<3;i++)instant+=target-wall(new Date(instant))
 return new Date(instant).toISOString()
}

function displayDate(value:string,locale:string,timeZone:string){
 return new Intl.DateTimeFormat(locale==="es"?"es-AR":"en-AU",{timeZone,dateStyle:"medium",timeStyle:"short"}).format(new Date(value))
}

function participantClient(participant:EventParticipant){
 return Array.isArray(participant.client)?participant.client[0]??null:participant.client
}

export default function EventsModal({onClose,onPaymentRecorded}:{onClose:()=>void;onPaymentRecorded?:()=>void}){
 const {t,locale}=useI18n()
 const toast=useToast()
 const confirm=useConfirm()
 const lock=useSubmissionLock()

 const [events,setEvents]=useState<EventRow[]>([])
 const [timezone,setTimezone]=useState("UTC")
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [creating,setCreating]=useState(false)
 const [error,setError]=useState("")

 const [name,setName]=useState("")
 const [startsAt,setStartsAt]=useState("")
 const [endsAt,setEndsAt]=useState("")
 const [location,setLocation]=useState("")
 const [capacity,setCapacity]=useState("")
 const [description,setDescription]=useState("")

 const [selectedEvent,setSelectedEvent]=useState<EventRow|null>(null)
 const [participants,setParticipants]=useState<EventParticipant[]>([])
 const [clients,setClients]=useState<EventClient[]>([])
 const [currency,setCurrency]=useState<"ARS"|"AUD">("AUD")
 const [participantsLoading,setParticipantsLoading]=useState(false)
 const [addingPerson,setAddingPerson]=useState(false)
 const [selectedClientId,setSelectedClientId]=useState("")
 const [clientSearch,setClientSearch]=useState("")
 const [amountDue,setAmountDue]=useState("")
 const [participantBusy,setParticipantBusy]=useState<string|null>(null)

 const upcoming=useMemo(()=>events.filter(event=>!["cancelled","completed"].includes(event.status)),[events])
 const participantIds=useMemo(()=>new Set(participants.map(participant=>participant.client_id)),[participants])
 const availableClients=useMemo(()=>clients.filter(client=>!participantIds.has(client.id)),[clients,participantIds])
 const filteredClients=useMemo(()=>{
  const q=clientSearch.trim().toLowerCase()
  if(!q)return availableClients.slice(0,8)
  return availableClients.filter(client=>client.name.toLowerCase().includes(q)||(client.email??"").toLowerCase().includes(q)).slice(0,8)
 },[availableClients,clientSearch])
 const paidCount=participants.filter(participant=>participant.status==="paid").length
 const expectedTotal=participants.reduce((sum,participant)=>sum+Number(participant.amount_due),0)
 const collectedTotal=participants.filter(participant=>participant.status==="paid").reduce((sum,participant)=>sum+Number(participant.amount_due),0)
 const capacityReached=Boolean(selectedEvent?.capacity&&participants.length>=selectedEvent.capacity)

 async function load(){
  setLoading(true);setError("")
  try{
   const response=await fetch("/api/events")
   if(response.status===401){window.location.href="/login";return}
   const body=await response.json()
   if(!response.ok)throw new Error(body.error??t("events.loadError"))
   setEvents(Array.isArray(body.events)?body.events:[])
   if(typeof body.timezone==="string")setTimezone(body.timezone)
  }catch(reason){setError(reason instanceof Error?reason.message:t("events.loadError"))}
  finally{setLoading(false)}
 }

 useEffect(()=>{void load()},[])

 function resetEventForm(){
  setName("");setStartsAt("");setEndsAt("");setLocation("");setCapacity("");setDescription("");setError("")
 }

 function resetParticipantForm(){
  setSelectedClientId("");setClientSearch("");setAmountDue("");setError("")
 }

 async function create(){
  if(!name.trim()||!startsAt||saving||!lock.acquire())return
  setSaving(true);setError("")
  const operation=toast.start(t("events.creating"))
  try{
   const response=await fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    name:name.trim(),
    startsAt:zonedLocalToIso(startsAt,timezone),
    endsAt:endsAt?zonedLocalToIso(endsAt,timezone):null,
    location:location.trim()||null,
    capacity:capacity?Number(capacity):null,
    description:description.trim()||null,
   })})
   const body=await response.json()
   if(!response.ok)throw new Error(body.error??t("events.createError"))
   setEvents(current=>[...current,body].sort((a,b)=>new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime()))
   operation.success(t("events.created"))
   resetEventForm();setCreating(false)
  }catch(reason){
   const message=reason instanceof Error?reason.message:t("events.createError")
   setError(message);operation.error(message)
  }finally{operation.close();lock.release();setSaving(false)}
 }

 async function loadParticipants(event:EventRow){
  setParticipantsLoading(true);setError("")
  try{
   const response=await fetch(`/api/events/${event.id}/participants`)
   if(response.status===401){window.location.href="/login";return}
   const body=await response.json()
   if(!response.ok)throw new Error(body.error??t("events.participantsError"))
   setParticipants(Array.isArray(body.participants)?body.participants:[])
   setClients(Array.isArray(body.clients)?body.clients:[])
   if(body.currency==="ARS"||body.currency==="AUD")setCurrency(body.currency)
  }catch(reason){setError(reason instanceof Error?reason.message:t("events.participantsError"))}
  finally{setParticipantsLoading(false)}
 }

 async function openEvent(event:EventRow){
  setCreating(false);setAddingPerson(false);resetParticipantForm();setSelectedEvent(event)
  await loadParticipants(event)
 }

 async function addParticipant(){
  if(!selectedEvent||!selectedClientId||!amountDue||saving||!lock.acquire())return
  setSaving(true);setError("")
  const operation=toast.start(t("events.addingPerson"))
  try{
   const response=await fetch(`/api/events/${selectedEvent.id}/participants`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:selectedClientId,amountDue})})
   const body=await response.json()
   if(!response.ok)throw new Error(body.error??t("events.personError"))
   operation.success(t("events.personAdded"))
   resetParticipantForm();setAddingPerson(false)
   await loadParticipants(selectedEvent)
  }catch(reason){
   const message=reason instanceof Error?reason.message:t("events.personError")
   setError(message);operation.error(message)
  }finally{operation.close();lock.release();setSaving(false)}
 }

 async function registerParticipantPayment(participant:EventParticipant){
  if(!selectedEvent||participant.status==="paid"||participantBusy)return
  const client=participantClient(participant)
  const accepted=await confirm({
   title:t("events.paymentConfirmTitle"),
   message:`${client?.name??""} · ${formatPaymentMoney(participant.amount_due,participant.currency)}. ${t("events.paymentConfirmMessage")}`,
   confirmLabel:t("events.registerPayment"),
  })
  if(!accepted)return
  setParticipantBusy(participant.id);setError("")
  const operation=toast.start(t("events.registeringPayment"))
  try{
   const response=await fetch(`/api/events/${selectedEvent.id}/participants/${participant.id}/pay`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})
   const body=await response.json()
   if(!response.ok)throw new Error(body.error??t("events.paymentError"))
   operation.success(t("events.paymentRegistered"))
   await loadParticipants(selectedEvent)
   onPaymentRecorded?.()
  }catch(reason){
   const message=reason instanceof Error?reason.message:t("events.paymentError")
   setError(message);operation.error(message)
  }finally{operation.close();setParticipantBusy(null)}
 }

 async function removeParticipant(participant:EventParticipant){
  if(!selectedEvent||participant.status==="paid"||participantBusy)return
  const accepted=await confirm({title:t("events.removeTitle"),message:t("events.removeMessage"),confirmLabel:t("events.remove")})
  if(!accepted)return
  setParticipantBusy(participant.id);setError("")
  const operation=toast.start(t("common.loading"))
  try{
   const response=await fetch(`/api/events/${selectedEvent.id}/participants/${participant.id}`,{method:"DELETE"})
   const body=await response.json()
   if(!response.ok)throw new Error(body.error??t("events.removeError"))
   operation.success(t("events.removed"))
   await loadParticipants(selectedEvent)
  }catch(reason){
   const message=reason instanceof Error?reason.message:t("events.removeError")
   setError(message);operation.error(message)
  }finally{operation.close();setParticipantBusy(null)}
 }

 const back=()=>{
  setError("")
  if(addingPerson){setAddingPerson(false);resetParticipantForm();return}
  if(selectedEvent){setSelectedEvent(null);setParticipants([]);setClients([]);return}
  if(creating){setCreating(false);resetEventForm();return}
  onClose()
 }

 const primaryAction=creating
  ?{label:saving?t("events.creating"):t("events.create"),onClick:create,disabled:saving||!name.trim()||!startsAt}
  :addingPerson
   ?{label:saving?t("events.addingPerson"):t("events.addPerson"),onClick:addParticipant,disabled:saving||!selectedClientId||!amountDue}
   :selectedEvent
    ?{label:t("events.addPerson"),onClick:()=>{if(!capacityReached){resetParticipantForm();setAddingPerson(true)}},disabled:participantsLoading||capacityReached}
    :{label:t("events.new"),onClick:()=>setCreating(true),disabled:loading}

 return <Modal
  size="normal"
  onClose={()=>{if(!saving&&!participantBusy)onClose()}}
  header={<div className="text-center"><h2 className="fs-20 font-semibold text-app">{selectedEvent?t("events.eventDetails"):t("events.title")}</h2><p className="mt-p5 fs-12 text-app-secondary">{selectedEvent?selectedEvent.name:t("events.subtitle")}</p></div>}
  secondaryAction={{label:creating||addingPerson||selectedEvent?t("common.back"):t("common.close"),onClick:back,disabled:saving||Boolean(participantBusy)}}
  primaryAction={primaryAction}
 >
  <div className="flex flex-col gap-p20">
   {error&&<div role="alert" className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"color-mix(in srgb, var(--color-state-danger) 6%, var(--n) 94%)"}}>{error}</div>}

   {loading?<InlineLoader text={t("events.loading")}/>:creating?<>
    <div className="grid grid-cols-1 gap-p20 sm:grid-cols-2">
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary sm:col-span-2">{t("events.name")}<input className={inputClass} value={name} onChange={event=>setName(event.target.value)} maxLength={200} autoFocus/></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">{t("events.start")}<input className={inputClass} type="datetime-local" value={startsAt} onChange={event=>setStartsAt(event.target.value)}/></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">{t("events.end")}<input className={inputClass} type="datetime-local" value={endsAt} onChange={event=>setEndsAt(event.target.value)}/></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">{t("events.location")}<input className={inputClass} value={location} onChange={event=>setLocation(event.target.value)} maxLength={300}/></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">{t("events.capacity")}<input className={inputClass} type="number" min="1" step="1" value={capacity} onChange={event=>setCapacity(event.target.value)}/></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary sm:col-span-2">{t("events.description")}<textarea className={inputClass} rows={4} value={description} onChange={event=>setDescription(event.target.value)} maxLength={2000}/></label>
    </div>
    <p className="fs-12 text-app-secondary">{t("events.timezone")} <strong className="text-app">{timezone}</strong></p>
   </>:selectedEvent?participantsLoading?<InlineLoader text={t("events.participantsLoading")}/>:addingPerson?<>
    <div className="flex flex-col gap-p20">
     <div className="relative flex flex-col gap-p5">
      <label className="fs-12 text-app-secondary">{t("events.choosePerson")}</label>
      <input className={inputClass} value={clientSearch} placeholder={t("events.searchPerson")} onChange={event=>{setClientSearch(event.target.value);setSelectedClientId("")}} autoFocus/>
      {clientSearch.trim()&&!selectedClientId&&<div className="absolute left-0 right-0 top-full z-20 mt-p5 max-h-56 overflow-y-auto rounded-br15 border border-n1 bg-bg0 p-p5 shadow-lg">
       {filteredClients.length?filteredClients.map(client=><button key={client.id} type="button" className="flex w-full flex-col rounded-br10 px-p20 py-p10 text-left hover:bg-bg1" onClick={()=>{setSelectedClientId(client.id);setClientSearch(`${client.name}${client.email?` — ${client.email}`:""}`)}}><span className="fs-14 font-medium text-app">{client.name}</span>{client.email&&<span className="fs-12 text-app-secondary">{client.email}</span>}</button>):<p className="px-p20 py-p10 fs-12 text-app-secondary">{t("events.noPeopleFound")}</p>}
      </div>}
     </div>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">{t("events.amountDue")}<input className={inputClass} inputMode="decimal" value={amountDue} onChange={event=>setAmountDue(event.target.value.replace(",", "."))} placeholder={formatPaymentMoney(0,currency)}/></label>
    </div>
   </>:<>
    <article className="rounded-br15 border border-n1 bg-bg0 p-p20">
     <div className="flex flex-wrap items-start justify-between gap-p20">
      <div><p className="fs-16 font-semibold text-app">{selectedEvent.name}</p><p className="mt-p5 flex items-center gap-p5 fs-12 text-app-secondary"><Calendar className="h-3.5 w-3.5"/>{displayDate(selectedEvent.starts_at,locale,selectedEvent.timezone)}</p>{selectedEvent.location&&<p className="mt-p5 flex items-center gap-p5 fs-12 text-app-secondary"><MapPin className="h-3.5 w-3.5"/>{selectedEvent.location}</p>}</div>
      <div className="text-right"><p className="fs-12 text-app-secondary">{t("events.people")}</p><p className="fs-20 font-semibold text-app">{participants.length}{selectedEvent.capacity?` / ${selectedEvent.capacity}`:""}</p></div>
     </div>
     <div className="mt-p20 grid grid-cols-3 gap-p10 border-t border-n1 pt-p20">
      <div><p className="fs-12 text-app-secondary">{t("events.paid")}</p><p className="fs-16 font-semibold text-app">{paidCount}</p></div>
      <div><p className="fs-12 text-app-secondary">{t("events.expected")}</p><p className="fs-16 font-semibold text-app">{formatPaymentMoney(expectedTotal,currency)}</p></div>
      <div><p className="fs-12 text-app-secondary">{t("events.collected")}</p><p className="fs-16 font-semibold text-app">{formatPaymentMoney(collectedTotal,currency)}</p></div>
     </div>
    </article>

    {capacityReached&&<p className="rounded-br10 border border-n1 bg-bg1 p-p10 fs-12 text-app-secondary">{t("events.capacityReached")}</p>}

    {participants.length?<div className="flex flex-col gap-p10">{participants.map(participant=>{
     const client=participantClient(participant)
     const paid=participant.status==="paid"
     return <article key={participant.id} className="rounded-br15 border border-n1 bg-bg0 p-p20">
      <div className="flex flex-col gap-p10 sm:flex-row sm:items-center sm:justify-between">
       <div className="min-w-0"><div className="flex flex-wrap items-center gap-p10"><p className="fs-14 font-semibold text-app">{client?.name??participant.client_id}</p><span className="rounded-full px-p10 py-p5 fs-12 font-medium" style={{backgroundColor:paid?"color-mix(in srgb, var(--status-paid) 10%, var(--n) 90%)":"var(--color-bg-bg1)",color:paid?"var(--status-paid)":"var(--color-text-secondary)"}}>{paid?t("events.paid"):t("events.pending")}</span></div>{client?.email&&<p className="mt-p5 fs-12 text-app-secondary">{client.email}</p>}<p className="mt-p5 fs-14 font-medium text-app">{formatPaymentMoney(participant.amount_due,participant.currency)}</p></div>
       {!paid&&<div className="flex flex-wrap gap-p10"><button type="button" className="inline-flex min-h-10 items-center justify-center rounded-full border border-n2 bg-bg0 px-p20 py-p10 fs-12 font-medium text-app hover:bg-bg1 disabled:opacity-50" disabled={Boolean(participantBusy)} onClick={()=>void removeParticipant(participant)}>{t("events.remove")}</button><button type="button" className="btn-primary min-h-10 px-p20 py-p10 fs-12 disabled:opacity-50" disabled={Boolean(participantBusy)} onClick={()=>void registerParticipantPayment(participant)}>{participantBusy===participant.id?t("events.registeringPayment"):t("events.registerPayment")}</button></div>}
      </div>
     </article>
    })}</div>:<div className="rounded-br15 border border-n1 bg-bg0 p-p30 text-center"><Users className="mx-auto h-6 w-6 text-app-secondary"/><h3 className="mt-p10 fs-14 font-semibold text-app">{t("events.noParticipants")}</h3><p className="mt-p5 fs-12 text-app-secondary">{t("events.noParticipantsHelp")}</p></div>}
   </>:upcoming.length?<div className="flex flex-col gap-p10">
    {upcoming.map(event=><article key={event.id} className="rounded-br15 border border-n1 bg-bg0 p-p20">
     <div className="flex items-start justify-between gap-p20">
      <div className="min-w-0"><h3 className="fs-14 font-semibold text-app">{event.name}</h3><p className="mt-p5 flex items-center gap-p5 fs-12 text-app-secondary"><Calendar className="h-3.5 w-3.5"/>{displayDate(event.starts_at,locale,event.timezone)}</p></div>
      <span className="rounded-full bg-bg1 px-p10 py-p5 fs-12 text-app-secondary">{event.status}</span>
     </div>
     {(event.location||event.capacity)&&<div className="mt-p10 flex flex-wrap gap-p20 fs-12 text-app-secondary">
      {event.location&&<span className="flex items-center gap-p5"><MapPin className="h-3.5 w-3.5"/>{event.location}</span>}
      {event.capacity&&<span className="flex items-center gap-p5"><Users className="h-3.5 w-3.5"/>{t("events.capacityShort")} {event.capacity}</span>}
     </div>}
     {event.description&&<p className="mt-p10 fs-12 text-app-secondary">{event.description}</p>}
     <div className="mt-p20 border-t border-n1 pt-p10"><button type="button" className="inline-flex min-h-10 items-center justify-center rounded-full border border-n2 bg-bg0 px-p20 py-p10 fs-12 font-medium text-app hover:bg-bg1" onClick={()=>void openEvent(event)}>{t("events.manage")}</button></div>
    </article>)}
   </div>:<div className="rounded-br15 border border-n1 bg-bg0 p-p30 text-center"><Calendar className="mx-auto h-6 w-6 text-app-secondary"/><h3 className="mt-p10 fs-14 font-semibold text-app">{t("events.empty")}</h3><p className="mt-p5 fs-12 text-app-secondary">{t("events.emptyHelp")}</p></div>}
  </div>
 </Modal>
}
