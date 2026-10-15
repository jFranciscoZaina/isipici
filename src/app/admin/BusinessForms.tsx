"use client"
import BusinessLocationFields from "./BusinessLocationFields"
import ConfirmedForm from "./ConfirmedForm"
import {useEffect,useState} from "react"
import {useFormStatus} from "react-dom"
import {addOwner,setLegacyAccess} from "./actions"

const field="w-full rounded-br15 border border-n1 bg-bg0 px-p20 py-p10 fs-14 text-app"
const label="flex flex-col gap-p5 fs-12 text-app-secondary"

function Submit({label:onLabel,onPendingChange}:{label:string;onPendingChange?:(value:boolean)=>void}){
 const {pending}=useFormStatus()
 useEffect(()=>{onPendingChange?.(pending)},[pending,onPendingChange])
 return <button className="btn-primary justify-center disabled:opacity-50 disabled:cursor-not-allowed" disabled={pending}>{pending?"Guardando...":onLabel}</button>
}

function Credentials({enabled,email="",initial=false}:{enabled:boolean;email?:string;initial?:boolean}){
 if(!enabled)return null
 return (
  <div className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
   <div>
    <p className="fs-16 font-semibold text-app">Credenciales clásicas</p>
    <p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Este acceso es independiente de Google y memberships.</p>
   </div>
   <label className={label}>Email del login clásico<input className={field} name="email" type="email" required defaultValue={email} maxLength={254} autoComplete="off"/></label>
   <label className={label}>Contraseña {initial?"inicial":"nueva (opcional)"}<input className={field} name="password" required={initial} type="password" autoComplete="new-password" minLength={12} maxLength={72}/></label>
  </div>
 )
}

export function BusinessCreateForm({onPendingChange}:{onPendingChange?:(value:boolean)=>void}={}){
 const [enabled,setEnabled]=useState(true)
 return (
  <form action={addOwner} onSubmit={()=>onPendingChange?.(true)} className="flex flex-col gap-p20">
   <section className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
    <div>
     <p className="fs-16 font-semibold text-app">Información del negocio</p>
     <p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Estos datos identifican y configuran el espacio de trabajo.</p>
    </div>
    <div className="grid grid-cols-1 gap-p20 md:grid-cols-2">
     <label className={label}>Nombre del negocio<input name="name" required maxLength={200} className={field}/></label>
     <label className={label}>Email de contacto<input name="contactEmail" type="email" required maxLength={254} className={field}/></label>
     <label className={label}>Moneda<select name="currency" required defaultValue="ARS" className={field}><option value="ARS">ARS — Peso argentino</option><option value="AUD">AUD — Dólar australiano</option></select></label>
     <BusinessLocationFields/>
     <label className={label}>Actividad (opcional)<input name="businessType" maxLength={200} className={field}/></label>

    </div>
   </section>

   <section className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--color-bg-bg0)"}}>
    <div className="flex items-start gap-p10">
     <input id="legacyEnabled" type="checkbox" name="legacyEnabled" checked={enabled} onChange={e=>setEnabled(e.target.checked)} style={{marginTop:"var(--p5)"}}/>
     <label htmlFor="legacyEnabled">
      <span className="block fs-14 font-semibold text-app">Crear acceso clásico</span>
      <span className="block fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Permite entrar con email y contraseña además de los futuros accesos vinculados.</span>
     </label>
    </div>
    <Credentials enabled={enabled} initial/>
    {enabled&&<p className="fs-12 text-app-secondary">Contraseña obligatoria: mínimo 12 caracteres, máximo 72 bytes. Compartila por un canal seguro.</p>}
   </section>

   <div className="flex justify-end"><Submit label="Crear negocio" onPendingChange={onPendingChange}/></div>
  </form>
 )
}

export function LegacyAccessForm({id,email,enabled}:{id:string;email:string|null;enabled:boolean}){
 const [checked,setChecked]=useState(enabled)
 return (
  <section className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
   <div>
    <h2 className="fs-20 font-semibold text-app">Acceso clásico</h2>
    <p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Gestioná el acceso por email y contraseña sin afectar memberships modernas.</p>
   </div>
   <ConfirmedForm action={setLegacyAccess} title="Cambiar acceso clásico" message="Deshabilitar o cambiar credenciales cierra las sesiones clásicas de este negocio." when="legacy" originalEmail={email??""}>
    <input name="id" type="hidden" value={id}/>
    <label className="flex items-start gap-p10">
     <input type="checkbox" name="legacyEnabled" checked={checked} onChange={e=>setChecked(e.target.checked)} style={{marginTop:"var(--p5)"}}/>
     <span><span className="block fs-14 font-semibold text-app">Habilitar acceso clásico</span><span className="block fs-12 text-app-secondary">Si se deshabilita, el negocio conserva todos sus datos.</span></span>
    </label>
    <Credentials enabled={checked} email={email??""}/>
    <p className="fs-12 text-app-secondary">Dejá la contraseña vacía para conservar la existente. Cambiar credenciales cierra las sesiones clásicas abiertas.</p>
    <div><Submit label="Guardar acceso clásico"/></div>
   </ConfirmedForm>
  </section>
 )
}
