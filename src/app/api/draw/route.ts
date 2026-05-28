import { NextResponse } from 'next/server';
import { getDb, Ticket } from '@/lib/db';

export const dynamic = 'force-dynamic';

function maskPhone(phone: string | null): string {
  if (!phone) return 'Sin teléfono';
  const cleaned = phone.trim();
  if (cleaned.length < 7) {
    return '***' + cleaned.slice(-3);
  }
  return cleaned.slice(0, 4) + '***' + cleaned.slice(-3);
}

function cleanBuyerName(name: string | null): string {
  if (!name) return 'Anónimo';
  // Strip out vendor bracket if present e.g. "Juan Pérez [Vendedor: Pedro]"
  const match = name.match(/^(.*?)\s*\[Vendedor:.*\]$/);
  if (match) {
    return match[1].trim();
  }
  return name.trim();
}

export async function GET() {
  try {
    const db = await getDb();
    
    // Filter only paid tickets
    const paidTickets = Object.values(db.tickets).filter(
      (t: Ticket) => t.status === 'paid'
    );

    // Format the list for the live draw
    const drawList = paidTickets.map((t: Ticket) => ({
      id: t.id,
      listIndex: t.listIndex,
      numberIndex: t.numberIndex,
      buyerName: cleanBuyerName(t.buyerName),
      buyerPhone: maskPhone(t.buyerPhone),
    }));

    return NextResponse.json({
      success: true,
      count: drawList.length,
      tickets: drawList
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
