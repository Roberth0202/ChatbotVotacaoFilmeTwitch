import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Film, TrendingUp, Star, Clock } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || '';
const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p/w500';
const POLLING_INTERVAL = 2000;

const getCertificationStyle = (cert) => {
  if (!cert) return { bg: 'bg-gray-600', text: 'N/A' };
  const c = cert.toUpperCase();
  if (c === 'L' || c === 'LIVRE') return { bg: 'bg-green-500', text: 'L' };
  if (c === '10') return { bg: 'bg-blue-500', text: '10' };
  if (c === '12') return { bg: 'bg-yellow-500', text: '12' };
  if (c === '14') return { bg: 'bg-orange-500', text: '14' };
  if (c === '16') return { bg: 'bg-red-500', text: '16' };
  if (c === '18') return { bg: 'bg-black', text: '18' };
  if (c === 'G') return { bg: 'bg-green-500', text: 'L' };
  if (c === 'PG') return { bg: 'bg-blue-500', text: '10' };
  if (c === 'PG-13') return { bg: 'bg-yellow-500', text: '12' };
  if (c === 'R') return { bg: 'bg-orange-500', text: '16' };
  if (c === 'NC-17') return { bg: 'bg-black', text: '18' };
  return { bg: 'bg-gray-600', text: cert };
};

export default function TwitchMovieVoting() {
  const [ranking, setRanking] = useState([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [lastVote, setLastVote] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [votingActive, setVotingActive] = useState(false);
  const [expandedMovies, setExpandedMovies] = useState({});
  const [watchedMovies, setWatchedMovies] = useState([]);
  const [activeTab, setActiveTab] = useState('votacao');

  // useRef para evitar recriação do useCallback e reinício do interval
  const prevRankingRef = useRef([]);
  const totalVotesRef = useRef(0);

  const fetchRanking = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/ranking`);
      if (!response.ok) throw new Error('API error');

      const data = await response.json();
      setIsConnected(true);

      const newRanking = data.ranking || [];
      const newTotal = data.totalVotes || 0;

      // Detectar novos votos comparando com refs (sem recriar callback)
      if (newTotal > totalVotesRef.current && prevRankingRef.current.length > 0) {
        for (const movie of newRanking) {
          const prev = prevRankingRef.current.find(m => m.name === movie.name);
          if (!prev || movie.count > prev.count) {
            const newVoter = prev
              ? movie.voters.find(v => !prev.voters.includes(v))
              : movie.voters[movie.voters.length - 1];

            if (newVoter) {
              setLastVote({
                username: newVoter,
                movie: movie.name,
                totalVotes: newTotal
              });
              setTimeout(() => setLastVote(null), 4000);
            }
            break;
          }
        }
      }

      prevRankingRef.current = newRanking;
      totalVotesRef.current = newTotal;
      setRanking(newRanking);
      setTotalVotes(newTotal);
      setVotingActive(data.votingActive || false);
      if (data.watchedMovies) setWatchedMovies(data.watchedMovies);

    } catch (error) {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchRanking();
    const interval = setInterval(fetchRanking, POLLING_INTERVAL);

    // Pausar/retomar polling baseado na visibilidade da aba
    let resumeInterval;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        fetchRanking();
        resumeInterval = setInterval(fetchRanking, POLLING_INTERVAL);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      if (resumeInterval) clearInterval(resumeInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchRanking]);

  return (
    <div className="min-h-screen bg-[#0d0b1a] text-white font-sans">

      {/* ── Header ── */}
      <header className="border-b border-white/5">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">
              🎬 Votação de Filmes
            </h1>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="inline-flex items-center gap-2 bg-white/5 border border-white/5 rounded-full px-3 py-1.5">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 motion-safe:animate-pulse' : 'bg-red-500'}`} />
                <span className="text-xs text-gray-400">
                  {isConnected ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${
                votingActive
                  ? 'bg-violet-500/15 border border-violet-500/20'
                  : 'bg-white/5 border border-white/5'
              }`}>
                <div className={`w-2 h-2 rounded-full ${votingActive ? 'bg-violet-400 motion-safe:animate-pulse' : 'bg-gray-600'}`} />
                <span className={`text-xs ${votingActive ? 'text-violet-300' : 'text-gray-500'}`}>
                  {votingActive ? 'Aberta' : 'Fechada'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-6 lg:px-8 pb-8 sm:pb-12">

        {/* ── Legenda de Faixas Etárias ── */}
        <div className="-mx-3 sm:-mx-6 lg:-mx-8 bg-white/5 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 px-5 sm:p-5 sm:px-8 lg:px-12 border border-white/10 mb-4 sm:mb-6">
          <h3 className="text-xs sm:text-sm font-semibold text-gray-300 mb-3 text-center">📋 Classificação Indicativa</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            <div className="flex items-start gap-2 bg-green-500/10 rounded-lg p-2">
              <span className="w-6 h-6 shrink-0 rounded bg-green-500 flex items-center justify-center text-[10px] font-bold text-white">L</span>
              <div><p className="text-[10px] sm:text-xs font-semibold text-green-400">Livre</p><p className="text-[10px] sm:text-xs text-white leading-tight">Conteúdo seguro para todas as idades</p></div>
            </div>
            <div className="flex items-start gap-2 bg-blue-500/10 rounded-lg p-2">
              <span className="w-6 h-6 shrink-0 rounded bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white">10</span>
              <div><p className="text-[10px] sm:text-xs font-semibold text-blue-400">10 anos</p><p className="text-[10px] sm:text-xs text-white leading-tight">Violência fantasiosa, linguagem levemente imprópria</p></div>
            </div>
            <div className="flex items-start gap-2 bg-yellow-500/10 rounded-lg p-2">
              <span className="w-6 h-6 shrink-0 rounded bg-yellow-500 flex items-center justify-center text-[10px] font-bold text-white">12</span>
              <div><p className="text-[10px] sm:text-xs font-semibold text-yellow-400">12 anos</p><p className="text-[10px] sm:text-xs text-white leading-tight">Violência moderada, insinuação sexual, uso de drogas lícitas</p></div>
            </div>
            <div className="flex items-start gap-2 bg-orange-500/10 rounded-lg p-2">
              <span className="w-6 h-6 shrink-0 rounded bg-orange-500 flex items-center justify-center text-[10px] font-bold text-white">14</span>
              <div><p className="text-[10px] sm:text-xs font-semibold text-orange-400">14 anos</p><p className="text-[10px] sm:text-xs text-white leading-tight">Violência intensa, nudez não explícita, uso de drogas ilícitas</p></div>
            </div>
            <div className="flex items-start gap-2 bg-red-500/10 rounded-lg p-2">
              <span className="w-6 h-6 shrink-0 rounded bg-red-500 flex items-center justify-center text-[10px] font-bold text-white">16</span>
              <div><p className="text-[10px] sm:text-xs font-semibold text-red-400">16 anos</p><p className="text-[10px] sm:text-xs text-white leading-tight">Violência extrema, nudez explícita, uso abusivo de drogas</p></div>
            </div>
            <div className="flex items-start gap-2 bg-gray-500/10 rounded-lg p-2">
              <span className="w-6 h-6 shrink-0 rounded bg-black border border-gray-600 flex items-center justify-center text-[10px] font-bold text-white">18</span>
              <div><p className="text-[10px] sm:text-xs font-semibold text-gray-300">18 anos</p><p className="text-[10px] sm:text-xs text-white leading-tight">Conteúdo sexual explícito, violência extrema, tortura, mutilação</p></div>
            </div>
          </div>
        </div>

        {/* ── Abas ── */}
        <div className="flex gap-1 mb-6 bg-white/5 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('votacao')}
            className={`flex-1 py-2 rounded-md font-medium text-sm transition-all ${
              activeTab === 'votacao'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Votação {ranking.length > 0 && `(${ranking.length})`}
          </button>
          <button
            onClick={() => setActiveTab('assistidos')}
            className={`flex-1 py-2 rounded-md font-medium text-sm transition-all ${
              activeTab === 'assistidos'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Assistidos {watchedMovies.length > 0 && `(${watchedMovies.length})`}
          </button>
        </div>

        {activeTab === 'votacao' && (<>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
          <div className="bg-white/[0.03] rounded-lg p-3 sm:p-4 border border-white/5">
            <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Votos</p>
            <p className="text-lg sm:text-2xl font-bold text-white">{totalVotes}</p>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-3 sm:p-4 border border-white/5">
            <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Filmes</p>
            <p className="text-lg sm:text-2xl font-bold text-white">{ranking.length}</p>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-3 sm:p-4 border border-white/5">
            <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Líder</p>
            <p className="text-xs sm:text-sm font-semibold text-white truncate">
              {ranking.length > 0 ? ranking[0].name : '—'}
            </p>
          </div>
        </div>

        {/* ── Notificação de Voto ── */}
        {lastVote && (
          <div className="mb-4 motion-safe:animate-slideDown">
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3">
              <p className="text-center text-xs sm:text-sm">
                <span className="font-semibold text-violet-300">@{lastVote.username}</span>
                {' '}votou em <span className="font-semibold text-white">{lastVote.movie}</span>
              </p>
            </div>
          </div>
        )}

        {/* ── Ranking de Filmes ── */}
        {ranking.length === 0 ? (
          <div className="text-center py-16 sm:py-24">
            <TrendingUp className="w-10 h-10 mx-auto mb-4 text-gray-600" />
            <p className="text-gray-500 text-sm">Aguardando votos...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
            {ranking.map((movie, index) => {
              const certStyle = getCertificationStyle(movie.certification);
              const percentage = totalVotes > 0 ? ((movie.count / totalVotes) * 100).toFixed(1) : 0;
              const isWatched = watchedMovies.some(w => w.title.toLowerCase() === movie.name.toLowerCase());

              return (
                <div
                  key={movie.name}
                  className={`group relative bg-white/[0.03] rounded-lg border overflow-hidden motion-safe:transition-all motion-safe:duration-300 motion-safe:hover:border-violet-500/30 ${
                    index === 0
                      ? 'border-violet-500/30'
                      : 'border-white/5'
                  }`}
                >
                  {/* Badge de posição */}
                  <div className={`absolute top-2 left-2 z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center text-xs sm:text-sm font-bold ${
                    index === 0
                      ? 'bg-violet-500 text-white'
                      : index === 1
                      ? 'bg-white/15 text-gray-300'
                      : index === 2
                      ? 'bg-white/10 text-gray-400'
                      : 'bg-white/5 text-gray-500'
                  }`}>
                    {index + 1}
                  </div>

                  {/* Badge de classificação indicativa */}
                  <div className={`absolute top-2 right-2 sm:top-3 sm:right-3 z-10 ${certStyle.bg} text-white text-[10px] sm:text-xs font-bold px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded-md sm:rounded-lg shadow-lg`}>
                    {certStyle.text}
                  </div>

                  {/* Badge de assistido */}
                  {isWatched && (
                    <div className="absolute top-10 right-2 sm:top-12 sm:right-3 z-10 bg-emerald-500/90 text-white text-[8px] sm:text-[10px] font-bold px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md shadow-lg">
                      ✅ VISTO
                    </div>
                  )}

                  {/* Poster do Filme */}
                  <div className="relative aspect-[2/3] overflow-hidden bg-gray-900/50">
                    {movie.posterPath ? (
                      <img
                        src={`${TMDB_IMAGE_URL}${movie.posterPath}`}
                        alt={movie.name}
                        loading="lazy"
                        className="w-full h-full object-cover motion-safe:group-hover:scale-110 motion-safe:transition-transform motion-safe:duration-700"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                        <Film className="w-12 h-12 sm:w-20 sm:h-20 text-gray-600" />
                      </div>
                    )}

                    {/* Overlay gradiente */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                    {/* Votos sobre o poster */}
                    <div className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-3 sm:right-3">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-xl sm:text-3xl font-extrabold text-white drop-shadow-lg">
                            {movie.count}
                          </p>
                          <p className="text-[10px] sm:text-xs text-white/70">
                            {movie.count === 1 ? 'voto' : 'votos'} • {percentage}%
                          </p>
                        </div>
                        {movie.voteAverage && (
                          <div className="flex items-center gap-0.5 sm:gap-1 bg-black/50 backdrop-blur-sm rounded-md sm:rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-1">
                            <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-400 fill-yellow-400" />
                            <span className="text-[10px] sm:text-sm font-semibold text-yellow-200">
                              {movie.voteAverage.toFixed(1)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Barra de progresso */}
                      <div className="mt-1.5 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-violet-500 motion-safe:transition-all motion-safe:duration-1000 ease-out"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Info do Filme */}
                  <div className="p-2.5 sm:p-4">
                    <h3 className="text-sm sm:text-lg font-bold mb-0.5 sm:mb-1 text-white leading-tight line-clamp-2">
                      {movie.name}
                    </h3>

                    {movie.year && (
                      <div className="flex items-center gap-1 sm:gap-1.5 mb-1.5 sm:mb-3">
                        <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-500" />
                        <span className="text-[10px] sm:text-xs text-gray-500">{movie.year}</span>
                      </div>
                    )}

                    {movie.overview && (
                      <div className="hidden sm:block">
                        <p className={`text-xs text-gray-400 leading-relaxed ${
                          expandedMovies[movie.name] ? '' : 'line-clamp-2'
                        }`}>
                          {movie.overview}
                        </p>
                        <button
                          onClick={() => setExpandedMovies(prev => ({
                            ...prev,
                            [movie.name]: !prev[movie.name]
                          }))}
                          className="text-[10px] text-violet-400 hover:text-violet-300 mt-1 font-medium"
                        >
                          {expandedMovies[movie.name] ? '▲ ver menos' : '▼ ver mais'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        </>)}

        {/* ── Aba Assistidos ── */}
        {activeTab === 'assistidos' && (
          <div>
            {watchedMovies.length === 0 ? (
              <div className="text-center py-16">
                <Film className="w-10 h-10 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-500 text-sm">Nenhum filme assistido ainda</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {watchedMovies.map((movie, i) => {
                  const certStyle = getCertificationStyle(movie.certification);
                  const date = movie.markedAt ? new Date(movie.markedAt) : null;
                  return (
                    <div key={i} className="bg-white/[0.03] rounded-lg border border-white/5 overflow-hidden motion-safe:hover:border-violet-500/20 motion-safe:transition-all">
                      <div className="flex gap-3 sm:gap-4 p-3 sm:p-4">
                        {/* Poster */}
                        {movie.posterPath ? (
                          <img
                            src={`${TMDB_IMAGE_URL}${movie.posterPath}`}
                            alt={movie.title}
                            className="w-16 h-24 sm:w-20 sm:h-30 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-24 sm:w-20 sm:h-30 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                            <Film className="w-6 h-6 text-gray-500" />
                          </div>
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 mb-1">
                            <h3 className="text-sm sm:text-lg font-bold text-white leading-tight truncate">
                              {movie.title}
                            </h3>
                            <span className="shrink-0 bg-violet-500/20 text-violet-300 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded border border-violet-500/30">
                              ✓ VISTO
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mb-2 text-[10px] sm:text-xs text-gray-400">
                            {movie.year && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {movie.year}
                              </span>
                            )}
                            {movie.certification && (
                              <span className={`${certStyle.bg} text-white text-[9px] font-bold px-1.5 py-0.5 rounded`}>
                                {certStyle.text}
                              </span>
                            )}
                            {movie.voteAverage && (
                              <span className="flex items-center gap-0.5">
                                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                {movie.voteAverage.toFixed(1)}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] sm:text-xs text-gray-500 mb-2">
                            {date && (
                              <span>📅 {date.toLocaleDateString('pt-BR')}</span>
                            )}
                            {movie.markedBy && (
                              <span>👤 {movie.markedBy}</span>
                            )}
                          </div>

                          {movie.overview && (
                            <p className="text-[10px] sm:text-xs text-gray-300 leading-relaxed line-clamp-2">
                              {movie.overview}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
