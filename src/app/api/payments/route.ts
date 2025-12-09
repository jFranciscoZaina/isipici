// src/app/api/payments/route.ts
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { getSessionOwnerId } from "@/lib/auth"
import { sendPaymentReceiptEmail } from "@/lib/email"

export const runtime = "nodejs"

// GET /api/payments?clientId=uuid
export async function GET(req: NextRequest) {
  try {
    const ownerId = getSessionOwnerId(req)

    if (!ownerId) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get("clientId")

    if (!clientId) {
      return NextResponse.json(
        { error: "clientId is required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("payments")
      .select(`
        id,
        amount,
        plan,
        discount,
        debt,
        next_payment_date,
        period_from,
        period_to,
        created_at
      `)
      .eq("client_id", clientId)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Supabase GET payments error:", error)
      return NextResponse.json(
        { error: "Error fetching payments" },
        { status: 500 }
      )
    }

    return NextResponse.json(data ?? [])
  } catch (e) {
    console.error("GET payments unexpected error:", e)
    return NextResponse.json(
      { error: "Unexpected error fetching payments" },
      { status: 500 }
    )
  }
}

// POST /api/payments
export async function POST(req: NextRequest) {
  try {
    const ownerId = getSessionOwnerId(req)

    if (!ownerId) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      )
    }

    const body = await req.json()
    const {
      clientId,
      amount,
      plan,
      discount = 0,
      debt = 0,
      periodFrom,
      periodTo,
    } = body

    if (!clientId || !plan) {
      return NextResponse.json(
        { error: "clientId and plan are required" },
        { status: 400 }
      )
    }

    const numericAmount = Number(amount || 0)
    const numericDiscount = Number(discount || 0)
    const numericDebt = Number(debt || 0)

    // Insert payment (atado al owner)
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert([
        {
          client_id: clientId,
          owner_id: ownerId,
          amount: numericAmount,
          plan,
          discount: numericDiscount,
          debt: numericDebt,
          period_from: periodFrom ?? null,
          period_to: periodTo ?? null,
          next_payment_date: periodTo ?? null, // lo usamos como "vencimiento"
        },
      ])
      .select()
      .single()

    if (paymentError) {
      console.error("Supabase POST payments error:", paymentError)
      return NextResponse.json(
        { error: "Error registrando pago" },
        { status: 500 }
      )
    }

    // Update client snapshot (deuda actual + próximo vencimiento)
    const { error: clientError } = await supabase
      .from("clients")
      .update({
        current_debt: numericDebt,
        last_payment_amount: numericAmount,
        last_payment_date: new Date().toISOString().slice(0, 10),
        next_payment_date: periodTo ?? null,
      })
      .eq("id", clientId)
      .eq("owner_id", ownerId)

    if (clientError) {
      console.error("Supabase updating client after payment:", clientError)
      // no cortamos el flujo, porque el pago ya quedó guardado
    }

    // ===== NUEVO: Enviar comprobante de pago por email =====
    try {
      // 1) Traer datos del cliente (nombre + email)
      const { data: client, error: clientFetchError } = await supabase
        .from("clients")
        .select("name, email")
        .eq("id", clientId)
        .eq("owner_id", ownerId)
        .single()

      if (clientFetchError || !client?.email) {
        if (clientFetchError) {
          console.error(
            "Error obteniendo cliente para email de pago:",
            clientFetchError,
          )
        }
        // si no hay email, no mandamos nada y seguimos
      } else {
        // 2) Traer nombre del owner (gimnasio)
        const { data: owner, error: ownerError } = await supabase
          .from("owners")
          .select("name")
          .eq("id", ownerId)
          .single()

        if (ownerError || !owner?.name) {
          if (ownerError) {
            console.error(
              "Error obteniendo owner para email de pago:",
              ownerError,
            )
          }
        }

        const ownerName = owner?.name ?? "tu gimnasio"
        const dueDate = periodTo ?? null

        await sendPaymentReceiptEmail({
          to: client.email,
          clientName: client.name,
          ownerName,
          amount: numericAmount,
          dueDate,
          plan,
        })
      }
    } catch (emailError) {
      console.error("Error enviando email de comprobante de pago:", emailError)
      // nunca rompemos la respuesta al cliente por un fallo de email
    }
    // ===== FIN BLOQUE NUEVO =====

    return NextResponse.json(payment, { status: 201 })
  } catch (e) {
    console.error("POST payments unexpected error:", e)
    return NextResponse.json(
      { error: "Unexpected error registering payment" },
      { status: 500 }
    )
  }
}
