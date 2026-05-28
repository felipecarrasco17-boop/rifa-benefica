import { NextResponse } from 'next/server';
import { getDb, updateDb, Ticket } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const body = await request.json();
    const { ticketsToImport } = body;

    if (!ticketsToImport || !Array.isArray(ticketsToImport)) {
      return NextResponse.json({ error: 'Formato de importación inválido. Se requiere un arreglo de tickets.' }, { status: 400 });
    }

    const totalLists = db.config.totalLists;
    const ticketsPerList = db.config.ticketsPerList;

    // Validate and process the import batch
    const updated = await updateDb((database) => {
      let importCount = 0;

      for (const item of ticketsToImport) {
        const { id, status, buyerName, buyerPhone, buyerEmail, paymentMethod, paymentId, reservedAt } = item;

        if (!id) continue;

        // Verify bounds
        const ticket = database.tickets[id];
        if (!ticket) {
          // If the ticket ID does not exist in the current grid size, skip or throw error
          // To be safe and avoid crashing, we skip it
          continue;
        }

        // Validate status
        const normStatus = (status || 'available').trim().toLowerCase();
        const finalStatus: 'available' | 'reserved' | 'paid' = 
          normStatus === 'paid' ? 'paid' : normStatus === 'reserved' ? 'reserved' : 'available';

        // Normalize payment method
        const normPayMethod = (paymentMethod || '').trim().toLowerCase();
        const finalPayMethod: 'transfer' | 'flow' | 'manual' | null =
          normPayMethod === 'flow' ? 'flow' : normPayMethod === 'transfer' ? 'transfer' : normPayMethod === 'manual' ? 'manual' : null;

        // Apply changes
        database.tickets[id] = {
          id,
          listIndex: ticket.listIndex,
          numberIndex: ticket.numberIndex,
          status: finalStatus,
          buyerName: finalStatus === 'available' ? null : (buyerName ? String(buyerName).trim() : null),
          buyerPhone: finalStatus === 'available' ? null : (buyerPhone ? String(buyerPhone).trim() : null),
          buyerEmail: finalStatus === 'available' ? null : (buyerEmail ? String(buyerEmail).trim() : null),
          reservedAt: finalStatus === 'available' ? null : (reservedAt ? String(reservedAt).trim() : new Date().toISOString()),
          paymentId: finalStatus === 'available' ? null : (paymentId ? String(paymentId).trim() : null),
          paymentMethod: finalStatus === 'available' ? null : finalPayMethod,
        };

        importCount++;
      }

      console.log(`Importación exitosa de ${importCount} tickets.`);
      return database;
    });

    return NextResponse.json({
      success: true,
      message: `Se importaron y actualizaron ${ticketsToImport.length} registros con éxito.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
