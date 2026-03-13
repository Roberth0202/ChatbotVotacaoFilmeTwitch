import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, Users, Film, TrendingUp, Star, Clock } from 'lucide-react';

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
  const [prevRanking, setPrevRanking] = useState([]);

  const fetchRanking = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/ranking`);
      if (!response.ok) throw new Error('API error');

      const data = await response.json();
      setIsConnected(true);

      // Detect new votes by comparing ranking
      const newRanking = data.ranking || [];
      const newTotal = data.totalVotes || 0;

      if (newTotal > totalVotes && prevRanking.length > 0) {
        // Find the vote that changed
        for (const movie of newRanking) {
          const prev = prevRanking.find(m => m.name === movie.name);
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

      setPrevRanking(newRanking);
      setRanking(newRanking);
      setTotalVotes(newTotal);
      setVotingActive(data.votingActive || false);
      if (data.watchedMovies) setWatchedMovies(data.watchedMovies);

    } catch (error) {
      setIsConnected(false);
    }
  }, [totalVotes, prevRanking]);

  useEffect(() => {
    fetchRanking();
    const interval = setInterval(fetchRanking, POLLING_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchRanking]);

  const getPositionEmoji = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] text-white font-sans">

      {/* ── Header ── */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/30 via-transparent to-transparent" />
        <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
          <div className="text-center">
            <h1 className="text-3xl sm:text-5xl lg:text-7xl font-extrabold mb-2 sm:mb-3 pb-3 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 leading-normal">
              🎬 Votação de Filmes
            </h1>
            <p className="text-sm sm:text-lg lg:text-xl text-gray-300/80 mb-4 sm:mb-5 max-w-md sm:max-w-none mx-auto">
              Digite <strong className="text-teal-300">!votar</strong> + nome do filme no chat da Twitch!
            </p>

            {/* Status */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 sm:px-4 sm:py-2 min-h-[44px] touch-manipulation">
                <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full motion-safe:transition-colors ${isConnected ? 'bg-emerald-400 motion-safe:animate-pulse shadow-lg shadow-emerald-400/50' : 'bg-red-500'}`} />
                <span className="text-xs sm:text-sm text-gray-300/70">
                  {isConnected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 sm:px-4 sm:py-2 min-h-[44px] touch-manipulation ${
                votingActive
                  ? 'bg-teal-500/20 border border-teal-500/30'
                  : 'bg-gray-500/10 border border-gray-500/20'
              }`}>
                <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${votingActive ? 'bg-teal-400 motion-safe:animate-pulse' : 'bg-gray-500'}`} />
                <span className={`text-xs sm:text-sm ${votingActive ? 'text-teal-300' : 'text-gray-500'}`}>
                  {votingActive ? 'Votação aberta' : 'Votação fechada'}
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
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('votacao')}
            className={`flex-1 py-2.5 sm:py-3 rounded-xl font-semibold text-sm sm:text-base transition-all min-h-[44px] ${
              activeTab === 'votacao'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            🎬 Votação {ranking.length > 0 && `(${ranking.length})`}
          </button>
          <button
            onClick={() => setActiveTab('assistidos')}
            className={`flex-1 py-2.5 sm:py-3 rounded-xl font-semibold text-sm sm:text-base transition-all min-h-[44px] ${
              activeTab === 'assistidos'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            ✅ Assistidos {watchedMovies.length > 0 && `(${watchedMovies.length})`}
          </button>
        </div>

        {activeTab === 'votacao' && (<>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-10">
          {/* Total de Votos */}
          <div className="bg-white/5 backdrop-blur-xl rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-white/10 motion-safe:hover:border-teal-500/30 motion-safe:transition-all motion-safe:duration-300">
            <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-4">
              <div className="bg-teal-500/20 p-2 sm:p-3 rounded-lg sm:rounded-xl">
                <Users className="w-5 h-5 sm:w-7 sm:h-7 text-teal-400" />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-400/60 hidden sm:block">Total de Votos</p>
                <p className="text-xl sm:text-3xl font-bold text-white">{totalVotes}</p>
                <p className="text-[10px] text-gray-400/60 sm:hidden">Votos</p>
              </div>
            </div>
          </div>

          {/* Filmes na Disputa */}
          <div className="bg-white/5 backdrop-blur-xl rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-white/10 motion-safe:hover:border-pink-500/30 motion-safe:transition-all motion-safe:duration-300">
            <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-4">
              <div className="bg-pink-500/20 p-2 sm:p-3 rounded-lg sm:rounded-xl">
                <Film className="w-5 h-5 sm:w-7 sm:h-7 text-pink-400" />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-400/60 hidden sm:block">Filmes na Disputa</p>
                <p className="text-xl sm:text-3xl font-bold text-white">{ranking.length}</p>
                <p className="text-[10px] text-gray-400/60 sm:hidden">Filmes</p>
              </div>
            </div>
          </div>

          {/* Líder Atual */}
          <div className="bg-white/5 backdrop-blur-xl rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-white/10 motion-safe:hover:border-yellow-500/30 motion-safe:transition-all motion-safe:duration-300">
            <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-4">
              <div className="bg-yellow-500/20 p-2 sm:p-3 rounded-lg sm:rounded-xl">
                <Trophy className="w-5 h-5 sm:w-7 sm:h-7 text-yellow-400" />
              </div>
              <div className="text-center sm:text-left min-w-0 w-full">
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-400/60 hidden sm:block">Líder Atual</p>
                <p className="text-xs sm:text-xl font-bold text-white truncate">
                  {ranking.length > 0 ? ranking[0].name : 'Nenhum'}
                </p>
                <p className="text-[10px] text-gray-400/60 sm:hidden">Líder</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Notificação de Voto ── */}
        {lastVote && (
          <div className="mb-4 sm:mb-8 motion-safe:animate-slideDown">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 sm:p-4 backdrop-blur-xl">
              <p className="text-center text-xs sm:text-base">
                <span className="font-bold text-emerald-300">@{lastVote.username}</span>
                {' '}votou em <span className="font-bold text-yellow-300">{lastVote.movie}</span> ✅
              </p>
            </div>
          </div>
        )}

        {/* ── Ranking de Filmes ── */}
        {ranking.length === 0 ? (
          <div className="text-center py-12 sm:py-20">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-8 sm:p-16 border border-white/10 max-w-sm sm:max-w-lg mx-auto">
              <TrendingUp className="w-12 h-12 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 text-teal-400/40" />
              <h3 className="text-lg sm:text-2xl font-semibold mb-2 sm:mb-3 text-gray-200/80">
                Aguardando votos...
              </h3>
              <p className="text-sm sm:text-base text-gray-400/50">
                Os espectadores podem votar digitando o nome do filme no chat!
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
            {ranking.map((movie, index) => {
              const certStyle = getCertificationStyle(movie.certification);
              const percentage = totalVotes > 0 ? ((movie.count / totalVotes) * 100).toFixed(1) : 0;
              const isWatched = watchedMovies.some(w => w.title.toLowerCase() === movie.name.toLowerCase());

              return (
                <div
                  key={movie.name}
                  className={`group relative bg-white/5 backdrop-blur-xl rounded-xl sm:rounded-2xl border overflow-hidden motion-safe:transition-all motion-safe:duration-500 motion-safe:hover:scale-[1.03] motion-safe:hover:shadow-2xl motion-safe:hover:shadow-teal-500/10 ${
                    index === 0
                      ? 'border-yellow-500/40 shadow-lg shadow-yellow-500/10'
                      : index === 1
                      ? 'border-gray-400/30'
                      : index === 2
                      ? 'border-orange-500/30'
                      : 'border-white/10'
                  }`}
                >
                  {/* Badge de posição */}
                  <div className={`absolute top-2 left-2 sm:top-3 sm:left-3 z-10 w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center text-sm sm:text-lg font-bold shadow-lg ${
                    index === 0
                      ? 'bg-gradient-to-br from-yellow-400 to-amber-600'
                      : index === 1
                      ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-gray-800'
                      : index === 2
                      ? 'bg-gradient-to-br from-orange-400 to-orange-600'
                      : 'bg-white/10 backdrop-blur-xl border border-white/20'
                  }`}>
                    {getPositionEmoji(index)}
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
                      <div className="mt-1.5 sm:mt-2 h-1 sm:h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full motion-safe:transition-all motion-safe:duration-1000 ease-out ${
                            index === 0
                              ? 'bg-gradient-to-r from-yellow-400 to-amber-500'
                              : index === 1
                              ? 'bg-gradient-to-r from-gray-300 to-gray-400'
                              : index === 2
                              ? 'bg-gradient-to-r from-orange-400 to-orange-500'
                              : 'bg-gradient-to-r from-teal-400 to-cyan-500'
                          }`}
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
                        <p className={`text-xs text-white leading-relaxed ${
                          expandedMovies[movie.name] ? '' : 'line-clamp-2'
                        }`}>
                          {movie.overview}
                        </p>
                        <button
                          onClick={() => setExpandedMovies(prev => ({
                            ...prev,
                            [movie.name]: !prev[movie.name]
                          }))}
                          className="text-[10px] text-teal-400 hover:text-teal-300 mt-1 font-medium min-h-[44px] sm:min-h-0"
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

        {/* ── Como Votar ── */}
        <div className="mt-8 sm:mt-14">
          <div className="bg-white/5 backdrop-blur-xl rounded-xl sm:rounded-2xl p-5 sm:p-8 border border-white/10">
            <h3 className="text-base sm:text-xl font-semibold mb-4 sm:mb-5 text-center text-gray-200/80">📝 Como Votar</h3>
            <div className="grid grid-cols-3 gap-3 sm:gap-6 text-xs sm:text-sm">
              <div className="text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 rounded-lg sm:rounded-xl bg-teal-500/20 flex items-center justify-center text-lg sm:text-2xl">
                  💬
                </div>
                <p className="font-semibold text-white mb-0.5 sm:mb-1 text-[11px] sm:text-sm">1. Use !votar</p>
                <p className="text-gray-400/50 text-[10px] sm:text-xs leading-tight">!votar nome do filme no chat</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 rounded-lg sm:rounded-xl bg-pink-500/20 flex items-center justify-center text-lg sm:text-2xl">
                  ✅
                </div>
                <p className="font-semibold text-white mb-0.5 sm:mb-1 text-[11px] sm:text-sm">2. Seu voto conta</p>
                <p className="text-gray-400/50 text-[10px] sm:text-xs leading-tight">Cada pessoa vota 1 vez</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 rounded-lg sm:rounded-xl bg-yellow-500/20 flex items-center justify-center text-lg sm:text-2xl">
                  🔄
                </div>
                <p className="font-semibold text-white mb-0.5 sm:mb-1 text-[11px] sm:text-sm">3. Mude se quiser</p>
                <p className="text-gray-400/50 text-[10px] sm:text-xs leading-tight">!votar outro filme para trocar</p>
              </div>
            </div>
          </div>
        </div>

        </>)}

        {/* ── Aba Assistidos ── */}
        {activeTab === 'assistidos' && (
          <div>
            {watchedMovies.length === 0 ? (
              <div className="text-center py-16">
                <Film className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400 text-lg">Nenhum filme assistido ainda</p>
                <p className="text-gray-500 text-sm mt-1">Mods podem marcar filmes com <strong className="text-emerald-400">!assistido</strong> nome do filme</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {watchedMovies.map((movie, i) => {
                  const certStyle = getCertificationStyle(movie.certification);
                  const date = movie.markedAt ? new Date(movie.markedAt) : null;
                  return (
                    <div key={i} className="bg-emerald-500/5 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-emerald-500/20 overflow-hidden motion-safe:hover:border-emerald-500/40 motion-safe:transition-all">
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
                            <span className="shrink-0 bg-emerald-500/20 text-emerald-300 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/30">
                              ✅ ASSISTIDO
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
