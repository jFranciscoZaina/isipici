"use client";

import React,{useState} from "react";
import {useSubmissionLock} from "./useSubmissionLock";
import {useToast} from "./ToastProvider";
import Modal from "./Modal";
import {User} from "react-feather";
import {useI18n} from "../../I18nProvider";

type Props={onClose:()=>void;onCreated:()=>void;onSuccess?:(msg:string)=>void;onError?:(msg:string)=>void};

export default function NewClientModal({onClose,onCreated}:Props){
  const {t}=useI18n(),submission=useSubmissionLock(),toast=useToast();
  const [name,setName]=useState(""),[email,setEmail]=useState(""),[phone,setPhone]=useState(""),[address,setAddress]=useState(""),[addressNumber,setAddressNumber]=useState(""),[loading,setLoading]=useState(false);
  const emailTrimmed=email.trim(),emailIsValid=emailTrimmed.length===0||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed),isValid=name.trim().length>0&&emailIsValid;

  const handleSave=async()=>{
    if(!isValid||loading||!submission.acquire())return;
    const operation=toast.start(t("client.registering"));setLoading(true);
    try{
      const payload={name:name.trim(),email:emailTrimmed||"",phone:phone.trim()||null,address:address.trim()||null,addressNumber:addressNumber.trim()||null};
      const res=await fetch("/api/clients",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      if(res.status===401){window.location.href="/login";operation.close();return}
      if(!res.ok)throw new Error(t("client.registerError"));
      onCreated();operation.success(t("client.registered"));onClose();
    }catch(err){console.error(err);operation.error(t("client.registerError"))}
    finally{submission.release();operation.close();setLoading(false)}
  };

  return <Modal
    size="small"
    onClose={()=>{if(!loading)onClose()}}
    header={<div className="flex items-center gap-p10 w-full justify-start"><div className="flex h-8 w-8 items-center justify-center"><User className="h-4 w-4 text-app"/></div><h2 className="fs-14 font-semibold">{t("client.newTitle")}</h2></div>}
    secondaryAction={{label:t("common.back"),onClick:onClose,disabled:loading}}
    primaryAction={{label:loading?t("client.saving"):t("client.register"),onClick:handleSave,disabled:loading||!isValid}}
  >
    <div className="flex flex-col gap-p10">
      <Field label={t("common.name")}><input className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={name} onChange={e=>setName(e.target.value)} required/></Field>
      <Field label={t("client.emailRecommended")}><input type="email" className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={email} onChange={e=>setEmail(e.target.value)} placeholder={t("client.emailPlaceholder")}/>{!emailIsValid&&<p className="fs-12 text-danger">{t("client.invalidEmail")}</p>}</Field>
      <Field label={t("client.phone")}><input className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={phone} onChange={e=>setPhone(e.target.value)}/></Field>
      <Field label={t("client.address")}><input className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={address} onChange={e=>setAddress(e.target.value)} placeholder={t("client.addressPlaceholder")}/></Field>
      <Field label={t("client.addressExtra")}><input className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={addressNumber} onChange={e=>setAddressNumber(e.target.value)}/></Field>
    </div>
  </Modal>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="flex flex-col gap-p5"><label className="fs-12 text-app-secondary">{label}</label>{children}</div>}
