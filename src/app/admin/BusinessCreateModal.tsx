"use client"
import {useState} from "react"
import Modal from "../dashboard/components/Modal"
import {BusinessCreateForm} from "./BusinessForms"
export default function BusinessCreateModal(){
 const [open,setOpen]=useState(false),[pending,setPending]=useState(false)
 return <><button className="btn-primary" onClick={()=>setOpen(true)}>Crear empresa</button>{open&&<Modal size="large" header={<h2 className="fs-20">Crear empresa</h2>} onClose={()=>{if(!pending)setOpen(false)}} secondaryAction={{label:"Cancelar",onClick:()=>setOpen(false),disabled:pending}}><BusinessCreateForm onPendingChange={setPending}/></Modal>}</>
}
