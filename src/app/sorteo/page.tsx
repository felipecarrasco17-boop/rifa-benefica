'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getExcelLabel } from '@/lib/utils';

interface Prize {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
}

interface DrawTicket {
  id: string;
  listIndex: number;
  numberIndex: number;
  buyerName: string;
  buyerPhone: string;
}

interface WinnerRecord {
  ticket: DrawTicket;
  prize: Prize;
  time: string;
}

type DrawPhase = 'idle' | 'spinning-list' | 'spinning-number' | 'completed';

export default function VirtualDraw() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [selectedPrize, setSelectedPrize] = useState<Prize | null>(null);
  const [tickets, setTickets] = useState<DrawTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Demo / Test Mode State
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);

  // Drawing State
  const [drawPhase, setDrawPhase] = useState<DrawPhase>('idle');
  const [spinningList, setSpinningList] = useState<string>('');
  const [spinningNumber, setSpinningNumber] = useState<number | null>(null);
  
  const [winningList, setWinningList] = useState<number | null>(null);
  const [winner, setWinner] = useState<DrawTicket | null>(null);
  const [winnersHistory, setWinnersHistory] = useState<WinnerRecord[]>([]);

  // Sound Suspense and Drone Synthesizer State & Refs
  const [isSoundSuspenseEnabled, setIsSoundSuspenseEnabled] = useState<boolean>(true);
  const droneOsc1Ref = useRef<OscillatorNode | null>(null);
  const droneOsc2Ref = useRef<OscillatorNode | null>(null);
  const droneGainRef = useRef<GainNode | null>(null);
  const droneFilterRef = useRef<BiquadFilterNode | null>(null);

  // Load sound setting on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('isSoundSuspenseEnabled');
      if (stored !== null) {
        setIsSoundSuspenseEnabled(stored === 'true');
      }
    }
  }, []);

  // Cleanup drone sounds on unmount
  useEffect(() => {
    return () => {
      stopSuspenseDrone();
    };
  }, []);

  const handleExportWinners = () => {
    if (winnersHistory.length === 0) return;
    
    const headers = ['Hora', 'Ganador', 'Telefono', 'Boleto (Lista-Numero)', 'Premio'];
    const csvRows = [headers.join(';')];
    
    winnersHistory.forEach((w) => {
      const row = [
        w.time,
        w.ticket.buyerName,
        w.ticket.buyerPhone,
        `Lista ${getExcelLabel(w.ticket.listIndex)} - Numero ${w.ticket.numberIndex}`,
        w.prize.title
      ];
      csvRows.push(row.join(';'));
    });
    
    const csvContent = 'sep=;\n' + csvRows.join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ganadores_sorteo_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Canvas / Audio References
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const confettiParticles = useRef<any[]>([]);
  const animationFrameId = useRef<number | null>(null);

  // Fetch prizes and tickets
  useEffect(() => {
    async function initDrawData() {
      try {
        const configRes = await fetch('/api/config');
        if (!configRes.ok) throw new Error('Error al cargar premios');
        const configData = await configRes.json();
        setPrizes(configData.prizes || []);
        if (configData.prizes && configData.prizes.length > 0) {
          setSelectedPrize(configData.prizes[0]);
        }

        const ticketsRes = await fetch('/api/draw');
        if (!ticketsRes.ok) throw new Error('Error al cargar números pagados');
        const ticketsData = await ticketsRes.json();
        
        if (ticketsData.tickets && ticketsData.tickets.length > 0) {
          setTickets(ticketsData.tickets);
          setIsDemoMode(false); // Default to real mode if tickets are found
        } else {
          setTickets([]);
          setIsDemoMode(true); // Fallback to demo mode if no tickets are sold yet
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    initDrawData();
  }, []);

  // Web Audio Context initializer
  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  // Sound Synth: Drone Suspense
  function startSuspenseDrone() {
    if (!isSoundSuspenseEnabled) return;
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume();

      // Ensure any existing oscillators are stopped first
      stopSuspenseDrone();

      const now = ctx.currentTime;
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gainNode = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(55, now); // A1 note
      
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(55.3, now); // Detuned for chorus
      
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(150, now);
      filter.frequency.exponentialRampToValueAtTime(1100, now + 3); // tension sweep

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.08, now + 0.5); // smooth fade in

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);

      droneOsc1Ref.current = osc1;
      droneOsc2Ref.current = osc2;
      droneGainRef.current = gainNode;
      droneFilterRef.current = filter;
    } catch (e) {
      console.error('Error starting drone:', e);
    }
  }

  function stopSuspenseDrone() {
    try {
      const ctx = audioCtxRef.current;
      const gainNode = droneGainRef.current;
      const osc1 = droneOsc1Ref.current;
      const osc2 = droneOsc2Ref.current;

      if (ctx && gainNode) {
        const now = ctx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        // Exponential fade-out over 0.8s
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        
        if (osc1) osc1.stop(now + 0.8);
        if (osc2) osc2.stop(now + 0.8);
      } else {
        if (osc1) osc1.stop();
        if (osc2) osc2.stop();
      }
    } catch (e) {
      // ignore
    } finally {
      droneOsc1Ref.current = null;
      droneOsc2Ref.current = null;
      droneGainRef.current = null;
      droneFilterRef.current = null;
    }
  }

  // Sound Synth: Tick
  const playTickSound = () => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.04);
      
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch (e) {
      console.error(e);
    }
  };

  // Sound Synth: Confirmation (List Lock)
  const playListLockSound = () => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554.37, now + 0.1); // C#
      osc.frequency.setValueAtTime(659.25, now + 0.2); // E
      
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(now + 0.4);
    } catch (e) {
      console.error(e);
    }
  };

  // Sound Synth: Fanfare (Winner found)
  const playWinSound = () => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      
      const now = ctx.currentTime;
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C Major Chord sweep
      
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + i * 0.08 + 0.5);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.06, now + i * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.6);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.6);
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Particle Canvas: Confetti
  class ConfettiParticle {
    x: number;
    y: number;
    size: number;
    color: string;
    speedX: number;
    speedY: number;
    rotation: number;
    rotationSpeed: number;

    constructor(w: number) {
      this.x = Math.random() * w;
      this.y = Math.random() * -50 - 20;
      this.size = Math.random() * 8 + 6;
      const colors = ['#00f2fe', '#4facfe', '#a855f7', '#f87171', '#34d399', '#fbbf24', '#e0f2fe'];
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.speedX = Math.random() * 6 - 3;
      this.speedY = Math.random() * 5 + 5;
      this.rotation = Math.random() * 360;
      this.rotationSpeed = Math.random() * 10 - 5;
    }

    update(h: number) {
      this.x += this.speedX;
      this.y += this.speedY;
      this.rotation += this.rotationSpeed;
      if (this.y > h) {
        this.y = -20;
        this.speedY = Math.random() * 5 + 5;
      }
    }

    draw(ctx: CanvasRenderingContext2D) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate((this.rotation * Math.PI) / 180);
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
      ctx.restore();
    }
  }

  // Draw loop for Confetti
  const startConfetti = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    confettiParticles.current = Array.from({ length: 150 }, () => new ConfettiParticle(canvas.width));

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      confettiParticles.current.forEach((p) => {
        p.update(canvas.height);
        p.draw(ctx);
      });

      animationFrameId.current = requestAnimationFrame(loop);
    };

    loop();
  };

  const stopConfetti = () => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    confettiParticles.current = [];
  };

  // Generate 50 mock tickets spread across lists A to T
  const generateMockTickets = (): DrawTicket[] => {
    const mockNames = [
      'Pedro Pascal', 'Claudio Bravo', 'Alexis Sánchez', 'Mon Laferte', 'Daddy Yankee',
      'Lionel Messi', 'Keanu Reeves', 'Elon Musk', 'María José', 'Juana de Arco',
      'Pedro González', 'Lucía Sepúlveda', 'Diego Maradona', 'Gabriel Boric', 'Gary Medel',
      'Shakira Mebarak', 'Gustavo Cerati', 'Cecilia Bolocco', 'Arturo Vidal', 'Tomas Gonzalez'
    ];
    
    return Array.from({ length: 50 }, (_, i) => {
      const listIndex = Math.floor(Math.random() * 20) + 1; // Lists 1 to 20 (A to T)
      const numberIndex = Math.floor(Math.random() * 15) + 1; // Numbers 1 to 15
      return {
        id: `${listIndex}-${numberIndex}`,
        listIndex,
        numberIndex,
        buyerName: mockNames[i % mockNames.length] + ` (Demo #${i + 1})`,
        buyerPhone: `+56 9 9${Math.floor(1000000 + Math.random() * 9000000)}`
      };
    });
  };

  // Start Drawing (Dual Phase: List first, then Number)
  const handleStartDraw = () => {
    // 1. Setup the active pool of tickets
    const activePool = isDemoMode ? generateMockTickets() : tickets;

    if (activePool.length === 0) {
      alert('No hay números vendidos (PAGADOS) participando actualmente.');
      return;
    }
    if (!selectedPrize) {
      alert('Por favor selecciona un premio para realizar el sorteo.');
      return;
    }

    setWinner(null);
    setWinningList(null);
    setSpinningNumber(null);
    stopConfetti();
    startSuspenseDrone();

    // 2. Select the final winning ticket
    const winningIndex = Math.floor(Math.random() * activePool.length);
    const winTicket = activePool[winningIndex];

    // --- PHASE 1: SPINNING LIST ---
    setDrawPhase('spinning-list');
    
    // Create unique lists list indices represented in the active pool
    const activeLists = Array.from(new Set(activePool.map(t => t.listIndex)));
    const totalListSteps = 30;
    let listStep = 0;

    const getListInterval = (step: number) => {
      if (step < 18) return 60; // fast
      return 60 + (step - 18) * 30; // slowdown
    };

    const runListSpin = () => {
      if (listStep < totalListSteps) {
        // Show random list from active pool
        const tempIdx = activeLists[Math.floor(Math.random() * activeLists.length)];
        setSpinningList(getExcelLabel(tempIdx));
        playTickSound();
        listStep++;
        setTimeout(runListSpin, getListInterval(listStep));
      } else {
        // List settled!
        const finalWinningList = winTicket.listIndex;
        setSpinningList(getExcelLabel(finalWinningList));
        setWinningList(finalWinningList);
        playListLockSound();
        
        // Wait 1.2s to build tension before starting Phase 2
        setTimeout(() => {
          runNumberSpin(activePool, winTicket);
        }, 1200);
      }
    };

    // --- PHASE 2: SPINNING NUMBER ---
    const runNumberSpin = (pool: DrawTicket[], winTk: DrawTicket) => {
      setDrawPhase('spinning-number');
      
      // Extract participating ticket numbers in the selected list
      const ticketsInWinningList = pool.filter(t => t.listIndex === winTk.listIndex);
      const activeNumbers = ticketsInWinningList.map(t => t.numberIndex);
      
      const totalNumberSteps = 25;
      let numberStep = 0;

      const getNumberInterval = (step: number) => {
        if (step < 15) return 80; // fast
        return 80 + (step - 15) * 45; // slowdown
      };

      const runNumStep = () => {
        if (numberStep < totalNumberSteps) {
          const tempNum = activeNumbers[Math.floor(Math.random() * activeNumbers.length)];
          setSpinningNumber(tempNum);
          playTickSound();
          numberStep++;
          setTimeout(runNumStep, getNumberInterval(numberStep));
        } else {
          // Stopped on the final winning ticket number
          setSpinningNumber(winTk.numberIndex);
          setWinner(winTk);
          setDrawPhase('completed');
          playWinSound();
          startConfetti();
          stopSuspenseDrone();

          // Log winner to history
          setWinnersHistory((prev) => [
            {
              ticket: winTk,
              prize: selectedPrize,
              time: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            },
            ...prev
          ]);
        }
      };

      runNumStep();
    };

    // Trigger Phase 1
    runListSpin();
  };

  // Handle window resizing for Canvas
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% 50%, #0d1117 0%, #030712 100%)',
      color: '#f3f4f6',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Canvas Layer for Confetti */}
      <canvas 
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 10
        }}
      />

      {/* Floating Animated Neon Backdrops */}
      <div className="ambient-glow bg-cyan" />
      <div className="ambient-glow bg-purple" />

      {/* Header */}
      <header style={{
        padding: '20px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        zIndex: 5,
        backdropFilter: 'blur(10px)',
        background: 'rgba(3, 7, 18, 0.4)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ fontSize: '1.8rem' }}>🔮</span>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase', background: 'linear-gradient(90deg, #00f2fe 0%, #a855f7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Tómbola Virtual en Vivo
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Gran Rifa Benéfica • Sorteo Digital con Suspenso
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              const newVal = !isSoundSuspenseEnabled;
              setIsSoundSuspenseEnabled(newVal);
              localStorage.setItem('isSoundSuspenseEnabled', String(newVal));
            }}
            className="btn-glass"
            style={{
              padding: '6px 12px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderColor: isSoundSuspenseEnabled ? '#00f2fe' : 'rgba(255,255,255,0.1)',
              background: isSoundSuspenseEnabled ? 'rgba(0, 242, 254, 0.08)' : 'none',
              color: isSoundSuspenseEnabled ? '#00f2fe' : '#9ca3af'
            }}
          >
            {isSoundSuspenseEnabled ? '🔊 Suspenso: ON' : '🔇 Suspenso: OFF'}
          </button>
          <Link href="/admin" className="btn-glass" style={{ textDecoration: 'none', fontSize: '0.85rem' }}>
            ⚙️ Panel Admin
          </Link>
          <Link href="/" className="btn-glass" style={{ textDecoration: 'none', fontSize: '0.85rem' }}>
            🏠 Inicio
          </Link>
        </div>
      </header>

      {/* Main Sorteo Area */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: '40px',
        padding: '40px',
        zIndex: 5,
        alignItems: 'center',
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%'
      }} className="sorteo-layout">
        
        {/* Left Side: Drawing Controls & Interactive Drum Wheel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', alignItems: 'center', width: '100%' }}>
          
          {/* Main Drawing Visualizer */}
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '650px',
            padding: '45px 30px',
            textAlign: 'center',
            background: 'rgba(17, 24, 39, 0.45)',
            borderColor: winner ? 'rgba(0, 242, 254, 0.4)' : 'rgba(255, 255, 255, 0.08)',
            boxShadow: winner ? '0 0 40px rgba(0, 242, 254, 0.25)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            position: 'relative'
          }}>
            
            {/* Demo mode status banner */}
            {isDemoMode && (
              <div style={{
                position: 'absolute',
                top: '12px',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#fbbf24',
                padding: '4px 16px',
                borderRadius: '50px',
                fontSize: '0.75rem',
                fontWeight: 'bold'
              }}>
                ⚠️ Modo de Prueba Activo (Compradores Ficticios)
              </div>
            )}

            {/* Ambient inner neon border */}
            <div className={`neon-pulse-ring ${drawPhase === 'spinning-list' || drawPhase === 'spinning-number' ? 'spinning' : winner ? 'winner' : ''}`} />

            {/* Spinner Drum Wheel Animation */}
            <div className={`drum-wheel ${drawPhase === 'spinning-list' || drawPhase === 'spinning-number' ? 'spinning' : ''}`} style={{ marginTop: isDemoMode ? '15px' : '0' }}>
              <div className="drum-core">
                <span style={{ fontSize: '2.5rem' }}>🎰</span>
              </div>
            </div>

            {/* Suspense Dual Phase Display */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '140px', justifyContent: 'center' }}>
              
              {drawPhase === 'idle' && (
                <div>
                  <h2 style={{ fontSize: '1.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                    ¿Listo para Sortear?
                  </h2>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Selecciona un premio abajo y presiona el botón para iniciar el sorteo.
                  </p>
                </div>
              )}

              {/* Phase 1 Display: Spinning List */}
              {drawPhase === 'spinning-list' && (
                <div style={{ animation: 'slideIn 0.2s' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>
                    ⚙️ Fase 1: Sorteando Lista
                  </div>
                  <h2 style={{ fontSize: '4.5rem', fontWeight: '900', color: '#c084fc', textShadow: '0 0 25px rgba(139, 92, 246, 0.5)' }}>
                    Lista {spinningList}
                  </h2>
                </div>
              )}

              {/* Phase 2 Display: Spinning Number */}
              {drawPhase === 'spinning-number' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    🔒 Lista Bloqueada: <strong style={{ color: '#34d399', fontSize: '1.2rem', textShadow: '0 0 10px rgba(52, 211, 153, 0.4)' }}>{spinningList}</strong>
                  </div>
                  <div style={{ borderTop: '1px dashed rgba(255,255,255,0.08)', margin: '4px 0' }} />
                  <div style={{ animation: 'slideIn 0.2s' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>
                      🔥 Fase 2: Sorteando Número
                    </div>
                    <h2 style={{ fontSize: '4.5rem', fontWeight: '900', color: '#00f2fe', textShadow: '0 0 25px rgba(0, 242, 254, 0.5)' }}>
                      Número {spinningNumber !== null ? spinningNumber : '?'}
                    </h2>
                  </div>
                </div>
              )}

              {/* Phase 3 Display: Winner Revealed */}
              {drawPhase === 'completed' && winner && (
                <div style={{ animation: 'slideIn 0.3s' }}>
                  <div style={{
                    fontSize: '1rem',
                    color: '#34d399',
                    fontWeight: 'bold',
                    background: 'rgba(52, 211, 153, 0.1)',
                    padding: '6px 20px',
                    borderRadius: '50px',
                    display: 'inline-block',
                    marginBottom: '10px',
                    border: '1px solid rgba(52, 211, 153, 0.3)'
                  }}>
                    Lista {getExcelLabel(winner.listIndex)} • Número {winner.numberIndex}
                  </div>
                  
                  <h2 style={{
                    fontSize: '2.4rem',
                    fontWeight: '900',
                    color: '#fff',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textShadow: '0 0 20px rgba(255, 255, 255, 0.3)'
                  }}>
                    {winner.buyerName}
                  </h2>
                  
                  <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginTop: '6px', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                    📱 {winner.buyerPhone}
                  </p>
                </div>
              )}

            </div>

            {/* Setup Controls */}
            <div style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              paddingTop: '20px'
            }}>
              
              {/* Premium Controls Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '12px', alignItems: 'end', textAlign: 'left' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    Premio a Sortear:
                  </label>
                  <select 
                    value={selectedPrize?.id || ''}
                    onChange={(e) => {
                      const found = prizes.find(p => p.id === e.target.value);
                      if (found) setSelectedPrize(found);
                    }}
                    disabled={drawPhase === 'spinning-list' || drawPhase === 'spinning-number'}
                    className="input-glass"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', fontSize: '0.9rem' }}
                  >
                    {prizes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Demo mode toggle switch */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center' }}>
                    Modo Prueba:
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsDemoMode(p => !p)}
                    disabled={drawPhase === 'spinning-list' || drawPhase === 'spinning-number'}
                    className="btn-glass"
                    style={{
                      width: '100%',
                      padding: '10px 0',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      borderColor: isDemoMode ? '#fbbf24' : 'var(--border-glass)',
                      color: isDemoMode ? '#fbbf24' : 'var(--text-secondary)',
                      background: isDemoMode ? 'rgba(245, 158, 11, 0.08)' : 'none',
                    }}
                  >
                    {isDemoMode ? '🟢 ACTIVO' : '⚫ APAGADO'}
                  </button>
                </div>
              </div>

              <button
                onClick={handleStartDraw}
                disabled={drawPhase === 'spinning-list' || drawPhase === 'spinning-number' || (!isDemoMode && tickets.length === 0)}
                className="btn-glow"
                style={{
                  background: 'linear-gradient(135deg, #00f2fe 0%, #a855f7 100%)',
                  padding: '14px 28px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  letterSpacing: '1px',
                  borderRadius: '8px',
                  width: '100%',
                  opacity: (!isDemoMode && tickets.length === 0) ? 0.5 : 1
                }}
              >
                {drawPhase === 'spinning-list' || drawPhase === 'spinning-number' ? '🎰 SORTEANDO...' : '🎉 INICIAR SORTEO'}
              </button>
            </div>

            {/* Summary statistics */}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '20px', justifyContent: 'center' }}>
              <span>🎟️ Boletos en Sorteo: <strong>{isDemoMode ? '50 (Ficticios)' : tickets.length}</strong></span>
              <span>🏆 Premios Disponibles: <strong>{prizes.length}</strong></span>
            </div>
          </div>
        </div>

        {/* Right Side: Winners Log & Realtime Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', width: '100%' }}>
          
          {/* Active Prize Card */}
          {selectedPrize && (
            <div className="glass-panel" style={{
              padding: '20px',
              background: 'rgba(17, 24, 39, 0.45)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              width: '100%',
              maxWidth: '500px',
              margin: '0 auto',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              boxShadow: '0 0 20px rgba(168, 85, 247, 0.05)'
            }}>
              <span style={{ fontSize: '0.75rem', color: '#c084fc', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                🎁 Premio en Juego
              </span>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {selectedPrize.imageUrl && (
                  <div style={{
                    width: '90px',
                    height: '90px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    position: 'relative',
                    border: '1px solid var(--border-glass)',
                    background: 'rgba(0,0,0,0.2)',
                    flexShrink: 0
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={selectedPrize.imageUrl} 
                      alt={selectedPrize.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        (e.target as any).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                      }}
                    />
                  </div>
                )}
                <div style={{ textAlign: 'left' }}>
                  <h4 style={{ fontSize: '1.05rem', color: '#fff', fontWeight: 'bold', margin: 0 }}>
                    {selectedPrize.title}
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.4', margin: 0 }}>
                    {selectedPrize.description}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Winners Board */}
          <div className="glass-panel" style={{
            padding: '24px',
            background: 'rgba(17, 24, 39, 0.45)',
            maxHeight: '520px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            width: '100%',
            maxWidth: '500px',
            margin: '0 auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>🏆 Historial de Ganadores</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', margin: 0 }}>
                  Premios sorteados en esta sesión en vivo.
                </p>
              </div>
              {winnersHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportWinners}
                  className="btn-glass"
                  style={{ 
                    padding: '4px 10px', 
                    fontSize: '0.75rem', 
                    borderColor: 'var(--primary)', 
                    color: 'var(--primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    margin: 0
                  }}
                >
                  📥 Descargar CSV
                </button>
              )}
            </div>

            <div style={{
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              paddingRight: '6px'
            }}>
              {winnersHistory.length > 0 ? (
                winnersHistory.map((w, idx) => (
                  <div key={idx} style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    animation: 'slideIn 0.3s ease'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        🕒 {w.time}
                      </span>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        color: '#00f2fe',
                        background: 'rgba(0, 242, 254, 0.1)',
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}>
                        Lista {getExcelLabel(w.ticket.listIndex)}-{w.ticket.numberIndex}
                      </span>
                    </div>

                    <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#fff' }}>
                      {w.ticket.buyerName}
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#a855f7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🎁 <span>{w.prize.title}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                  gap: '10px',
                  padding: '40px 0'
                }}>
                  <span>🏆</span>
                  <p>Aún no se han registrado ganadores.</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Winner Modal overlay */}
      {winner && drawPhase === 'completed' && (
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
          <div className="glass-panel winner-modal" style={{
            background: 'rgba(17, 24, 39, 0.8)',
            border: '2px solid #00f2fe',
            boxShadow: '0 0 50px rgba(0, 242, 254, 0.35)',
            width: '100%',
            maxWidth: '600px',
            padding: '45px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            borderRadius: '24px',
            animation: 'modalScale 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}>
            <span style={{ fontSize: '4.5rem', animation: 'bounce 1.5s infinite' }}>👑</span>
            
            <div>
              <span style={{ fontSize: '0.85rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase' }}>
                ¡Tenemos un Ganador!
              </span>
              <h2 style={{
                fontSize: '2.5rem',
                fontWeight: '900',
                color: '#fff',
                marginTop: '10px',
                textShadow: '0 0 20px rgba(0, 242, 254, 0.4)'
              }}>
                {winner.buyerName}
              </h2>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '16px 28px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Boleto Ganador:</span>
                <strong style={{ color: '#00f2fe' }}>
                  Lista {getExcelLabel(winner.listIndex)} • Número {winner.numberIndex}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Teléfono:</span>
                <strong style={{ fontFamily: 'monospace' }}>{winner.buyerPhone}</strong>
              </div>
              {selectedPrize && (
                <div style={{
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  marginTop: '12px',
                  paddingTop: '12px',
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'center',
                  textAlign: 'left'
                }}>
                  {selectedPrize.imageUrl && (
                    <div style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(0,0,0,0.2)',
                      flexShrink: 0
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={selectedPrize.imageUrl} 
                        alt={selectedPrize.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          (e.target as any).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                        }}
                      />
                    </div>
                  )}
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Premio Obtenido:</span>
                    <h4 style={{ color: '#a855f7', fontSize: '1.05rem', fontWeight: 'bold', margin: '2px 0 0 0' }}>🎁 {selectedPrize.title}</h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px', lineHeight: '1.4', margin: 0 }}>{selectedPrize.description}</p>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setWinner(null);
                setDrawPhase('idle');
                stopConfetti();
              }}
              className="btn-glow"
              style={{
                background: 'linear-gradient(135deg, #a855f7 0%, #00f2fe 100%)',
                padding: '14px 40px',
                fontSize: '1rem',
                fontWeight: 'bold',
                borderRadius: '10px',
                width: '100%'
              }}
            >
              Listo, Continuar
            </button>
          </div>
        </div>
      )}

      {/* Styled JSX for Premium Animations */}
      <style jsx global>{`
        .ambient-glow {
          position: absolute;
          width: 50vw;
          height: 50vw;
          border-radius: 50%;
          filter: blur(150px);
          opacity: 0.15;
          pointer-events: none;
          z-index: 1;
        }
        .bg-cyan {
          top: -10vw;
          left: -10vw;
          background: #00f2fe;
        }
        .bg-purple {
          bottom: -10vw;
          right: -10vw;
          background: #a855f7;
        }
        .drum-wheel {
          width: 140px;
          height: 140px;
          border: 4px dashed rgba(0, 242, 254, 0.4);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          transition: border-color 0.3s;
        }
        .drum-wheel.spinning {
          animation: drumSpin 0.2s linear infinite;
          border-color: #a855f7;
        }
        .drum-core {
          width: 100px;
          height: 100px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-glass);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .neon-pulse-ring {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          border-radius: inherit;
          border: 2px solid transparent;
          pointer-events: none;
          transition: border-color 0.5s, box-shadow 0.5s;
        }
        .neon-pulse-ring.spinning {
          border-color: rgba(168, 85, 247, 0.3);
          box-shadow: inset 0 0 20px rgba(168, 85, 247, 0.2);
        }
        .neon-pulse-ring.winner {
          border-color: rgba(52, 211, 153, 0.4);
          box-shadow: inset 0 0 30px rgba(52, 211, 153, 0.3);
        }

        @keyframes drumSpin {
          100% { transform: rotate(360deg); }
        }
        @keyframes slideIn {
          0% { transform: translateY(15px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes modalScale {
          0% { transform: scale(0.85); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        @media (min-width: 992px) {
          .sorteo-layout {
            grid-template-columns: 1.3fr 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
