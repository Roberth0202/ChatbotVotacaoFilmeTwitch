import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Star } from 'lucide-react';
import { useParticles } from '../hooks/useParticles';

const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p/w500';

const ROUND_LABELS = ['Semifinal 1', 'Semifinal 2', 'Grande Final'];

export default function VersusScreen({ bracket, ranking, onNextRound, onEndBracket, isAdmin, API_URL, clockOffset = 0 }) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [localVotesA, setLocalVotesA] = useState(0);
  const [localVotesB, setLocalVotesB] = useState(0);
  const [showingResult, setShowingResult] = useState(false);
  const [roundWinner, setRoundWinner] = useState(null);
  const [showChampion, setShowChampion] = useState(false);
  const [shakeActive, setShakeActive] = useState(false);
  const timerRef = useRef(null);
  const autoAdvanceRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const hasAdvancedRef = useRef(false);
  // Evita avanço falso imediato se o cronômetro já estava expirado na montagem, usando fallback de segurança
  const timerExpiredOnMountRef = useRef(false);
  const zeroTicksRef = useRef(0);
  const [nextRoundTimeLeft, setNextRoundTimeLeft] = useState(5);
  const nextRoundTimerRef = useRef(null);
  const { emitConfetti, stopAll } = useParticles(canvasRef);

  const currentRound = bracket?.rounds?.[bracket.currentRound];
  const roundDuration = bracket?.roundDuration || 60;
  const isFinished = bracket?.status === 'finished';

  // Retorna o "agora" corrigido e ajustado para a diferença de relógio do cliente.
  // clockOffset = serverTime - Date.now() (negativo quando o relógio do cliente está adiantado).
  const nowCorrected = useCallback(() => Date.now() + clockOffset, [clockOffset]);

  // Obter dados do filme
  const getMovieData = useCallback((movieName) => {
    if (!movieName) return {};
    // Tenta primeiro os dados do filme no chaveamento (bracket)
    if (bracket?.movieData?.[movieName]) return bracket.movieData[movieName];
    // Fallback para os dados do ranking
    const fromRanking = ranking?.find(m => m.name === movieName);
    return fromRanking || {};
  }, [bracket, ranking]);

  const movieA = useMemo(() => getMovieData(currentRound?.movieA), [getMovieData, currentRound?.movieA]);
  const movieB = useMemo(() => getMovieData(currentRound?.movieB), [getMovieData, currentRound?.movieB]);

  // Redimensionar canvas
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.width = containerRef.current.offsetWidth;
        canvasRef.current.height = containerRef.current.offsetHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sincroniza o cronômetro com o timestamp do servidor para que todos os clientes (admin + espectadores) terminem no mesmo horário real.
  // targetTime é sempre derivado de bracket.roundStartedAt (fonte da verdade do servidor),
  // garantindo que todos os clientes — independentemente de quando abrirem a página — vejam o tempo restante correto.
  useEffect(() => {
    if (!bracket?.roundStartedAt) return;
    hasAdvancedRef.current = false;
    zeroTicksRef.current = 0;

    const targetTime = new Date(bracket.roundStartedAt).getTime() + roundDuration * 1000;
    const initialRemaining = Math.max(0, Math.ceil((targetTime - nowCorrected()) / 1000));
    setTimeLeft(initialRemaining);

    // Se o cronômetro já estava expirado quando este round foi montado (ex: recarregamento de página ou delay de rede),
    // marca-o inicialmente para aguardar a tolerância de sincronização do fallback (2s) antes de avançar.
    timerExpiredOnMountRef.current = initialRemaining <= 0;

  }, [bracket?.currentRound, roundDuration, bracket?.roundStartedAt, nowCorrected]);


  // 2. Mantém a função handleRoundEnd mais recente em uma ref para evitar reinicializações do intervalo
  const handleRoundEndRef = useRef();

  // 3. Intervalo de contagem (tick)
  useEffect(() => {
    if (isFinished || showingResult) return;

    timerRef.current = setInterval(() => {
      if (!bracket?.roundStartedAt) return;
      
      const targetTime = new Date(bracket.roundStartedAt).getTime() + roundDuration * 1000;
      const remaining = Math.max(0, Math.ceil((targetTime - nowCorrected()) / 1000));
      setTimeLeft(remaining);
        
      // Efeitos de urgência
      if (remaining <= 10 && remaining > 0) {
        if (remaining <= 5) {
          setShakeActive(true);
          setTimeout(() => setShakeActive(false), 500);
        }
      }

      // Tempo esgotado — mostra o resultado para TODOS os usuários (visual), apenas o admin avança o backend.
      if (remaining <= 0 && !hasAdvancedRef.current) {
        if (!timerExpiredOnMountRef.current) {
          // Expiração normal durante a visualização: avança imediatamente
          hasAdvancedRef.current = true;
          if (handleRoundEndRef.current) {
            setTimeout(() => handleRoundEndRef.current(), 0);
          }
        } else {
          // Fallback de segurança: Se o round iniciou já zerado (ex: aba em segundo plano ou delay de rede),
          // aguarda 2 segundos para sincronizar votos e então avança automaticamente para evitar congelamento da tela.
          zeroTicksRef.current = (zeroTicksRef.current || 0) + 1;
          if (zeroTicksRef.current >= 2) {
            hasAdvancedRef.current = true;
            if (handleRoundEndRef.current) {
              setTimeout(() => handleRoundEndRef.current(), 0);
            }
          }
        }
      } else if (remaining > 0) {
        zeroTicksRef.current = 0;
      }
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [isFinished, showingResult, bracket?.roundStartedAt, roundDuration, nowCorrected]);


  // Consulta (polling) dos votos para o round atual
  useEffect(() => {
    if (isFinished || showingResult) return;

    const pollVotes = async () => {
      try {
        const res = await fetch(`${API_URL}/api/ranking`);
        const data = await res.json();
        if (data.bracket?.currentRound === bracket?.currentRound) {
          let a = 0, b = 0;
          for (const r of data.ranking || []) {
            if (r.name === currentRound?.movieA) a = r.count;
            if (r.name === currentRound?.movieB) b = r.count;
          }
          setLocalVotesA(a);
          setLocalVotesB(b);
        }
      } catch (e) {
        // silencioso
      }
    };

    pollVotes();
    const interval = setInterval(pollVotes, 2000);
    return () => clearInterval(interval);
  }, [API_URL, bracket?.currentRound, currentRound?.movieA, currentRound?.movieB, isFinished, showingResult]);

  // Redefine o estado interno quando o round muda OU quando um novo torneio começa.
  // IMPORTANTE: a dependência inclui roundStartedAt (único por round/torneio) porque
  // apenas currentRound é insuficiente — um novo torneio sempre começa em currentRound=0,
  // assim como o anterior, portanto o efeito nunca seria redisparado e showingResult/
  // showChampion continuariam como true do torneio antigo (bug exclusivo do admin).
  useEffect(() => {
    setShowingResult(false);
    setRoundWinner(null);
    setShowChampion(false);
    setLocalVotesA(0);
    setLocalVotesB(0);
    hasAdvancedRef.current = false;
    timerExpiredOnMountRef.current = false;
    zeroTicksRef.current = 0;
    clearInterval(nextRoundTimerRef.current);
    clearTimeout(autoAdvanceRef.current);
  }, [bracket?.currentRound, bracket?.roundStartedAt]);

  // Tela de campeão
  useEffect(() => {
    if (isFinished && bracket?.champion) {
      setShowChampion(true);
      setTimeout(() => emitConfetti(), 500);
    }
  }, [isFinished, bracket?.champion, emitConfetti]);

  // Lida com o fim do round — resultado visual para todos, avanço no backend apenas para o admin
  const handleRoundEnd = useCallback(async () => {
    clearInterval(nextRoundTimerRef.current);

    setShowingResult(true);
    const winner = localVotesA >= localVotesB ? currentRound?.movieA : currentRound?.movieB;
    setRoundWinner(winner);
    
    setNextRoundTimeLeft(5);
    nextRoundTimerRef.current = setInterval(() => {
      setNextRoundTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    // Apenas o admin de fato avança o round no backend
    if (isAdmin && onNextRound) {
      autoAdvanceRef.current = setTimeout(async () => {
        clearInterval(nextRoundTimerRef.current);
        await onNextRound();
      }, 5000);
    }

    return () => {
      clearTimeout(autoAdvanceRef.current);
      clearInterval(nextRoundTimerRef.current);
    };
  }, [localVotesA, localVotesB, currentRound, onNextRound, isAdmin]);

  // Mantém a ref atualizada com o callback mais recente
  useEffect(() => {
    handleRoundEndRef.current = handleRoundEnd;
  }, [handleRoundEnd]);

  // Limpeza (cleanup)
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(autoAdvanceRef.current);
      clearInterval(nextRoundTimerRef.current);
      stopAll();
    };
  }, [stopAll]);

  // Aceita voto otimista do chaveamento vindo do chat da Twitch
  const handleBracketVote = useCallback((choice) => {
    if (choice === 1) setLocalVotesA(prev => prev + 1);
    if (choice === 2) setLocalVotesB(prev => prev + 1);
  }, []);

  // Expõe para o componente pai
  useEffect(() => {
    window.__versusHandleBracketVote = handleBracketVote;
    return () => { delete window.__versusHandleBracketVote; };
  }, [handleBracketVote]);

  const totalVotes = localVotesA + localVotesB;
  const percentA = totalVotes > 0 ? (localVotesA / totalVotes) * 100 : 50;
  const percentB = totalVotes > 0 ? (localVotesB / totalVotes) * 100 : 50;
  const isUrgent = timeLeft <= 10 && timeLeft > 0;
  const isCritical = timeLeft <= 5 && timeLeft > 0;
  const timerProgress = roundDuration > 0 ? (timeLeft / roundDuration) : 0;

  // ── TELA DE CAMPEÃO ──
  if (showChampion && bracket?.champion) {
    const champData = getMovieData(bracket.champion);
    return (
      <div ref={containerRef} className="relative min-h-[80vh] flex flex-col items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-20"
        />

        {/* Brilho de fundo */}
        <div className="absolute inset-0 bg-gradient-radial from-amber-500/10 via-transparent to-transparent" />
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at center, rgba(255,215,0,0.08) 0%, transparent 70%)',
          animation: 'pulseGlow 3s ease-in-out infinite'
        }} />

        <div className="relative z-10 animate-championReveal flex flex-col items-center">
          <span className="text-5xl sm:text-7xl mb-4">🏆</span>
          <h2 className="text-2xl sm:text-4xl font-black text-amber-400 animate-glowPulse mb-6 text-center px-4">
            CAMPEÃO
          </h2>

          {/* Pôster */}
          {champData.posterPath && (
            <div className="relative mb-6">
              <div className="absolute -inset-2 bg-gradient-to-br from-amber-400/30 to-yellow-500/30 rounded-2xl blur-lg" />
              <img
                src={`${TMDB_IMAGE_URL}${champData.posterPath}`}
                alt={bracket.champion}
                className="relative w-48 sm:w-64 rounded-xl shadow-2xl shadow-amber-500/30 border-2 border-amber-400/50"
              />
            </div>
          )}

          <h3 className="text-xl sm:text-3xl font-bold text-white mb-2 text-center px-4">
            {bracket.champion}
          </h3>
          {champData.year && (
            <p className="text-gray-400 text-sm mb-2">{champData.year}</p>
          )}
          {champData.voteAverage && (
            <div className="flex items-center gap-1 mb-6">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <span className="text-yellow-200 text-sm font-semibold">
                {champData.voteAverage.toFixed?.(1) || champData.voteAverage}
              </span>
            </div>
          )}

          {/* Resumo do Chaveamento */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-4 max-w-md w-full">
            <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-3 text-center">Resultados do Torneio</h4>
            {bracket.rounds.map((round, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <span className="text-[10px] text-gray-500 w-20">{ROUND_LABELS[i]}</span>
                <span className={`text-xs font-medium ${round.winner === round.movieA ? 'text-white' : 'text-gray-600'}`}>
                  {round.movieA} ({round.votesA})
                </span>
                <span className="text-[10px] text-gray-600 mx-2">vs</span>
                <span className={`text-xs font-medium ${round.winner === round.movieB ? 'text-white' : 'text-gray-600'}`}>
                  {round.movieB} ({round.votesB})
                </span>
              </div>
            ))}
          </div>

          {isAdmin && (
            <button
              onClick={onEndBracket}
              className="mt-6 px-6 py-2.5 rounded-xl text-sm font-medium bg-white/10 text-gray-300 border border-white/10 hover:bg-white/20 transition-all"
            >
              Encerrar Torneio
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── TELA DE VERSUS ──
  if (!currentRound?.movieA || !currentRound?.movieB) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500 text-sm">Preparando próximo confronto...</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-2xl border border-white/10 ${shakeActive ? 'animate-screenShake' : ''}`}
      style={{ minHeight: '70vh' }}
    >
      {/* Canvas de Partículas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-30"
      />

      {/* Rótulo do Round + Mini Chaveamento */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/15 px-2.5 py-1 rounded-lg border border-amber-500/20">
            ⚔️ {ROUND_LABELS[bracket.currentRound] || `Round ${bracket.currentRound + 1}`}
          </span>
          {showingResult && (
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-lg border border-emerald-500/20 animate-fadeIn">
              Resultado
            </span>
          )}
        </div>

        {/* Mini Chaveamento */}
        <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-lg px-2 py-1 border border-white/10">
          {bracket.rounds.map((r, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${
                i === bracket.currentRound
                  ? 'bg-amber-400 animate-pulse'
                  : r.winner
                  ? 'bg-emerald-500'
                  : 'bg-gray-700'
              }`}
              title={ROUND_LABELS[i]}
            />
          ))}
        </div>
      </div>

      {/* Cronômetro */}
      {!showingResult && (
        <div className="absolute top-12 sm:top-14 left-1/2 -translate-x-1/2 z-20">
          <div className={`relative flex flex-col items-center ${isUrgent ? 'animate-urgentPulse' : ''} rounded-full`}>
            <div className="relative" style={{ width: 64, height: 64 }}>
              <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                <circle
                  cx="32" cy="32" r="28" fill="none"
                  stroke={isCritical ? '#ef4444' : isUrgent ? '#f59e0b' : '#8b5cf6'}
                  strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${timerProgress * 175.93} 175.93`}
                  style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.5s ease' }}
                />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center font-black ${
                isCritical
                  ? 'text-red-400 text-2xl animate-counterPulse'
                  : isUrgent
                  ? 'text-amber-400 text-xl'
                  : 'text-white text-lg'
              }`}>
                {timeLeft}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Visão Dividida Principal (Split View) */}
      <div className="flex h-full" style={{ minHeight: '70vh' }}>

        {/* Filme A (Esquerda — Ciano/Azul) */}
        <div
          key={`movieA-${currentRound.movieA}`}
          className="relative overflow-hidden transition-all duration-1000 ease-in-out"
          style={{
            flex: showingResult ? (roundWinner === currentRound.movieA ? 1 : 0.0001) : 1,
            opacity: showingResult && roundWinner !== currentRound.movieA ? 0 : 1,
            animation: !showingResult ? 'versusSlideLeft 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : undefined
          }}
        >
          {/* Pôster de fundo */}
          {movieA.posterPath && (
            <img
              src={`${TMDB_IMAGE_URL}${movieA.posterPath}`}
              alt={currentRound.movieA}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className={`absolute inset-0 transition-all duration-1000 ${
            showingResult && roundWinner !== currentRound.movieA
              ? 'bg-black/85'
              : 'bg-gradient-to-r from-cyan-900/80 via-cyan-900/60 to-black/80'
          }`} />

          {/* Conteúdo */}
          <div className="relative z-10 h-full flex flex-col items-center justify-center p-4 sm:p-8 pb-28 sm:pb-32">
            <span className="text-4xl sm:text-6xl font-black text-cyan-400/30 absolute top-16 left-4">!1</span>

            {movieA.posterPath && (
              <img
                src={`${TMDB_IMAGE_URL}${movieA.posterPath}`}
                alt={currentRound.movieA}
                className="w-28 sm:w-40 rounded-xl shadow-2xl shadow-cyan-500/20 border border-cyan-500/30 mb-3"
              />
            )}

            {showingResult && roundWinner === currentRound.movieA && (
              <div className="mb-2 animate-fadeIn">
                <span className="text-amber-400 font-bold text-lg animate-glowPulse">⚡ VENCEDOR</span>
              </div>
            )}

            <h3 className="text-lg sm:text-2xl font-bold text-white text-center mb-1 drop-shadow-lg">
              {currentRound.movieA}
            </h3>
            {movieA.year && (
              <p className="text-cyan-300/70 text-xs mb-1">{movieA.year}</p>
            )}

            <div className="mt-1">
              <span className="text-3xl sm:text-5xl font-black text-white drop-shadow-lg">
                {localVotesA}
              </span>
              <p className="text-cyan-300/70 text-xs text-center">
                {totalVotes > 0 ? `${percentA.toFixed(0)}%` : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Emblema VS (Centro) */}
        <div className={`absolute inset-0 flex items-center justify-center z-20 pointer-events-none transition-all duration-700 ${showingResult ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`}>
          <div
            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center font-black text-xl sm:text-2xl border-2 ${
                isCritical
                ? 'bg-red-500/20 border-red-500/50 text-red-400 animate-pulseGlow'
                : 'bg-black/60 border-amber-500/50 text-amber-400 animate-vsBounce'
            }`}
            style={{ backdropFilter: 'blur(8px)' }}
          >
            VS
          </div>
        </div>

        {/* Contagem regressiva do resultado (Lado direito) */}
        {showingResult && (
          <div className="absolute top-16 right-4 sm:right-8 z-30 flex flex-col items-center bg-black/80 backdrop-blur-md px-6 py-5 rounded-2xl border border-emerald-500/50 shadow-2xl shadow-emerald-500/20 animate-championReveal">
            <span className="text-emerald-400 font-bold text-lg sm:text-xl mb-2 text-center drop-shadow-md">🎉 Vitória de {roundWinner}!</span>
            <span className="text-gray-300 text-xs sm:text-xs mb-1 uppercase tracking-wider font-semibold">
              {nextRoundTimeLeft === 0 
                ? 'Carregando...' 
                : (bracket?.currentRound === bracket?.rounds?.length - 1 ? 'Encerrando torneio em' : 'Próximo round em')}
            </span>
            {nextRoundTimeLeft > 0 && (
              <span className="text-3xl sm:text-4xl font-black text-amber-400 drop-shadow-lg">{nextRoundTimeLeft}</span>
            )}
          </div>
        )}

        {/* Filme B (Direita — Vermelho/Laranja) */}
        <div
          key={`movieB-${currentRound.movieB}`}
          className="relative overflow-hidden transition-all duration-1000 ease-in-out"
          style={{
            flex: showingResult ? (roundWinner === currentRound.movieB ? 1 : 0.0001) : 1,
            opacity: showingResult && roundWinner !== currentRound.movieB ? 0 : 1,
            animation: !showingResult ? 'versusSlideRight 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : undefined
          }}
        >
          {/* Pôster de fundo */}
          {movieB.posterPath && (
            <img
              src={`${TMDB_IMAGE_URL}${movieB.posterPath}`}
              alt={currentRound.movieB}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className={`absolute inset-0 transition-all duration-1000 ${
            showingResult && roundWinner !== currentRound.movieB
              ? 'bg-black/85'
              : 'bg-gradient-to-l from-red-900/80 via-red-900/60 to-black/80'
          }`} />

          {/* Conteúdo */}
          <div className="relative z-10 h-full flex flex-col items-center justify-center p-4 sm:p-8 pb-28 sm:pb-32">
            <span className="text-4xl sm:text-6xl font-black text-red-400/30 absolute top-16 right-4">!2</span>

            {movieB.posterPath && (
              <img
                src={`${TMDB_IMAGE_URL}${movieB.posterPath}`}
                alt={currentRound.movieB}
                className="w-28 sm:w-40 rounded-xl shadow-2xl shadow-red-500/20 border border-red-500/30 mb-3"
              />
            )}

            {showingResult && roundWinner === currentRound.movieB && (
              <div className="mb-2 animate-fadeIn">
                <span className="text-amber-400 font-bold text-lg animate-glowPulse">⚡ VENCEDOR</span>
              </div>
            )}

            <h3 className="text-lg sm:text-2xl font-bold text-white text-center mb-1 drop-shadow-lg">
              {currentRound.movieB}
            </h3>
            {movieB.year && (
              <p className="text-red-300/70 text-xs mb-1">{movieB.year}</p>
            )}

            <div className="mt-1">
              <span className="text-3xl sm:text-5xl font-black text-white drop-shadow-lg">
                {localVotesB}
              </span>
              <p className="text-red-300/70 text-xs text-center">
                {totalVotes > 0 ? `${percentB.toFixed(0)}%` : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Progresso (Cabo de Guerra / Tug of War) */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-3 sm:p-4">
        <div className="bg-black/60 backdrop-blur-sm rounded-xl p-3 border border-white/10">
          {/* Contagem de votos */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-bold text-sm">{localVotesA}</span>
              <span className="text-gray-500 text-[10px]">{currentRound.movieA?.split(' ').slice(0, 2).join(' ')}</span>
            </div>
            <span className="text-[10px] text-gray-600">{totalVotes} votos</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-[10px]">{currentRound.movieB?.split(' ').slice(0, 2).join(' ')}</span>
              <span className="text-red-400 font-bold text-sm">{localVotesB}</span>
            </div>
          </div>

          {/* Barra do cabo de guerra */}
          <div className="h-3 sm:h-4 bg-gray-800 rounded-full overflow-hidden relative">
            {/* Lado do Filme A */}
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-l-full transition-all duration-500 ease-out"
              style={{ width: `${percentA}%` }}
            />
            {/* Lado do Filme B */}
            <div
              className="absolute right-0 top-0 h-full bg-gradient-to-l from-red-500 to-red-400 rounded-r-full transition-all duration-500 ease-out"
              style={{ width: `${percentB}%` }}
            />
            {/* Ponto de colisão e brilho */}
            {totalVotes > 0 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-6 sm:h-8"
                style={{
                  left: `calc(${percentA}% - 6px)`,
                  background: 'radial-gradient(ellipse, rgba(255,255,255,0.8) 0%, rgba(255,215,0,0.4) 40%, transparent 70%)',
                  filter: 'blur(1px)',
                  transition: 'left 0.5s ease-out'
                }}
              />
            )}
          </div>

          {/* Porcentagens */}
          <div className="flex justify-between mt-1.5">
            <span className="text-cyan-400/70 text-[10px] font-medium">
              {totalVotes > 0 ? `${percentA.toFixed(0)}%` : '50%'}
            </span>
            <span className="text-red-400/70 text-[10px] font-medium">
              {totalVotes > 0 ? `${percentB.toFixed(0)}%` : '50%'}
            </span>
          </div>

          {/* Instruções de votação */}
          {!showingResult && (
            <p className="text-center text-[10px] text-gray-500 mt-2">
              Vote no chat: <code className="text-cyan-400">!1</code> ou <code className="text-red-400">!2</code>
            </p>
          )}
        </div>
      </div>

      {/* Controles Manuais do Admin (fallback) */}
      {isAdmin && !showingResult && (
        <div className="absolute bottom-32 sm:bottom-36 right-3 sm:right-4 z-20 flex flex-col gap-2">
          <button
            onClick={handleRoundEnd}
            className="text-[10px] px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all"
          >
            Pular Round
          </button>
          <button
            onClick={onEndBracket}
            className="text-[10px] px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
