"use client"
import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from "react"
import {detectLocale,translate,type Locale,type MessageKey} from "@/lib/i18n"

type Value={locale:Locale;setLocale:(locale:Locale)=>void;t:(key:MessageKey)=>string}
const I18nContext=createContext<Value|null>(null)
const COOKIE="isipici_locale"

export function I18nProvider({initialLocale,children}:{initialLocale:Locale;children:ReactNode}){
 const [locale,setLocaleState]=useState<Locale>(initialLocale)

 useEffect(()=>{
  const stored=window.localStorage.getItem(COOKIE)
  if(stored==="en"||stored==="es"){
   if(stored!==locale)setLocaleState(stored)
   return
  }
  const detected=detectLocale(window.navigator.language)
  if(detected!==locale)setLocaleState(detected)
 },[])

 const setLocale=(next:Locale)=>{
  setLocaleState(next)
  window.localStorage.setItem(COOKIE,next)
  document.cookie=`${COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
  document.documentElement.lang=next
 }

 useEffect(()=>{document.documentElement.lang=locale},[locale])
 const value=useMemo<Value>(()=>({locale,setLocale,t:key=>translate(locale,key)}),[locale])
 return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(){
 const value=useContext(I18nContext)
 if(!value)throw new Error("useI18n must be used inside I18nProvider")
 return value
}
