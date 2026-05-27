import { NextResponse } from 'next/server';
import { getDb, updateDb } from '@/lib/db';
import { getFlowPaymentStatus } from '@/lib/flow';

export async function POST(request: Request) {
  try {
    let token: string | null = null;
    const contentType = request.headers.get('content-type') || '';

    // Flow.cl sends data as x-www-form-urlencoded. Mock clients might send JSON.
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      token = formData.get('token') as string;
    } else {
      // Fallback to JSON
      const body = await request.json().catch(() => ({}));
      token = body.token;
    }

    if (!token) {
      return NextResponse.json({ error: 'Token faltante en la confirmación' }, { status: 400 });
    }

    const db = await getDb();
    
    // Fetch payment status from Flow (or mock)
    const flowStatus = await getFlowPaymentStatus(db.config.flowConfig, token);
    
    // Status 2 is Paid in Flow
    if (flowStatus.status === 2) {
      await updateDb((database) => {
        // Find all tickets associated with this payment token
        let updatedCount = 0;
        for (const [id, ticket] of Object.entries(database.tickets)) {
          if (ticket.paymentId === token && ticket.status !== 'paid') {
            database.tickets[id] = {
              ...ticket,
              status: 'paid',
            };
            updatedCount++;
          }
        }
        console.log(`Pago verificado para el token ${token}. Se actualizaron ${updatedCount} números a PAGADO.`);
        return database;
      });

      return new Response('OK', { status: 200 });
    } else {
      console.log(`Pago no confirmado para el token ${token}. Estado Flow: ${flowStatus.status}`);
      return new Response(`Status is ${flowStatus.status}`, { status: 200 });
    }
  } catch (error: any) {
    console.error('Error en webhook de Flow:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
