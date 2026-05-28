import { createClient } from '@supabase/supabase-js';

export const DEFAULT_WHATSAPP_TEMPLATE = `Hola {nombre}, te escribo de la Rifa. Tu reserva del número {numero} de la Lista {lista} (ID: {id}) por {precio} está reservada y pendiente de pago.

Puedes transferir a:
Banco: {banco}
Tipo de Cuenta: {cuenta}
Número: {ncuenta}
RUT: {rut}

Por favor, respóndenos con el comprobante de transferencia. ¡Muchas gracias!`;

// Define Interfaces
export interface RaffleConfig {
  title: string;
  description: string;
  ticketPrice: number;
  drawDate: string;
  totalLists: number;
  ticketsPerList: number;
  adminEmail: string;
  adminPassword?: string;
  bankTransferData: {
    bankName: string;
    accountType: string;
    accountNumber: string;
    rut: string;
    email: string;
  };
  flowConfig: {
    apiKey: string;
    secretKey: string;
    sandboxMode: boolean;
    mockMode: boolean;
  };
  whatsappTemplate?: string;
  reservationExpiryDays?: number;
  discountEnabled?: boolean;
  discountCombo1Tickets?: number;
  discountCombo1Price?: number;
  discountCombo2Tickets?: number;
  discountCombo2Price?: number;
}

export interface Prize {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
}

export interface Ticket {
  id: string; // "list-number" (e.g., "15-7")
  listIndex: number; // 1-based list index
  numberIndex: number; // 1-based number index
  status: 'available' | 'reserved' | 'paid';
  buyerName: string | null;
  buyerPhone: string | null;
  buyerEmail: string | null;
  reservedAt: string | null;
  paymentId: string | null; // Flow token or transfer reference
  paymentMethod: 'transfer' | 'flow' | 'manual' | null;
}

export interface DatabaseSchema {
  config: RaffleConfig;
  prizes: Prize[];
  tickets: Record<string, Ticket>;
}

// 1. Initialize Supabase Client
let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// If URL is not valid, use dummy fallback for compilation/build safety
if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
  supabaseUrl = 'https://dummy-project.supabase.co';
  supabaseKey = 'dummy-key';
  
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      'ADVERTENCIA: Las variables de entorno de Supabase no están configuradas correctamente. Configure NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  },
  global: {
    fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' as any })
  }
});

// 2. Default Initial State for Autopopulation
const getDefaultConfig = () => ({
  id: 1,
  title: "Gran Rifa Benéfica",
  description: "Participa y apoya nuestra noble causa. Cada número comprado nos ayuda a llegar a la meta. ¡Excelentes premios te esperan!",
  ticket_price: 2000,
  draw_date: "2026-06-30",
  total_lists: 200,
  tickets_per_list: 15,
  admin_email: "felipe.carrasco17@gmail.com",
  admin_password: "AdminRifa2026!",
  bank_name: "Banco Estado",
  account_type: "Cuenta RUT",
  account_number: "12345678",
  rut: "12.345.678-9",
  transfer_email: "felipe.carrasco17@gmail.com",
  flow_api_key: "",
  flow_secret_key: "",
  flow_sandbox_mode: true,
  flow_mock_mode: true
});

const getDefaultPrizes = (): Prize[] => [
  {
    id: "1",
    title: "Primer Premio: $500.000 CLP",
    description: "Medio millón de pesos en efectivo transferido directamente al ganador.",
    imageUrl: "/prizes/cash.jpg"
  },
  {
    id: "2",
    title: "Segundo Premio: Smart TV 55\" 4K",
    description: "Televisor de última generación con resolución 4K y sonido envolvente.",
    imageUrl: "/prizes/tv.jpg"
  },
  {
    id: "3",
    title: "Tercer Premio: Canasta Familiar Premium",
    description: "Completa canasta con productos gourmet y de primera necesidad para disfrutar en familia.",
    imageUrl: "/prizes/basket.jpg"
  }
];

// Helper to chunk array for faster Supabase batch insertion
function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// 3. Thread-safe & Cloud persistent read operations
export async function getDb(): Promise<DatabaseSchema> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase no está configurado. Revisa las variables de entorno.');
  }

  // A. Check if configuration exists
  const { data: configRows, error: configError } = await supabase
    .from('raffle_config')
    .select('*')
    .eq('id', 1);

  if (configError) {
    throw new Error(`Error de lectura en Supabase (config): ${configError.message}`);
  }

  // B. Autopopulate database if no config row is found
  if (!configRows || configRows.length === 0) {
    console.log('Base de datos vacía detectada. Autopoblando tablas de Supabase...');
    
    // 1. Insert Default Config
    const defaultConfig = getDefaultConfig();
    const { error: insConfigErr } = await supabase
      .from('raffle_config')
      .insert(defaultConfig);

    if (insConfigErr) {
      throw new Error(`Error al autopoblar configuración: ${insConfigErr.message}`);
    }

    // 2. Insert Default Prizes
    const defaultPrizes = getDefaultPrizes();
    const { error: insPrizesErr } = await supabase
      .from('raffle_prizes')
      .insert(defaultPrizes.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        image_url: p.imageUrl
      })));

    if (insPrizesErr) {
      throw new Error(`Error al autopoblar premios: ${insPrizesErr.message}`);
    }

    // 3. Generate and Insert 3000 tickets
    const totalLists = defaultConfig.total_lists;
    const ticketsPerList = defaultConfig.tickets_per_list;
    const insertTickets = [];

    for (let l = 1; l <= totalLists; l++) {
      for (let n = 1; n <= ticketsPerList; n++) {
        insertTickets.push({
          id: `${l}-${n}`,
          list_index: l,
          number_index: n,
          status: 'available',
          buyer_name: null,
          buyer_phone: null,
          buyer_email: null,
          reserved_at: null,
          payment_id: null,
          payment_method: null
        });
      }
    }

    // Chunk batch insert in sizes of 500 rows to avoid Supabase query size limits
    const chunks = chunkArray(insertTickets, 500);
    for (const chunk of chunks) {
      const { error: insTicketsErr } = await supabase
        .from('raffle_tickets')
        .insert(chunk);

      if (insTicketsErr) {
        throw new Error(`Error al autopoblar tickets: ${insTicketsErr.message}`);
      }
    }

    console.log('Autopoblación en Supabase completada con éxito.');
    return getDb(); // Re-read initialized database
  }

  // C. Normal load of config, prizes, and tickets from Supabase
  const row = configRows[0];
  const config: RaffleConfig = {
    title: row.title,
    description: row.description,
    ticketPrice: row.ticket_price,
    drawDate: row.draw_date,
    totalLists: row.total_lists,
    ticketsPerList: row.tickets_per_list,
    adminEmail: row.admin_email,
    adminPassword: row.admin_password,
    bankTransferData: {
      bankName: row.bank_name,
      accountType: row.account_type,
      accountNumber: row.account_number,
      rut: row.rut,
      email: row.transfer_email
    },
    flowConfig: {
      apiKey: row.flow_api_key || '',
      secretKey: row.flow_secret_key || '',
      sandboxMode: row.flow_sandbox_mode,
      mockMode: row.flow_mock_mode
    },
    whatsappTemplate: row.whatsapp_template || DEFAULT_WHATSAPP_TEMPLATE,
    reservationExpiryDays: row.reservation_expiry_days !== undefined && row.reservation_expiry_days !== null
      ? Number(row.reservation_expiry_days)
      : 2, // default to 2 days
    discountEnabled: row.discount_enabled !== undefined && row.discount_enabled !== null
      ? Boolean(row.discount_enabled)
      : false,
    discountCombo1Tickets: row.discount_combo1_tickets !== undefined && row.discount_combo1_tickets !== null
      ? Number(row.discount_combo1_tickets)
      : 3,
    discountCombo1Price: row.discount_combo1_price !== undefined && row.discount_combo1_price !== null
      ? Number(row.discount_combo1_price)
      : 5000,
    discountCombo2Tickets: row.discount_combo2_tickets !== undefined && row.discount_combo2_tickets !== null
      ? Number(row.discount_combo2_tickets)
      : 7,
    discountCombo2Price: row.discount_combo2_price !== undefined && row.discount_combo2_price !== null
      ? Number(row.discount_combo2_price)
      : 10000
  };

  const { data: prizesRows, error: prizesError } = await supabase
    .from('raffle_prizes')
    .select('*');

  if (prizesError) {
    throw new Error(`Error al cargar premios desde Supabase: ${prizesError.message}`);
  }

  const prizes: Prize[] = (prizesRows || []).map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    imageUrl: p.image_url
  }));

  let ticketsRows: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: chunk, error: ticketsError } = await supabase
      .from('raffle_tickets')
      .select('*')
      .range(from, from + pageSize - 1);

    if (ticketsError) {
      throw new Error(`Error al cargar tickets desde Supabase: ${ticketsError.message}`);
    }

    if (chunk && chunk.length > 0) {
      ticketsRows = ticketsRows.concat(chunk);
      from += pageSize;
      if (chunk.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  const tickets: Record<string, Ticket> = {};
  for (const t of ticketsRows) {
    // Filtrar dinámicamente tickets huérfanos de configuraciones anteriores de mayor tamaño
    if (t.list_index <= config.totalLists && t.number_index <= config.ticketsPerList) {
      tickets[t.id] = {
        id: t.id,
        listIndex: t.list_index,
        numberIndex: t.number_index,
        status: t.status as any,
        buyerName: t.buyer_name,
        buyerPhone: t.buyer_phone,
        buyerEmail: t.buyer_email,
        reservedAt: t.reserved_at,
        paymentId: t.payment_id,
        paymentMethod: t.payment_method as any
      };
    }
  }

  return { config, prizes, tickets };
}

// 4. Cloud persistent write operations
export async function saveDb(data: DatabaseSchema): Promise<void> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase no está configurado.');
  }

  const updateData: any = {
    title: data.config.title,
    description: data.config.description,
    ticket_price: data.config.ticketPrice,
    draw_date: data.config.drawDate,
    total_lists: data.config.totalLists,
    tickets_per_list: data.config.ticketsPerList,
    admin_email: data.config.adminEmail,
    admin_password: data.config.adminPassword || 'AdminRifa2026!',
    bank_name: data.config.bankTransferData.bankName,
    account_type: data.config.bankTransferData.accountType,
    account_number: data.config.bankTransferData.accountNumber,
    rut: data.config.bankTransferData.rut,
    transfer_email: data.config.bankTransferData.email,
    flow_api_key: data.config.flowConfig.apiKey,
    flow_secret_key: data.config.flowConfig.secretKey,
    flow_sandbox_mode: data.config.flowConfig.sandboxMode,
    flow_mock_mode: data.config.flowConfig.mockMode
  };

  if (data.config.whatsappTemplate !== undefined) {
    updateData.whatsapp_template = data.config.whatsappTemplate;
  }
  if (data.config.reservationExpiryDays !== undefined) {
    updateData.reservation_expiry_days = data.config.reservationExpiryDays;
  }
  if (data.config.discountEnabled !== undefined) {
    updateData.discount_enabled = data.config.discountEnabled;
  }
  if (data.config.discountCombo1Tickets !== undefined) {
    updateData.discount_combo1_tickets = data.config.discountCombo1Tickets;
  }
  if (data.config.discountCombo1Price !== undefined) {
    updateData.discount_combo1_price = data.config.discountCombo1Price;
  }
  if (data.config.discountCombo2Tickets !== undefined) {
    updateData.discount_combo2_tickets = data.config.discountCombo2Tickets;
  }
  if (data.config.discountCombo2Price !== undefined) {
    updateData.discount_combo2_price = data.config.discountCombo2Price;
  }

  const { error: configError } = await supabase
    .from('raffle_config')
    .update(updateData)
    .eq('id', 1);

  if (configError) {
    // Graceful fallback if new columns do not exist in Supabase (detecting 42703 or PostgREST schema cache error)
    const isColumnError = configError.code === '42703' || 
                          configError.message?.includes('column') || 
                          configError.message?.includes('schema cache');

    if (isColumnError) {
      console.warn('Advertencia: Columnas nuevas no existen en Supabase. Guardando sin whatsapp_template, reservation_expiry_days ni combos.');
      delete updateData.whatsapp_template;
      delete updateData.reservation_expiry_days;
      delete updateData.discount_enabled;
      delete updateData.discount_combo1_tickets;
      delete updateData.discount_combo1_price;
      delete updateData.discount_combo2_tickets;
      delete updateData.discount_combo2_price;
      const { error: retryError } = await supabase
        .from('raffle_config')
        .update(updateData)
        .eq('id', 1);
      
      if (retryError) {
        throw new Error(`Error al guardar configuración en Supabase: ${retryError.message}`);
      }
    } else {
      throw new Error(`Error al guardar configuración en Supabase: ${configError.message}`);
    }
  }

  // B. Save Prizes (Delete all first, then insert new ones to keep in sync)
  const { error: delError } = await supabase
    .from('raffle_prizes')
    .delete()
    .neq('id', 'dummy_value_to_delete_all');

  if (delError) {
    throw new Error(`Error al sincronizar premios (clean): ${delError.message}`);
  }

  if (data.prizes.length > 0) {
    const { error: insError } = await supabase
      .from('raffle_prizes')
      .insert(data.prizes.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        image_url: p.imageUrl
      })));

    if (insError) {
      throw new Error(`Error al sincronizar premios (insert): ${insError.message}`);
    }
  }
}

export async function updateDb(
  updater: (db: DatabaseSchema) => DatabaseSchema | Promise<DatabaseSchema>
): Promise<DatabaseSchema> {
  const oldDb = await getDb();
  
  // Clonar el estado original para poder calcular las diferencias reales en memoria
  const oldDbClone = JSON.parse(JSON.stringify(oldDb)) as DatabaseSchema;
  
  const newDb = await updater(oldDb);

  // A. Sift through tickets map to find what changed
  const changedTickets = [];
  for (const [id, ticket] of Object.entries(newDb.tickets)) {
    const oldTicket = oldDbClone.tickets[id];
    
    // Check if ticket is new or modified
    if (!oldTicket || 
        oldTicket.status !== ticket.status || 
        oldTicket.buyerName !== ticket.buyerName || 
        oldTicket.buyerPhone !== ticket.buyerPhone || 
        oldTicket.buyerEmail !== ticket.buyerEmail ||
        oldTicket.paymentId !== ticket.paymentId ||
        oldTicket.paymentMethod !== ticket.paymentMethod
    ) {
      changedTickets.push({
        id: ticket.id,
        list_index: ticket.listIndex,
        number_index: ticket.numberIndex,
        status: ticket.status,
        buyer_name: ticket.buyerName,
        buyer_phone: ticket.buyerPhone,
        buyer_email: ticket.buyerEmail,
        reserved_at: ticket.reservedAt,
        payment_id: ticket.paymentId,
        payment_method: ticket.paymentMethod
      });
    }
  }

  // B. Write modified tickets back in bulk
  if (changedTickets.length > 0) {
    const { error: ticketsError } = await supabase
      .from('raffle_tickets')
      .upsert(changedTickets);

    if (ticketsError) {
      throw new Error(`Error al actualizar tickets en Supabase: ${ticketsError.message}`);
    }
  }

  // C. Sift configuration updates
  if (
    oldDbClone.config.title !== newDb.config.title ||
    oldDbClone.config.description !== newDb.config.description ||
    oldDbClone.config.ticketPrice !== newDb.config.ticketPrice ||
    oldDbClone.config.drawDate !== newDb.config.drawDate ||
    oldDbClone.config.totalLists !== newDb.config.totalLists ||
    oldDbClone.config.ticketsPerList !== newDb.config.ticketsPerList ||
    oldDbClone.config.adminEmail !== newDb.config.adminEmail ||
    oldDbClone.config.adminPassword !== newDb.config.adminPassword ||
    oldDbClone.config.whatsappTemplate !== newDb.config.whatsappTemplate ||
    oldDbClone.config.reservationExpiryDays !== newDb.config.reservationExpiryDays ||
    oldDbClone.config.discountEnabled !== newDb.config.discountEnabled ||
    oldDbClone.config.discountCombo1Tickets !== newDb.config.discountCombo1Tickets ||
    oldDbClone.config.discountCombo1Price !== newDb.config.discountCombo1Price ||
    oldDbClone.config.discountCombo2Tickets !== newDb.config.discountCombo2Tickets ||
    oldDbClone.config.discountCombo2Price !== newDb.config.discountCombo2Price ||
    JSON.stringify(oldDbClone.config.bankTransferData) !== JSON.stringify(newDb.config.bankTransferData) ||
    JSON.stringify(oldDbClone.config.flowConfig) !== JSON.stringify(newDb.config.flowConfig)
  ) {
    await saveDb(newDb);
  }

  return newDb;
}
