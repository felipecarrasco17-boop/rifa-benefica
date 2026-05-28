'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getExcelLabel } from '@/lib/utils';

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
  whatsappTemplate?: string;
  reservationExpiryDays?: number;
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
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // New Prize state
  const [newPrizeTitle, setNewPrizeTitle] = useState('');
  const [newPrizeDesc, setNewPrizeDesc] = useState('');
  const [newPrizeImage, setNewPrizeImage] = useState('');

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('Error al cargar la configuración');
        const data = await res.json();
        setConfig(data.config);
        setPrizes(data.prizes);

        const ticketsRes = await fetch('/api/tickets');
        if (!ticketsRes.ok) throw new Error('Error al cargar números');
        const ticketsData = await ticketsRes.json();
        setTickets(ticketsData.tickets || []);
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

  // Handle local image file upload converting it to Base64
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen es demasiado grande. Por favor selecciona una de menos de 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setNewPrizeImage(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
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
      imageUrl: newPrizeImage.trim() !== '' ? newPrizeImage.trim() : '/prizes/custom.jpg',
    };

    setPrizes((prev) => [...prev, newPrize]);
    setNewPrizeTitle('');
    setNewPrizeDesc('');
    setNewPrizeImage('');
  };

  const handleDeletePrize = (id: string) => {
    setPrizes((prev) => prev.filter((p) => p.id !== id));
  };

  // CSV Export Handler
  const handleExportCSV = (e: React.MouseEvent) => {
    e.preventDefault();
    if (tickets.length === 0) {
      alert('No hay datos de boletos para exportar.');
      return;
    }

    const headers = [
      'ID',
      'Lista',
      'Numero',
      'Estado',
      'Nombre Comprador',
      'Telefono',
      'Correo',
      'Fecha Reserva',
      'Medio Pago',
      'ID Transaccion'
    ];

    const csvRows = [headers.join(';')];

    // Sort by list index and ticket number index
    const sorted = [...tickets].sort((a, b) => {
      if (a.listIndex !== b.listIndex) return a.listIndex - b.listIndex;
      return a.numberIndex - b.numberIndex;
    });

    sorted.forEach((t) => {
      const row = [
        t.id,
        getExcelLabel(t.listIndex),
        t.numberIndex,
        t.status,
        t.buyerName ? t.buyerName.replace(/;/g, ',') : '',
        t.buyerPhone ? t.buyerPhone.replace(/;/g, ',') : '',
        t.buyerEmail ? t.buyerEmail.replace(/;/g, ',') : '',
        t.reservedAt || '',
        t.paymentMethod || '',
        t.paymentId || ''
      ];
      csvRows.push(row.join(';'));
    });

    const csvContent = 'sep=;\n' + csvRows.join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `reporte_ventas_rifa_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Import Handler
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('¿Estás seguro de que deseas importar este archivo CSV? Esto sobrescribirá el estado y compradores de los números especificados en el archivo.')) {
      e.target.value = '';
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) throw new Error('El archivo está vacío.');

        let lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) throw new Error('El archivo no contiene filas de datos.');

        // If the first line specifies the delimiter (e.g. sep=; or sep=,), handle and skip it
        let customDelimiter: string | null = null;
        if (lines[0].toLowerCase().startsWith('sep=')) {
          const sepLine = lines.shift() || '';
          const match = sepLine.match(/sep=(.)/i);
          if (match) {
            customDelimiter = match[1];
          }
        }

        if (lines.length < 2) throw new Error('El archivo no contiene filas de datos después de la línea de separación.');

        // Custom parser to split columns by delimiter supporting double quotes and empty fields
        const parseCSVLine = (lineStr: string, delim: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < lineStr.length; i++) {
            const char = lineStr[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === delim && !inQuotes) {
              result.push(current);
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current);
          return result;
        };

        const firstLine = lines[0];
        // Auto-detect delimiter if not explicitly specified via sep=
        const delimiter = customDelimiter || 
          (((firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length) ? ';' : ',');

        const headerRow = parseCSVLine(firstLine, delimiter);
        const getColumnIndex = (keywords: string[]) => {
          return headerRow.findIndex(h => 
            keywords.some(k => h.toLowerCase().trim().includes(k))
          );
        };

        const idIdx = getColumnIndex(['id', 'codigo', 'boleto']);
        const statusIdx = getColumnIndex(['estado', 'status', 'condicion']);
        const nameIdx = getColumnIndex(['nombre', 'comprador', 'buyername', 'buyer_name']);
        const phoneIdx = getColumnIndex(['telefono', 'celular', 'phone', 'buyerphone', 'buyer_phone']);
        const emailIdx = getColumnIndex(['correo', 'email', 'buyeremail', 'buyer_email']);
        const dateIdx = getColumnIndex(['fecha', 'reservedat', 'reserved_at', 'fecha reserva']);
        const methodIdx = getColumnIndex(['medio', 'metodo', 'paymentmethod', 'payment_method', 'medio pago']);
        const payIdIdx = getColumnIndex(['transaccion', 'idtransaccion', 'paymentid', 'payment_id', 'id pago']);

        if (idIdx === -1) {
          throw new Error('No se pudo encontrar la columna de ID en el archivo CSV (ej: ID, Boleto, Codigo).');
        }

        const ticketsToImport: any[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const fields = parseCSVLine(line, delimiter);
          
          const cleanVal = (val: string) => {
            if (!val) return '';
            return val.replace(/^["']|["']$/g, '').trim();
          };

          const id = cleanVal(fields[idIdx]);
          if (!id || !id.includes('-')) continue;

          const status = statusIdx !== -1 && fields[statusIdx] !== undefined ? cleanVal(fields[statusIdx]) : 'available';
          const buyerName = nameIdx !== -1 && fields[nameIdx] !== undefined ? cleanVal(fields[nameIdx]) : null;
          const buyerPhone = phoneIdx !== -1 && fields[phoneIdx] !== undefined ? cleanVal(fields[phoneIdx]) : null;
          const buyerEmail = emailIdx !== -1 && fields[emailIdx] !== undefined ? cleanVal(fields[emailIdx]) : null;
          const reservedAt = dateIdx !== -1 && fields[dateIdx] !== undefined ? cleanVal(fields[dateIdx]) : null;
          const paymentMethod = methodIdx !== -1 && fields[methodIdx] !== undefined ? cleanVal(fields[methodIdx]) : null;
          const paymentId = payIdIdx !== -1 && fields[payIdIdx] !== undefined ? cleanVal(fields[payIdIdx]) : null;

          ticketsToImport.push({
            id,
            status,
            buyerName,
            buyerPhone,
            buyerEmail,
            reservedAt,
            paymentMethod,
            paymentId
          });
        }

        if (ticketsToImport.length === 0) {
          throw new Error('No se encontraron registros de boletos válidos en el archivo.');
        }

        const res = await fetch('/api/tickets/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketsToImport }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al importar datos en el servidor.');

        const refreshRes = await fetch('/api/tickets');
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setTickets(refreshData.tickets || []);
        }

        setSuccess(true);
        alert(`✓ ¡Importación exitosa! Se actualizaron ${ticketsToImport.length} números en la base de datos.`);
      } catch (err: any) {
        setError(err.message);
        alert(`❌ Error de importación: ${err.message}`);
      } finally {
        setSubmitting(false);
        e.target.value = '';
      }
    };

    reader.readAsText(file, 'UTF-8');
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

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Días de Expiración de Reservas</label>
                <input 
                  type="number" 
                  min={1}
                  max={30}
                  required
                  value={config.reservationExpiryDays !== undefined ? config.reservationExpiryDays : 2} 
                  onChange={(e) => handleConfigChange('reservationExpiryDays', parseInt(e.target.value, 10))}
                  className="input-glass"
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                  Límite de días para marcar boletos reservados como caducados.
                </small>
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Plantilla del Mensaje de WhatsApp (Cobros)</label>
              <textarea 
                rows={5}
                required
                value={config.whatsappTemplate || ''} 
                onChange={(e) => handleConfigChange('whatsappTemplate', e.target.value)}
                className="input-glass"
                style={{ fontFamily: 'inherit', resize: 'vertical', lineHeight: '1.4' }}
                placeholder="Escribe el formato del mensaje..."
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '6px', display: 'block' }}>
                Usa las siguientes etiquetas para rellenar datos automáticamente: 
                <strong>{" {nombre}"}</strong> (comprador), 
                <strong>{" {numero}"}</strong> (número boleto), 
                <strong>{" {lista}"}</strong> (letra lista), 
                <strong>{" {id}"}</strong> (ID boleto), 
                <strong>{" {precio}"}</strong> (valor CLP), 
                <strong>{" {banco}"}</strong> (banco), 
                <strong>{" {cuenta}"}</strong> (tipo cuenta), 
                <strong>{" {ncuenta}"}</strong> (n° cuenta), 
                <strong>{" {rut}"}</strong> (RUT).
              </small>
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
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Imagen del Premio (URL o Archivo Local)
                </label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    placeholder="URL de la imagen o selecciona un archivo local..."
                    value={newPrizeImage.startsWith('data:image/') ? 'Imagen cargada en memoria (Archivo local)' : newPrizeImage}
                    onChange={(e) => setNewPrizeImage(e.target.value)}
                    className="input-glass"
                    style={{ flex: 1 }}
                    disabled={newPrizeImage.startsWith('data:image/')}
                  />
                  <label 
                    className="btn-glass"
                    style={{ 
                      padding: '10px 14px', 
                      fontSize: '0.85rem', 
                      cursor: 'pointer', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '6px',
                      borderColor: 'var(--secondary)',
                      color: 'var(--secondary)',
                      whiteSpace: 'nowrap',
                      margin: 0
                    }}
                  >
                    📁 Elegir Archivo
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                      style={{ display: 'none' }} 
                    />
                  </label>
                </div>
                {newPrizeImage.startsWith('data:image/') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={newPrizeImage} 
                      alt="Preview" 
                      style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} 
                    />
                    <span style={{ fontSize: '0.75rem', color: '#34d399' }}>✓ Imagen local cargada en memoria</span>
                    <button 
                      type="button" 
                      onClick={() => setNewPrizeImage('')} 
                      className="btn-glass" 
                      style={{ padding: '2px 8px', fontSize: '0.7rem', borderColor: 'var(--danger)', color: 'var(--danger)', margin: 0 }}
                    >
                      Quitar
                    </button>
                  </div>
                )}
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
                <div key={prize.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '8px', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    {prize.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img 
                        src={prize.imageUrl} 
                        alt={prize.title} 
                        style={{ width: '60px', height: '60px', borderRadius: '6px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} 
                        onError={(e) => {
                          (e.target as any).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="%23a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                        }}
                      />
                    )}
                    <div style={{ textAlign: 'left' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Premio #{idx + 1}</span>
                      <h5 style={{ fontSize: '1rem', color: '#fff', marginTop: '2px', margin: 0 }}>{prize.title}</h5>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px', margin: 0 }}>{prize.description}</p>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => handleDeletePrize(prize.id)}
                    className="btn-glass"
                    style={{ padding: '6px 12px', fontSize: '0.8rem', borderColor: 'var(--danger)', color: 'var(--danger)', flexShrink: 0 }}
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

        {/* Section 5: CSV Import / Export */}
        <section className="glass-panel" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '20px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>📤 Importación y Exportación de Datos (Excel / CSV)</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
            Descarga un reporte ordenado de las ventas en formato Excel/CSV, o importa un listado de asignaciones masivas desde una planilla de cálculo.
          </p>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleExportCSV}
              className="btn-glow"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                padding: '12px 24px',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '8px',
                border: 'none',
                boxShadow: 'none'
              }}
            >
              📥 Exportar Ventas a CSV (Excel)
            </button>

            <label
              className="btn-glass"
              style={{
                padding: '12px 24px',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '8px',
                cursor: 'pointer',
                borderColor: 'var(--secondary)',
                color: 'var(--secondary)',
                margin: 0
              }}
            >
              📤 Importar desde CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                style={{ display: 'none' }}
                disabled={submitting}
              />
            </label>
          </div>
          <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '10px', display: 'block', textAlign: 'left' }}>
            * Consejo: El CSV exportado utiliza punto y coma (;) como separador para ser compatible directamente con Excel en español y soporta caracteres especiales (UTF-8). Para importar, asegúrate de mantener la columna <strong>ID</strong> con la nomenclatura de lista y número (ej: 1-5, 12-14).
          </small>
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
