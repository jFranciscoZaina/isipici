import BusinessLocationFields from "../../BusinessLocationFields"
import WorkspaceAccessPanel from "../../WorkspaceAccessPanel"
import AuditPanel from "../../AuditPanel"
import ConfirmedForm from "../../ConfirmedForm"
import Link from "next/link"
import {notFound} from "next/navigation"
import {requireAdmin} from "@/lib/admin-auth"
import {ownerSummary,AnalyticsError} from "@/lib/admin-owners"
import {serverI18n} from "@/lib/i18n-server"
import {LegacyAccessForm} from "../../BusinessForms"
import {setOwnerStatus,setOwnerCurrency,setBusinessContact} from "../../actions"

const field="w-full rounded-br15 bg-bg0 border border-n1 px-p20 py-p10 fs-14 text-app"
const label="flex flex-col gap-p5 fs-12 text-app-secondary"
const secondary="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1"

export default async function OwnerDetails({params}:{params:Promise<{id:string}>}){
 await requireAdmin()
 const {t,locale}=await serverI18n()
 const date=(value:string|null)=>value?new Date(value).toLocaleString(locale==="es"?"es-AR":"en-AU",{timeZone:"UTC"})+" UTC":t("admin.noActivityRecorded")
 const {id}=await params
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))notFound()

 let owner
 try{owner=await ownerSummary(id)}catch(e){return <section className="flex flex-col gap-p20"><Link href="/admin" className={secondary} style={{backgroundColor:"var(--n)"}}>{t("admin.back")}</Link><div role="alert" className="rounded-br15 border p-p20 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}}>{e instanceof AnalyticsError?e.message:t("admin.loadError")}</div></section>}
 if(!owner)notFound()

 const usage=[
  [t("admin.clients"),owner.clientCount],
  [t("admin.payments"),owner.paymentCount],
  [t("admin.recurringPayments"),owner.recurringCount],
  [t("admin.oneOffPayments"),owner.oneOffCount],
  [t("admin.owners"),owner.modernOwnerCount+" / "+owner.max_owner_members],
  [t("admin.invites"),owner.pendingInviteCount],
 ] as const

 return <section className="flex flex-col gap-p20">
  <header className="flex flex-col gap-p20 border-b border-n1" style={{paddingBottom:"var(--p20)"}}>
   <div><Link href="/admin" className={secondary} style={{backgroundColor:"var(--n)"}}>← {t("admin.back")}</Link></div>
   <div className="flex flex-col gap-p10 sm:flex-row sm:items-end sm:justify-between">
    <div>
     <p className="fs-12 text-app-secondary">{t("admin.detail")}</p>
     <h1 className="font-semibold text-app" style={{fontSize:"var(--fs-28)"}}>{owner.name}</h1>
     <p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{owner.contact_email??t("admin.noContact")} · {owner.country??t("admin.noCountry")}</p>
    </div>
    <span className="inline-flex self-start rounded-full px-p20 py-p10 fs-12 font-semibold" style={owner.is_active?{backgroundColor:"color-mix(in srgb, var(--status-paid) 10%, var(--n) 90%)",color:"var(--status-paid)"}:{backgroundColor:"var(--color-bg-bg1)",color:"var(--color-text-secondary)"}}>{owner.is_active?t("admin.businessActive"):t("admin.businessDisabled")}</span>
   </div>
  </header>

  <section className="grid grid-cols-2 gap-p10 md:grid-cols-3 xl:grid-cols-6">{usage.map(([name,value])=><article key={name} className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}><p className="fs-12 text-app-secondary">{name}</p><p className="fs-20 font-semibold text-app" style={{marginTop:"var(--p5)"}}>{value}</p></article>)}</section>

  <section className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
   <div className="flex flex-col gap-p10">
    <div><h2 className="fs-20 font-semibold text-app">{t("admin.operationalSummary")}</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.operationalHelp")}</p></div>
    <dl className="grid grid-cols-1 gap-p10 sm:grid-cols-2 lg:grid-cols-4">{[
     [t("admin.businessType"),owner.business_type??"—"],
     [t("admin.currency"),owner.default_currency],
     [t("admin.timezone"),owner.timezone??"—"],
     [t("admin.classicAccess"),owner.legacy_login_enabled?t("admin.enabled"):t("admin.disabled")],
     [t("admin.classicLogin"),owner.email??t("admin.noCredentials")],
     [t("admin.lastLogin"),date(owner.lastLoginAt)],
     [t("admin.lastActivity"),date(owner.lastActivityAt)],
     [t("admin.historical"),owner.unclassifiedCount],
    ].map(([name,value])=><div className="rounded-br10 border border-n1 p-p10" style={{backgroundColor:"var(--color-bg-bg0)"}} key={String(name)}><dt className="fs-12 text-app-secondary">{name}</dt><dd className="fs-14 font-medium text-app" style={{marginTop:"var(--p5)"}}>{value}</dd></div>)}</dl>
   </div>
  </section>

  <section className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
   <form action={setBusinessContact} className="flex flex-col gap-p20">
    <input type="hidden" name="id" value={id}/>
    <div><h2 className="fs-20 font-semibold text-app">{t("admin.businessInfo")}</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.businessInfoHelp")}</p></div>
    <div className="grid grid-cols-1 gap-p20 md:grid-cols-2">
     <label className={label}>{t("common.name")}<input name="name" defaultValue={owner.name} required maxLength={200} className={field}/></label>
     <label className={label}>{t("admin.contactEmail")}<input name="contactEmail" type="email" required maxLength={254} defaultValue={owner.contact_email??""} className={field}/></label>
     <BusinessLocationFields country={owner.country} timezone={owner.timezone}/>
     <label className={label}>{t("admin.businessType")}<input name="businessType" maxLength={200} defaultValue={owner.business_type??""} className={field}/></label>
    </div>
    <div><button className="btn-primary">{t("admin.saveBusiness")}</button></div>
   </form>
  </section>

  <LegacyAccessForm id={id} email={owner.email} enabled={owner.legacy_login_enabled}/>

  <section className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
   <ConfirmedForm action={setOwnerCurrency} title={t("admin.changeCurrency")} message={t("admin.currencyWarning")}>
    <input type="hidden" name="id" value={id}/>
    <div><h2 className="fs-20 font-semibold text-app">{t("admin.businessCurrency")}</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.currencyHelp")}</p></div>
    <label className={label}>{t("admin.currency")}<select name="currency" defaultValue={owner.default_currency} className={field}><option value="ARS">{t("admin.ars")}</option><option value="AUD">{t("admin.aud")}</option></select></label>
    <div><button className="btn-primary">{t("admin.saveCurrency")}</button></div>
   </ConfirmedForm>
  </section>

  <WorkspaceAccessPanel key={id} ownerId={id}/>

  <section className="rounded-br15 border p-p20" style={{borderColor:"color-mix(in srgb, var(--color-state-danger) 35%, var(--n1) 65%)",backgroundColor:"var(--n)"}}>
   <ConfirmedForm action={setOwnerStatus} title={owner.is_active?t("admin.disableBusiness"):t("admin.reactivateBusiness")} message={owner.is_active?t("admin.disableMessage"):t("admin.reactivateMessage")}>
    <input type="hidden" name="id" value={id}/><input type="hidden" name="active" value={String(!owner.is_active)}/>
    <div><h2 className="fs-20 font-semibold text-app">{owner.is_active?t("admin.riskZone"):t("admin.businessDisabled")}</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{owner.is_active?t("admin.disableHelp"):t("admin.reactivateHelp")}</p></div>
    <div><button className={owner.is_active?"inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium text-danger":"btn-primary"} style={owner.is_active?{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}:undefined}>{owner.is_active?t("admin.disableBusiness"):t("admin.reactivateBusiness")}</button></div>
   </ConfirmedForm>
  </section>

  <AuditPanel key={"audit-"+id} ownerId={id}/>
 </section>
}
