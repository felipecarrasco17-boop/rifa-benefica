import { NextResponse } from 'next/server';
import { getDb, updateDb, Ticket } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    
    // Public search by phone or email
    const searchQuery = searchParams.get('search');
    if (searchQuery) {
      const query = searchQuery.trim().toLowerCase();
      if (query.length < 4) {
        return NextResponse.json({ error: 'La búsqueda debe tener al menos 4 caracteres' }, { status: 400 });
      }

      const matchedTickets = Object.values(db.tickets).filter((t) => {
        if (t.status === 'available') return false;

        const emailMatch = t.buyerEmail && t.buyerEmail.toLowerCase().trim() === query;

        const cleanPhone = (p: string | null) => p ? p.replace(/[^0-9]/g, '') : '';
        const cleanQ = query.replace(/[^0-9]/g, '');

        let phoneMatch = false;
        if (t.buyerPhone && cleanQ) {
          const tPhone = cleanPhone(t.buyerPhone);
          phoneMatch = tPhone.endsWith(cleanQ) || cleanQ.endsWith(tPhone);
        }

        return emailMatch || phoneMatch;
      });

      // Sanitize names for privacy in public search
      const sanitized = matchedTickets.map(t => {
        // Strip out seller placeholders if any
        let cleanName = t.buyerName || '';
        if (cleanName.startsWith('Responsable:')) {
          cleanName = cleanName.replace('Responsable:', '').trim();
        } else {
          const sellerMatch = cleanName.match(/^(.*?)\s*\[Vendedor:.*\]$/);
          if (sellerMatch) {
            cleanName = sellerMatch[1].trim();
          }
        }
        
        const firstWord = cleanName.split(' ')[0] || 'Comprador';
        const maskedName = firstWord.length > 2 
          ? firstWord.substring(0, 3) + '***' 
          : firstWord + '***';

        return {
          id: t.id,
          listIndex: t.listIndex,
          numberIndex: t.numberIndex,
          status: t.status,
          buyerName: maskedName,
          reservedAt: t.reservedAt,
          paymentMethod: t.paymentMethod
        };
      });

      return NextResponse.json({ tickets: sanitized });
    }

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

    // Otherwise return all tickets (admin usage)
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
    const { ticketId, status, buyerName, buyerPhone, buyerEmail, paymentMethod, reservedAt } = body;

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
          reservedAt: reservedAt !== undefined ? reservedAt : ticket.reservedAt,
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
