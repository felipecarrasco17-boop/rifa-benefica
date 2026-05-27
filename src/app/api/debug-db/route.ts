import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'NO CONFIGURADA';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'NO CONFIGURADA';
    
    // Mask key for safety
    const maskedKey = key !== 'NO CONFIGURADA' 
      ? `${key.substring(0, 8)}... (longitud: ${key.length})` 
      : 'NO CONFIGURADA';

    // 1. Raw read of raffle_config
    const { data: configData, error: configError } = await supabase
      .from('raffle_config')
      .select('*');

    // 2. Count tickets
    const { count: ticketCount, error: ticketError } = await supabase
      .from('raffle_tickets')
      .select('*', { count: 'exact', head: true });

    // 3. Raw read of prizes
    const { data: prizesData, error: prizesError } = await supabase
      .from('raffle_prizes')
      .select('*');

    return NextResponse.json({
      env: {
        url,
        key: maskedKey,
        nodeEnv: process.env.NODE_ENV
      },
      raffle_config: {
        data: configData,
        error: configError ? { message: configError.message, code: configError.code, details: configError.details } : null
      },
      raffle_tickets: {
        count: ticketCount,
        error: ticketError ? { message: ticketError.message, code: ticketError.code } : null
      },
      raffle_prizes: {
        data: prizesData,
        error: prizesError ? { message: prizesError.message, code: prizesError.code } : null
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
