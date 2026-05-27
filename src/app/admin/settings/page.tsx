'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface RaffleConfig {
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
}

interface Prize {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
}

export default function AdminSettings() {
  const [config, setConfig] = useState<RaffleConfig | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // New Prize state
  const [newPrizeTitle, setNewPrizeTitle] = useState('');
  const [newPrizeDesc, setNewPrizeDesc] = useState('');

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('Error al cargar la configuración');
        const data = await res.json();
        setConfig(data.config);
        setPrizes(data.prizes);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          prizes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      setSuccess(true);
      setConfig(data.config);
      setPrizes(data.prizes);
      
      // Scroll to top to see success message
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfigChange = (field: string, value: any) => {
    if (!config) return;
    setConfig((prev: any) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleBankChange = (field: string, value: string) => {
    if (!config) return;
    setConfig((prev: any) => ({
      ...prev,
      bankTransferData: {
        ...prev.bankTransferData,
        [field]: value,
      },
    }));
  };

  const handleFlowChange = (field: string, value: any) => {
    if (!config) return;
    setConfig((prev: any) => ({
      ...prev,
      flowConfig: {
        ...prev.flowConfig,
        [field]: value,
      },
    }));
  };

  // Prizes Management
  const handleAddPrize = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!newPrizeTitle || !newPrizeDesc) {
      alert('Completa el título y descripción del premio.');
      return;
    }

    const newPrize: Prize = {
      id: String(Date.now()),
      title: newPrizeTitle,
      description: newPrizeDesc,
      imageUrl: '/prizes/custom.jpg',
    };

    setPrizes((prev) => [...prev, newPrize]);
    setNewPrizeTitle('');
    setNewPrizeDesc('');
  };

  const handleDeletePrize = (id: string) => {
    setPrizes((prev) => prev.filter((p) => p.id !== id));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '20px' }}>
        <div style={{ width: '50px', height: '50px', border: '5px solid rgba(255,255,255,0.1)', borderTopColor: '#00f2fe', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#9ca3af', fontWeight: '500' }}>Cargando configuraciones...</p>
        <style jsx global>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#f3f4f6' }}>
        <h2>Error de carga</h2>
        <p style={{ color: '#9ca3af', marginTop: '10px' }}>No se pudo obtener la configuración.</p>
      </div>
    );
  }

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px', width: '100%' }}>
      
      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <Link href="/admin" style={{ color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: '600' }}>
            ◀ Volver al Dashboard
          </Link>
          <h1 style={{ fontSize: '2rem', marginTop: '8px' }}>Configuración de la Rifa</h1>
        </div>
      </div>

      {success && (
        <div style={{ background: 'var(--success-glow)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', padding: '16px', borderRadius: '12px', marginBottom: '24px', fontWeight: '500' }}>
          ✓ ¡Configuración y premios guardados correctamente!
        </div>
      )}

      {error && (
        <div style={{ background: 'var(--danger-glow)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
          ⚠️ Error: {error}
        </div>
      )}

      <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        
        {/* Section 1: General Info */}
        <section className="glass-panel" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '20px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>⚙️ Ajustes Generales</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Título de la Rifa</label>
              <input 
                type="text" 
                required
                value={config.title} 
                onChange={(e) => handleConfigChange('title', e.target.value)}
                className="input-glass"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Descripción / Instrucciones</label>
              <textarea 
                rows={3}
                required
                value={config.description} 
                onChange={(e) => handleConfigChange('description', e.target.value)}
                className="input-glass"
                style={{ fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Precio del Número (CLP)</label>
                <input 
                  type="number" 
                  required
                  value={config.ticketPrice} 
                  onChange={(e) => handleConfigChange('ticketPrice', parseInt(e.target.value, 10))}
                  className="input-glass"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Fecha del Sorteo</label>
                <input 
                  type="date" 
                  required
                  value={config.drawDate} 
                  onChange={(e) => handleConfigChange('drawDate', e.target.value)}
                  className="input-glass"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Cantidad de Listas</label>
                <input 
                  type="number" 
                  required
                  value={config.totalLists} 
                  onChange={(e) => handleConfigChange('totalLists', parseInt(e.target.value, 10))}
                  className="input-glass"
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                  Nota: Si disminuye las listas, se eliminarán los números excedentes si no están vendidos.
                </small>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Números por Lista</label>
                <input 
                  type="number" 
                  required
                  value={config.ticketsPerList} 
                  onChange={(e) => handleConfigChange('ticketsPerList', parseInt(e.target.value, 10))}
                  className="input-glass"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Correo del Administrador</label>
                <input 
                  type="email" 
                  required
                  value={config.adminEmail} 
                  onChange={(e) => handleConfigChange('adminEmail', e.target.value)}
                  className="input-glass"
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                  Este correo se asignará a compras públicas sin email.
                </small>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Contraseña de Administración</label>
                <input 
                  type="password" 
                  required
                  value={config.adminPassword || ''} 
                  onChange={(e) => handleConfigChange('adminPassword', e.target.value)}
                  className="input-glass"
                  placeholder="Ej. AdminRifa2026!"
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                  Clave para ingresar al panel (/admin/login).
                </small>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Bank Details */}
        <section className="glass-panel" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '20px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>🏦 Datos para Transferencia Bancaria</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
            Información que se mostrará a los compradores que elijan realizar transferencia bancaria manual.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Nombre del Banco</label>
                <input 
                  type="text" 
                  value={config.bankTransferData.bankName} 
                  onChange={(e) => handleBankChange('bankName', e.target.value)}
                  className="input-glass"
                  placeholder="Ej. Banco Estado"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Tipo de Cuenta</label>
                <input 
                  type="text" 
                  value={config.bankTransferData.accountType} 
                  onChange={(e) => handleBankChange('accountType', e.target.value)}
                  className="input-glass"
                  placeholder="Ej. Cuenta RUT"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Número de Cuenta</label>
                <input 
                  type="text" 
                  value={config.bankTransferData.accountNumber} 
                  onChange={(e) => handleBankChange('accountNumber', e.target.value)}
                  className="input-glass"
                  placeholder="Ej. 12345678"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>RUT Titular</label>
                <input 
                  type="text" 
                  value={config.bankTransferData.rut} 
                  onChange={(e) => handleBankChange('rut', e.target.value)}
                  className="input-glass"
                  placeholder="Ej. 12.345.678-9"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Correo para Comprobantes</label>
              <input 
                type="email" 
                value={config.bankTransferData.email} 
                onChange={(e) => handleBankChange('email', e.target.value)}
                className="input-glass"
                placeholder="ejemplo@correo.com"
              />
            </div>
          </div>
        </section>

        {/* Section 3: Flow.cl Configuration */}
        <section className="glass-panel" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '20px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>💳 Configuración de Flow.cl (Pasarela)</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input 
                  type="checkbox" 
                  checked={config.flowConfig.mockMode}
                  onChange={(e) => handleFlowChange('mockMode', e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span><strong>Habilitar Modo de Simulación (Recomendado para pruebas locales)</strong></span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input 
                  type="checkbox" 
                  checked={config.flowConfig.sandboxMode}
                  disabled={config.flowConfig.mockMode}
                  onChange={(e) => handleFlowChange('sandboxMode', e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span>Usar Sandbox (Ambiente de Pruebas de Flow)</span>
              </label>
            </div>

            <div style={{ opacity: config.flowConfig.mockMode ? 0.5 : 1, transition: 'var(--transition)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Flow API Key</label>
                  <input 
                    type="text" 
                    value={config.flowConfig.apiKey} 
                    disabled={config.flowConfig.mockMode}
                    onChange={(e) => handleFlowChange('apiKey', e.target.value)}
                    className="input-glass"
                    placeholder="Ej. ABCDEFGH12345"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Flow Secret Key</label>
                  <input 
                    type="password" 
                    value={config.flowConfig.secretKey} 
                    disabled={config.flowConfig.mockMode}
                    onChange={(e) => handleFlowChange('secretKey', e.target.value)}
                    className="input-glass"
                    placeholder="••••••••••••••••"
                  />
                </div>
              </div>
            </div>
            
          </div>
        </section>

        {/* Section 4: Prizes CRUD */}
        <section className="glass-panel" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '20px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>🏆 Gestión de Premios</h3>
          
          {/* Add New Prize form inline */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '12px', color: 'var(--primary)' }}>Agregar Nuevo Premio</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <input 
                  type="text" 
                  placeholder="Título del premio (ej. Smart TV 50 pulgadas)"
                  value={newPrizeTitle}
                  onChange={(e) => setNewPrizeTitle(e.target.value)}
                  className="input-glass"
                />
              </div>
              <div>
                <input 
                  type="text" 
                  placeholder="Descripción del premio (ej. Con tecnología QLED y wifi integrado)"
                  value={newPrizeDesc}
                  onChange={(e) => setNewPrizeDesc(e.target.value)}
                  className="input-glass"
                />
              </div>
              <button 
                type="button" 
                onClick={handleAddPrize}
                className="btn-glass"
                style={{ padding: '8px 16px', alignSelf: 'flex-start', fontSize: '0.85rem', borderColor: 'var(--primary)', color: 'var(--primary)' }}
              >
                + Añadir Premio
              </button>
            </div>
          </div>

          {/* Current Prizes List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {prizes.length > 0 ? (
              prizes.map((prize, idx) => (
                <div key={prize.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '8px' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Premio #{idx + 1}</span>
                    <h5 style={{ fontSize: '1rem', color: '#fff', marginTop: '2px' }}>{prize.title}</h5>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{prize.description}</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => handleDeletePrize(prize.id)}
                    className="btn-glass"
                    style={{ padding: '6px 12px', fontSize: '0.8rem', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  >
                    Eliminar
                  </button>
                </div>
              ))
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>No hay premios registrados. Agrega al menos uno.</p>
            )}
          </div>
        </section>

        {/* Form Actions */}
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', marginBottom: '40px' }}>
          <Link href="/admin" className="btn-glass" style={{ textDecoration: 'none' }}>
            Cancelar
          </Link>
          <button type="submit" className="btn-glow" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Guardar Todos los Cambios'}
          </button>
        </div>

      </form>
    </main>
  );
}
