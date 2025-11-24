import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"

export async function GET() {
  // Traemos clients + relación payments
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
      next_payment_date,
      created_at,
      payments (
        id,
        amount,
        plan,
        discount,
        debt,
        period_from,
        period_to,
        created_at
      )
    `)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Supabase error:", error)
    return NextResponse.json(
      { error: "Error fetching clients" },
      { status: 500 }
    )
  }

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const result = (data ?? []).map((client: any) => {
    const payments = client.payments ?? []

    // Ordenamos pagos desc para obtener el último
    const sorted = [...payments].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const lastPayment = sorted[0]

    const paymentsThisMonth = payments.filter((p: any) => {
      const d = new Date(p.created_at)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })

    const totalPaidThisMonth = paymentsThisMonth.reduce(
      (sum: number, p: any) => sum + Number(p.amount || 0),
      0
    )

    // Plan actual: el del último pago, si existe, sino el del cliente
    const currentPlan = lastPayment?.plan ?? client.plan ?? null

    // Deuda actual:
    // prioridad al último pago (porque refleja lo que quedó post-pago),
    // fallback a campo current_debt en clients
    const currentDebt =
      lastPayment?.debt != null
        ? Number(lastPayment.debt)
        : Number(client.current_debt || 0)

    // Vencimiento = "Hasta" (period_to) del último pago
    const nextDue = lastPayment?.period_to ?? client.next_payment_date ?? null

    const isMonthFullyPaid = totalPaidThisMonth > 0 && currentDebt <= 0

    return {
      id: client.id,
      name: client.name,
      email: client.email,
      phone: client.phone,
      address: client.address,
      addressNumber: client.address_number,
      currentPlan,
      currentDebt,
      totalPaidThisMonth,
      nextDue,
      isMonthFullyPaid,
    }
  })

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const { name, email, phone, address, addressNumber, dueDay } =
    await req.json()

  const { data, error } = await supabase
    .from("clients")
    .insert([
      {
        name,
        email,
        phone,
        address,
        address_number: addressNumber,
        due_day: dueDay,
      },
    ])
    .select()
    .single()

  if (error) {
    console.error("Supabase error:", error)
    return NextResponse.json(
      { error: "Error creando cliente" },
      { status: 500 }
    )
  }

  return NextResponse.json(data, { status: 201 })
}
