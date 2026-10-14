"use client"
import {useSubmissionLock} from "./useSubmissionLock"
import InlineLoader from "./InlineLoader"
import {useState} from "react"
import {useConfirm} from "./ConfirmProvider"
import {useToast} from "./ToastProvider"
import {useRemoteData} from "./useRemoteData"
import Modal from "./Modal"
import RangeCalendar from "./RangeCalendar"
import {priceForDate,type PlanSummary} from "@/lib/payments/plan-types"
import {FREQUENCY_LABELS,RECURRING_FREQUENCIES,toCalendarDate,fromCalendarDate,formatCalendarDate,type RecurringFrequency} from "@/lib/payments/schedule"
import {formatPaymentMoney} from "@/lib/payments/format"
import {validPaymentMoneyDraft} from "@/lib/payments/validation"
const inputClass="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
export default function PlansModal({onClose}:{onClose:()=>void}){
 const submission=useSubmissionLock()
 const toast=useToast(),confirm=useConfirm()
 const remote=useRemoteData<PlanSummary[]>("/api/plans","Cargando planes...","No se pudieron cargar los planes.")
 const plans=remote.data??[],refresh=remote.refresh
 const [error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false)
 const [form,setForm]=useState<"create"|"edit"|null>(null),[id,setId]=useState(""),[name,setName]=useState(""),[frequency,setFrequency]=useState<RecurringFrequency>("monthly"),[amount,setAmount]=useState(""),[date,setDate]=useState(toCalendarDate(new Date())),[existing,setExisting]=useState(false),[scheduled,setScheduled]=useState(false)
 const begin=(p?:PlanSummary)=>{setForm(p?"edit":"create");setId(p?.id??"");setName(p?.name??"");setFrequency(p?.frequency??"monthly");setAmount("");setDate(toCalendarDate(new Date()));setExisting(false);setScheduled(false);setError("");setMessage("")}
 const save=async(action:string)=>{if(busy)return;if(!submission.acquire())return;const operation=toast.start("Guardando plan...");setBusy(true);setError("");try{const r=await fetch("/api/plans",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...(id?{planId:id}:{}),...(action!=="archive"?{name,frequency,...(amount?{amount:Number(amount),effectiveFrom:form==="create"?undefined:scheduled?date:toCalendarDate(new Date()),applyExisting:existing}:{})}:{})})});if(r.status===401){window.location.href="/login";operation.close();return}const b=await r.json();if(!r.ok)throw new Error("No se pudo guardar el plan.");operation.success(action==="archive"?"Plan archivado.":form==="create"?"Plan creado.":amount?(scheduled||existing?"Nuevo precio programado.":"Precio actualizado."):"Plan actualizado.");setMessage(existing?`${b.scheduled??0} suscripciones programadas. ${b.skipped??0} omitidas por cambios pendientes, baja o estado no elegible.`:"Plan guardado. Las suscripciones actuales conservan sus condiciones.");setForm(null);await refresh()}catch{setError("No se pudo guardar el plan.");operation.error("No se pudo guardar el plan.")}finally{submission.release();operation.close();setBusy(false)}}
 const today=toCalendarDate(new Date()),used=plans.find(p=>p.id===id)?.used??false
 return <Modal
  size="large"
  onClose={()=>{if(!busy)onClose()}}
  header={<div className="text-center"><h2 className="fs-20 font-semibold text-app">Planes</h2><p className="fs-12 text-app-secondary mt-p5">Definí las opciones recurrentes que después podés asignar a tus clientes.</p></div>}
  secondaryAction={{disabled:busy,label:form?"Cancelar":"Cerrar",onClick:()=>form?setForm(null):onClose()}}
  primaryAction={form?{label:"Guardar plan",onClick:()=>save(form),disabled:busy||remote.loading||!name.trim()||form==="create"&&(!amount||!date)||Boolean(amount)&&(!validPaymentMoneyDraft(amount)||Number(amount)<=0||!date)}:undefined}
 >
  <div className="space-y-p20" aria-busy={remote.loading}>
   {remote.loading&&<InlineLoader text={remote.data?"Actualizando planes...":"Cargando planes..."}/>}
   {remote.error&&<div className="rounded-br10 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}><p className="fs-14 text-app-secondary">No pudimos cargar los planes.</p><button className="btn-primary mt-p10" onClick={()=>void refresh()}>Reintentar</button></div>}
   {error&&<div role="alert" className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"color-mix(in srgb, var(--color-state-danger) 6%, var(--n) 94%)"}}>{error}</div>}
   {message&&<div role="status" className="rounded-br10 border border-n1 p-p10 fs-14 text-app" style={{backgroundColor:"var(--color-accent-primary-soft)"}}>{message}</div>}

   {!form?<>
    {remote.status==="success"&&plans.length===0?(
     <div className="flex min-h-[340px] items-center justify-center">
      <div className="max-w-md text-center space-y-p20">
       <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full fs-20 font-semibold" style={{backgroundColor:"var(--color-accent-primary-soft)",color:"var(--color-accent-primary)"}}>+</div>
       <div>
        <p className="fs-20 font-semibold text-app">Creá tu primer plan</p>
        <p className="fs-14 text-app-secondary mt-p5">Los planes te permiten reutilizar precio y frecuencia al crear suscripciones.</p>
       </div>
       <button className="btn-primary" disabled={busy} onClick={()=>begin()}>Nuevo plan</button>
      </div>
     </div>
    ):plans.length>0&&<>
     <div className="flex flex-wrap items-center justify-between gap-p10">
      <div><p className="fs-16 font-semibold text-app">Planes activos</p><p className="fs-12 text-app-secondary mt-p5">{plans.length} {plans.length===1?"plan disponible":"planes disponibles"}</p></div>
      <button className="btn-primary" disabled={remote.loading||busy} onClick={()=>begin()}>Nuevo plan</button>
     </div>
     <div className="grid gap-p10">
      {plans.map(p=>{
       const current=priceForDate(p,today),next=p.prices.find(price=>price.effective_from>today)
       return <article key={p.id} className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
        <div className="flex flex-col gap-p20 md:flex-row md:items-center md:justify-between">
         <div className="min-w-0 space-y-p10">
          <div className="flex flex-wrap items-center gap-p10">
           <h3 className="fs-16 font-semibold text-app">{p.name}</h3>
           <span className="rounded-full px-p10 py-p5 fs-12 text-app-secondary" style={{backgroundColor:"var(--color-bg-bg1)"}}>{FREQUENCY_LABELS[p.frequency]}</span>
           <span className="rounded-full px-p10 py-p5 fs-12 text-app-secondary" style={{backgroundColor:"var(--color-bg-bg1)"}}>{p.subscriptions} {p.subscriptions===1?"suscripción":"suscripciones"}</span>
          </div>
          <p className="fs-20 font-semibold text-app">{current?formatPaymentMoney(current.amount,current.currency):"Sin precio vigente"}</p>
          {next&&<p className="fs-12 text-app-secondary">Próximo precio: {formatPaymentMoney(next.amount,next.currency)} desde {formatCalendarDate(next.effective_from)}</p>}
         </div>
         <button
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1 disabled:opacity-50"
          style={{backgroundColor:"var(--color-bg-bg0)"}}
          disabled={remote.loading||busy}
          onClick={()=>begin(p)}
         >
          Editar plan
         </button>
        </div>
       </article>
      })}
     </div>
    </>}
   </>:<div className="space-y-p20">
    <div className="rounded-br15 border border-n1 p-p20 space-y-p20" style={{backgroundColor:"var(--n)"}}>
     <div>
      <p className="fs-16 font-semibold text-app">{form==="create"?"Nuevo plan":"Editar plan"}</p>
      <p className="fs-12 text-app-secondary mt-p5">{form==="create"?"Definí nombre, frecuencia y precio inicial.":"Actualizá el catálogo sin modificar el historial ya registrado."}</p>
     </div>
     <div className="grid gap-p20 md:grid-cols-2">
      <label className="fs-12 text-app-secondary">Nombre<input className={inputClass} value={name} maxLength={200} onChange={e=>setName(e.target.value)}/></label>
      <label className="fs-12 text-app-secondary">Frecuencia<select className={inputClass} value={frequency} disabled={used} onChange={e=>setFrequency(e.target.value as RecurringFrequency)}>{RECURRING_FREQUENCIES.map(f=><option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}</select>{used&&<span className="block mt-p5">La frecuencia queda fija una vez que el plan fue utilizado.</span>}</label>
     </div>
     <label className="fs-12 text-app-secondary">{form==="create"?"Precio inicial":"Nuevo precio (opcional)"}<input className={inputClass} type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
     {form==="create"&&<p className="fs-12 text-app-secondary">El precio inicial queda disponible desde la creación del plan.</p>}
    </div>

    {amount&&form==="edit"&&<section className="rounded-br15 border border-n1 p-p20 space-y-p20" style={{backgroundColor:"var(--n)"}}>
     <div><p className="fs-16 font-semibold text-app">Aplicación del nuevo precio</p><p className="fs-12 text-app-secondary mt-p5">Elegí desde cuándo y a quiénes impactará. No se modifican cuotas protegidas ni hay prorrateo.</p></div>
     <div className="grid gap-p20 md:grid-cols-2">
      <label className="fs-12 text-app-secondary">Cuándo aplicar<select className={inputClass} value={scheduled?"scheduled":"now"} onChange={e=>setScheduled(e.target.value==="scheduled")}><option value="now">Desde ahora, para próximos vencimientos</option><option value="scheduled">Programar para una fecha</option></select></label>
      <label className="fs-12 text-app-secondary">Aplicar a<select className={inputClass} value={existing?"existing":"new"} onChange={e=>setExisting(e.target.value==="existing")}><option value="new">Solo nuevas suscripciones</option><option value="existing">También suscripciones actuales</option></select></label>
     </div>
     {scheduled&&<div><p className="fs-12 text-app-secondary mb-p10">Vigente desde</p><RangeCalendar selectionMode="single" value={{from:fromCalendarDate(date)}} onChange={v=>setDate(toCalendarDate(v.from))}/></div>}
    </section>}

    {form==="edit"&&<section className="rounded-br15 border border-n1 p-p20 space-y-p10" style={{backgroundColor:"var(--n)"}}>
     <div><p className="fs-16 font-semibold text-app">Historial de precios</p><p className="fs-12 text-app-secondary mt-p5">Los precios anteriores se conservan como referencia histórica.</p></div>
     <div className="space-y-p5">{plans.find(p=>p.id===id)?.prices.map(price=><div key={price.id} className="flex items-center justify-between rounded-br10 px-p10 py-p10 fs-12" style={{backgroundColor:"var(--color-bg-bg0)"}}><span className="text-app">{formatPaymentMoney(price.amount,price.currency)}</span><span className="text-app-secondary">desde {formatCalendarDate(price.effective_from)}</span></div>)}</div>
     <div className="pt-p10 border-t border-n1">
      <button
       className="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium disabled:opacity-50"
       style={{color:"var(--color-state-danger)",borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}}
       disabled={busy}
       onClick={async()=>{if(await confirm({title:"Archivar plan",message:"Las suscripciones y el historial se conservan.",confirmLabel:"Archivar"}))void save("archive")}}
      >
       Archivar plan
      </button>
     </div>
    </section>}
   </div>}
  </div>
 </Modal>
}
