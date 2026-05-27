'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';

interface Ticket {
  id: string;
  listIndex: number;
  numberIndex: number;
  status: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
}

function PaymentResultContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'reserved' | 'failed' | 'checking'>('checking');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);

  const token = searchParams.get('token');
  const urlStatus = searchParams.get('status');

  const priceFormatter = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

  useEffect(() => {
    if (!token) {
      setError('No se proporcionó un token de pago válido.');
      setLoading(false);
      return;
    }

    if (urlStatus === 'cancelled') {
      setPaymentStatus('failed');
      setLoading(false);
      return;
    }

    // Call status endpoint to verify if the payment webhook succeeded
    async function verifyPayment() {
      try {
        const response = await fetch(`/api/payment/status?token=${token}`);
        if (!response.ok) throw new Error('Error al verificar el pago');
        const data = await response.json();
        
        if (data.status === 'paid') {
          setPaymentStatus('paid');
          setTickets(data.tickets);
        } else if (data.status === 'reserved') {
          setPaymentStatus('reserved');
          setTickets(data.tickets);
        } else {
          setPaymentStatus('failed');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    verifyPayment();
  }, [token, urlStatus]);

  if (loading) {
    return (
      <div style={{ maxWidth: '500px', margin: '100px auto', textAlign: 'center', color: '#9ca3af' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#00f2fe', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
        <p>Verificando estado de tu pago...</p>
        <style jsx global>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '60px auto', padding: '16px', width: '100%' }}>
      <div className="glass-panel" style={{ padding: '32px 24px', textAlign: 'center', background: '#111827' }}>
        {paymentStatus === 'paid' && (
          <>
            <div style={{ fontSize: '4rem', marginBottom: '16px' }}>✅</div>
            <h1 className="gradient-text" style={{ fontSize: '1.8rem', marginBottom: '12px', fontWeight: '800' }}>¡Pago Confirmado!</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '24px', lineHeight: '1.5' }}>
              Muchas gracias por tu compra. Tus números han sido registrados de forma definitiva para el sorteo.
            </p>

            <div className="glass-panel" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', textAlign: 'left', borderRadius: '12px', marginBottom: '24px' }}>
              <div style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px', marginBottom: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                DETALLES DE LA COMPRA
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Comprador:</span>
                <strong>{tickets[0]?.buyerName}</strong>

                <span style={{ color: 'var(--text-secondary)' }}>Teléfono:</span>
                <strong>{tickets[0]?.buyerPhone}</strong>

                <span style={{ color: 'var(--text-secondary)' }}>Correo:</span>
                <strong>{tickets[0]?.buyerEmail}</strong>

                <span style={{ color: 'var(--text-secondary)' }}>Números:</span>
                <strong style={{ color: 'var(--primary)' }}>
                  {tickets.map(t => t.numberIndex).join(', ')} (Lista {tickets[0]?.listIndex})
                </strong>
              </div>
            </div>

            <div style={{ background: 'var(--success-glow)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: '#10b981', marginBottom: '32px', textAlign: 'left' }}>
              ℹ️ Se ha enviado la confirmación a tu correo. Guarda el número de esta transacción como respaldo.
            </div>
          </>
        )}

        {paymentStatus === 'reserved' && (
          <>
            <div style={{ fontSize: '4rem', marginBottom: '16px' }}>⏳</div>
            <h1 style={{ fontSize: '1.8rem', marginBottom: '12px', color: 'var(--warning)', fontWeight: '800' }}>Pago en Proceso</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '24px', lineHeight: '1.5' }}>
              El pago está pendiente de confirmación por la entidad recaudadora. Los números quedarán reservados temporalmente.
            </p>

            <div className="glass-panel" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', textAlign: 'left', borderRadius: '12px', marginBottom: '32px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Comprador:</span>
                <strong>{tickets[0]?.buyerName}</strong>

                <span style={{ color: 'var(--text-secondary)' }}>Números:</span>
                <strong>{tickets.map(t => t.numberIndex).join(', ')} (Lista {tickets[0]?.listIndex})</strong>
              </div>
            </div>
          </>
        )}

        {(paymentStatus === 'failed' || error) && (
          <>
            <div style={{ fontSize: '4rem', marginBottom: '16px' }}>❌</div>
            <h1 style={{ fontSize: '1.8rem', marginBottom: '12px', color: 'var(--danger)', fontWeight: '800' }}>Pago Cancelado o Fallido</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '32px', lineHeight: '1.5' }}>
              {error || 'La transacción no se pudo completar. Los números seleccionados han sido liberados y están disponibles para su compra.'}
            </p>
          </>
        )}

        <Link href="/" className="btn-glow" style={{ textDecoration: 'none', width: '100%' }}>
          Volver a la Página Principal
        </Link>
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Cargando Resultado del Pago...</div>}>
      <PaymentResultContent />
    </Suspense>
  );
}
