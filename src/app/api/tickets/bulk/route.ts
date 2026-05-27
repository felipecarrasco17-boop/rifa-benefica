import { NextResponse } from 'next/server';
import { getDb, updateDb, Ticket } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const body = await request.json();
    const { listIndex, buyerName, buyerPhone, buyerEmail, paymentMethod, status } = body;

    const listIdx = parseInt(listIndex, 10);
    if (isNaN(listIdx) || listIdx < 1 || listIdx > db.config.totalLists) {
      return NextResponse.json({ error: 'Índice de lista inválido o fuera de rango.' }, { status: 400 });
    }

    if (!buyerName || !buyerPhone) {
      return NextResponse.json({ error: 'Nombre y Teléfono son campos requeridos.' }, { status: 400 });
    }

    // Default email to admin's email if not provided
    const finalEmail = buyerEmail && buyerEmail.trim() !== '' 
      ? buyerEmail.trim() 
      : db.config.adminEmail;

    const targetStatus = status || 'reserved'; // Default to reserved
    const ticketsPerList = db.config.ticketsPerList;
    const targetTicketIds: string[] = [];

    // Precalculate the list of ticket IDs for this list
    for (let n = 1; n <= ticketsPerList; n++) {
      targetTicketIds.push(`${listIdx}-${n}`);
    }

    const updated = await updateDb((database) => {
      // 1. Verify availability of ALL tickets in this list
      const unavailableTickets: string[] = [];
      for (const id of targetTicketIds) {
        const ticket = database.tickets[id];
        if (!ticket || ticket.status !== 'available') {
          unavailableTickets.push(id.split('-')[1]); // Keep just the ticket number for readability
        }
      }

      if (unavailableTickets.length > 0) {
        throw new Error(
          `La lista ${listIdx} tiene números ocupados (${unavailableTickets.join(', ')}). No se puede comprar como lista completa.`
        );
      }

      // 2. Assign the entire list
      for (const id of targetTicketIds) {
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
      message: `Lista ${listIdx} asignada correctamente a ${buyerName}.`,
      reservedTickets: targetTicketIds.map((id) => updated.tickets[id]),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const db = await getDb();
    const body = await request.json();
    const { listIndex } = body;

    const listIdx = parseInt(listIndex, 10);
    if (isNaN(listIdx) || listIdx < 1 || listIdx > db.config.totalLists) {
      return NextResponse.json({ error: 'Índice de lista inválido.' }, { status: 400 });
    }

    const ticketsPerList = db.config.ticketsPerList;
    const targetTicketIds: string[] = [];
    for (let n = 1; n <= ticketsPerList; n++) {
      targetTicketIds.push(`${listIdx}-${n}`);
    }

    await updateDb((database) => {
      for (const id of targetTicketIds) {
        database.tickets[id] = {
          id,
          listIndex: listIdx,
          numberIndex: database.tickets[id]?.numberIndex || parseInt(id.split('-')[1], 10),
          status: 'available',
          buyerName: null,
          buyerPhone: null,
          buyerEmail: null,
          reservedAt: null,
          paymentId: null,
          paymentMethod: null,
        };
      }
      return database;
    });

    return NextResponse.json({
      success: true,
      message: `Lista ${listIdx} liberada con éxito.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
