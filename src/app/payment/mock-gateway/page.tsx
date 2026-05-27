'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, Suspense } from 'react';

function MockGatewayContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = searchParams.get('token') || '';
  const amount = searchParams.get('amount') || '0';
  const order = searchParams.get('order') || '';
  const urlReturn = searchParams.get('urlReturn') || '/';
  const urlConfirmation = searchParams.get('urlConfirmation') || '';

  const priceFormatter = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

  const handleApprove = async () => {
    setProcessing(true);
    setError(null);
    try {
      // Simulate webhook call to our server
      const webhookRes = await fetch(urlConfirmation || '/api/payment/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (!webhookRes.ok) {
        const errText = await webhookRes.text();
        throw new Error(`Error en el webhook simulado: ${errText}`);
      }

      // Webhook successfully processed and updated database
      // Now redirect the user to urlReturn with token parameter
      const targetUrl = new URL(urlReturn, window.location.origin);
      targetUrl.searchParams.set('token', token);
      router.push(targetUrl.pathname + targetUrl.search);
    } catch (err: any) {
      setError(err.message);
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    // Simply redirect back to return page
    const targetUrl = new URL(urlReturn, window.location.origin);
    targetUrl.searchParams.set('token', token);
    targetUrl.searchParams.set('status', 'cancelled');
    router.push(targetUrl.pathname + targetUrl.search);
  };

  return (
    <div style={{ maxWidth: '480px', margin: '60px auto', padding: '16px', width: '100%' }}>
      <div className="glass-panel" style={{ padding: '32px 24px', background: '#111827', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
        
        {/* Flow.cl Mock Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
          <div>
            <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#ff5a00' }}>flow</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 'light', color: '#fff' }}>.cl</span>
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#9ca3af', fontWeight: '600' }}>Simulador</span>
          </div>
          <span style={{ fontSize: '1.5rem' }}>🛡️</span>
        </div>

        <h2 style={{ fontSize: '1.3rem', marginBottom: '24px', fontWeight: '700' }}>Pasarela de Pago Simulada</h2>

        {error && (
          <div style={{ background: 'var(--danger-glow)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '20px' }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '16px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Comercio:</span>
            <strong>Rifa Benéfica Oficial</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>N° de Orden:</span>
            <strong>{order}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Monto a Pagar:</span>
            <strong style={{ color: 'var(--primary)', fontSize: '1.1rem' }}>{priceFormatter.format(Number(amount))}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button 
            className="btn-glow" 
            onClick={handleApprove} 
            disabled={processing}
            style={{ width: '100%', padding: '14px' }}
          >
            {processing ? 'Confirmando pago...' : 'Simular Pago Exitoso (Aprobar)'}
          </button>
          
          <button 
            className="btn-glass" 
            onClick={handleCancel} 
            disabled={processing}
            style={{ width: '100%', padding: '14px' }}
          >
            Simular Cancelación / Rechazo
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Esta página simula la redirección y el webhook del procesador de pagos Flow.cl para pruebas locales rápidas sin tokens comerciales.
        </div>
      </div>
    </div>
  );
}

export default function MockGatewayPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Cargando Simulador Flow...</div>}>
      <MockGatewayContent />
    </Suspense>
  );
}
