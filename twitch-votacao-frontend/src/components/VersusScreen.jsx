import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Star } from 'lucide-react';
import { useParticles } from '../hooks/useParticles';

const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p/w500';

const ROUND_LABELS = ['Semifinal 1', 'Semifinal 2', 'Grande Final'];

export default function VersusScreen({ bracket, ranking, onNextRound, onEndBracket, isAdmin, API_URL }) {
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
  const [nextRoundTimeLeft, setNextRoundTimeLeft] = useState(5);
  const nextRoundTimerRef = useRef(null);
  const { emitConfetti, stopAll } = useParticles(canvasRef);

  const currentRound = bracket?.rounds?.[bracket.currentRound];
  const roundDuration = bracket?.roundDuration || 60;
  const isFinished = bracket?.status === 'finished';

  // Get movie data
  const getMovieData = useCallback((movieName) => {
    if (!movieName) return {};
    // Try bracket movieData first
    if (bracket?.movieData?.[movieName]) return bracket.movieData[movieName];
    // Fallback to ranking data
    const fromRanking = ranking?.find(m => m.name === movieName);
    return fromRanking || {};
  }, [bracket, ranking]);

  const movieA = useMemo(() => getMovieData(currentRound?.movieA), [getMovieData, currentRound?.movieA]);
  const movieB = useMemo(() => getMovieData(currentRound?.movieB), [getMovieData, currentRound?.movieB]);

  // Resize canvas
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

  // Sync timer to server timestamp so all clients (admin + viewers) finish at the same wall-clock time.
  // Using Date.now() here was the root cause: admin received bracket data instantly (local state),
  // while regular users received it seconds later via polling — resulting in different targetTimes.
  useEffect(() => {
    if (!bracket?.roundStartedAt) return;
    hasAdvancedRef.current = false;

    const storageKey = `timer_${bracket.roundStartedAt}`;
    let targetTime = sessionStorage.getItem(storageKey);

    if (!targetTime) {
      // Anchor to the server's roundStartedAt — same value for every client regardless of when they received the data
      targetTime = new Date(bracket.roundStartedAt).getTime() + roundDuration * 1000;
      sessionStorage.setItem(storageKey, targetTime);
    }

    const initialRemaining = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
    setTimeLeft(initialRemaining);

  }, [bracket?.currentRound, roundDuration, bracket?.roundStartedAt]);

  // 2. Keep the latest handleRoundEnd function in a ref to avoid interval restarts
  const handleRoundEndRef = useRef();

  // 3. The tick interval
  useEffect(() => {
    if (isFinished || showingResult) return;

    timerRef.current = setInterval(() => {
      if (!bracket?.roundStartedAt) return;
      
      const storageKey = `timer_${bracket.roundStartedAt}`;
      const targetTime = parseInt(sessionStorage.getItem(storageKey) || '0', 10);
      
      const remaining = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
      setTimeLeft(remaining);
        
      // Urgency effects
      if (remaining <= 10 && remaining > 0) {
        if (remaining <= 5) {
          setShakeActive(true);
          setTimeout(() => setShakeActive(false), 500);
        }
      }

      // Time's up — auto advance
      if (remaining <= 0 && isAdmin && !hasAdvancedRef.current) {
        hasAdvancedRef.current = true;
        if (handleRoundEndRef.current) {
          setTimeout(() => handleRoundEndRef.current(), 0);
        }
      }
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [isFinished, showingResult, isAdmin, bracket?.roundStartedAt]);

  // Poll votes for current round
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
        // silent
      }
    };

    pollVotes();
    const interval = setInterval(pollVotes, 2000);
    return () => clearInterval(interval);
  }, [API_URL, bracket?.currentRound, currentRound?.movieA, currentRound?.movieB, isFinished, showingResult]);

  // Reset internal state if the round changes externally (e.g. bot command !proximo)
  useEffect(() => {
    setShowingResult(false);
    setRoundWinner(null);
    setLocalVotesA(0);
    setLocalVotesB(0);
    hasAdvancedRef.current = false;
    clearInterval(nextRoundTimerRef.current);
    clearTimeout(autoAdvanceRef.current);
  }, [bracket?.currentRound]);

  // Champion screen
  useEffect(() => {
    if (isFinished && bracket?.champion) {
      setShowChampion(true);
      setTimeout(() => emitConfetti(), 500);
    }
  }, [isFinished, bracket?.champion, emitConfetti]);

  // Handle round end
  const handleRoundEnd = useCallback(async () => {
    clearInterval(nextRoundTimerRef.current);

    setShowingResult(true);
    const winner = localVotesA >= localVotesB ? currentRound?.movieA : currentRound?.movieB;
    setRoundWinner(winner);
    
    setNextRoundTimeLeft(5);
    nextRoundTimerRef.current = setInterval(() => {
      setNextRoundTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    // Wait for result display interval then advance
    autoAdvanceRef.current = setTimeout(async () => {
      clearInterval(nextRoundTimerRef.current);
      if (onNextRound) {
        await onNextRound();
      }
      // Note: setShowingResult(false) is now handled robustly by the useEffect 
      // listening to bracket.currentRound changes.
    }, 5000); // 5 seconds to show result

    return () => {
      clearTimeout(autoAdvanceRef.current);
      clearInterval(nextRoundTimerRef.current);
    };
  }, [localVotesA, localVotesB, currentRound, onNextRound]);

  // Keep the ref updated with the latest callback
  useEffect(() => {
    handleRoundEndRef.current = handleRoundEnd;
  }, [handleRoundEnd]);

  // Cleanup
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(autoAdvanceRef.current);
      clearInterval(nextRoundTimerRef.current);
      stopAll();
    };
  }, [stopAll]);

  // Accept optimistic bracket vote from Twitch chat
  const handleBracketVote = useCallback((choice) => {
    if (choice === 1) setLocalVotesA(prev => prev + 1);
    if (choice === 2) setLocalVotesB(prev => prev + 1);
  }, []);

  // Expose to parent
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

  // ── CHAMPION SCREEN ──
  if (showChampion && bracket?.champion) {
    const champData = getMovieData(bracket.champion);
    return (
      <div ref={containerRef} className="relative min-h-[80vh] flex flex-col items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-20"
        />

        {/* Background glow */}
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

          {/* Poster */}
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

          {/* Bracket Summary */}
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

  // ── VERSUS SCREEN ──
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
      {/* Particle Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-30"
      />

      {/* Round Label + Bracket Mini */}
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

        {/* Mini Bracket */}
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

      {/* Timer */}
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

      {/* Main Split View */}
      <div className="flex h-full" style={{ minHeight: '70vh' }}>

        {/* Movie A (Left — Cyan/Blue) */}
        <div
          key={`movieA-${currentRound.movieA}`}
          className="relative overflow-hidden transition-all duration-1000 ease-in-out"
          style={{
            flex: showingResult ? (roundWinner === currentRound.movieA ? 1 : 0.0001) : 1,
            opacity: showingResult && roundWinner !== currentRound.movieA ? 0 : 1,
            animation: !showingResult ? 'versusSlideLeft 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : undefined
          }}
        >
          {/* Background poster */}
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

          {/* Content */}
          <div className="relative z-10 h-full flex flex-col items-center justify-center p-4 sm:p-8">
            <span className="text-4xl sm:text-6xl font-black text-cyan-400/30 absolute top-16 left-4">!1</span>

            {movieA.posterPath && (
              <img
                src={`${TMDB_IMAGE_URL}${movieA.posterPath}`}
                alt={currentRound.movieA}
                className="w-28 sm:w-40 rounded-xl shadow-2xl shadow-cyan-500/20 border border-cyan-500/30 mb-4"
              />
            )}

            <h3 className="text-lg sm:text-2xl font-bold text-white text-center mb-1 drop-shadow-lg">
              {currentRound.movieA}
            </h3>
            {movieA.year && (
              <p className="text-cyan-300/70 text-xs mb-2">{movieA.year}</p>
            )}

            <div className="mt-2">
              <span className="text-3xl sm:text-5xl font-black text-white drop-shadow-lg">
                {localVotesA}
              </span>
              <p className="text-cyan-300/70 text-xs text-center">
                {totalVotes > 0 ? `${percentA.toFixed(0)}%` : '—'}
              </p>
            </div>

            {showingResult && roundWinner === currentRound.movieA && (
              <div className="mt-4 animate-fadeIn">
                <span className="text-amber-400 font-bold text-lg animate-glowPulse">⚡ VENCEDOR</span>
              </div>
            )}
          </div>
        </div>

        {/* VS Badge (Center) */}
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

        {/* Result countdown (Moved to the Right Side) */}
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

        {/* Movie B (Right — Red/Orange) */}
        <div
          key={`movieB-${currentRound.movieB}`}
          className="relative overflow-hidden transition-all duration-1000 ease-in-out"
          style={{
            flex: showingResult ? (roundWinner === currentRound.movieB ? 1 : 0.0001) : 1,
            opacity: showingResult && roundWinner !== currentRound.movieB ? 0 : 1,
            animation: !showingResult ? 'versusSlideRight 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : undefined
          }}
        >
          {/* Background poster */}
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

          {/* Content */}
          <div className="relative z-10 h-full flex flex-col items-center justify-center p-4 sm:p-8">
            <span className="text-4xl sm:text-6xl font-black text-red-400/30 absolute top-16 right-4">!2</span>

            {movieB.posterPath && (
              <img
                src={`${TMDB_IMAGE_URL}${movieB.posterPath}`}
                alt={currentRound.movieB}
                className="w-28 sm:w-40 rounded-xl shadow-2xl shadow-red-500/20 border border-red-500/30 mb-4"
              />
            )}

            <h3 className="text-lg sm:text-2xl font-bold text-white text-center mb-1 drop-shadow-lg">
              {currentRound.movieB}
            </h3>
            {movieB.year && (
              <p className="text-red-300/70 text-xs mb-2">{movieB.year}</p>
            )}

            <div className="mt-2">
              <span className="text-3xl sm:text-5xl font-black text-white drop-shadow-lg">
                {localVotesB}
              </span>
              <p className="text-red-300/70 text-xs text-center">
                {totalVotes > 0 ? `${percentB.toFixed(0)}%` : '—'}
              </p>
            </div>

            {showingResult && roundWinner === currentRound.movieB && (
              <div className="mt-4 animate-fadeIn">
                <span className="text-amber-400 font-bold text-lg animate-glowPulse">⚡ VENCEDOR</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar (Tug of War) */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-3 sm:p-4">
        <div className="bg-black/60 backdrop-blur-sm rounded-xl p-3 border border-white/10">
          {/* Vote counts */}
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

          {/* The tug-of-war bar */}
          <div className="h-3 sm:h-4 bg-gray-800 rounded-full overflow-hidden relative">
            {/* Movie A side */}
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-l-full transition-all duration-500 ease-out"
              style={{ width: `${percentA}%` }}
            />
            {/* Movie B side */}
            <div
              className="absolute right-0 top-0 h-full bg-gradient-to-l from-red-500 to-red-400 rounded-r-full transition-all duration-500 ease-out"
              style={{ width: `${percentB}%` }}
            />
            {/* Collision point glow */}
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

          {/* Percentage */}
          <div className="flex justify-between mt-1.5">
            <span className="text-cyan-400/70 text-[10px] font-medium">
              {totalVotes > 0 ? `${percentA.toFixed(0)}%` : '50%'}
            </span>
            <span className="text-red-400/70 text-[10px] font-medium">
              {totalVotes > 0 ? `${percentB.toFixed(0)}%` : '50%'}
            </span>
          </div>

          {/* Voting instructions */}
          {!showingResult && (
            <p className="text-center text-[10px] text-gray-500 mt-2">
              Vote no chat: <code className="text-cyan-400">!1</code> ou <code className="text-red-400">!2</code>
            </p>
          )}
        </div>
      </div>

      {/* Admin Manual Controls (fallback) */}
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
