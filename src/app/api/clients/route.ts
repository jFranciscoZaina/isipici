import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { getSessionOwnerId } from "@/lib/auth"
import type { PostgrestError } from "@supabase/supabase-js"

export const runtime = "nodejs"

// -----------------------------------------------------------------------------
// GET - Lista clientes con filtro active/inactive (para el owner logueado)
// -----------------------------------------------------------------------------
const INACTIVE_AFTER_DAYS = 21

type SupabasePaymentRow = {
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
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  address_number: string | null
  plan: string | null
  current_debt: number | null
  last_payment_amount: number | null
  last_payment_date: string | null
  next_payment_date: string | null
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
  try {
    const ownerId = getSessionOwnerId(req)

    if (!ownerId) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      )
    }

    const statusParam = req.nextUrl.searchParams.get("status") // active | inactive | null

    const selectClause = `
      id,
      name,
      email,
      phone,
      address,
      address_number,
      plan,
      current_debt,
      last_payment_amount,
      last_payment_date,
      next_payment_date,
      payments (
        id,
        amount,
        plan,
        discount,
        debt,
        next_payment_date,
        period_from,
        period_to,
        created_at
      )
    `

    let ownerColumn: "owner_id" | "gym_id" = "owner_id"

    let { data, error } = await supabase
      .from("clients")
      .select(selectClause)
      .eq(ownerColumn, ownerId)
      .order("created_at", { ascending: true })

    if (isUndefinedColumn(error)) {
      ownerColumn = "gym_id"
      ;({ data, error } = await supabase
        .from("clients")
        .select(selectClause)
        .eq(ownerColumn, ownerId)
        .order("created_at", { ascending: true }))
    }

    if (error) {
      console.error("Supabase GET error:", error)
      return NextResponse.json(
        { error: "Error fetching clients", details: error.message },
        { status: 500 }
      )
    }

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const mapped = ((data ?? []) as SupabaseClientRow[]).map((client) => {
      const payments = client.payments ?? []

      // Ultimo pago por fecha de creacion
      const lastPayment = [...payments].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0]

      const currentDebt = Number(lastPayment?.debt ?? 0)
      const nextDue = lastPayment?.period_to ?? null

      // calcular status: inactivo si nunca pagó o si pasó el umbral desde el ultimo pago/vencimiento
      let computedStatus: "active" | "inactive" = "active"
      const lastPaymentDate = lastPayment?.created_at
        ? new Date(lastPayment.created_at)
        : null
      if (lastPaymentDate) lastPaymentDate.setHours(0, 0, 0, 0)

      if (!lastPaymentDate) {
        computedStatus = "inactive"
      } else {
        const inactiveThreshold = new Date(lastPaymentDate)
        inactiveThreshold.setDate(
          inactiveThreshold.getDate() + INACTIVE_AFTER_DAYS
        )
        if (now > inactiveThreshold) computedStatus = "inactive"
      }

      if (nextDue) {
        const due = new Date(nextDue)
        due.setHours(0, 0, 0, 0)
        const inactiveThreshold = new Date(due)
        inactiveThreshold.setDate(
          inactiveThreshold.getDate() + INACTIVE_AFTER_DAYS
        )
        if (now > inactiveThreshold) computedStatus = "inactive"
      }

      const totalPaidThisMonth = payments.reduce((sum, p) => {
        if (!p.created_at) return sum
        const created = new Date(p.created_at)
        if (created >= monthStart && created < monthEnd) {
          return sum + Number(p.amount ?? 0)
        }
        return sum
      }, 0)

      return {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        addressNumber: client.address_number,
        currentPlan: lastPayment?.plan ?? null,
        currentDebt,
        totalPaidThisMonth,
        nextDue,
        isMonthFullyPaid: currentDebt <= 0,
        computedStatus,
      }
    })

    const filtered =
      statusParam === "active" || statusParam === "inactive"
        ? mapped.filter((c) => c.computedStatus === statusParam)
        : mapped

    return NextResponse.json(filtered)
  } catch (err) {
    console.error("Unexpected GET error:", err)
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 })
  }
}

// -----------------------------------------------------------------------------
// POST - Crear cliente para el owner logueado
// -----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const ownerId = getSessionOwnerId(req)

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
        { error: "Error creating client", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error("Unexpected POST error:", err)
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 })
  }
}
