"use client"
import Link from "next/link"
import LanguageSwitch from "../LanguageSwitch"
import {useI18n} from "../I18nProvider"
import {privacyCopy} from "@/lib/privacy-copy"

const sectionClass="flex flex-col gap-p10"
const headingClass="fs-20 font-semibold text-app"
const textClass="fs-14 text-app-secondary leading-relaxed"

export default function PrivacyContent(){
 const {locale}=useI18n()
 const copy=privacyCopy[locale]
 return <main className="min-h-screen bg-bg1 text-app" style={{padding:"var(--p20)"}}>
  <article className="mx-auto flex w-full max-w-[900px] flex-col gap-p30 rounded-br25 border border-n1 bg-bg0 shadow-lg" style={{padding:"var(--p30)"}}>
   <header className="flex flex-col gap-p10 border-b border-n1" style={{paddingBottom:"var(--p20)"}}>
    <div className="flex items-center justify-between gap-p20">
     <Link href="/" className="fs-12 text-app-secondary underline-offset-4 hover:underline">{locale==="es"?"← Volver a ISIPICI":"← Back to ISIPICI"}</Link>
     <LanguageSwitch compact/>
    </div>
    <div>
     <p className="fs-12 font-medium text-app-secondary">ISIPICI</p>
     <h1 className="font-semibold text-app" style={{fontSize:"var(--fs-28)"}}>{copy.title}</h1>
     <p className={textClass} style={{marginTop:"var(--p5)"}}>{copy.updated}</p>
    </div>
   </header>

   <p className={textClass}>{copy.intro}</p>

   {copy.sections.map(section=><section className={sectionClass} key={section.title}>
    <h2 className={headingClass}>{section.title}</h2>
    {section.paragraphs?.map(paragraph=><p className={textClass} key={paragraph}>{paragraph}</p>)}
    {section.items&&<ul className={`list-disc space-y-p5 ${textClass}`} style={{paddingLeft:"var(--p20)"}}>{section.items.map(item=><li key={item}>{item}</li>)}</ul>}
    {section.title.startsWith("12.")&&<p className={textClass}>{copy.contactPrefix}{" "}<a className="font-medium text-app underline underline-offset-4" href="mailto:juanfranciscozaina@gmail.com">juanfranciscozaina@gmail.com</a>.</p>}
   </section>)}
  </article>
 </main>
}
