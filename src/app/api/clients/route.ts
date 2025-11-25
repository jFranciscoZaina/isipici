import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"

// -----------------------------------------------------------------------------
// GET – Lista clientes con filtro active/inactive
// -----------------------------------------------------------------------------
const INACTIVE_AFTER_DAYS = 45

export async function GET(req: NextRequest) {
  try {
    const statusParam = req.nextUrl.searchParams.get("status") // active | inactive | null

    const { data, error } = await supabase
      .from("clients")
      .select(`
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
      `)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Supabase GET error:", error)
      return NextResponse.json(
        { error: "Error fetching clients", details: error.message },
        { status: 500 }
      )
    }

    const now = new Date()

    // límites del mes actual (inclusive start, exclusive end)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const mapped = (data ?? []).map((client: any) => {
      const payments = (client.payments ?? []) as any[]

      // último pago por fecha de creación
      const lastPayment = [...payments].sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      )[0]

      const currentDebt = Number(lastPayment?.debt ?? 0)
      const nextDue = lastPayment?.period_to ?? null

      // calcular status
      let computedStatus: "active" | "inactive" = "active"
      if (nextDue) {
        const due = new Date(nextDue)
        const inactiveThreshold = new Date(due)
        inactiveThreshold.setDate(
          inactiveThreshold.getDate() + INACTIVE_AFTER_DAYS
        )
        if (now > inactiveThreshold) computedStatus = "inactive"
      }

      // calcular total pagado en el mes actual
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
// POST – Crear cliente
// -----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, address, addressNumber } = await req.json()

    const { data, error } = await supabase
      .from("clients")
      .insert([
        {
          name,
          email,
          phone,
          address,
          address_number: addressNumber,
        },
      ])
      .select()
      .single()

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
