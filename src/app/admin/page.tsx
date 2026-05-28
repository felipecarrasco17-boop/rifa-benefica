'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getExcelLabel, excelLabelToIndex, calculateTotalPrice } from '@/lib/utils';

const priceFormatter = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

interface RaffleConfig {
  title: string;
  ticketPrice: number;
  totalLists: number;
  ticketsPerList: number;
  adminEmail: string;
  bankTransferData?: {
    bankName: string;
    accountType: string;
    accountNumber: string;
    rut: string;
    email: string;
  };
  reservationExpiryDays?: number;
  whatsappTemplate?: string;
  discountEnabled?: boolean;
  discountCombo1Tickets?: number;
  discountCombo1Price?: number;
  discountCombo2Tickets?: number;
  discountCombo2Price?: number;
}

interface Ticket {
  id: string;
  listIndex: number;
  numberIndex: number;
  status: 'available' | 'reserved' | 'paid';
  buyerName: string | null;
  buyerPhone: string | null;
  buyerEmail: string | null;
  reservedAt: string | null;
  paymentId: string | null;
  paymentMethod: 'transfer' | 'flow' | 'manual' | null;
}

export default function AdminDashboard() {
  const [config, setConfig] = useState<RaffleConfig | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters and Navigation
  const [selectedList, setSelectedList] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals / Details State
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showBulkModal, setShowBulkModal] = useState<boolean>(false);
  const [bulkType, setBulkType] = useState<'responsible' | 'buyer'>('responsible');
  const [isEditingTicket, setIsEditingTicket] = useState<boolean>(false);

  // Manual Assignment Form State
  const [buyerName, setBuyerName] = useState<string>('');
  const [buyerPhone, setBuyerPhone] = useState<string>('');
  const [buyerEmail, setBuyerEmail] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'flow' | 'manual'>('manual');
  const [ticketStatus, setTicketStatus] = useState<'reserved' | 'paid'>('paid');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Helpers for Seller Performance & Name Sanitization
  const parseSellerInfo = (name: string | null) => {
    if (!name) return null;
    const match = name.match(/\[Vendedor:\s*(.*?)(?:\|(.*?))?\]/);
    if (match) {
      return { name: match[1].trim(), phone: match[2]?.trim() || '' };
    }
    return null;
  };

  const cleanBuyerName = (name: string | null) => {
    if (!name) return '';
    if (name.startsWith('Responsable:')) return name;
    const match = name.match(/^(.*?)\s*\[Vendedor:.*\]$/);
    return match ? match[1].trim() : name;
  };

  const formatWhatsAppMessage = (ticket: Ticket) => {
    const defaultTemplate = `Hola {nombre}, te escribo de la Rifa. Tu reserva del número {numero} de la Lista {lista} (ID: {id}) por {precio} está reservada y pendiente de pago.\n\nPuedes transferir a:\nBanco: {banco}\nTipo de Cuenta: {cuenta}\nNúmero: {ncuenta}\nRUT: {rut}\n\nPor favor, respóndenos con el comprobante de transferencia. ¡Muchas gracias!`;
    const template = config?.whatsappTemplate || defaultTemplate;
    
    const buyerNameClean = ticket.buyerName?.startsWith('Responsable:') 
      ? ticket.buyerName.replace('Responsable:', '').trim() 
      : cleanBuyerName(ticket.buyerName);
      
    // Detect other tickets reserved for the same buyer (same clean phone number)
    const cleanPhone = (p: string | null) => p ? p.replace(/[^0-9]/g, '') : '';
    const ticketPhone = cleanPhone(ticket.buyerPhone);
    
    let buyerTickets = [ticket];
    if (ticketPhone) {
      buyerTickets = tickets.filter(t => 
        t.status === 'reserved' && 
        cleanPhone(t.buyerPhone) === ticketPhone
      );
    }
    
    let numeroStr = String(ticket.numberIndex);
    let listaStr = getExcelLabel(ticket.listIndex);
    let idStr = ticket.id;
    let totalPrice = calculateTotalPrice(buyerTickets.length, config);
    
    if (buyerTickets.length > 1) {
      // Sort tickets to make listing look clean
      const sortedTickets = [...buyerTickets].sort((a, b) => {
        if (a.listIndex !== b.listIndex) return a.listIndex - b.listIndex;
        return a.numberIndex - b.numberIndex;
      });
      
      // Numbers: e.g. "4, 5 y 6"
      const numberValues = sortedTickets.map(t => t.numberIndex);
      if (numberValues.length === 2) {
        numeroStr = `${numberValues[0]} y ${numberValues[1]}`;
      } else {
        const lastNum = numberValues.pop();
        numeroStr = `${numberValues.join(', ')} y ${lastNum}`;
      }
      
      // Lists: e.g. "B" or "B y C"
      const listLabels = Array.from(new Set(sortedTickets.map(t => getExcelLabel(t.listIndex))));
      if (listLabels.length === 1) {
        listaStr = listLabels[0];
      } else if (listLabels.length === 2) {
        listaStr = `${listLabels[0]} y ${listLabels[1]}`;
      } else {
        const lastList = listLabels.pop();
        listaStr = `${listLabels.join(', ')} y ${lastList}`;
      }
      
      // IDs
      idStr = sortedTickets.map(t => t.id).join(', ');
    }
      
    return template
      .replace(/{nombre}/g, buyerNameClean || '')
      .replace(/{numero}/g, numeroStr)
      .replace(/{lista}/g, listaStr)
      .replace(/{id}/g, idStr)
      .replace(/{precio}/g, priceFormatter.format(totalPrice))
      .replace(/{banco}/g, config?.bankTransferData?.bankName || '')
      .replace(/{cuenta}/g, config?.bankTransferData?.accountType || '')
      .replace(/{ncuenta}/g, config?.bankTransferData?.accountNumber || '')
      .replace(/{rut}/g, config?.bankTransferData?.rut || '');
  };

  const getListSellerInfo = (listIdx: number) => {
    const listTickets = tickets.filter(t => t.listIndex === listIdx);
    for (const t of listTickets) {
      if (!t.buyerName) continue;
      if (t.buyerName.startsWith('Responsable:')) {
        return {
          name: t.buyerName.replace('Responsable:', '').trim(),
          phone: t.buyerPhone || ''
        };
      }
      const match = parseSellerInfo(t.buyerName);
      if (match) return match;
    }
    return null;
  };

  const sellersPerformance = useMemo(() => {
    if (!config) return [];
    
    const listSellers: Record<number, { name: string; phone: string }> = {};
    for (let l = 1; l <= config.totalLists; l++) {
      const info = getListSellerInfo(l);
      if (info) listSellers[l] = info;
    }

    const sellersMap: Record<string, {
      name: string;
      phone: string;
      lists: number[];
      paidCount: number;
      reservedCount: number;
      totalCount: number;
    }> = {};

    for (const [listIdxStr, seller] of Object.entries(listSellers)) {
      const listIdx = parseInt(listIdxStr, 10);
      const sellerKey = seller.name.toLowerCase().trim();
      
      if (!sellersMap[sellerKey]) {
        sellersMap[sellerKey] = {
          name: seller.name,
          phone: seller.phone,
          lists: [],
          paidCount: 0,
          reservedCount: 0,
          totalCount: 0
        };
      }
      
      if (seller.phone && !sellersMap[sellerKey].phone) {
        sellersMap[sellerKey].phone = seller.phone;
      }
      
      sellersMap[sellerKey].lists.push(listIdx);
      
      const listTickets = tickets.filter(t => t.listIndex === listIdx);
      const paid = listTickets.filter(t => t.status === 'paid').length;
      const reserved = listTickets.filter(t => t.status === 'reserved').length;
      
      sellersMap[sellerKey].paidCount += paid;
      sellersMap[sellerKey].reservedCount += reserved;
      sellersMap[sellerKey].totalCount += config.ticketsPerList;
    }

    return Object.values(sellersMap).sort((a, b) => b.paidCount - a.paidCount);
  }, [tickets, config]);

  const listStats = useMemo(() => {
    if (!config) return {};
    const stats: Record<number, { paid: number; reserved: number; status: 'empty' | 'partial' | 'full' }> = {};
    for (let l = 1; l <= config.totalLists; l++) {
      stats[l] = { paid: 0, reserved: 0, status: 'empty' };
    }
    
    tickets.forEach((t) => {
      if (stats[t.listIndex]) {
        if (t.status === 'paid') stats[t.listIndex].paid++;
        if (t.status === 'reserved') stats[t.listIndex].reserved++;
      }
    });

    for (let l = 1; l <= config.totalLists; l++) {
      const s = stats[l];
      const totalSold = s.paid + s.reserved;
      if (s.paid === config.ticketsPerList) {
        s.status = 'full';
      } else if (totalSold > 0) {
        s.status = 'partial';
      } else {
        s.status = 'empty';
      }
    }
    
    return stats;
  }, [tickets, config]);

  const expiredReservations = useMemo(() => {
    if (!config || tickets.length === 0) return [];
    
    const expiryDays = config.reservationExpiryDays !== undefined ? config.reservationExpiryDays : 2;
    const expiryMs = expiryDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    return tickets.filter((t) => {
      if (t.status !== 'reserved' || !t.reservedAt) return false;
      
      try {
        const reservedTime = new Date(t.reservedAt).getTime();
        if (isNaN(reservedTime)) return false;
        
        return (now - reservedTime) > expiryMs;
      } catch (e) {
        return false;
      }
    });
  }, [tickets, config]);

  const handleSaveTicketEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    if (!buyerName.trim() || !buyerPhone.trim()) {
      alert('Nombre y Teléfono son obligatorios.');
      return;
    }
    
    setSubmitting(true);
    try {
      const sellerInfo = getListSellerInfo(selectedTicket.listIndex);
      const finalBuyerName = sellerInfo 
        ? `${buyerName.trim()} [Vendedor: ${sellerInfo.name}${sellerInfo.phone ? `|${sellerInfo.phone}` : ''}]`
        : buyerName.trim();

      const res = await fetch('/api/tickets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          buyerName: finalBuyerName,
          buyerPhone: buyerPhone.trim(),
          buyerEmail: buyerEmail.trim(),
          status: ticketStatus,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar');
      
      setTickets((prev) =>
        prev.map((t) => (t.id === selectedTicket.id ? data.ticket : t))
      );
      setSelectedTicket(null);
      setIsEditingTicket(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Fetch all config and tickets on mount
  const fetchData = async () => {
    try {
      const configRes = await fetch('/api/config');
      if (!configRes.ok) throw new Error('Error al cargar configuración');
      const configData = await configRes.json();
      setConfig(configData.config);

      const ticketsRes = await fetch('/api/tickets');
      if (!ticketsRes.ok) throw new Error('Error al cargar números');
      const ticketsData = await ticketsRes.json();
      setTickets(ticketsData.tickets);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Update a single ticket status (API call)
  const handleUpdateTicket = async (ticketId: string, updates: Partial<Ticket>) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          ...updates,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar');
      
      // Update local state
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? data.ticket : t))
      );
      setSelectedTicket(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Assign entire list to a responsible or buyer (API call)
  const handleAssignBulkList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerName || !buyerPhone) {
      alert('Nombre y Teléfono son obligatorios.');
      return;
    }
    setSubmitting(true);

    const finalBuyerName = bulkType === 'responsible' 
      ? `Responsable: ${buyerName.trim()}` 
      : buyerName.trim();
    
    const finalStatus = bulkType === 'responsible' 
      ? 'reserved' 
      : ticketStatus;
      
    const finalPaymentMethod = bulkType === 'responsible' 
      ? 'manual' 
      : paymentMethod;

    try {
      const res = await fetch('/api/tickets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listIndex: selectedList,
          buyerName: finalBuyerName,
          buyerPhone,
          buyerEmail: bulkType === 'responsible' ? '' : buyerEmail,
          paymentMethod: finalPaymentMethod,
          status: finalStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al asignar lista');

      // Refresh data
      await fetchData();
      setShowBulkModal(false);
      // Reset form
      setBuyerName('');
      setBuyerPhone('');
      setBuyerEmail('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Release entire list (API call)
  const handleReleaseWholeList = async () => {
    if (!confirm(`¿Estás seguro de que deseas liberar TODOS los números de la lista ${getExcelLabel(selectedList)}?`)) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/tickets/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listIndex: selectedList
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al liberar lista');
      
      await fetchData();
      alert(`Lista ${getExcelLabel(selectedList)} liberada con éxito.`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Manual assign individual ticket (API call)
  const handleAssignManualTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    if (!buyerName || !buyerPhone) {
      alert('Nombre y Teléfono son obligatorios.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketIds: [selectedTicket.id],
          buyerName,
          buyerPhone,
          buyerEmail,
          paymentMethod,
          status: ticketStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al asignar');

      // Update state
      const updatedTicket = data.reservedTickets[0];
      setTickets((prev) =>
        prev.map((t) => (t.id === selectedTicket.id ? updatedTicket : t))
      );
      setSelectedTicket(null);
      // Reset form
      setBuyerName('');
      setBuyerPhone('');
      setBuyerEmail('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Open ticket details modal and initialize form values
  const openTicketModal = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    const seller = parseSellerInfo(ticket.buyerName);
    const isSellerPlaceholder = ticket.buyerName?.startsWith('Responsable:');
    
    setBuyerName(isSellerPlaceholder ? '' : (cleanBuyerName(ticket.buyerName) || ''));
    setBuyerPhone(isSellerPlaceholder ? '' : (ticket.buyerPhone || ''));
    setBuyerEmail(isSellerPlaceholder ? '' : (ticket.buyerEmail || ''));
    setPaymentMethod(ticket.paymentMethod || 'manual');
    setTicketStatus(ticket.status === 'paid' ? 'paid' : 'reserved');
    setIsEditingTicket(false);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '20px' }}>
        <div style={{ width: '50px', height: '50px', border: '5px solid rgba(255,255,255,0.1)', borderTopColor: '#00f2fe', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#9ca3af', fontWeight: '500' }}>Cargando Panel de Administración...</p>
        <style jsx global>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#f3f4f6' }}>
        <h2>Error de conexión</h2>
        <p style={{ color: '#9ca3af', marginTop: '10px' }}>{error || 'No se cargó la configuración.'}</p>
      </div>
    );
  }

  // Calculate KPIs
  const totalTickets = tickets.length;
  const paidTickets = tickets.filter((t) => t.status === 'paid').length;
  const reservedTickets = tickets.filter((t) => t.status === 'reserved').length;
  const availableTickets = tickets.filter((t) => t.status === 'available').length;

  const totalRaised = paidTickets * config.ticketPrice;
  const totalReservedPending = reservedTickets * config.ticketPrice;
  const totalProjected = (paidTickets + reservedTickets) * config.ticketPrice;
  const salesProgressPercent = totalTickets > 0 ? ((paidTickets + reservedTickets) / totalTickets) * 100 : 0;

  // Calcular listas completas vendidas (los 15 tickets pagados)
  let fullListsSold = 0;
  const ticketsByList: Record<number, number> = {};
  for (let i = 1; i <= config.totalLists; i++) {
    ticketsByList[i] = 0;
  }
  tickets.forEach((t) => {
    if (t.status === 'paid') {
      ticketsByList[t.listIndex] = (ticketsByList[t.listIndex] || 0) + 1;
    }
  });
  for (let i = 1; i <= config.totalLists; i++) {
    if (ticketsByList[i] === config.ticketsPerList) {
      fullListsSold++;
    }
  }

  // Filter list of tickets for current list
  const currentListTickets = tickets.filter((t) => t.listIndex === selectedList);
  const isListEmpty = currentListTickets.every((t) => t.status === 'available');

  // Detectar si la lista está asignada masivamente a un responsable (vendedor) o a un comprador único
  const firstTicketInList = currentListTickets[0];
  
  // Es responsable si todos (o al menos uno si hay una asignación bulk inicial) están en estado reserved y su nombre empieza con "Responsable:"
  // Para que sea robusto, verificamos si al menos el primer ticket es de tipo responsable.
  const isListAssignedToResponsible = firstTicketInList && 
    firstTicketInList.status === 'reserved' && 
    (firstTicketInList.buyerName || '').startsWith('Responsable:');

  const responsibleName = isListAssignedToResponsible 
    ? firstTicketInList.buyerName?.replace('Responsable:', '').trim() 
    : '';
  const responsiblePhone = isListAssignedToResponsible 
    ? firstTicketInList.buyerPhone 
    : '';

  // Es comprador único si toda la lista tiene el mismo nombre de comprador no nulo y no empieza con "Responsable:"
  const isListAssignedToSingleBuyer = !isListAssignedToResponsible && 
    currentListTickets.length > 0 && 
    currentListTickets.every(
      (t) => t.status !== 'available' && 
      t.buyerName && 
      t.buyerName === firstTicketInList.buyerName && 
      t.buyerPhone === firstTicketInList.buyerPhone
    );

  const singleBuyerName = isListAssignedToSingleBuyer ? firstTicketInList.buyerName : '';
  const singleBuyerPhone = isListAssignedToSingleBuyer ? firstTicketInList.buyerPhone : '';
  const singleBuyerStatus = isListAssignedToSingleBuyer ? firstTicketInList.status : '';

  // Search Results
  const queryListIndex = excelLabelToIndex(searchQuery);
  const searchResults = searchQuery.trim() !== ''
    ? tickets.filter(
        (t) =>
          t.status !== 'available' &&
          ((t.buyerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (t.buyerPhone || '').includes(searchQuery) ||
            t.id === searchQuery ||
            t.listIndex === queryListIndex ||
            String(t.listIndex) === searchQuery)
      )
    : [];


  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px', width: '100%' }}>
      
      {/* Top Navbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>PANEL DE ORGANIZACIÓN</span>
          <h1 style={{ fontSize: '2rem', marginTop: '4px' }}>Control de Evento Rifa</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link href="/" className="btn-glass" style={{ textDecoration: 'none' }}>
            👁️ Ver Rifa Pública
          </Link>
          <Link href="/admin/settings" className="btn-glass" style={{ textDecoration: 'none' }}>
            ⚙️ Configuración
          </Link>
          <button 
            onClick={async () => {
              await fetch('/api/admin/logout', { method: 'POST' });
              window.location.href = '/admin/login';
            }} 
            className="btn-glass" 
            style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
          >
            🔒 Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Share Link Card */}
      <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', background: 'rgba(0, 242, 254, 0.03)', borderColor: 'rgba(0, 242, 254, 0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.5rem' }}>🔗</span>
          <div>
            <strong style={{ color: '#fff', fontSize: '0.95rem' }}>Enlace para compartir en Redes Sociales:</strong>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
              Los compradores que entren a este enlace verán directamente la rifa y podrán comprar de inmediato sin que se les pida contraseña.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span id="share-link-text" style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.9rem', border: '1px solid var(--border-glass)' }}>
            {typeof window !== 'undefined' ? window.location.origin + '/' : 'http://localhost:3000/'}
          </span>
          <button 
            onClick={() => {
              const link = typeof window !== 'undefined' ? window.location.origin + '/' : 'http://localhost:3000/';
              navigator.clipboard.writeText(link);
              alert('¡Enlace copiado al portapapeles!');
            }}
            className="btn-glow" 
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            📋 Copiar Enlace
          </button>
        </div>
      </div>

      {/* KPI Section */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        
        <div className="glass-panel" style={{ padding: '20px', borderBottom: '4px solid var(--success)' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Recaudado (Pagado)</span>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--success)', marginTop: '8px' }}>{priceFormatter.format(totalRaised)}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>{paidTickets} números pagados efectivamente</p>
        </div>

        <div className="glass-panel" style={{ padding: '20px', borderBottom: '4px solid var(--warning)' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Pendiente (Reservado)</span>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--warning)', marginTop: '8px' }}>{priceFormatter.format(totalReservedPending)}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>{reservedTickets} números reservados por verificar</p>
        </div>

        <div className="glass-panel" style={{ padding: '20px', borderBottom: '4px solid var(--primary)' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Ingreso Proyectado</span>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--primary)', marginTop: '8px' }}>{priceFormatter.format(totalProjected)}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>Total si se completan todas las reservas</p>
        </div>

        <div className="glass-panel" style={{ padding: '20px', borderBottom: '4px solid #8b5cf6' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Progreso de Ventas</span>
          <h2 style={{ fontSize: '1.8rem', color: '#c084fc', marginTop: '8px' }}>{salesProgressPercent.toFixed(1)}%</h2>
          {/* Progress bar container */}
          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', marginTop: '8px', overflow: 'hidden' }}>
            <div style={{ width: `${salesProgressPercent}%`, height: '100%', background: 'linear-gradient(90deg, var(--secondary) 0%, var(--primary) 100%)', borderRadius: '4px' }} />
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px', borderBottom: '4px solid #06b6d4' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Estado de Números</span>
          <h2 style={{ fontSize: '1.8rem', color: '#22d3ee', marginTop: '8px' }}>{paidTickets + reservedTickets} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>/ {totalTickets}</span></h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--success)' }}>🟢 {paidTickets} Pagados</span>
            <span style={{ color: 'var(--warning)' }}>🟡 {reservedTickets} Reservados</span>
            <span style={{ color: '#fff' }}>⚪ {availableTickets} Disp.</span>
          </p>
        </div>

        <div className="glass-panel" style={{ padding: '20px', borderBottom: '4px solid #f97316' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Listas Completas Vendidas</span>
          <h2 style={{ fontSize: '1.8rem', color: '#fb923c', marginTop: '8px' }}>{fullListsSold} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>/ {config.totalLists}</span></h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
            Listas (A-GR) con sus {config.ticketsPerList} números pagados
          </p>
        </div>

      </section>

      {/* Expired Reservations Table */}
      {expiredReservations.length > 0 && (
        <section className="glass-panel" style={{ 
          padding: '24px', 
          marginBottom: '32px', 
          background: 'rgba(239, 68, 68, 0.02)', 
          borderColor: 'rgba(239, 68, 68, 0.3)',
          boxShadow: '0 0 25px rgba(239, 68, 68, 0.03)' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                ⚠️ Control de Reservas Caducadas ({expiredReservations.length})
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px', margin: 0 }}>
                Las siguientes reservas superaron el límite de {config.reservationExpiryDays || 2} días. Elige si liberar el número o renovar su período de gracia.
              </p>
            </div>
            <button
              onClick={async () => {
                if (confirm(`¿Estás seguro de que deseas LIBERAR las ${expiredReservations.length} reservas expiradas de una vez?`)) {
                  setSubmitting(true);
                  let successCount = 0;
                  for (const t of expiredReservations) {
                    try {
                      const res = await fetch('/api/tickets', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ticketId: t.id, status: 'available' })
                      });
                      if (res.ok) successCount++;
                    } catch (e) {
                      console.error(e);
                    }
                  }
                  await fetchData();
                  setSubmitting(false);
                  alert(`Se han liberado ${successCount} boletos exitosamente.`);
                }
              }}
              className="btn-glass"
              style={{ borderColor: 'var(--danger)', color: '#f87171', fontSize: '0.8rem' }}
              disabled={submitting}
            >
              🔓 Liberar Todas Masivamente
            </button>
          </div>

          <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: '8px', background: 'rgba(0,0,0,0.15)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-glass)' }}>
                  <th style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>Boleto</th>
                  <th style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>Comprador</th>
                  <th style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>Teléfono</th>
                  <th style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>Fecha Reserva</th>
                  <th style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>Tiempo Transcurrido</th>
                  <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {expiredReservations.map((t) => {
                  const daysElapsed = t.reservedAt 
                    ? ((Date.now() - new Date(t.reservedAt).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)
                    : '?';
                  const formattedDate = t.reservedAt 
                    ? new Date(t.reservedAt).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : '?';
                    
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 'bold' }}>
                        Lista {getExcelLabel(t.listIndex)} - N° {t.numberIndex}
                      </td>
                      <td style={{ padding: '10px 14px' }}>{cleanBuyerName(t.buyerName)}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>{t.buyerPhone}</td>
                      <td style={{ padding: '10px 14px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formattedDate}</td>
                      <td style={{ padding: '10px 14px', color: '#f87171', fontWeight: '500' }}>{daysElapsed} días</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => handleUpdateTicket(t.id, { status: 'available' })}
                            className="btn-glass"
                            style={{ padding: '4px 8px', fontSize: '0.75rem', borderColor: 'var(--danger)', color: '#f87171' }}
                            disabled={submitting}
                          >
                            Liberar 🔓
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateTicket(t.id, { reservedAt: new Date().toISOString() })}
                            className="btn-glass"
                            style={{ padding: '4px 8px', fontSize: '0.75rem', borderColor: 'var(--success)', color: '#34d399' }}
                            disabled={submitting}
                          >
                            Mantener 🔄
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* List Heatmap Panel */}
      <section className="glass-panel" style={{ padding: '20px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>🗺️ Mapa de Calor de Listas</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px', margin: 0 }}>
              Haz clic en cualquier casilla para ver los números de esa lista en el visualizador.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '2px' }} /> Vacía</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', background: 'rgba(139, 92, 246, 0.15)', border: '1px solid #c084fc', borderRadius: '2px' }} /> En Proceso</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', borderRadius: '2px' }} /> ¡Agotada!</span>
          </div>
        </div>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))', 
          gap: '6px', 
          maxHeight: '180px', 
          overflowY: 'auto',
          paddingRight: '4px'
        }}>
          {Array.from({ length: config.totalLists }, (_, i) => i + 1).map((l) => {
            const stats = listStats[l];
            let bg = 'rgba(255, 255, 255, 0.03)';
            let border = '1px solid rgba(255, 255, 255, 0.08)';
            let color = 'var(--text-secondary)';
            let titleStr = `Lista ${getExcelLabel(l)}: Disponible`;

            if (stats) {
              if (stats.status === 'full') {
                bg = 'rgba(16, 185, 129, 0.2)';
                border = '1px solid #10b981';
                color = '#34d399';
                titleStr = `Lista ${getExcelLabel(l)}: ¡AGOTADA! (15/15 Pagados)`;
              } else if (stats.status === 'partial') {
                const totalSold = stats.paid + stats.reserved;
                bg = 'rgba(139, 92, 246, 0.15)';
                border = '1px solid #c084fc';
                color = '#d8b4fe';
                titleStr = `Lista ${getExcelLabel(l)}: ${stats.paid} Pagados, ${stats.reserved} Reservados`;
              }
            }
            
            if (selectedList === l) {
              border = '2px solid var(--primary)';
              bg = stats?.status === 'full' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(0, 242, 254, 0.15)';
              color = '#fff';
            }

            return (
              <button
                key={l}
                type="button"
                onClick={() => setSelectedList(l)}
                title={titleStr}
                style={{
                  background: bg,
                  border,
                  color,
                  borderRadius: '4px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'var(--transition)',
                }}
              >
                {getExcelLabel(l)}
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Grid: Left List Viewer, Right Search / Logs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px', alignItems: 'start' }} className="admin-grid-layout">
        
        {/* Left Column: Visual List Allocation */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ fontSize: '1.25rem' }}>Visualizador de Lista</h3>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                className="btn-glass" 
                style={{ padding: '6px 12px' }}
                onClick={() => setSelectedList(p => Math.max(1, p - 1))}
                disabled={selectedList <= 1}
              >
                ◀
              </button>
              <input 
                type="text" 
                value={getExcelLabel(selectedList)} 
                onChange={(e) => {
                  const valStr = e.target.value.toUpperCase().trim();
                  const idx = excelLabelToIndex(valStr);
                  if (idx >= 1 && idx <= config.totalLists) {
                    setSelectedList(idx);
                  } else {
                    const idxNum = parseInt(valStr, 10);
                    if (!isNaN(idxNum) && idxNum >= 1 && idxNum <= config.totalLists) {
                      setSelectedList(idxNum);
                    }
                  }
                }}
                className="input-glass"
                style={{ width: '75px', textAlign: 'center', padding: '6px', fontWeight: 'bold' }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>/ {getExcelLabel(config.totalLists)}</span>
              <button 
                className="btn-glass" 
                style={{ padding: '6px 12px' }}
                onClick={() => setSelectedList(p => Math.min(config.totalLists, p + 1))}
                disabled={selectedList >= config.totalLists}
              >
                ▶
              </button>
            </div>
          </div>

          {/* Banner de Asignación Completa (Responsable o Comprador Único) */}
          {isListAssignedToResponsible && (
            <div style={{
              background: 'rgba(139, 92, 246, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              color: '#c084fc',
              padding: '12px 16px',
              borderRadius: '12px',
              marginBottom: '20px',
              fontSize: '0.9rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ flex: '1' }}>
                👤 <strong>Lista asignada a un Responsable / Vendedor:</strong>
                <span style={{ color: '#fff', marginLeft: '6px', fontWeight: 'bold' }}>{responsibleName}</span>
                {responsiblePhone && <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>({responsiblePhone})</span>}
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Todos los números de la lista están reservados para él. Puedes registrar compras individuales haciendo clic en cada número.
                </p>
              </div>
              <button
                onClick={handleReleaseWholeList}
                className="btn-glass"
                style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                disabled={submitting}
              >
                🗑️ Liberar Lista
              </button>
            </div>
          )}

          {isListAssignedToSingleBuyer && (
            <div style={{
              background: singleBuyerStatus === 'paid' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
              border: singleBuyerStatus === 'paid' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
              color: singleBuyerStatus === 'paid' ? '#34d399' : '#fbbf24',
              padding: '12px 16px',
              borderRadius: '12px',
              marginBottom: '20px',
              fontSize: '0.9rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ flex: '1' }}>
                🎯 <strong>Lista comprada por un único dueño:</strong>
                <span style={{ color: '#fff', marginLeft: '6px', fontWeight: 'bold' }}>{singleBuyerName}</span>
                {singleBuyerPhone && <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>({singleBuyerPhone})</span>}
                <span style={{
                  marginLeft: '10px',
                  fontSize: '0.7rem',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: singleBuyerStatus === 'paid' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: singleBuyerStatus === 'paid' ? '#34d399' : '#fbbf24',
                  fontWeight: 'bold'
                }}>
                  {singleBuyerStatus === 'paid' ? 'PAGADO' : 'RESERVADO'}
                </span>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Todos los números de la lista pertenecen a este comprador.
                </p>
              </div>
              <button
                onClick={handleReleaseWholeList}
                className="btn-glass"
                style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                disabled={submitting}
              >
                🗑️ Liberar Lista
              </button>
            </div>
          )}

          {/* List Status Numbers Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {currentListTickets.map((ticket) => {
              let bg = 'rgba(255,255,255,0.03)';
              let border = '1px solid var(--border-glass)';
              let color = 'var(--text-primary)';

              if (ticket.status === 'reserved') {
                bg = 'var(--warning-glow)';
                border = '1px solid var(--warning)';
                color = '#fbbf24';
              } else if (ticket.status === 'paid') {
                bg = 'var(--danger-glow)';
                border = '1px solid var(--danger)';
                color = '#f87171';
              }

              return (
                <div 
                  key={ticket.id}
                  onClick={() => openTicketModal(ticket)}
                  style={{
                    background: bg,
                    border,
                    color,
                    borderRadius: '8px',
                    height: '56px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'var(--transition)',
                    fontSize: '1.1rem',
                    fontWeight: '700'
                  }}
                  className="admin-ticket-cell"
                >
                  <div>{ticket.numberIndex}</div>
                  {ticket.buyerName && (
                    <div style={{ fontSize: '0.65rem', fontWeight: 'normal', color: 'var(--text-secondary)', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(ticket.buyerName.startsWith('Responsable:') 
                        ? ticket.buyerName.replace('Responsable:', '').trim() 
                        : cleanBuyerName(ticket.buyerName)).split(' ')[0]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isListEmpty && (
            <div style={{ textAlign: 'center' }}>
              <button 
                onClick={() => {
                  // Pre-initialize empty form
                  setBuyerName('');
                  setBuyerPhone('');
                  setBuyerEmail('');
                  setPaymentMethod('manual');
                  setTicketStatus('paid');
                  setShowBulkModal(true);
                }} 
                className="btn-glow" 
                style={{ background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)', boxShadow: 'none' }}
              >
                📋 Asignar Lista Completa ({config.ticketsPerList} Números)
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Search Buyer & Action Logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Búsqueda de Comprador</h3>
            <input 
              type="text" 
              placeholder="Buscar por Nombre, Teléfono o Lista..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-glass"
              style={{ marginBottom: '16px' }}
            />

            {searchQuery.trim() !== '' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto' }}>
                {searchResults.length > 0 ? (
                  searchResults.map((t) => (
                    <div 
                      key={t.id} 
                      onClick={() => openTicketModal(t)}
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '12px', cursor: 'pointer', transition: 'var(--transition)' }}
                      className="search-item"
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <strong>
                          {t.buyerName?.startsWith('Responsable:') 
                            ? `Responsable: ${t.buyerName.replace('Responsable:', '').trim()}` 
                            : cleanBuyerName(t.buyerName)}
                        </strong>
                        <span className={`badge ${t.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                          {t.status === 'paid' ? 'PAGADO' : 'RESERVADO'}
                        </span>
                      </div>
                      {parseSellerInfo(t.buyerName) && (
                        <div style={{ fontSize: '0.75rem', color: '#c084fc', marginBottom: '4px' }}>
                          🧑‍💼 Vendedor: {parseSellerInfo(t.buyerName)?.name}
                        </div>
                      )}
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                        <span>📞 {t.buyerPhone}</span>
                        {t.status === 'reserved' && t.buyerPhone && (
                          <a
                            href={`https://api.whatsapp.com/send?phone=${t.buyerPhone.replace(/[^0-9]/g, '')}&text=${encodeURIComponent(
                              formatWhatsAppMessage(t)
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#25D366', textDecoration: 'none', fontSize: '0.7rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '2px', background: 'rgba(37, 211, 102, 0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(37, 211, 102, 0.2)' }}
                          >
                            💬 Cobrar por WhatsApp
                          </a>
                        )}
                        <span>| 📧 {t.buyerEmail || 'Sin registrar'}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: '600', marginTop: '4px' }}>
                        Número: {t.numberIndex} de Lista {getExcelLabel(t.listIndex)} (ID: {t.id})
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>No se encontraron coincidencias.</p>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', margin: '20px 0' }}>
                Digita un nombre, teléfono o número de lista para ver detalles de compras.
              </p>
            )}
          </div>
          
          {/* Panel de Rendimiento de Vendedores */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '4px' }}>Rendimiento de Vendedores</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '16px' }}>
              Seguimiento de ventas por vendedor responsable de lista.
            </p>

            {sellersPerformance.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto' }}>
                {sellersPerformance.map((seller) => {
                  const progress = seller.totalCount > 0 ? (seller.paidCount / seller.totalCount) * 100 : 0;
                  
                  return (
                    <div 
                      key={seller.name}
                      style={{ 
                        background: 'rgba(255,255,255,0.02)', 
                        border: '1px solid var(--border-glass)', 
                        borderRadius: '12px', 
                        padding: '14px',
                        transition: 'var(--transition)'
                      }}
                      className="seller-card"
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div>
                          <strong style={{ fontSize: '0.95rem', color: '#fff' }}>{seller.name}</strong>
                          {seller.phone && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              📞 {seller.phone}
                            </div>
                          )}
                        </div>
                        <span style={{ 
                          fontSize: '0.8rem', 
                          fontWeight: 'bold', 
                          color: '#c084fc', 
                          background: 'rgba(139, 92, 246, 0.1)', 
                          padding: '2px 8px', 
                          borderRadius: '6px' 
                        }}>
                          {progress.toFixed(0)}%
                        </span>
                      </div>

                      {/* Lists badges */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', alignSelf: 'center', marginRight: '4px' }}>
                          Listas:
                        </span>
                        {seller.lists.map((listIdx) => (
                          <button
                            key={listIdx}
                            onClick={() => setSelectedList(listIdx)}
                            className="btn-glass"
                            style={{ 
                              padding: '2px 6px', 
                              fontSize: '0.7rem', 
                              borderRadius: '4px',
                              background: selectedList === listIdx ? 'rgba(0, 242, 254, 0.15)' : 'none',
                              borderColor: selectedList === listIdx ? 'var(--primary)' : 'var(--border-glass)',
                              color: selectedList === listIdx ? '#fff' : 'var(--text-secondary)'
                            }}
                          >
                            {getExcelLabel(listIdx)}
                          </button>
                        ))}
                      </div>

                      {/* Progress bar */}
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '8px' }}>
                        <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #a855f7 0%, #3b82f6 100%)', borderRadius: '3px' }} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                        <span>🟢 {seller.paidCount} Pagados</span>
                        <span>🟡 {seller.reservedCount} Reservados</span>
                        <span>📦 {seller.totalCount} Total</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', margin: '20px 0' }}>
                No hay vendedores activos asignados a listas.
              </p>
            )}
          </div>

          {/* Quick reference card for total tickets statuses */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h4 style={{ fontSize: '1rem', marginBottom: '12px' }}>Estado General del Inventario</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>🟢 Disponibles:</span>
                <strong>{availableTickets} ({((availableTickets/totalTickets)*100).toFixed(0)}%)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>🟡 Reservados:</span>
                <strong>{reservedTickets} ({((reservedTickets/totalTickets)*100).toFixed(0)}%)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>🔴 Pagados:</span>
                <strong>{paidTickets} ({((paidTickets/totalTickets)*100).toFixed(0)}%)</strong>
              </div>
              <div style={{ borderTop: '1px solid var(--border-glass)', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>📦 Total Sorteo:</span>
                <span>{totalTickets} números</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Ticket Details & Modification Modal */}
      {selectedTicket && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 200
        }}>
          <div className="glass-panel" style={{
            background: 'var(--bg-surface-opaque)',
            width: '100%',
            maxWidth: '500px',
            padding: '28px',
            position: 'relative'
          }}>
            <button 
              onClick={() => setSelectedTicket(null)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer' }}
            >
              ✕
            </button>

            <h3 style={{ fontSize: '1.4rem', marginBottom: '4px' }}>Número {selectedTicket.numberIndex} - Lista {getExcelLabel(selectedTicket.listIndex)}</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID Ticket: {selectedTicket.id}</span>

            {/* If ticket is currently available, show manual assignment form */}
            {selectedTicket.status === 'available' ? (
              <form onSubmit={handleAssignManualTicket} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--primary)' }}>Asignar Número Manualmente</h4>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Nombre del Comprador</label>
                  <input 
                    type="text" 
                    required 
                    value={buyerName} 
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="input-glass"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Teléfono (WhatsApp)</label>
                  <input 
                    type="tel" 
                    required 
                    value={buyerPhone} 
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    placeholder="Ej. +56912345678"
                    className="input-glass"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Correo Electrónico (Opcional)</label>
                  <input 
                    type="email" 
                    value={buyerEmail} 
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className="input-glass"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Medio Pago</label>
                    <select 
                      value={paymentMethod} 
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="input-glass"
                    >
                      <option value="manual">Efectivo / Manual</option>
                      <option value="transfer">Transferencia</option>
                      <option value="flow">Flow.cl</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Estado</label>
                    <select 
                      value={ticketStatus} 
                      onChange={(e) => setTicketStatus(e.target.value as any)}
                      className="input-glass"
                    >
                      <option value="paid">Pagado</option>
                      <option value="reserved">Reservado</option>
                    </select>
                  </div>
                </div>

                <button type="submit" className="btn-glow" disabled={submitting} style={{ marginTop: '10px' }}>
                  {submitting ? 'Asignando...' : 'Asignar Número'}
                </button>
              </form>
            ) : isEditingTicket ? (
              <form onSubmit={handleSaveTicketEdit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--primary)' }}>Editar Datos de Comprador</h4>
                
                {getListSellerInfo(selectedTicket.listIndex) && (
                  <div style={{ 
                    background: 'rgba(139, 92, 246, 0.08)', 
                    border: '1px solid rgba(139, 92, 246, 0.2)', 
                    padding: '8px 12px', 
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    color: '#c084fc'
                  }}>
                    🧑‍💼 <strong>Vendedor Responsable:</strong> {getListSellerInfo(selectedTicket.listIndex)?.name}
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Nombre del Comprador</label>
                  <input 
                    type="text" 
                    required 
                    value={buyerName} 
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="input-glass"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Teléfono (WhatsApp)</label>
                  <input 
                    type="tel" 
                    required 
                    value={buyerPhone} 
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    placeholder="Ej. +56912345678"
                    className="input-glass"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Correo Electrónico (Opcional)</label>
                  <input 
                    type="email" 
                    value={buyerEmail} 
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className="input-glass"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Medio Pago</label>
                    <select 
                      value={paymentMethod} 
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="input-glass"
                    >
                      <option value="manual">Efectivo / Manual</option>
                      <option value="transfer">Transferencia</option>
                      <option value="flow">Flow.cl</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Estado</label>
                    <select 
                      value={ticketStatus} 
                      onChange={(e) => setTicketStatus(e.target.value as any)}
                      className="input-glass"
                    >
                      <option value="paid">Pagado</option>
                      <option value="reserved">Reservado</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="submit" className="btn-glow" disabled={submitting} style={{ flex: 1 }}>
                    {submitting ? 'Guardando...' : '💾 Guardar'}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setIsEditingTicket(false)} 
                    className="btn-glass" 
                    style={{ flex: 1 }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              // If ticket is already reserved or paid, show information and modify actions
              <div style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <span className={`badge ${selectedTicket.status === 'paid' ? 'badge-success' : 'badge-warning'}`} style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
                    {selectedTicket.status === 'paid' ? '🔥 PAGADO' : '⏳ RESERVADO'}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Pago: <strong>{selectedTicket.paymentMethod?.toUpperCase() || 'MOCK'}</strong>
                  </span>
                </div>

                <div className="glass-panel" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', marginBottom: '24px', fontSize: '0.9rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '8px 12px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {selectedTicket.buyerName?.startsWith('Responsable:') ? 'Responsable:' : 'Comprador:'}
                    </span>
                    <strong>
                      {selectedTicket.buyerName?.startsWith('Responsable:') 
                        ? selectedTicket.buyerName.replace('Responsable:', '').trim() 
                        : cleanBuyerName(selectedTicket.buyerName)}
                    </strong>

                    {parseSellerInfo(selectedTicket.buyerName) && (
                      <>
                        <span style={{ color: '#a855f7' }}>Vendedor:</span>
                        <strong style={{ color: '#c084fc' }}>
                          {parseSellerInfo(selectedTicket.buyerName)?.name}
                          {parseSellerInfo(selectedTicket.buyerName)?.phone && ` (${parseSellerInfo(selectedTicket.buyerName)?.phone})`}
                        </strong>
                      </>
                    )}

                    <span style={{ color: 'var(--text-secondary)' }}>Teléfono:</span>
                    <strong>{selectedTicket.buyerPhone}</strong>

                    <span style={{ color: 'var(--text-secondary)' }}>Correo:</span>
                    <strong>{selectedTicket.buyerEmail || 'Sin registrar'}</strong>

                    <span style={{ color: 'var(--text-secondary)' }}>Fecha:</span>
                    <span>{new Date(selectedTicket.reservedAt || '').toLocaleString('es-CL')}</span>

                    {selectedTicket.paymentId && (
                      <>
                        <span style={{ color: 'var(--text-secondary)' }}>Transacción:</span>
                        <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {selectedTicket.paymentId}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedTicket.status === 'reserved' && (
                    <button 
                      onClick={() => handleUpdateTicket(selectedTicket.id, { status: 'paid' })}
                      className="btn-glow"
                      disabled={submitting}
                      style={{ background: 'var(--success)', border: 'none', boxShadow: 'none' }}
                    >
                      💳 Confirmar Recibo de Pago (Marcar Pagado)
                    </button>
                  )}
                  
                  {selectedTicket.status === 'reserved' && selectedTicket.buyerPhone && (
                    <a
                      href={`https://api.whatsapp.com/send?phone=${selectedTicket.buyerPhone.replace(/[^0-9]/g, '')}&text=${encodeURIComponent(
                        formatWhatsAppMessage(selectedTicket)
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-glass"
                      style={{ 
                        textDecoration: 'none', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '8px', 
                        borderColor: '#25D366', 
                        color: '#25D366', 
                        background: 'rgba(37, 211, 102, 0.05)',
                        fontWeight: 'bold',
                        textAlign: 'center'
                      }}
                    >
                      💬 Enviar Cobro por WhatsApp
                    </a>
                  )}
                  
                  <button 
                    onClick={() => setIsEditingTicket(true)}
                    className="btn-glow"
                    style={{ background: 'var(--primary)', border: 'none', boxShadow: 'none' }}
                  >
                    📝 Editar Datos de Comprador
                  </button>

                  <button 
                    onClick={() => handleUpdateTicket(selectedTicket.id, { status: 'available' })}
                    className="btn-glass"
                    disabled={submitting}
                    style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  >
                    🗑️ Liberar Número (Volver a Disponible)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk Assignment Modal (Whole List) */}
      {showBulkModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 200
        }}>
          <div className="glass-panel" style={{
            background: 'var(--bg-surface-opaque)',
            width: '100%',
            maxWidth: '500px',
            padding: '28px',
            position: 'relative'
          }}>
            <button 
              onClick={() => setShowBulkModal(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer' }}
            >
              ✕
            </button>

            <h3 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Asignar Lista {getExcelLabel(selectedList)} Completa</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Registra todos los {config.ticketsPerList} números de esta lista (del 1 al {config.ticketsPerList}) de forma masiva.
            </p>

            {/* Selector de Tipo de Asignación */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <button
                type="button"
                onClick={() => {
                  setBulkType('responsible');
                  setPaymentMethod('manual');
                  setTicketStatus('reserved');
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: bulkType === 'responsible' ? 'var(--primary)' : 'none',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.8rem',
                  transition: 'background 0.2s'
                }}
              >
                🧑‍💼 Responsable / Vendedor
              </button>
              <button
                type="button"
                onClick={() => setBulkType('buyer')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: bulkType === 'buyer' ? 'var(--primary)' : 'none',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.8rem',
                  transition: 'background 0.2s'
                }}
              >
                🛒 Comprador Único
              </button>
            </div>

            <form onSubmit={handleAssignBulkList} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {bulkType === 'responsible' ? (
                // FORMULARIO DE RESPONSABLE
                <>
                  <div style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '12px', marginBottom: '4px' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Asigna la lista a un colaborador para que la venda con sus conocidos. Los números quedarán **Reservados** y podrás editar cada comprador manualmente más tarde.
                    </p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Nombre del Responsable / Vendedor</label>
                    <input 
                      type="text" 
                      required 
                      value={buyerName} 
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                      className="input-glass"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Teléfono del Responsable</label>
                    <input 
                      type="tel" 
                      required 
                      value={buyerPhone} 
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="Ej. +56912345678"
                      className="input-glass"
                    />
                  </div>
                </>
              ) : (
                // FORMULARIO DE COMPRADOR ÚNICO
                <>
                  <div style={{ borderLeft: '3px solid var(--secondary)', paddingLeft: '12px', marginBottom: '4px' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Vende o reserva la lista completa a un único cliente dueño de todos los números.
                    </p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Nombre del Comprador</label>
                    <input 
                      type="text" 
                      required 
                      value={buyerName} 
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Ej. María Gómez"
                      className="input-glass"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Número de Teléfono</label>
                    <input 
                      type="tel" 
                      required 
                      value={buyerPhone} 
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="Ej. +56998765432"
                      className="input-glass"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Correo Electrónico (Opcional)</label>
                    <input 
                      type="email" 
                      value={buyerEmail} 
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      placeholder="ejemplo@correo.com"
                      className="input-glass"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Medio de Pago</label>
                      <select 
                        value={paymentMethod} 
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="input-glass"
                      >
                        <option value="manual">Efectivo / Manual</option>
                        <option value="transfer">Transferencia</option>
                        <option value="flow">Flow.cl</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Estado</label>
                      <select 
                        value={ticketStatus} 
                        onChange={(e) => setTicketStatus(e.target.value as any)}
                        className="input-glass"
                      >
                        <option value="paid">Pagado</option>
                        <option value="reserved">Reservado</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              <button type="submit" className="btn-glow" disabled={submitting} style={{ marginTop: '12px', width: '100%' }}>
                {submitting ? 'Asignando lista...' : 'Confirmar Asignación Completa'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Styled JSX layout constraints */}
      <style jsx>{`
        @media (min-width: 992px) {
          .admin-grid-layout {
            grid-template-columns: 2fr 1fr !important;
          }
        }
        .admin-ticket-cell:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.25) !important;
        }
        .search-item:hover {
          border-color: var(--primary) !important;
          background: rgba(255, 255, 255, 0.04) !important;
        }
        .seller-card:hover {
          border-color: rgba(139, 92, 246, 0.3) !important;
          background: rgba(255, 255, 255, 0.04) !important;
        }
      `}</style>
    </main>
  );
}
