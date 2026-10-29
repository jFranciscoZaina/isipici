import Link from "next/link"
import {requireAdmin} from "@/lib/admin-auth"
import {platformSummary,businessPage,AnalyticsError,type PlatformSummary,type BusinessPage} from "@/lib/admin-owners"
import {serverI18n} from "@/lib/i18n-server"
import BusinessCreateModal from "./BusinessCreateModal"
import AuditPanel from "./AuditPanel"
import {logoutAdmin} from "./actions"

const secondaryButton="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1"
const dangerButton="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium text-danger"

export default async function AdminPage({searchParams}:{searchParams:Promise<{q?:string;page?:string;error?:string}>}){
 await requireAdmin()
 const {t,locale}=await serverI18n()
 const format=(value:string|null)=>value?new Date(value).toLocaleString(locale==="es"?"es-AR":"en-AU",{timeZone:"UTC"})+" UTC":t("admin.noActivityRecorded")
 const params=await searchParams,q=(params.q??"").trim().slice(0,100),page=Math.max(1,Math.min(100000,Math.floor(Number(params.page)||1)))
 let summary:PlatformSummary|null=null,list:BusinessPage|null=null,loadError:string|null=null
 try{[summary,list]=await Promise.all([platformSummary(),businessPage(page,20,q)])}catch(e){loadError=e instanceof AnalyticsError?e.message:t("admin.loadError")}

 const primaryKpis=summary?[
  [t("admin.activeBusinesses"),summary.activeBusinesses],
  [t("admin.businesses"),summary.businesses],
  [t("admin.users"),summary.users],
  [t("admin.clients"),summary.clients],
  [t("admin.payments"),summary.payments],
 ] as const:null
 const accessKpis=summary?[
  [t("admin.memberships"),summary.activeMemberships],
  [t("admin.zeroOwners"),summary.zeroOwnerBusinesses],
  [t("admin.pendingInvites"),summary.pendingInvites],
  [t("admin.recurringPayments"),summary.recurringPayments],
  [t("admin.oneOffPayments"),summary.oneOffPayments],
 ] as const:null
 const numberLocale=locale==="es"?"es-AR":"en-AU"

 return <>
  <header className="flex flex-col gap-p20 border-b border-n1" style={{paddingBottom:"var(--p20)"}}>
   <div className="flex flex-col gap-p20 lg:flex-row lg:items-center lg:justify-between">
    <div>
     <p className="fs-12 font-medium text-app-secondary">{t("admin.internal")}</p>
     <h1 className="font-semibold text-app" style={{fontSize:"var(--fs-28)"}}>ISIPICI · Backoffice</h1>
     <p className="fs-14 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.overview")}</p>
    </div>
    <div className="flex flex-wrap items-center gap-p10">
     <BusinessCreateModal/>
     <form action={logoutAdmin}><button className={dangerButton} style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}}>{t("common.logout")}</button></form>
    </div>
   </div>
  </header>

  {params.error&&<div role="alert" className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"color-mix(in srgb, var(--color-state-danger) 6%, var(--n) 94%)"}}>{params.error}</div>}
  {loadError&&<div role="alert" className="rounded-br10 border p-p20 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}}>{loadError}</div>}

  {primaryKpis&&<section aria-label={t("admin.platform")} className="flex flex-col gap-p10">
   <div><h2 className="fs-20 font-semibold text-app">{t("admin.platform")}</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.platformHelp")}</p></div>
   <div className="grid grid-cols-1 gap-p10 sm:grid-cols-2 xl:grid-cols-5">{primaryKpis.map(([label,count])=><article key={label} className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}><p className="fs-12 text-app-secondary">{label}</p><strong className="block font-semibold text-app" style={{fontSize:"var(--fs-28)",marginTop:"var(--p5)"}}>{count.toLocaleString(numberLocale)}</strong></article>)}</div>
  </section>}

  {accessKpis&&<section className="flex flex-col gap-p10">
   <h2 className="fs-16 font-semibold text-app">{t("admin.accessUsage")}</h2>
   <div className="grid grid-cols-1 gap-p10 sm:grid-cols-2 xl:grid-cols-5">{accessKpis.map(([label,count])=><article key={label} className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--color-bg-bg0)"}}><p className="fs-12 text-app-secondary">{label}</p><strong className="block fs-20 font-semibold text-app" style={{marginTop:"var(--p5)"}}>{count.toLocaleString(numberLocale)}</strong></article>)}</div>
   {summary&&<p className="fs-12 text-app-secondary">{t("admin.unclassified")} {summary.unclassifiedPayments}. {t("admin.profiles")} {summary.profiles}.</p>}
  </section>}

  <section className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
   <form className="flex flex-col gap-p10 md:flex-row md:items-end">
    <label className="flex flex-1 flex-col gap-p5 fs-12 text-app-secondary">{t("admin.searchBusinesses")}<input name="q" defaultValue={q} maxLength={100} placeholder={t("admin.searchPlaceholder")} className="w-full rounded-br15 border border-n1 bg-bg0 px-p20 py-p10 fs-14 text-app"/></label>
    <button className="btn-primary justify-center">{t("admin.search")}</button>
    {q&&<Link href="/admin" className={secondaryButton} style={{backgroundColor:"var(--color-bg-bg0)"}}>{t("admin.clearSearch")}</Link>}
   </form>
  </section>

  {list&&<section className="flex flex-col gap-p10">
   <div className="flex flex-col gap-p5 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="fs-20 font-semibold text-app">{t("admin.businessList")}</h2><p className="fs-12 text-app-secondary">{list.total.toLocaleString(numberLocale)} {t("admin.registeredTotal")}</p></div><p className="fs-12 text-app-secondary">{t("admin.page")} {page}</p></div>
   <div className="overflow-hidden rounded-br15 border border-n1" style={{backgroundColor:"var(--n)"}}><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left fs-12">
    <thead style={{backgroundColor:"var(--color-bg-bg8)",color:"var(--color-text-on-primary)"}}><tr>{[t("admin.business"),t("admin.status"),t("admin.contact"),t("admin.countryActivity"),t("admin.clients"),t("admin.owners"),t("admin.classicAccess"),t("admin.lastActivity")].map(label=><th className="p-p10 font-medium" key={label}>{label}</th>)}</tr></thead>
    <tbody>{list.businesses.map(b=><tr key={b.id} className="border-b border-n1 last:border-b-0 hover:bg-bg0">
     <td className="p-p10"><Link className="font-semibold text-app hover:underline" href={"/admin/owners/"+b.id}>{b.name}</Link></td>
     <td className="p-p10"><span className="inline-flex rounded-full px-p10 py-p5 font-medium" style={b.is_active?{backgroundColor:"color-mix(in srgb, var(--status-paid) 10%, var(--n) 90%)",color:"var(--status-paid)"}:{backgroundColor:"var(--color-bg-bg1)",color:"var(--color-text-secondary)"}}>{b.is_active?t("admin.active"):t("admin.disabled")}</span></td>
     <td className="p-p10"><span className="text-app">{b.contact_email??"—"}</span></td>
     <td className="p-p10"><span className="text-app">{b.country??"—"}</span><br/><span className="text-app-secondary">{b.business_type??t("admin.noActivity")}</span></td>
     <td className="p-p10 font-semibold text-app">{b.clientCount}</td>
     <td className="p-p10"><span className="font-semibold text-app">{b.modernOwnerCount}</span> <span className="text-app-secondary">/ {b.max_owner_members}</span></td>
     <td className="p-p10"><span className="inline-flex rounded-full px-p10 py-p5" style={{backgroundColor:"var(--color-bg-bg0)",color:b.legacy_login_enabled?"var(--color-text)":"var(--color-text-secondary)"}}>{b.legacy_login_enabled?t("admin.enabled"):t("admin.disabled")}</span></td>
     <td className="p-p10 text-app-secondary">{format(b.lastActivityAt)}</td>
    </tr>)}</tbody>
   </table></div>
   {!list.businesses.length&&<div className="p-p30 text-center"><p className="fs-16 font-semibold text-app">{t("admin.noBusinesses")}</p><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.trySearch")}</p></div>}
   </div>
   <nav className="flex flex-wrap items-center justify-between gap-p10" aria-label="Pagination">
    <div>{page>1&&<Link className={secondaryButton} style={{backgroundColor:"var(--n)"}} href={"/admin?q="+encodeURIComponent(q)+"&page="+(page-1)}>{t("admin.previous")}</Link>}</div>
    <span className="fs-12 text-app-secondary">{t("admin.page")} {page} · {list.total} {t("admin.businessList").toLowerCase()}</span>
    <div>{page*20<list.total&&<Link className={secondaryButton} style={{backgroundColor:"var(--n)"}} href={"/admin?q="+encodeURIComponent(q)+"&page="+(page+1)}>{t("admin.next")}</Link>}</div>
   </nav>
  </section>}

  <AuditPanel/>
 </>
}
