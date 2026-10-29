"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import type { ClientRow } from "../page";
import { Trash2, DollarSign, UserPlus, CreditCard, Mail } from "react-feather";
import {useI18n} from "../../I18nProvider";

export type ClientMenuAction="delete"|"registerPayment"|"editProfile"|"paymentsHistory"|"emailsHistory";
type Props={client:ClientRow|null;position:{top:number;left:number}|null;onClose:()=>void;onAction:(action:ClientMenuAction,client:ClientRow)=>void};

export function ClientContextMenu({client,position,onClose,onAction}:Props){
  const {t}=useI18n();
  const ref=useRef<HTMLDivElement|null>(null);
  const [adjustedTop,setAdjustedTop]=useState<number|null>(null),[isMobile,setIsMobile]=useState(false);

  useEffect(()=>{const update=()=>setIsMobile(window.innerWidth<768);update();window.addEventListener("resize",update);return()=>window.removeEventListener("resize",update)},[]);
  useEffect(()=>{
    if(!client||!position)return;
    const handleClick=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))onClose()};
    const handleKey=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose()};
    document.addEventListener("mousedown",handleClick);document.addEventListener("keydown",handleKey);
    return()=>{document.removeEventListener("mousedown",handleClick);document.removeEventListener("keydown",handleKey)}
  },[client,position,onClose]);
  useEffect(()=>{
    if(!client||!position)return;
    const raf=requestAnimationFrame(()=>{
      if(!ref.current)return;
      const margin=16,menuHeight=ref.current.offsetHeight,viewportHeight=window.innerHeight,scrollY=window.scrollY;
      let top=position.top;const bottom=top+menuHeight,maxBottom=scrollY+viewportHeight-margin,minTop=scrollY+margin;
      if(bottom>maxBottom)top-=bottom-maxBottom;
      if(top<minTop)top=minTop;
      setAdjustedTop(top);
    });
    return()=>cancelAnimationFrame(raf)
  },[client,position]);

  if(!client||!position)return null;
  const items:{id:ClientMenuAction;label:string;icon:ComponentType<SVGProps<SVGSVGElement>>;tone?:"danger"}[]=[
    {id:"registerPayment",label:t("menu.registerPayment"),icon:DollarSign},
    {id:"editProfile",label:t("menu.editProfile"),icon:UserPlus},
    {id:"paymentsHistory",label:t("menu.paymentHistory"),icon:CreditCard},
    {id:"emailsHistory",label:t("menu.emailHistory"),icon:Mail},
    {id:"delete",label:t("menu.archive"),icon:Trash2,tone:"danger"},
  ];
  const top=adjustedTop??position.top;

  const list=<ul className={isMobile?"space-y-p10 flex flex-col gap-p30":"px-p20 py-p20 space-y-p30"}>
    {items.map(({id,label,icon:Icon,tone})=><li key={id}><button type="button" className={`flex w-full items-center gap-p20 rounded-br10 px-p10 py-p10 text-left fs-14 transition-colors ${tone==="danger"?"text-danger":"text-app"} hover:bg-bg1`} onClick={()=>{onAction(id,client);onClose()}}><Icon className="h-5 w-5 stroke-[2.2]"/><span>{label}</span></button></li>)}
  </ul>;

  if(isMobile)return <div className="fixed inset-0 z-50 flex items-end md:hidden bg-black/60 transition-opacity duration-200" onClick={onClose}><div className="w-full bg-bg0 p-p20 rounded-br15 shadow-lg flex flex-col gap-p10 pb-[calc(var(--p20)+env(safe-area-inset-bottom))]" onClick={e=>e.stopPropagation()}><div className="font-bold uppercase">{client.name}</div>{list}</div></div>;
  return <div className="fixed inset-0 z-40 pointer-events-none"><div ref={ref} className="pointer-events-auto rounded-br10 border border-n2 bg-bg0 shadow-lg w-[240px]" style={{position:"absolute",top,left:position.left,transform:"translateX(-100%)"}}>{list}</div></div>
}
