"use client"
import {useState} from "react"
const countries=[
 {name:"Argentina",zone:"America/Argentina/Buenos_Aires",label:"Buenos Aires · UTC−03:00"},
 {name:"Australia",zone:"Australia/Sydney",label:"Canberra · UTC+10:00 / UTC+11:00 (verano)"},
]
const field="w-full rounded-br15 border border-n1 bg-bg0 px-p20 py-p10 fs-14 text-app"
const label="flex flex-col gap-p5 fs-12 text-app-secondary"
export default function BusinessLocationFields({country="",timezone=""}:{country?:string|null;timezone?:string|null}){
 const initial=countries.find(c=>c.name.toLowerCase()===(country??"").trim().toLowerCase()||c.name==="Argentina"&&country==="AR"||c.name==="Australia"&&country==="AU")
 const [selected,setSelected]=useState(initial?.name??country??"")
 const [zone,setZone]=useState(timezone?.trim()||initial?.zone||"")
 return <>
  <label className={label}>País<select name="country" className={field} value={selected} onChange={e=>{setSelected(e.target.value);setZone(countries.find(c=>c.name===e.target.value)?.zone??"")}}>
   <option value="">Sin configurar</option>
   {countries.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}
   {selected&&!countries.some(c=>c.name===selected)&&<option value={selected}>{selected} (actual)</option>}
  </select></label>
  <label className={label}>Zona horaria<select name="timezone" className={field} value={zone} onChange={e=>setZone(e.target.value)}>
   <option value="">Sin configurar</option>
   {countries.map(c=><option key={c.zone} value={c.zone}>{c.label}</option>)}
   {zone&&!countries.some(c=>c.zone===zone)&&<option value={zone}>{zone} (actual)</option>}
  </select><span>Al cambiar el país se selecciona la zona de su capital. Podés ajustarla si lo necesitás.</span></label>
 </>
}
