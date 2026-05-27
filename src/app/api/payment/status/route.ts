import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    
    if (!token) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
    }

    const db = await getDb();
    
    // Find all tickets associated with this token
    const matchingTickets = Object.values(db.tickets).filter(
      (t) => t.paymentId === token
    );

    if (matchingTickets.length === 0) {
      return NextResponse.json({ status: 'not_found', tickets: [] });
    }

    // Check if all are paid or if some are still reserved
    const allPaid = matchingTickets.every((t) => t.status === 'paid');
    const status = allPaid ? 'paid' : 'reserved';

    return NextResponse.json({
      status,
      tickets: matchingTickets,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
