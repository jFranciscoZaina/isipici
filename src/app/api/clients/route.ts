import {withRequestAudit} from "@/lib/audit-request"
﻿import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { getSessionOwnerId } from "@/lib/auth"
import type { PostgrestError } from "@supabase/supabase-js"
import { fromCalendarDate } from "@/lib/payments/schedule"
import type { Currency, PaymentType } from "@/lib/payments/types"

export const runtime = "nodejs"

// -----------------------------------------------------------------------------
// GET - Lista clientes con filtro active/inactive (para el owner logueado)
// -----------------------------------------------------------------------------
const NEW_CLIENT_DAYS = 7
const INACTIVE_AFTER_DAYS = 21

type SupabasePaymentRow = {
  currency: Currency
  payment_type: PaymentType | null
  id: string
  amount: number | null
  plan: string | null
  discount: number | null
  debt: number | null
  next_payment_date: string | null
  period_from: string | null
  period_to: string | null
  created_at: string
}

type SupabaseClientRow = {
  currency: Currency
  created_at?: string
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  address_number: string | null
  plan: string | null
  current_debt: number | null
  archived_at?: string | null
  legacy_debt_amount?: number | null
  recurring_installments?: {amount_due:number;status:string;due_date:string;payments:{amount:number;discount:number}[]}[]
  recurring_agreements?: {status:string;installments_enabled:boolean;next_charge_at:string|null}[]
  last_payment_amount: number | null
  last_payment_date: string | null
  next_payment_date: string | null
  last_payment?: SupabasePaymentRow | null
  last_recurring?: SupabasePaymentRow | null
  total_paid_this_month?: number
  installment_debt?: number
  has_agreements?: boolean
  has_active_agreement?: boolean
  payments?: SupabasePaymentRow[] | null
}

function isUndefinedColumn(error: PostgrestError | null) {
  if (!error) return false
  return (
    error.code === "42703" ||
    (error.message ?? "").toLowerCase().includes("column") ||
    (error.details ?? "").toLowerCase().includes("column")
  )
}

export async function GET(req: NextRequest) {
  const started = Date.now()
  try {
    const ownerId = await getSessionOwnerId(req)

    if (!ownerId) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      )
    }

    const { data: owner, error: ownerError } = await supabase.from("owners").select("default_currency").eq("id", ownerId).single()
    if (ownerError || !owner || !["ARS", "AUD"].includes(owner.default_currency)) return NextResponse.json({ error: "Configuración de moneda no disponible" }, { status: 503 })
    const statusParam = req.nextUrl.searchParams.get("status") // active | inactive | null

    const selectClause = `
      id,
      created_at,
      name,
      email,
      phone,
      address,
      address_number,
      plan,
      current_debt, archived_at, legacy_debt_amount,
      recurring_installments(amount_due,status,due_date,payments(amount,discount)),
      recurring_agreements(status,installments_enabled,next_charge_at),
      last_payment_amount,
      last_payment_date,
      next_payment_date,
      payments (
        id,
        amount,
        plan,
        currency,
        payment_type,
        discount,
        debt,
        next_payment_date,
        period_from,
        period_to,
        created_at
      )
    `

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const today = now.toISOString().slice(0, 10)
    const clientsQuery = (column: "owner_id" | "gym_id") => {
      let query = supabase.from("clients").select(selectClause).eq(column, ownerId)
        .eq("payments.owner_id", ownerId)
        .eq("recurring_installments.owner_id", ownerId)
        .eq("recurring_installments.payments.owner_id", ownerId)
        .eq("recurring_agreements.owner_id", ownerId)
        .eq("recurring_installments.status", "open")
        .lte("recurring_installments.due_date", today)
      query = statusParam === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null)
      return query.order("created_at", { ascending: true })
    }
    let ownerColumn: "owner_id" | "gym_id" = "owner_id"

    const summary = await supabase.rpc("dashboard_client_summary", {p_owner:ownerId,p_archived:statusParam==="archived",p_month_start:monthStart.toISOString(),p_month_end:monthEnd.toISOString(),p_today:today})
    const legacySchema = summary.error?.code === "PGRST202" || summary.error?.code === "42883"
    let data: SupabaseClientRow[] | null = null
    let error: PostgrestError | null = summary.error
    if (!summary.error) {
      if (!summary.data || summary.data.currency !== owner.default_currency || !Array.isArray(summary.data.clients)) return NextResponse.json({error:"Resumen no disponible"},{status:503})
      data = summary.data.clients as SupabaseClientRow[]
    } else if (legacySchema) {
      // Rolling deployment: old query only while the new RPC is genuinely absent.
      const result = await clientsQuery(ownerColumn)
      data = result.data as unknown as SupabaseClientRow[] | null; error = result.error
      if (isUndefinedColumn(error)) {
        ownerColumn = "gym_id"
        const fallback = await clientsQuery(ownerColumn)
        data = fallback.data as unknown as SupabaseClientRow[] | null; error = fallback.error
      }
    }

    if (error) {
      console.error("Supabase GET error:", error)
      return NextResponse.json(
        { error: "Error fetching clients" },
        { status: 500 }
      )
    }

    const rows=((data ?? []) as SupabaseClientRow[])
    const agreementActivity=new Map<string,number>()
    const eventActivity=new Map<string,number>()

    if(statusParam!=="archived"&&rows.length){
      const agreements=await supabase
        .from("recurring_agreements")
        .select("client_id,created_at")
        .eq("owner_id",ownerId)

      if(agreements.error){
        console.error("Supabase agreement activity error:",agreements.error)
        return NextResponse.json({error:"Error fetching client activity"},{status:500})
      }

      for(const agreement of agreements.data??[]){
        const time=new Date(agreement.created_at).getTime()
        if(Number.isFinite(time)&&time>(agreementActivity.get(agreement.client_id)??-Infinity))agreementActivity.set(agreement.client_id,time)
      }

      const eventParticipants=await supabase
        .from("event_participants")
        .select("client_id,event_id,created_at,status")
        .eq("owner_id",ownerId)
        .neq("status","cancelled")

      const eventSchemaMissing=eventParticipants.error&&["42P01","42703","PGRST205"].includes(eventParticipants.error.code)
      if(eventParticipants.error&&!eventSchemaMissing){
        console.error("Supabase event activity error:",eventParticipants.error)
        return NextResponse.json({error:"Error fetching client activity"},{status:500})
      }

      if(!eventParticipants.error){
        const eventIds=[...new Set((eventParticipants.data??[]).map(item=>item.event_id))]
        const eventDates=new Map<string,number>()
        if(eventIds.length){
          const events=await supabase.from("business_events").select("id,starts_at,status").eq("owner_id",ownerId)
          if(events.error){
            console.error("Supabase event date error:",events.error)
            return NextResponse.json({error:"Error fetching client activity"},{status:500})
          }
          for(const event of events.data??[]){
            if(event.status==="cancelled")continue
            const time=new Date(event.starts_at).getTime()
            if(Number.isFinite(time))eventDates.set(event.id,time)
          }
        }
        for(const participant of eventParticipants.data??[]){
          const created=new Date(participant.created_at).getTime()
          const eventDate=eventDates.get(participant.event_id)??-Infinity
          const time=Math.max(Number.isFinite(created)?created:-Infinity,eventDate)
          if(Number.isFinite(time)&&time>(eventActivity.get(participant.client_id)??-Infinity))eventActivity.set(participant.client_id,time)
        }
      }
    }

    const mapped = rows.map((client) => {
      const payments = client.payments ?? []

      // Una pasada: último pago, última recurrencia e ingreso mensual.
      let lastPayment: SupabasePaymentRow | undefined = client.last_payment?.id ? client.last_payment : undefined
      let lastRecurring: SupabasePaymentRow | undefined = client.last_recurring?.id ? client.last_recurring : undefined
      let latestTime = -Infinity
      let recurringTime = -Infinity
      let totalPaidThisMonth = Number(client.total_paid_this_month ?? 0)
      for (const payment of payments) {
        const created = new Date(payment.created_at).getTime()
        if (created > latestTime) { lastPayment = payment; latestTime = created }
        if (payment.payment_type !== "one_off" && created > recurringTime) { lastRecurring = payment; recurringTime = created }
        if (payment.currency === owner.default_currency && created >= monthStart.getTime() && created < monthEnd.getTime()) totalPaidThisMonth += Number(payment.amount ?? 0)
      }
      const installmentDebt = client.installment_debt ?? (client.recurring_installments??[]).filter(i=>i.status === "open"&&i.due_date<=today).reduce((sum,i)=>sum+Math.max(Number(i.amount_due)-(i.payments??[]).reduce((covered,p)=>covered+Number(p.amount)+Number(p.discount),0),0),0)
      const currentDebt = client.legacy_debt_amount != null ? Number(client.legacy_debt_amount)+installmentDebt : Number(client.current_debt ?? lastRecurring?.debt ?? 0)
      const nextDue = (client.has_agreements && !client.has_active_agreement) || (client.recurring_agreements?.length && !client.recurring_agreements.some(a=>a.status === "active")) ? null : client.next_payment_date ?? lastRecurring?.next_payment_date ?? lastRecurring?.period_to ?? null

      // Estado derivado:
      // - new: primeros 7 días sin ninguna actividad relevante.
      // - active: existe pago, suscripción/plan o participación en evento y sigue dentro de la ventana operativa.
      // - inactive: nunca tuvo actividad y venció la ventana New, o pasaron 21 días desde la última referencia relevante.
      let computedStatus: "new" | "active" | "inactive" = "active"
      const paymentActivityTime=lastPayment?.created_at?new Date(lastPayment.created_at).getTime():-Infinity
      const agreementActivityTime=agreementActivity.get(client.id)??-Infinity
      const eventActivityTime=eventActivity.get(client.id)??-Infinity
      const lastRelevantActivityTime=Math.max(paymentActivityTime,agreementActivityTime,eventActivityTime)
      const hasRelevantActivity=Number.isFinite(lastRelevantActivityTime)

      if(!hasRelevantActivity){
        const createdTime=client.created_at?new Date(client.created_at).getTime():NaN
        const newUntil=Number.isFinite(createdTime)?createdTime+NEW_CLIENT_DAYS*24*60*60*1000:-Infinity
        computedStatus=now.getTime()<=newUntil?"new":"inactive"
      }else{
        let referenceTime=lastRelevantActivityTime
        if(nextDue){
          const due=fromCalendarDate(nextDue)
          if(due){
            due.setHours(0,0,0,0)
            referenceTime=Math.max(referenceTime,due.getTime())
          }
        }
        const inactiveAfter=referenceTime+INACTIVE_AFTER_DAYS*24*60*60*1000
        computedStatus=now.getTime()>inactiveAfter?"inactive":"active"
      }

      return {
        id: client.id,
        archivedAt: client.archived_at ?? null,
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        addressNumber: client.address_number,
        currentPlan: lastRecurring?.plan ?? null,
        currency: owner.default_currency as Currency,
        hasPayments: Boolean(lastPayment?.id),
        currentDebt,
        totalPaidThisMonth,
        nextDue,
        isMonthFullyPaid: currentDebt <= 0,
        computedStatus,
      }
    })

    const filtered =
      statusParam === "archived" ? mapped.filter(c=>c.archivedAt) :
      statusParam === "new" || statusParam === "active" || statusParam === "inactive"
        ? mapped.filter((c) => !c.archivedAt && c.computedStatus === statusParam)
        : mapped.filter(c=>!c.archivedAt)

    return NextResponse.json(filtered, { headers: { "X-Owner-Currency": owner.default_currency, "X-Dashboard-Source": legacySchema ? "legacy" : "summary", "Server-Timing": `dashboard;dur=${Date.now()-started}` } })
  } catch (err) {
    console.error("Unexpected GET error:", err)
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 })
  }
}

// -----------------------------------------------------------------------------
// POST - Crear cliente para el owner logueado
// -----------------------------------------------------------------------------
async function performPOST(req: NextRequest) {
  try {
    const ownerId = await getSessionOwnerId(req)

    if (!ownerId) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      )
    }

    const { name, email, phone, address, addressNumber } = await req.json()

    const basePayload = {
      name,
      email,
      phone,
      address,
      address_number: addressNumber,
    }

    let { data, error } = await supabase
      .from("clients")
      .insert([{ ...basePayload, owner_id: ownerId }])
      .select()
      .single()

    if (isUndefinedColumn(error)) {
      ;({ data, error } = await supabase
        .from("clients")
        .insert([{ ...basePayload, gym_id: ownerId }])
        .select()
        .single())
    }

    if (error) {
      console.error("Supabase POST error:", error)
      return NextResponse.json(
        { error: "Error creating client" },
        { status: 500 }
      )
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error("Unexpected POST error:", err)
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req:NextRequest){return withRequestAudit(req,()=>performPOST(req))}
