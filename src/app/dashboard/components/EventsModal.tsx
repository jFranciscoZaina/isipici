"use client"
import {useEffect,useMemo,useState} from "react"
import {Calendar,MapPin,Users} from "react-feather"
import Modal from "./Modal"
import InlineLoader from "./InlineLoader"
import {useToast} from "./ToastProvider"
import {useSubmissionLock} from "./useSubmissionLock"
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

export default function EventsModal({onClose}:{onClose:()=>void}){
 const {t,locale}=useI18n()
 const toast=useToast()
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

 const upcoming=useMemo(()=>events.filter(event=>!["cancelled","completed"].includes(event.status)),[events])

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

 function reset(){
  setName("");setStartsAt("");setEndsAt("");setLocation("");setCapacity("");setDescription("");setError("")
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
   reset();setCreating(false)
  }catch(reason){
   const message=reason instanceof Error?reason.message:t("events.createError")
   setError(message);operation.error(message)
  }finally{operation.close();lock.release();setSaving(false)}
 }

 return <Modal
  size="normal"
  onClose={()=>{if(!saving)onClose()}}
  header={<div className="text-center"><h2 className="fs-20 font-semibold text-app">{t("events.title")}</h2><p className="mt-p5 fs-12 text-app-secondary">{t("events.subtitle")}</p></div>}
  secondaryAction={{label:creating?t("common.back"):t("common.close"),onClick:creating?()=>{reset();setCreating(false)}:onClose,disabled:saving}}
  primaryAction={creating
   ?{label:saving?t("events.creating"):t("events.create"),onClick:create,disabled:saving||!name.trim()||!startsAt}
   :{label:t("events.new"),onClick:()=>setCreating(true),disabled:loading}}
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
    </article>)}
   </div>:<div className="rounded-br15 border border-n1 bg-bg0 p-p30 text-center"><Calendar className="mx-auto h-6 w-6 text-app-secondary"/><h3 className="mt-p10 fs-14 font-semibold text-app">{t("events.empty")}</h3><p className="mt-p5 fs-12 text-app-secondary">{t("events.emptyHelp")}</p></div>}
  </div>
 </Modal>
}
