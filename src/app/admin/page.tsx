'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getExcelLabel, excelLabelToIndex } from '@/lib/utils';

interface RaffleConfig {
  title: string;
  ticketPrice: number;
  totalLists: number;
  ticketsPerList: number;
  adminEmail: string;
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

  // Manual Assignment Form State
  const [buyerName, setBuyerName] = useState<string>('');
  const [buyerPhone, setBuyerPhone] = useState<string>('');
  const [buyerEmail, setBuyerEmail] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'flow' | 'manual'>('manual');
  const [ticketStatus, setTicketStatus] = useState<'reserved' | 'paid'>('paid');
  const [submitting, setSubmitting] = useState<boolean>(false);

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

  // Assign entire list to a buyer (API call)
  const handleAssignBulkList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerName || !buyerPhone) {
      alert('Nombre y Teléfono son obligatorios.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/tickets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listIndex: selectedList,
          buyerName,
          buyerPhone,
          buyerEmail,
          paymentMethod,
          status: ticketStatus,
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
    setBuyerName(ticket.buyerName || '');
    setBuyerPhone(ticket.buyerPhone || '');
    setBuyerEmail(ticket.buyerEmail || '');
    setPaymentMethod(ticket.paymentMethod || 'manual');
    setTicketStatus(ticket.status === 'paid' ? 'paid' : 'reserved');
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

  // Filter list of tickets for current list
  const currentListTickets = tickets.filter((t) => t.listIndex === selectedList);
  const isListEmpty = currentListTickets.every((t) => t.status === 'available');

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

  const priceFormatter = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

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
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        
        <div className="glass-panel" style={{ padding: '20px', borderBottom: '4px solid var(--success)' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Recaudado (Pagado)</span>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--success)', marginTop: '8px' }}>{priceFormatter.format(totalRaised)}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>{paidTickets} números pagados</p>
        </div>

        <div className="glass-panel" style={{ padding: '20px', borderBottom: '4px solid var(--warning)' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Pendiente (Reservado)</span>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--warning)', marginTop: '8px' }}>{priceFormatter.format(totalReservedPending)}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>{reservedTickets} números reservados</p>
        </div>

        <div className="glass-panel" style={{ padding: '20px', borderBottom: '4px solid var(--primary)' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Ingreso Proyectado</span>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--primary)', marginTop: '8px' }}>{priceFormatter.format(totalProjected)}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>{paidTickets + reservedTickets} de {totalTickets} vendidos</p>
        </div>

        <div className="glass-panel" style={{ padding: '20px', borderBottom: '4px solid #8b5cf6' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Progreso de Ventas</span>
          <h2 style={{ fontSize: '1.8rem', color: '#c084fc', marginTop: '8px' }}>{salesProgressPercent.toFixed(1)}%</h2>
          {/* Progress bar container */}
          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', marginTop: '8px', overflow: 'hidden' }}>
            <div style={{ width: `${salesProgressPercent}%`, height: '100%', background: 'linear-gradient(90deg, var(--secondary) 0%, var(--primary) 100%)', borderRadius: '4px' }} />
          </div>
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
                      {ticket.buyerName.split(' ')[0]}
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
                        <strong>{t.buyerName}</strong>
                        <span className={`badge ${t.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                          {t.status === 'paid' ? 'PAGADO' : 'RESERVADO'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        📞 {t.buyerPhone} | 📧 {t.buyerEmail}
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
                    <span style={{ color: 'var(--text-secondary)' }}>Nombre:</span>
                    <strong>{selectedTicket.buyerName}</strong>

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
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>
              Se registrarán todos los {config.ticketsPerList} números de esta lista (del 1 al {config.ticketsPerList}) a nombre de una sola persona.
            </p>

            <form onSubmit={handleAssignBulkList} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Nombre Completo</label>
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
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Número de Teléfono</label>
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
      `}</style>
    </main>
  );
}
