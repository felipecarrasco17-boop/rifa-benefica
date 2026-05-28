import { NextResponse } from 'next/server';
import { getDb, updateDb, Ticket } from '@/lib/db';
import { createFlowPayment } from '@/lib/flow';
import { calculateTotalPrice } from '@/lib/utils';

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const body = await request.json();
    const { ticketIds, buyerName, buyerPhone, buyerEmail } = body;

    if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
      return NextResponse.json({ error: 'Debe seleccionar al menos un número.' }, { status: 400 });
    }

    if (!buyerName || !buyerPhone) {
      return NextResponse.json({ error: 'Nombre y Teléfono son requeridos.' }, { status: 400 });
    }

    // Default email if empty
    const finalEmail = buyerEmail && buyerEmail.trim() !== '' 
      ? buyerEmail.trim() 
      : db.config.adminEmail;

    const totalAmount = calculateTotalPrice(ticketIds.length, db.config);
    const commerceOrder = `order_${Date.now()}`;

    // Get host for absolute URLs
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    
    const urlReturn = `${protocol}://${host}/payment/result`;
    const urlConfirmation = `${protocol}://${host}/api/payment/webhook`;

    // 1. Temporarily reserve tickets and check availability
    let token: string = '';
    let redirectUrl: string = '';

    // First check and hold tickets, then call Flow, then update tickets with the token
    const updatedDb = await updateDb(async (database) => {
      // Validate availability
      for (const id of ticketIds) {
        const ticket = database.tickets[id];
        if (!ticket) {
          throw new Error(`El número ${id} no existe.`);
        }
        if (ticket.status !== 'available') {
          throw new Error(`El número ${id} ya no está disponible.`);
        }
      }

      // We need to call Flow to get the token. Since createFlowPayment can be async,
      // we'll run it. Since we are inside updateDb, let's call it and get the token.
      // (Flow config is in database.config.flowConfig)
      try {
        const flowRes = await createFlowPayment(database.config.flowConfig, {
          commerceOrder,
          subject: `Compra de ${ticketIds.length} número(s) - Rifa`,
          amount: totalAmount,
          email: finalEmail,
          urlConfirmation,
          urlReturn,
        });
        token = flowRes.token;
        redirectUrl = flowRes.url;
      } catch (err: any) {
        throw new Error(`Error al iniciar el pago con Flow: ${err.message}`);
      }

      // Save reservation details and token in the tickets
      for (const id of ticketIds) {
        database.tickets[id] = {
          ...database.tickets[id],
          status: 'reserved',
          buyerName: buyerName.trim(),
          buyerPhone: buyerPhone.trim(),
          buyerEmail: finalEmail,
          reservedAt: new Date().toISOString(),
          paymentId: token, // Store Flow token
          paymentMethod: 'flow',
        };
      }

      return database;
    });

    return NextResponse.json({
      success: true,
      redirectUrl,
      token,
      commerceOrder,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
