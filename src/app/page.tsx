'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getExcelLabel, excelLabelToIndex } from '@/lib/utils';

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

        <div style={{ display: 'flex', gap: '16px' }}>
          <span className="badge badge-info" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
            Valor por Número: {priceFormatter.format(config.ticketPrice)}
          </span>
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
            Pagar {priceFormatter.format(selectedNumbers.length * config.ticketPrice)}
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
                  Has seleccionado {selectedNumbers.length} números por un valor total de <strong>{priceFormatter.format(selectedNumbers.length * config.ticketPrice)}</strong>.
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
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎉</div>
                <h3 style={{ fontSize: '1.4rem', marginBottom: '12px', color: 'var(--success)' }}>¡Reserva Exitosa!</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px', lineHeight: '1.5' }}>
                  {checkoutResult.message}
                </p>

                {/* Transfer data block */}
                <div className="glass-panel" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', textAlign: 'left', borderRadius: '12px', marginBottom: '24px', fontSize: '0.9rem' }}>
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
                    <strong style={{ color: 'var(--primary)' }}>{priceFormatter.format((checkoutResult.ticketIds?.length || 0) * config.ticketPrice)}</strong>
                  </div>
                </div>

                <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: '#fbbf24', textAlign: 'left', marginBottom: '24px', lineHeight: '1.4' }}>
                  ⚠️ <strong>Importante:</strong> Envía el comprobante de transferencia al correo <strong>{checkoutResult.transferDetails?.email}</strong> indicando tu nombre y que compraste el/los números: <strong>{checkoutResult.ticketIds?.map(id => id.split('-')[1]).join(', ')} (Lista {getExcelLabel(selectedList)})</strong>. Tus números quedarán reservados y serán marcados como "PAGADO" una vez verificado el depósito.
                </div>

                <button 
                  onClick={() => {
                    setShowCheckoutModal(false);
                    setCheckoutResult(null);
                  }}
                  className="btn-glass"
                  style={{ width: '100%' }}
                >
                  Entendido, cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Styled JSX for local hover animations */}
      <style jsx>{`
        .ticket-cell:hover {
          transform: translateY(-4px) scale(1.03);
          border-color: var(--primary) !important;
          background: rgba(0, 242, 254, 0.05) !important;
          box-shadow: 0 4px 12px rgba(0, 242, 254, 0.1);
        }
      `}</style>
    </main>
  );
}
