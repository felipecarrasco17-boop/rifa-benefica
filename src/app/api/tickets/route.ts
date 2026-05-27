import { NextResponse } from 'next/server';
import { getDb, updateDb, Ticket } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const listIndexStr = searchParams.get('listIndex');

    if (listIndexStr) {
      const listIndex = parseInt(listIndexStr, 10);
      if (isNaN(listIndex)) {
        return NextResponse.json({ error: 'Índice de lista inválido' }, { status: 400 });
      }
      
      // Filter tickets for this list
      const listTickets = Object.values(db.tickets).filter(
        (t) => t.listIndex === listIndex
      );
      return NextResponse.json({ tickets: listTickets });
    }

    // Otherwise return all tickets
    return NextResponse.json({ tickets: Object.values(db.tickets) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Create a reservation (Buy ticket)
export async function POST(request: Request) {
  try {
    const db = await getDb();
    const body = await request.json();
    const { ticketIds, buyerName, buyerPhone, buyerEmail, paymentMethod, status } = body;

    if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
      return NextResponse.json({ error: 'Debe seleccionar al menos un número' }, { status: 400 });
    }

    if (!buyerName || !buyerPhone) {
      return NextResponse.json({ error: 'Nombre y Teléfono son campos requeridos' }, { status: 400 });
    }

    // Default email to admin's email if not provided
    const finalEmail = buyerEmail && buyerEmail.trim() !== '' 
      ? buyerEmail.trim() 
      : db.config.adminEmail;

    const targetStatus = status || 'reserved'; // Default to reserved

    const updated = await updateDb((database) => {
      // 1. Verify availability of all tickets
      for (const id of ticketIds) {
        const ticket = database.tickets[id];
        if (!ticket) {
          throw new Error(`El número ${id} no existe.`);
        }
        if (ticket.status !== 'available') {
          throw new Error(`El número ${id} ya no está disponible (estado actual: ${ticket.status}).`);
        }
      }

      // 2. Perform reservations
      for (const id of ticketIds) {
        database.tickets[id] = {
          ...database.tickets[id],
          status: targetStatus,
          buyerName: buyerName.trim(),
          buyerPhone: buyerPhone.trim(),
          buyerEmail: finalEmail,
          reservedAt: new Date().toISOString(),
          paymentMethod: paymentMethod || 'transfer',
        };
      }

      return database;
    });

    return NextResponse.json({
      success: true,
      reservedTickets: ticketIds.map((id) => updated.tickets[id]),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// Admin modification (Update ticket details / release / mark paid)
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { ticketId, status, buyerName, buyerPhone, buyerEmail, paymentMethod } = body;

    if (!ticketId) {
      return NextResponse.json({ error: 'ID de ticket requerido' }, { status: 400 });
    }

    const updated = await updateDb((database) => {
      const ticket = database.tickets[ticketId];
      if (!ticket) {
        throw new Error(`El ticket ${ticketId} no existe.`);
      }

      if (status === 'available') {
        // Release ticket
        database.tickets[ticketId] = {
          id: ticketId,
          listIndex: ticket.listIndex,
          numberIndex: ticket.numberIndex,
          status: 'available',
          buyerName: null,
          buyerPhone: null,
          buyerEmail: null,
          reservedAt: null,
          paymentId: null,
          paymentMethod: null,
        };
      } else {
        // Modify details or status
        database.tickets[ticketId] = {
          ...ticket,
          status: status || ticket.status,
          buyerName: buyerName !== undefined ? buyerName : ticket.buyerName,
          buyerPhone: buyerPhone !== undefined ? buyerPhone : ticket.buyerPhone,
          buyerEmail: buyerEmail !== undefined ? buyerEmail : ticket.buyerEmail,
          paymentMethod: paymentMethod !== undefined ? paymentMethod : ticket.paymentMethod,
        };
      }

      return database;
    });

    return NextResponse.json({
      success: true,
      ticket: updated.tickets[ticketId],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
