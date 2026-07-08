import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const { total, efectivo, transferencia } = await request.json()
    const { data, error } = await supabaseAdmin
      .from('liquidaciones_pagos')
      .update({
        total: Math.round(Number(total)),
        efectivo: Math.round(Number(efectivo)),
        transferencia: Math.round(Number(transferencia)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al actualizar'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
