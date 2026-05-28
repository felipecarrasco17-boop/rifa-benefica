'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getExcelLabel, excelLabelToIndex, calculateTotalPrice } from '@/lib/utils';

interface RaffleConfig {
  title: string;
  description: string;
  ticketPrice: number;
  drawDate: string;
  totalLists: number;
  ticketsPerList: number;
  adminEmail: string;
  bankTransferData: {
    bankName: string;
    accountType: string;
    accountNumber: string;
    rut: string;
    email: string;
  };
  discountEnabled?: boolean;
  discountCombo1Tickets?: number;
  discountCombo1Price?: number;
  discountCombo2Tickets?: number;
  discountCombo2Price?: number;
}

interface Prize {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
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
}

export default function PublicHome() {
  const [config, setConfig] = useState<RaffleConfig | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedList, setSelectedList] = useState<number>(1);
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [showCheckoutModal, setShowCheckoutModal] = useState<boolean>(false);
  const [buyerName, setBuyerName] = useState<string>('');
  const [buyerPhone, setBuyerPhone] = useState<string>('');
  const [buyerEmail, setBuyerEmail] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'flow'>('flow');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [checkoutResult, setCheckoutResult] = useState<{
    success: boolean;
    message?: string;
    transferDetails?: any;
    ticketIds?: string[];
  } | null>(null);

  // Countdown timer State
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  // Public Ticket Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Receipt Retrieval Modal State
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [receiptTickets, setReceiptTickets] = useState<any[]>([]);

  const handlePublicSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (query.length < 4) {
      setSearchError('Por favor ingresa al menos 4 caracteres para buscar (ej. tu teléfono o email).');
      return;
    }
    setSearching(true);
    setSearchError(null);
    setHasSearched(true);
    try {
      const res = await fetch(`/api/tickets?search=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al realizar la búsqueda.');
      setSearchResults(data.tickets || []);
    } catch (err: any) {
      setSearchError(err.message);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Fetch initial configuration & prizes
  useEffect(() => {
    async function initData() {
      try {
        const configRes = await fetch('/api/config');
        if (!configRes.ok) throw new Error('Error al obtener la configuración');
        const configData = await configRes.json();
        setConfig(configData.config);
        setPrizes(configData.prizes);

        // Fetch tickets for list 1 initially
        await fetchTicketsForList(1);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    initData();
  }, []);

  // Fetch tickets whenever list index changes
  async function fetchTicketsForList(listIndex: number) {
    try {
      const ticketsRes = await fetch(`/api/tickets?listIndex=${listIndex}`);
      if (!ticketsRes.ok) throw new Error('Error al obtener los números');
      const ticketsData = await ticketsRes.json();
      setTickets(ticketsData.tickets);
    } catch (err: any) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (config) {
      fetchTicketsForList(selectedList);
    }
  }, [selectedList]);

  // Countdown logic
  useEffect(() => {
    if (!config?.drawDate) return;
    const target = new Date(config.drawDate).getTime();

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const difference = target - now;

      if (difference <= 0) {
        clearInterval(interval);
        setTimeLeft(null);
      } else {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);
        setTimeLeft({ days, hours, minutes, seconds });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [config?.drawDate]);

  // Toggle ticket selection
  const handleTicketClick = (ticket: Ticket) => {
    if (ticket.status !== 'available') return;
    
    setSelectedNumbers((prev) => {
      if (prev.includes(ticket.id)) {
        return prev.filter((id) => id !== ticket.id);
      } else {
        return [...prev, ticket.id];
      }
    });
  };

  // Select all available tickets in the current list
  const handleBuyWholeList = () => {
    const availableInList = tickets
      .filter((t) => t.status === 'available')
      .map((t) => t.id);

    if (availableInList.length === 0) return;

    setSelectedNumbers((prev) => {
      // Add all from this list that aren't already selected
      const filteredPrev = prev.filter((id) => !id.startsWith(`${selectedList}-`));
      return [...filteredPrev, ...availableInList];
    });
  };

  // Submit checkout
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedNumbers.length === 0) return;
    if (!buyerName || !buyerPhone) {
      alert('Por favor completa los campos de Nombre y Teléfono.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (paymentMethod === 'flow') {
        // Redirection Flow
        const response = await fetch('/api/payment/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketIds: selectedNumbers,
            buyerName,
            buyerPhone,
            buyerEmail,
          }),
        });

        const resData = await response.json();
        if (!response.ok) throw new Error(resData.error || 'Error al iniciar el pago');

        // Redirect user to Flow page or mock page
        window.location.href = resData.redirectUrl;
      } else {
        // Bank Transfer (Manual verification)
        const response = await fetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketIds: selectedNumbers,
            buyerName,
            buyerPhone,
            buyerEmail,
            paymentMethod: 'transfer',
            status: 'reserved',
          }),
        });

        const resData = await response.json();
        if (!response.ok) throw new Error(resData.error || 'Error al guardar la reserva');

        setCheckoutResult({
          success: true,
          message: '¡Reserva completada con éxito! Por favor realiza la transferencia bancaria para confirmar tus números.',
          transferDetails: config?.bankTransferData,
          ticketIds: selectedNumbers,
        });
        setSelectedNumbers([]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '20px' }}>
        <div style={{ width: '50px', height: '50px', border: '5px solid rgba(255,255,255,0.1)', borderTopColor: '#00f2fe', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#9ca3af', fontWeight: '500' }}>Cargando detalles de la rifa...</p>
        <style jsx global>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#f3f4f6' }}>
        <h2>Error al inicializar la rifa</h2>
        <p style={{ color: '#9ca3af', marginTop: '10px' }}>No se pudo conectar al servidor de datos.</p>
      </div>
    );
  }

  // Calculate sold statistics for progress bar
  // Ideally, this should come from API, but we can compute it on mount or mock it.
  // For a nice feeling, let's hardcode some placeholder/accumulated metrics or fetch all tickets status in background.
  const totalNumbers = config.totalLists * config.ticketsPerList;
  const priceFormatter = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px', width: '100%', position: 'relative' }}>
      
      {/* Background Orbs */}
      <div style={{ position: 'absolute', top: '-10%', left: '10%', width: '300px', height: '300px', background: 'radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)', zIndex: -1 }} />
      <div style={{ position: 'absolute', top: '30%', right: '10%', width: '400px', height: '400px', background: 'radial-gradient(circle, var(--secondary-glow) 0%, transparent 70%)', zIndex: -1 }} />

      {/* Header / Hero Section */}
      <header className="glass-panel" style={{ padding: '40px 24px', textAlign: 'center', marginBottom: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h1 className="gradient-text" style={{ fontSize: '2.5rem', marginBottom: '16px', fontWeight: '800' }}>
          {config.title}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '700px', lineHeight: '1.6', marginBottom: '24px' }}>
          {config.description}
        </p>

        {/* Countdown Timer */}
        {timeLeft ? (
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '32px', flexWrap: 'wrap' }}>
            {[
              { val: timeLeft.days, label: 'Días' },
              { val: timeLeft.hours, label: 'Horas' },
              { val: timeLeft.minutes, label: 'Minutos' },
              { val: timeLeft.seconds, label: 'Segundos' },
            ].map((item, idx) => (
              <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)', borderRadius: '12px', minWidth: '80px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--primary)' }}>{String(item.val).padStart(2, '0')}</div>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: '600' }}>{item.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: 'var(--success-glow)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '10px 24px', color: '#10b981', fontWeight: '600', marginBottom: '32px' }}>
            📅 ¡El sorteo está programado para el {new Date(config.drawDate).toLocaleDateString('es-CL')}!
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
          <span className="badge badge-info" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
            Valor por Número: {priceFormatter.format(config.ticketPrice)}
          </span>
          {config.discountEnabled && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' }}>
              {config.discountCombo1Tickets && config.discountCombo1Price && (
                <span className="badge badge-success" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '20px', fontWeight: '600' }}>
                  🔥 Pack {config.discountCombo1Tickets}: {priceFormatter.format(config.discountCombo1Price)}
                </span>
              )}
              {config.discountCombo2Tickets && config.discountCombo2Price && (
                <span className="badge badge-success" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '20px', fontWeight: '600' }}>
                  🔥 Pack {config.discountCombo2Tickets}: {priceFormatter.format(config.discountCombo2Price)}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Prizes Catalog */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '1.6rem', marginBottom: '20px', textAlign: 'center', fontWeight: '700' }}>🏆 Premios a Sortear</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          {prizes.map((prize, idx) => (
            <div key={prize.id} className="glass-panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Prize Icon/Graphics Instead of actual images to look sleek */}
              <div style={{ height: '140px', background: `linear-gradient(135deg, rgba(127, 0, 255, 0.2) 0%, rgba(0, 242, 254, 0.2) 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.4)', borderRadius: '20px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: '700', color: 'var(--primary)' }}>
                  #{idx + 1} Lugar
                </div>
                {idx === 0 ? '💰' : idx === 1 ? '📺' : '🎁'}
              </div>
              <div style={{ padding: '20px', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', color: '#fff' }}>{prize.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', flexGrow: 1 }}>{prize.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Selector Section */}
      <section className="glass-panel" style={{ padding: '32px 24px', marginBottom: '64px' }}>
        <h2 style={{ fontSize: '1.6rem', marginBottom: '24px', textAlign: 'center', fontWeight: '700' }}>🎟️ Elige tus Números</h2>

        {/* List Navigator */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="btn-glass" 
              style={{ padding: '8px 16px' }}
              onClick={() => setSelectedList((p) => Math.max(1, p - 1))}
              disabled={selectedList <= 1}
            >
              ◀
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '150px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Lista Seleccionada</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
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
                  style={{ width: '80px', textAlign: 'center', fontSize: '1.2rem', padding: '4px', fontWeight: 'bold' }}
                />
                <span style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>/ {getExcelLabel(config.totalLists)}</span>
              </div>
            </div>
            <button 
              className="btn-glass" 
              style={{ padding: '8px 16px' }}
              onClick={() => setSelectedList((p) => Math.min(config.totalLists, p + 1))}
              disabled={selectedList >= config.totalLists}
            >
              ▶
            </button>
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.03)' }} />
              <span>Disponible</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: 'var(--warning)', opacity: 0.8 }} />
              <span>Reservado</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: 'var(--danger)', opacity: 0.8 }} />
              <span>Pagado</span>
            </div>
          </div>
        </div>

        {/* Number Selector Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: '16px', maxWidth: '600px', margin: '0 auto 32px' }}>
          {tickets.map((ticket) => {
            const isSelected = selectedNumbers.includes(ticket.id);
            let bg = 'rgba(255,255,255,0.03)';
            let borderColor = 'var(--border-glass)';
            let textColor = 'var(--text-primary)';
            let cursor = 'pointer';

            if (ticket.status === 'reserved') {
              bg = 'var(--warning-glow)';
              borderColor = 'rgba(245, 158, 11, 0.4)';
              textColor = '#fbbf24';
              cursor = 'not-allowed';
            } else if (ticket.status === 'paid') {
              bg = 'var(--danger-glow)';
              borderColor = 'rgba(239, 68, 68, 0.4)';
              textColor = '#f87171';
              cursor = 'not-allowed';
            } else if (isSelected) {
              bg = 'linear-gradient(135deg, #7f00ff 0%, #00f2fe 100%)';
              borderColor = 'transparent';
              textColor = '#fff';
            }

            return (
              <div 
                key={ticket.id}
                onClick={() => handleTicketClick(ticket)}
                style={{
                  background: bg,
                  border: '1px solid ' + borderColor,
                  borderRadius: '12px',
                  height: '70px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.3rem',
                  fontWeight: '700',
                  color: textColor,
                  cursor,
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? '0 4px 12px rgba(0, 242, 254, 0.3)' : 'none',
                  transform: isSelected ? 'scale(1.05)' : 'none',
                  userSelect: 'none'
                }}
                className={ticket.status === 'available' ? 'ticket-cell' : ''}
              >
                {ticket.numberIndex}
              </div>
            );
          })}
        </div>

        {/* Action: Buy Whole List */}
        <div style={{ textAlign: 'center' }}>
          <button 
            className="btn-glass"
            style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
            onClick={handleBuyWholeList}
            disabled={tickets.every((t) => t.status !== 'available')}
          >
            📋 Comprar Lista Completa ({config.ticketsPerList} números)
          </button>
        </div>
      </section>

      {/* Public Search Reservation Section */}
      <section className="glass-panel" style={{ padding: '32px 24px', marginBottom: '64px' }}>
        <h2 style={{ fontSize: '1.6rem', marginBottom: '12px', textAlign: 'center', fontWeight: '700' }}>🔍 Consultar mis Números Reservados/Comprados</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', textAlign: 'center', marginBottom: '24px', maxWidth: '600px', margin: '0 auto 24px' }}>
          ¿Ya realizaste una reserva o compra? Ingresa el teléfono o correo electrónico con el que registraste tu compra para verificar el estado de tus números.
        </p>

        <form onSubmit={handlePublicSearch} style={{ maxWidth: '500px', margin: '0 auto 20px', display: 'flex', gap: '12px' }}>
          <input 
            type="text" 
            placeholder="Ej: +56912345678 o tu@correo.com"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-glass"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-glow" disabled={searching} style={{ padding: '0 24px', height: '46px', whiteSpace: 'nowrap' }}>
            {searching ? 'Buscando...' : 'Consultar'}
          </button>
        </form>

        {searchError && (
          <div style={{ background: 'var(--danger-glow)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', maxWidth: '500px', margin: '0 auto 20px', textAlign: 'center' }}>
            ⚠️ {searchError}
          </div>
        )}

        {hasSearched && !searching && (
          <div style={{ maxWidth: '600px', margin: '20px auto 0' }}>
            {searchResults.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <h4 style={{ fontSize: '1rem', color: 'var(--primary)', margin: 0 }}>Números encontrados ({searchResults.length}):</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptTickets(searchResults);
                      setShowReceiptModal(true);
                    }}
                    className="btn-glow"
                    style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'linear-gradient(135deg, #00f2fe 0%, #a855f7 100%)', margin: 0 }}
                  >
                    🎫 Ver Comprobante / Boleto Digital
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
                  {searchResults.map((t) => (
                    <div key={t.id} style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#fff' }}>
                          Número {t.numberIndex} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>de Lista {getExcelLabel(t.listIndex)}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Registrado a: {t.buyerName}
                        </div>
                      </div>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 'bold', 
                        padding: '4px 10px', 
                        borderRadius: '6px', 
                        background: t.status === 'paid' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: t.status === 'paid' ? '#34d399' : '#fbbf24',
                        border: t.status === 'paid' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
                      }}>
                        {t.status === 'paid' ? '🟢 PAGADO' : '🟡 RESERVADO'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-glass)', padding: '20px', borderRadius: '12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                📭 No se encontraron números reservados o pagados asociados a ese contacto. Asegúrate de escribirlo exactamente como lo registraste.
              </div>
            )}
          </div>
        )}
      </section>

      {/* Floating Cart */}
      {selectedNumbers.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: '600px',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '16px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
          zIndex: 100
        }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>NÚMEROS SELECCIONADOS</div>
            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff', marginTop: '4px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedNumbers.map(id => id.split('-')[1]).join(', ')} (Lista {getExcelLabel(selectedList)})
            </div>
          </div>
          <button 
            className="btn-glow"
            onClick={() => setShowCheckoutModal(true)}
            style={{ padding: '10px 20px', fontSize: '0.9rem' }}
          >
            Pagar {priceFormatter.format(calculateTotalPrice(selectedNumbers.length, config))}
          </button>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckoutModal && (
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
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            position: 'relative'
          }}>
            <button 
              onClick={() => {
                setShowCheckoutModal(false);
                setCheckoutResult(null);
              }}
              style={{
                position: 'absolute',
                top: '16px', right: '16px',
                background: 'none', border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '1.5rem', cursor: 'pointer'
              }}
            >
              ✕
            </button>

            {!checkoutResult ? (
              <>
                <h3 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Finalizar Compra</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                  Has seleccionado {selectedNumbers.length} números por un valor total de <strong>{priceFormatter.format(calculateTotalPrice(selectedNumbers.length, config))}</strong>.
                </p>

                {error && (
                  <div style={{ background: 'var(--danger-glow)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '20px' }}>
                    ⚠️ {error}
                  </div>
                )}

                <form onSubmit={handleCheckoutSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Número de Teléfono (WhatsApp)</label>
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
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                      Si no posees correo, se usará el correo del administrador de forma automática.
                    </small>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '10px', fontWeight: '600' }}>Método de Pago</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div 
                        onClick={() => setPaymentMethod('flow')}
                        style={{
                          border: `1px solid ${paymentMethod === 'flow' ? 'var(--primary)' : 'var(--border-glass)'}`,
                          background: paymentMethod === 'flow' ? 'rgba(0, 242, 254, 0.05)' : 'rgba(255,255,255,0.01)',
                          borderRadius: '8px', padding: '12px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>💳</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>Tarjeta / Webpay</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Pago online por Flow.cl</div>
                      </div>

                      <div 
                        onClick={() => setPaymentMethod('transfer')}
                        style={{
                          border: `1px solid ${paymentMethod === 'transfer' ? 'var(--primary)' : 'var(--border-glass)'}`,
                          background: paymentMethod === 'transfer' ? 'rgba(0, 242, 254, 0.05)' : 'rgba(255,255,255,0.01)',
                          borderRadius: '8px', padding: '12px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>🏦</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>Transferencia</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Datos para transferencia</div>
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    className="btn-glow" 
                    disabled={submitting}
                    style={{ marginTop: '12px', width: '100%' }}
                  >
                    {submitting ? 'Procesando...' : paymentMethod === 'flow' ? 'Ir a pagar (Flow.cl)' : 'Reservar y ver datos de transferencia'}
                  </button>
                </form>
              </>
            ) : (
              // Transfer Success details
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px' }} className="no-print">🎉</div>
                <h3 style={{ fontSize: '1.4rem', marginBottom: '12px', color: 'var(--success)' }} className="no-print">¡Reserva Exitosa!</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px', lineHeight: '1.5' }} className="no-print">
                  {checkoutResult.message}
                </p>

                {/* Premium Digital Ticket */}
                <div className="print-area" style={{
                  background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
                  border: '2px solid rgba(0, 242, 254, 0.25)',
                  boxShadow: '0 0 30px rgba(0, 242, 254, 0.15)',
                  borderRadius: '16px',
                  padding: '24px',
                  position: 'relative',
                  marginBottom: '24px',
                  textAlign: 'left',
                  overflow: 'hidden'
                }}>
                  {/* Notches on sides */}
                  <div style={{ position: 'absolute', top: '50%', left: '-12px', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(15, 23, 42, 1)', borderRight: '2px solid rgba(0, 242, 254, 0.25)', transform: 'translateY(-50%)' }} />
                  <div style={{ position: 'absolute', top: '50%', right: '-12px', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(15, 23, 42, 1)', borderLeft: '2px solid rgba(0, 242, 254, 0.25)', transform: 'translateY(-50%)' }} />
                  
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px dashed rgba(255,255,255,0.15)', paddingBottom: '16px', marginBottom: '16px' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' }}>BOLETO OFICIAL DE RIFA</span>
                      <h4 style={{ fontSize: '1.2rem', color: '#fff', margin: '4px 0 0 0', fontWeight: 'bold' }}>{config.title}</h4>
                    </div>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 'bold', 
                      padding: '4px 10px', 
                      borderRadius: '6px', 
                      background: 'rgba(245, 158, 11, 0.15)', 
                      color: '#fbbf24',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      whiteSpace: 'nowrap'
                    }}>
                      🟡 RESERVADO
                    </span>
                  </div>

                  {/* Info grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Comprador:</span>
                        <div style={{ fontSize: '1rem', color: '#fff', fontWeight: 'bold' }}>{buyerName}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Teléfono:</span>
                        <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: '500' }}>{buyerPhone}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fecha Sorteo:</span>
                        <div style={{ fontSize: '0.85rem', color: '#fff' }}>{new Date(config.drawDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                      </div>
                    </div>
                    
                    {/* Decorative QR */}
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', borderRadius: '12px' }} className="no-print">
                      <svg width="60" height="60" viewBox="0 0 29 29" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
                        <path d="M1 1h6v6H1V1zm0 21h6v6H1v-6zm21 0h6v6h-6v-6zM21 1h6v6h-6V1z" fill="currentColor" />
                        <path d="M12 2h2v4h-2V2zm3 0h2v1h-2V2zm0 3h2v2h-2V5zm-3 8h2v2h-2v-2zm3 0h3v1h-3v-1zm5 0h2v4h-2v-4zm-5 3h2v2h-2v-2zm-3 3h2v2h-2v-2zm3 0h2v3h-2v-3zm3 0h2v1h-2v-1zm3 0h2v3h-2v-3zm-9 3h2v2H9v-2zm3 0h2v1h-2v-1zm5 0h2v2h-2v-2zm-9 3h3v1H8v-1zm5 0h2v2h-2v-2zm3 0h2v1h-2v-1z" fill="currentColor" />
                      </svg>
                    </div>
                  </div>

                  {/* Tickets section */}
                  <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px dashed rgba(255,255,255,0.15)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Números Reservados:</span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {checkoutResult.ticketIds?.map((id) => {
                        const parts = id.split('-');
                        const listLabel = getExcelLabel(parseInt(parts[0], 10));
                        const numLabel = parts[1];
                        return (
                          <div key={id} style={{
                            background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.1) 0%, transparent 100%)',
                            border: '1px solid var(--primary)',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <span>Lista {listLabel}</span>
                            <span style={{ color: 'var(--primary)' }}>•</span>
                            <span>N° {numLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-glow no-print"
                  style={{
                    marginBottom: '24px',
                    width: '100%',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)'
                  }}
                >
                  🖨️ Descargar Boleto / Guardar PDF
                </button>

                {/* Transfer data block */}
                <div className="glass-panel no-print" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', textAlign: 'left', borderRadius: '12px', marginBottom: '24px', fontSize: '0.9rem' }}>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '12px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '6px' }}>Datos para Transferencia:</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '8px 12px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Banco:</span>
                    <strong>{checkoutResult.transferDetails?.bankName}</strong>
                    
                    <span style={{ color: 'var(--text-secondary)' }}>Tipo:</span>
                    <strong>{checkoutResult.transferDetails?.accountType}</strong>
                    
                    <span style={{ color: 'var(--text-secondary)' }}>Número:</span>
                    <strong>{checkoutResult.transferDetails?.accountNumber}</strong>
                    
                    <span style={{ color: 'var(--text-secondary)' }}>RUT:</span>
                    <strong>{checkoutResult.transferDetails?.rut}</strong>
                    
                    <span style={{ color: 'var(--text-secondary)' }}>Correo:</span>
                    <strong>{checkoutResult.transferDetails?.email}</strong>
                    
                    <span style={{ color: 'var(--text-secondary)' }}>Monto:</span>
                    <strong style={{ color: 'var(--primary)' }}>{priceFormatter.format(calculateTotalPrice(checkoutResult.ticketIds?.length || 0, config))}</strong>
                  </div>
                </div>

                <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: '#fbbf24', textAlign: 'left', marginBottom: '24px', lineHeight: '1.4' }} className="no-print">
                  ⚠️ <strong>Importante:</strong> Envía el comprobante de transferencia al correo <strong>{checkoutResult.transferDetails?.email}</strong> indicando tu nombre y que compraste el/los números: <strong>{checkoutResult.ticketIds?.map(id => id.split('-')[1]).join(', ')} (Lista {getExcelLabel(selectedList)})</strong>. Tus números quedarán reservados y serán marcados como "PAGADO" una vez verificado el depósito.
                </div>

                <button 
                  onClick={() => {
                    setShowCheckoutModal(false);
                    setCheckoutResult(null);
                  }}
                  className="btn-glass no-print"
                  style={{ width: '100%' }}
                >
                  Entendido, cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Receipt Retrieval Modal */}
      {showReceiptModal && receiptTickets.length > 0 && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(3, 7, 18, 0.85)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 100
        }}>
          <div className="glass-panel" style={{
            background: 'rgba(17, 24, 39, 0.8)',
            border: '1px solid var(--border-glass)',
            boxShadow: '0 0 40px rgba(0,0,0,0.5)',
            width: '100%',
            maxWidth: '550px',
            padding: '32px',
            borderRadius: '20px',
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative'
          }}>
            <button 
              onClick={() => {
                setShowReceiptModal(false);
                setReceiptTickets([]);
              }}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.2rem', cursor: 'pointer' }}
              className="no-print"
            >
              ✕
            </button>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }} className="no-print">🎫</div>
              <h3 style={{ fontSize: '1.3rem', marginBottom: '8px', color: 'var(--primary)' }} className="no-print">Comprobante de Respaldo</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }} className="no-print">
                Aquí tienes el respaldo oficial de tus números adquiridos en nuestra rifa.
              </p>

              {/* Premium Digital Ticket */}
              <div className="print-area" style={{
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
                border: '2px solid rgba(0, 242, 254, 0.25)',
                boxShadow: '0 0 30px rgba(0, 242, 254, 0.15)',
                borderRadius: '16px',
                padding: '24px',
                position: 'relative',
                marginBottom: '20px',
                textAlign: 'left',
                overflow: 'hidden'
              }}>
                {/* Notches on sides */}
                <div style={{ position: 'absolute', top: '50%', left: '-12px', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(15, 23, 42, 1)', borderRight: '2px solid rgba(0, 242, 254, 0.25)', transform: 'translateY(-50%)' }} />
                <div style={{ position: 'absolute', top: '50%', right: '-12px', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(15, 23, 42, 1)', borderLeft: '2px solid rgba(0, 242, 254, 0.25)', transform: 'translateY(-50%)' }} />
                
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px dashed rgba(255,255,255,0.15)', paddingBottom: '16px', marginBottom: '16px' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' }}>BOLETO OFICIAL DE RIFA</span>
                    <h4 style={{ fontSize: '1.1rem', color: '#fff', margin: '4px 0 0 0', fontWeight: 'bold' }}>{config.title}</h4>
                  </div>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: 'bold', 
                    padding: '4px 10px', 
                    borderRadius: '6px', 
                    background: receiptTickets.some(t => t.status === 'reserved') ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)', 
                    color: receiptTickets.some(t => t.status === 'reserved') ? '#fbbf24' : '#34d399',
                    border: receiptTickets.some(t => t.status === 'reserved') ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                    whiteSpace: 'nowrap'
                  }}>
                    {receiptTickets.some(t => t.status === 'reserved') ? '🟡 RESERVADO' : '🟢 PAGADO'}
                  </span>
                </div>

                {/* Info grid */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Comprador:</span>
                      <div style={{ fontSize: '0.95rem', color: '#fff', fontWeight: 'bold' }}>{receiptTickets[0]?.buyerName || 'Comprador Registrado'}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Contacto:</span>
                      <div style={{ fontSize: '0.85rem', color: '#fff' }}>{searchQuery}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fecha Sorteo:</span>
                      <div style={{ fontSize: '0.85rem', color: '#fff' }}>{new Date(config.drawDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    </div>
                  </div>
                  
                  {/* Decorative QR */}
                  <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', borderRadius: '12px' }} className="no-print">
                    <svg width="55" height="55" viewBox="0 0 29 29" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
                      <path d="M1 1h6v6H1V1zm0 21h6v6H1v-6zm21 0h6v6h-6v-6zM21 1h6v6h-6V1z" fill="currentColor" />
                      <path d="M12 2h2v4h-2V2zm3 0h2v1h-2V2zm0 3h2v2h-2V5zm-3 8h2v2h-2v-2zm3 0h3v1h-3v-1zm5 0h2v4h-2v-4zm-5 3h2v2h-2v-2zm-3 3h2v2h-2v-2zm3 0h2v3h-2v-3zm3 0h2v1h-2v-1zm3 0h2v3h-2v-3zm-9 3h2v2H9v-2zm3 0h2v1h-2v-1zm5 0h2v2h-2v-2zm-9 3h3v1H8v-1zm5 0h2v2h-2v-2zm3 0h2v1h-2v-1z" fill="currentColor" />
                    </svg>
                  </div>
                </div>

                {/* Tickets section */}
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px dashed rgba(255,255,255,0.15)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Números Adquiridos:</span>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {receiptTickets.map((t) => {
                      return (
                        <div key={t.id} style={{
                          background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.05) 0%, transparent 100%)',
                          border: t.status === 'paid' ? '1px solid #10b981' : '1px solid #fbbf24',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '0.85rem',
                          fontWeight: 'bold',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <span>Lista {getExcelLabel(t.listIndex)}</span>
                          <span style={{ color: t.status === 'paid' ? '#10b981' : '#fbbf24' }}>•</span>
                          <span>N° {t.numberIndex}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                className="btn-glow no-print"
                style={{
                  marginBottom: '16px',
                  width: '100%',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)'
                }}
              >
                🖨️ Imprimir o Guardar PDF
              </button>

              {/* If any ticket is reserved, show bank transfer instructions */}
              {receiptTickets.some(t => t.status === 'reserved') && (
                <div className="glass-panel no-print" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', textAlign: 'left', borderRadius: '12px', marginBottom: '16px', fontSize: '0.9rem' }}>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '8px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '6px', color: '#fbbf24' }}>Datos para Transferencia Pendiente:</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '6px 12px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Banco:</span>
                    <strong>{config.bankTransferData?.bankName}</strong>
                    
                    <span style={{ color: 'var(--text-secondary)' }}>Tipo:</span>
                    <strong>{config.bankTransferData?.accountType}</strong>
                    
                    <span style={{ color: 'var(--text-secondary)' }}>Número:</span>
                    <strong>{config.bankTransferData?.accountNumber}</strong>
                    
                    <span style={{ color: 'var(--text-secondary)' }}>RUT:</span>
                    <strong>{config.bankTransferData?.rut}</strong>
                    
                    <span style={{ color: 'var(--text-secondary)' }}>Correo:</span>
                    <strong>{config.bankTransferData?.email}</strong>
                    
                    <span style={{ color: 'var(--text-secondary)' }}>Total Pendiente:</span>
                    <strong style={{ color: 'var(--primary)' }}>
                      {priceFormatter.format(calculateTotalPrice(receiptTickets.filter(t => t.status === 'reserved').length, config))}
                    </strong>
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#fbbf24', lineHeight: '1.4' }}>
                    ⚠️ Envía el comprobante a <strong>{config.bankTransferData?.email}</strong> para validar tu pago y pasar tus números a estado "PAGADO".
                  </div>
                </div>
              )}

              <button 
                onClick={() => {
                  setShowReceiptModal(false);
                  setReceiptTickets([]);
                }}
                className="btn-glass no-print"
                style={{ width: '100%' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styled JSX for local hover and print styles */}
      <style jsx>{`
        .ticket-cell:hover {
          transform: translateY(-4px) scale(1.03);
          border-color: var(--primary) !important;
          background: rgba(0, 242, 254, 0.05) !important;
          box-shadow: 0 4px 12px rgba(0, 242, 254, 0.1);
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area, .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            box-shadow: none !important;
            background: #0f172a !important;
            color: #fff !important;
            border: 2px solid #00f2fe !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </main>
  );
}
