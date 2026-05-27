import { NextResponse } from 'next/server';
import { getDb, saveDb, updateDb, Ticket } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    // Return config and prizes (hide sensitive keys in production, but let's return them for simplicity in local admin)
    return NextResponse.json({
      config: db.config,
      prizes: db.prizes
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { config, prizes } = body;
    
    if (!config) {
      return NextResponse.json({ error: 'Configuración faltante' }, { status: 400 });
    }

    const updated = await updateDb((db) => {
      const oldTotalLists = db.config.totalLists;
      const oldTicketsPerList = db.config.ticketsPerList;
      
      // Update config and prizes
      db.config = {
        ...db.config,
        ...config,
        // Keep list configs numeric
        totalLists: Number(config.totalLists) || oldTotalLists,
        ticketsPerList: Number(config.ticketsPerList) || oldTicketsPerList,
        ticketPrice: Number(config.ticketPrice) || db.config.ticketPrice,
      };

      if (prizes) {
        db.prizes = prizes;
      }

      // If grid dimensions changed, we adjust tickets
      const newTotalLists = db.config.totalLists;
      const newTicketsPerList = db.config.ticketsPerList;

      if (newTotalLists !== oldTotalLists || newTicketsPerList !== oldTicketsPerList) {
        const newTickets: Record<string, Ticket> = {};

        // 1. Prepopulate all new tickets as available
        for (let l = 1; l <= newTotalLists; l++) {
          for (let n = 1; n <= newTicketsPerList; n++) {
            const id = `${l}-${n}`;
            
            // Check if ticket already existed
            if (db.tickets[id]) {
              newTickets[id] = db.tickets[id];
            } else {
              newTickets[id] = {
                id,
                listIndex: l,
                numberIndex: n,
                status: 'available',
                buyerName: null,
                buyerPhone: null,
                buyerEmail: null,
                reservedAt: null,
                paymentId: null,
                paymentMethod: null,
              };
            }
          }
        }

        // 2. Preserve any other sold/reserved tickets that might now be out of bounds, 
        // or just restrict to the new bounds. Standard: keep within the new grid.
        db.tickets = newTickets;
      }

      return db;
    });

    return NextResponse.json({ success: true, config: updated.config, prizes: updated.prizes });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
