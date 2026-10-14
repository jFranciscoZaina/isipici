"use client"
import {useState} from "react"
import Modal from "../dashboard/components/Modal"
import {BusinessCreateForm} from "./BusinessForms"

export default function BusinessCreateModal(){
 const [open,setOpen]=useState(false),[pending,setPending]=useState(false)
 return (
  <>
   <button className="btn-primary" onClick={()=>setOpen(true)}>Crear negocio</button>
   {open&&(
    <Modal
     size="large"
     header={<div className="text-center"><h2 className="fs-20 font-semibold text-app">Crear negocio</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Configurá los datos del espacio y, si hace falta, un acceso clásico inicial.</p></div>}
     onClose={()=>{if(!pending)setOpen(false)}}
     secondaryAction={{label:"Cancelar",onClick:()=>setOpen(false),disabled:pending}}
    >
     <BusinessCreateForm onPendingChange={setPending}/>
    </Modal>
   )}
  </>
 )
}
