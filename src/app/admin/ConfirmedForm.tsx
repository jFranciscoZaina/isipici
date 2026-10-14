"use client"
import {useRef,type ReactNode} from "react"
import {useFormStatus} from "react-dom"
import {useConfirm} from "../dashboard/components/ConfirmProvider"
function PendingFields({children}:{children:ReactNode}){const {pending}=useFormStatus();return <fieldset disabled={pending} className="space-y-p20">{children}</fieldset>}
export default function ConfirmedForm({action,children,title,message,when="always",originalEmail=""}:{action:(form:FormData)=>Promise<void>;children:ReactNode;title:string;message:string;when?:"always"|"legacy";originalEmail?:string}){
 const confirm=useConfirm(),approved=useRef(false),confirming=useRef(false)
 return <form action={action} className="space-y-p20" onSubmit={async e=>{
  if(approved.current){approved.current=false;return}
  const form=e.currentTarget,data=new FormData(form)
  if(when==="legacy"&&data.get("legacyEnabled")==="on"&&!data.get("password")&&data.get("email")===originalEmail)return
  e.preventDefault()
  if(confirming.current)return
  confirming.current=true
  try{if(await confirm({title,message,confirmLabel:"Confirmar"})){approved.current=true;form.requestSubmit()}}finally{confirming.current=false}
 }}><PendingFields>{children}</PendingFields></form>
}
