import React, { useState, useEffect, useCallback, useRef } from 'react';

const TOUR_STEPS = [
  {
    target: '#tour-voting-status',
    title: '📡 Status da Votação',
    description: 'Aqui você vê se a votação está aberta ou fechada. Quando estiver "Aberta", os viewers podem votar pelo chat da Twitch usando !votar ou !v seguido do nome do filme.',
    position: 'bottom',
  },
  {
    target: '#tour-chat-status',
    title: '💬 Conexão com o Chat',
    description: 'Mostra se o site está conectado ao chat da Twitch. Quando verde, o site lê os votos do chat em tempo real automaticamente.',
    position: 'bottom',
  },
  {
    target: '#tour-age-rating',
    title: '📋 Classificação Indicativa',
    description: 'Legenda das faixas etárias brasileiras (L, 10, 12, 14, 16, 18). Cada filme votado mostra automaticamente sua classificação indicativa oficial no card.',
    position: 'bottom',
  },
  {
    target: '#tour-tabs',
    title: '📑 Abas de Navegação',
    description: 'Alterne entre: "Votação" para ver o ranking ao vivo, "Assistidos" para ver filmes já vistos pela comunidade. Admins também veem o Painel de Controle.',
    position: 'bottom',
  },
  {
    target: '#tour-stats',
    title: '📊 Estatísticas ao Vivo',
    description: 'Veja em tempo real: total de votos, quantos filmes foram votados, quem está na liderança, e o timer circular que mostra quando a próxima atualização automática acontece.',
    position: 'bottom',
  },
  {
    target: '#tour-filters',
    title: '🎬 Filtros',
    description: 'Filtre os filmes por gênero (Ação, Comédia, Terror...) ou ative o toggle "Esconder vistos" para ocultar filmes que a comunidade já assistiu.',
    position: 'bottom',
  },
  {
    target: '#tour-ranking-card',
    title: '🏆 Cards do Ranking',
    description: 'Cada filme votado aparece como um card com: poster oficial, nota do TMDB, classificação indicativa, número de votos e barra de porcentagem. O 1º lugar ganha destaque dourado!',
    position: 'right',
  },
];

const TOUR_STORAGE_KEY = 'uzflix-tour-completed';

export default function GuidedTour({ onComplete, instant = false }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const tooltipRef = useRef(null);
  const rafRef = useRef(null);

  const step = TOUR_STEPS[currentStep];

  const updatePositions = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const pad = 6;

    const sr = {
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    };
    setSpotlightRect(sr);

    // Position tooltip
    const tooltipW = Math.min(320, window.innerWidth - 32);
    const tooltipH = tooltipRef.current?.offsetHeight || 180;
    const gap = 14;
    let top, left;

    if (step.position === 'right' && rect.right + gap + tooltipW < window.innerWidth) {
      top = Math.max(16, Math.min(rect.top, window.innerHeight - tooltipH - 16));
      left = rect.right + gap;
    } else if (step.position === 'top' || (rect.bottom + gap + tooltipH > window.innerHeight && rect.top - gap - tooltipH > 0)) {
      top = sr.top - gap - tooltipH;
      left = Math.max(16, Math.min(sr.left + sr.width / 2 - tooltipW / 2, window.innerWidth - tooltipW - 16));
    } else {
      top = sr.top + sr.height + gap;
      left = Math.max(16, Math.min(sr.left + sr.width / 2 - tooltipW / 2, window.innerWidth - tooltipW - 16));
    }

    setTooltipPos({ top, left, width: tooltipW });
  }, [step]);

  // Continuous position tracking (handles scroll + resize)
  useEffect(() => {
    if (!isVisible) return;

    const tick = () => {
      updatePositions();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isVisible, updatePositions]);

  // Auto-start
  useEffect(() => {
    if (instant) {
      setIsVisible(true);
      return;
    }
    const hasCompleted = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!hasCompleted) {
      const timer = setTimeout(() => setIsVisible(true), 1200);
      return () => clearTimeout(timer);
    } else {
      onComplete?.();
    }
  }, [onComplete, instant]);

  // Scroll target into view when step changes
  useEffect(() => {
    if (!isVisible || !step) return;
    setIsTransitioning(true);
    const timer = setTimeout(() => setIsTransitioning(false), 350);

    const el = document.querySelector(step.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.top < 80 || rect.bottom > window.innerHeight - 80) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    return () => clearTimeout(timer);
  }, [isVisible, currentStep, step]);

  const goNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setIsTransitioning(true);
      setCurrentStep(prev => prev + 1);
    } else {
      finishTour();
    }
  };

  const goPrev = () => {
    if (currentStep > 0) {
      setIsTransitioning(true);
      setCurrentStep(prev => prev - 1);
    }
  };

  const finishTour = () => {
    setIsVisible(false);
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    onComplete?.();
  };

  if (!isVisible || !spotlightRect) return null;

  // Box-shadow approach: a transparent div with massive shadow creates the dark overlay
  const shadowSpread = 9999;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>

      {/* Click-catcher overlay (behind spotlight) */}
      <div
        onClick={finishTour}
        style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'auto' }}
      />

      {/* Spotlight cutout */}
      <div
        style={{
          position: 'fixed',
          top: `${spotlightRect.top}px`,
          left: `${spotlightRect.left}px`,
          width: `${spotlightRect.width}px`,
          height: `${spotlightRect.height}px`,
          borderRadius: '12px',
          boxShadow: `0 0 0 ${shadowSpread}px rgba(0, 0, 0, 0.82)`,
          zIndex: 2,
          pointerEvents: 'none',
          transition: 'top 0.4s cubic-bezier(0.4,0,0.2,1), left 0.4s cubic-bezier(0.4,0,0.2,1), width 0.4s cubic-bezier(0.4,0,0.2,1), height 0.4s cubic-bezier(0.4,0,0.2,1)',
        }}
      />

      {/* Glow ring */}
      <div
        style={{
          position: 'fixed',
          top: `${spotlightRect.top}px`,
          left: `${spotlightRect.left}px`,
          width: `${spotlightRect.width}px`,
          height: `${spotlightRect.height}px`,
          borderRadius: '12px',
          border: '2px solid rgba(139, 92, 246, 0.5)',
          boxShadow: '0 0 20px rgba(139, 92, 246, 0.2), inset 0 0 20px rgba(139, 92, 246, 0.05)',
          zIndex: 3,
          pointerEvents: 'none',
          transition: 'top 0.4s cubic-bezier(0.4,0,0.2,1), left 0.4s cubic-bezier(0.4,0,0.2,1), width 0.4s cubic-bezier(0.4,0,0.2,1), height 0.4s cubic-bezier(0.4,0,0.2,1)',
        }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: 'fixed',
          top: `${tooltipPos.top}px`,
          left: `${tooltipPos.left}px`,
          width: `${tooltipPos.width || 320}px`,
          zIndex: 4,
          pointerEvents: 'auto',
          opacity: isTransitioning ? 0 : 1,
          transform: isTransitioning ? 'scale(0.96) translateY(4px)' : 'scale(1) translateY(0)',
          transition: 'opacity 0.3s ease 0.1s, transform 0.3s ease 0.1s',
        }}
      >
        <div
          style={{
            background: 'rgba(18, 14, 32, 0.97)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(139, 92, 246, 0.2)',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 30px rgba(139, 92, 246, 0.08)',
          }}
        >
          {/* Step dots */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '3px' }}>
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === currentStep ? '18px' : '6px',
                    height: '6px',
                    borderRadius: '3px',
                    background: i === currentStep
                      ? 'linear-gradient(135deg, #8b5cf6, #a78bfa)'
                      : i < currentStep
                        ? '#6d28d9'
                        : 'rgba(255,255,255,0.12)',
                    transition: 'all 0.3s ease',
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
              {currentStep + 1}/{TOUR_STEPS.length}
            </span>
          </div>

          {/* Title */}
          <h3 style={{
            fontSize: '15px',
            fontWeight: 700,
            color: '#fff',
            marginBottom: '6px',
            lineHeight: 1.3,
          }}>
            {step.title}
          </h3>

          {/* Description */}
          <p style={{
            fontSize: '12.5px',
            color: 'rgba(255,255,255,0.55)',
            lineHeight: 1.65,
            marginBottom: '18px',
            margin: '0 0 18px 0',
          }}>
            {step.description}
          </p>

          {/* Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              onClick={finishTour}
              style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.3)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 0',
                fontFamily: 'inherit',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => e.target.style.color = 'rgba(255,255,255,0.6)'}
              onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.3)'}
            >
              Pular tour
            </button>

            <div style={{ display: 'flex', gap: '6px' }}>
              {currentStep > 0 && (
                <button
                  onClick={goPrev}
                  style={{
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.5)',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    padding: '7px 14px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.color = '#fff'; }}
                  onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.06)'; e.target.style.color = 'rgba(255,255,255,0.5)'; }}
                >
                  ← Voltar
                </button>
              )}
              <button
                onClick={goNext}
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#fff',
                  background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 18px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: '0 4px 16px rgba(124, 58, 237, 0.3)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.target.style.boxShadow = '0 6px 24px rgba(124, 58, 237, 0.5)'; e.target.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.target.style.boxShadow = '0 4px 16px rgba(124, 58, 237, 0.3)'; e.target.style.transform = 'translateY(0)'; }}
              >
                {currentStep === TOUR_STEPS.length - 1 ? '✓ Concluir' : 'Próximo →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
