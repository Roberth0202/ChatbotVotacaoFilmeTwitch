import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Film, TrendingUp, Star, Clock, Search, Loader2 } from 'lucide-react';
import { useTwitchChat } from './hooks/useTwitchChat';

const API_URL = process.env.REACT_APP_API_URL || '';
const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p/w500';
const POLLING_INTERVAL = 10000; // Backup do WebSocket — fetch sob demanda cuida de filmes novos
const TWITCH_CHANNEL = process.env.REACT_APP_TWITCH_CHANNEL || 'roberth0202';

const TMDB_GENRES = {
  28: 'Ação', 12: 'Aventura', 16: 'Animação', 35: 'Comédia', 80: 'Crime',
  99: 'Documentário', 18: 'Drama', 10751: 'Família', 14: 'Fantasia',
  36: 'História', 27: 'Terror', 10402: 'Música', 9648: 'Mistério',
  10749: 'Romance', 878: 'Ficção científica', 10770: 'Cinema TV',
  53: 'Thriller', 10752: 'Guerra', 37: 'Faroeste'
};

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
  const [activeTab, setActiveTab] = useState('votacao'); // 'votacao', 'assistidos', 'admin'
  const [isAdmin, setIsAdmin] = useState(() => !!localStorage.getItem('adminToken'));
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isProcessingControl, setIsProcessingControl] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState(null);

  // Hook da Twitch para WebSockets
  const { chatConnected, lastVoteEvent } = useTwitchChat(TWITCH_CHANNEL);

  // Effect para a busca automática ao digitar
  useEffect(() => {
    if (!manualSearch.trim() || manualSearch.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${API_URL}/api/movies/search?query=${encodeURIComponent(manualSearch)}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
          setShowDropdown(true);
        }
      } catch (e) {
        console.error('Busca TMDB falhou', e);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [manualSearch]);

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

  // Verificar se o usuário está voltando de um redirecionamento da Twitch (Callback OAUTH)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    
    if (code && !isAdmin && !isLoggingIn) {
      setIsLoggingIn(true);
      // Falar com a nossa própria API para trocar o code pelo JWT
      fetch(`${API_URL}/api/auth/twitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          redirectUri: window.location.origin // Onde o React está rodando
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.token) {
          localStorage.setItem('adminToken', data.token);
          setIsAdmin(true);
          window.history.replaceState({}, document.title, window.location.pathname); // Limpa a URL
        } else {
          alert(`Erro no Login: ${data.error || 'Falha na autorização'}`);
        }
      })
      .catch(err => {
        console.error('Erro na API de Auth:', err);
        alert('Falha ao se comunicar com o servidor de login.');
      })
      .finally(() => {
        setIsLoggingIn(false);
      });
    }
  }, [isAdmin, isLoggingIn]);

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

  // Efeito trigado sempre que o WebSocket recebe um voto (!votar ou !v) na Twitch
  useEffect(() => {
    if (!lastVoteEvent) return;

    const { username, movieName } = lastVoteEvent;

    // 1. Atualização Otimista Visual (Instantânea para todos)
    setLastVote({
      username,
      movie: movieName,
      totalVotes: totalVotesRef.current + 1
    });
    setTimeout(() => setLastVote(null), 4000);

    setTotalVotes(prev => {
      totalVotesRef.current = prev + 1;
      return prev + 1;
    });
    
    // Incrementa graficamente local ou busca dados do filme novo
    setRanking(prev => {
      const exists = prev.find(m => m.name.toLowerCase() === movieName.toLowerCase());
      if (exists) {
        return prev.map(m => 
          m.name.toLowerCase() === movieName.toLowerCase() 
            ? { ...m, count: m.count + 1, voters: [...m.voters, username] } 
            : m
        ).sort((a, b) => b.count - a.count);
      }
      // Filme novo: fetch imediato para trazer dados TMDB (poster, ano, etc.)
      fetchRanking();
      return prev;
    });

    // 2. Somente o navegador que tem a autorização salva os votos no MongoDB
    const token = localStorage.getItem('adminToken');
    if (token) {
      fetch(`${API_URL}/api/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username, movieName })
      }).catch(err => console.error('Erro ao enviar voto pro BD:', err));
    }
  }, [lastVoteEvent, fetchRanking]);

  return (
    <div className="min-h-screen bg-[#0d0b1a] text-white font-sans overflow-x-hidden">

      {/* ── Header ── */}
      <header className="border-b border-white/5">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">
              🎬 Votação de Filmes
            </h1>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="inline-flex items-center gap-2 bg-white/5 border border-white/5 rounded-full px-3 py-1.5">
                <div className={`w-2 h-2 rounded-full ${chatConnected ? 'bg-cyan-400 motion-safe:animate-pulse' : 'bg-red-500'}`} />
                <span className="text-xs text-gray-400 hidden sm:inline">
                  {chatConnected ? 'Chat Conectado' : 'Sem Chat'}
                </span>
                {chatConnected && isAdmin && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded ml-1 border border-emerald-500/20">
                    Lendo Votos
                  </span>
                )}
                {chatConnected && !isAdmin && (
                  <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded ml-1 border border-red-500/20" title="Faça login como Admin para contabilizar votos">
                    Votos Pausados (Faça Login)
                  </span>
                )}
              </div>
              <div className="inline-flex items-center gap-2 bg-white/5 border border-white/5 rounded-full px-3 py-1.5">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 motion-safe:animate-pulse' : 'bg-red-500'}`} />
                <span className="text-xs text-gray-400">
                  {isConnected ? 'API Online' : 'API Offline'}
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

      <main className="container mx-auto px-3 sm:px-6 lg:px-8 pb-8 sm:pb-12 overflow-x-hidden">

        {/* ── Legenda de Faixas Etárias ── */}
        <div className="-mx-3 sm:-mx-6 lg:-mx-8 bg-white/5  rounded-xl sm:rounded-2xl p-4 px-5 sm:p-5 sm:px-8 lg:px-12 border border-white/10 mb-4 sm:mb-6">
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
        <div className="flex gap-1 mb-6 bg-transparent p-1 rounded-xl border border-white/[0.06]">
          <button
            onClick={() => setActiveTab('votacao')}
            className={`flex-1 py-2 rounded-md font-medium text-sm transition-all outline-none focus:outline-none focus:ring-0 border ${
              activeTab === 'votacao'
                ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border-transparent'
            }`}
          >
            Votação {ranking.length > 0 && `(${ranking.length})`}
          </button>
          <button
            onClick={() => setActiveTab('assistidos')}
            className={`flex-1 py-2 rounded-md font-medium text-sm transition-all outline-none focus:outline-none focus:ring-0 border ${
              activeTab === 'assistidos'
                ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border-transparent'
            }`}
          >
            Assistidos {watchedMovies.length > 0 && `(${watchedMovies.length})`}
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex-1 py-2 rounded-md font-medium text-sm transition-all flex items-center justify-center gap-1.5 outline-none focus:outline-none focus:ring-0 border ${
                activeTab === 'admin'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'text-gray-500 hover:text-emerald-400/70 hover:bg-white/5 border-transparent'
              }`}
            >
              🔒 Painel Admin
            </button>
          )}
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

        {/* ── Filtro de Gênero ── */}
        {ranking.length > 0 && (() => {
          const availableGenres = [...new Set(ranking.flatMap(m => m.genreIds || []))]
            .filter(id => TMDB_GENRES[id])
            .sort((a, b) => TMDB_GENRES[a].localeCompare(TMDB_GENRES[b]));
          if (availableGenres.length === 0) return null;
          return (
            <div className="mb-4 flex flex-wrap gap-1.5 sm:gap-2">
              <button
                onClick={() => setSelectedGenre(null)}
                className={`text-[10px] sm:text-xs px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full font-medium transition-all border ${
                  selectedGenre === null
                    ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                    : 'bg-white/[0.03] text-gray-500 border-white/10 hover:text-gray-300 hover:border-white/20'
                }`}
              >
                Todos
              </button>
              {availableGenres.map(id => (
                <button
                  key={id}
                  onClick={() => setSelectedGenre(selectedGenre === id ? null : id)}
                  className={`text-[10px] sm:text-xs px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full font-medium transition-all border ${
                    selectedGenre === id
                      ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                      : 'bg-white/[0.03] text-gray-500 border-white/10 hover:text-gray-300 hover:border-white/20'
                  }`}
                >
                  {TMDB_GENRES[id]}
                </button>
              ))}
            </div>
          );
        })()}

        {/* ── Ranking de Filmes ── */}
        {ranking.length === 0 ? (
          <div className="text-center py-16 sm:py-24">
            <TrendingUp className="w-10 h-10 mx-auto mb-4 text-gray-600" />
            <p className="text-gray-500 text-sm">Aguardando votos...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
            {ranking.filter(m => !selectedGenre || (m.genreIds || []).includes(selectedGenre)).map((movie, index) => {
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
          <div className="space-y-6">
            {isAdmin && (
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8 relative">
                <h3 className="text-gray-300 font-medium mb-4 text-sm">Adicionar filme aos assistidos</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!manualSearch.trim()) return;
                  try {
                    const res = await fetch(`${API_URL}/api/movies/watch`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                      },
                      body: JSON.stringify({ 
                        movieName: manualSearch.trim(), 
                        markedBy: 'Moderador',
                        tmdbData: searchResults.find(m => m.title.toLowerCase() === manualSearch.trim().toLowerCase()) || null
                      })
                    });
                    if (res.ok) {
                      setManualSearch('');
                      setSearchResults([]);
                      setShowDropdown(false);
                      fetchRanking();
                    } else {
                      const err = await res.json();
                      alert(`Erro: ${err.error}`);
                    }
                  } catch (e) {
                    console.error(e);
                    alert('Erro de conexão ao salvar.');
                  }
                }} className="flex flex-col sm:flex-row gap-3 relative">
                  
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      {isSearching ? (
                        <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4 text-gray-500" />
                      )}
                    </div>
                    <input
                      type="text"
                      value={manualSearch}
                      onChange={(e) => {
                        setManualSearch(e.target.value);
                        setShowDropdown(true);
                      }}
                      onFocus={() => { if (searchResults.length > 0 && manualSearch.trim().length >= 2) setShowDropdown(true); }}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                      placeholder="Busque por um filme..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                    
                    {/* Dropdown com os Resultados */}
                    {showDropdown && searchResults.length > 0 && (
                      <div className="absolute w-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 z-[100]">
                        {searchResults.map((movie) => {
                          const alreadyWatched = watchedMovies.some(w => (w.title || w.name || '').toLowerCase() === movie.title.toLowerCase());
                          return (
                          <div 
                            key={movie.id}
                            className={`flex items-center gap-3 p-3 transition-colors border-b border-white/5 last:border-0 ${
                              alreadyWatched ? 'opacity-50 cursor-default' : 'hover:bg-white/5 cursor-pointer'
                            }`}
                            onClick={async () => {
                              if (alreadyWatched) return;
                              setManualSearch(movie.title);
                              setShowDropdown(false);
                              try {
                                const res = await fetch(`${API_URL}/api/movies/watch`, {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                                  },
                                  body: JSON.stringify({ 
                                    movieName: movie.title, 
                                    markedBy: 'Moderador',
                                    tmdbData: movie
                                  })
                                });
                                if (res.ok) {
                                  setManualSearch('');
                                  setSearchResults([]);
                                  fetchRanking();
                                } else {
                                  const err = await res.json();
                                  alert(`Erro: ${err.error}`);
                                }
                              } catch (e) {
                                console.error('Erro ao adicionar via dropdown', e);
                              }
                            }}
                          >
                            {movie.posterPath ? (
                              <img 
                                src={`${TMDB_IMAGE_URL}${movie.posterPath}`} 
                                alt={movie.title} 
                                className="w-8 h-12 object-cover rounded bg-black/50" 
                              />
                            ) : (
                              <div className="w-8 h-12 bg-white/5 border border-white/10 rounded flex flex-col items-center justify-center text-[10px] text-gray-500">
                                <Film className="w-4 h-4 mb-1 opacity-50"/>
                                N/A
                              </div>
                            )}
                            <div className="flex flex-col overflow-hidden flex-1">
                              <span className="text-sm text-gray-200 font-medium truncate">{movie.title}</span>
                              <span className="text-xs text-gray-500 truncate">
                                {movie.year || 'N/A'} {movie.originalTitle && movie.originalTitle !== movie.title ? `(${movie.originalTitle})` : ''}
                              </span>
                            </div>
                            {alreadyWatched && (
                              <span className="shrink-0 bg-green-500/20 text-green-400 text-[9px] font-bold px-1.5 py-0.5 rounded border border-green-500/50">
                                ✓ VISTO
                              </span>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!manualSearch.trim() || isSearching}
                    className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 flex items-center justify-center min-w-[120px]"
                  >
                    Adicionar
                  </button>
                </form>
              </div>
            )}

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
                            alt={movie.title || movie.name}
                            className="w-16 h-24 sm:w-20 sm:h-30 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-24 sm:w-20 sm:h-30 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                            <Film className="w-6 h-6 text-gray-500" />
                          </div>
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-start gap-2 overflow-hidden">
                              <h3 className="text-sm sm:text-lg font-bold text-white leading-tight truncate">
                                {movie.title || movie.name}
                              </h3>
                              <span className="shrink-0 bg-violet-500/20 text-violet-300 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded border border-violet-500/30">
                                ✓ VISTO
                              </span>
                            </div>
                            {isAdmin && (
                              <button
                                onClick={async () => {
                                  if (!window.confirm(`Deseja remover ${movie.title || movie.name} dos assistidos?`)) return;
                                  // Optimistic UI: remove imediatamente da lista
                                  setWatchedMovies(prev => prev.filter(m => m.id !== movie.id));
                                  try {
                                    const res = await fetch(`${API_URL}/api/movies/watch?id=${movie.id}`, {
                                      method: 'DELETE',
                                      headers: {
                                        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                                      }
                                    });
                                    if (!res.ok) {
                                      // Revert: adiciona de volta se falhar
                                      setWatchedMovies(prev => [...prev, movie].sort((a, b) => new Date(b.markedAt) - new Date(a.markedAt)));
                                      alert('Erro ao remover.');
                                    }
                                  } catch (e) {
                                    setWatchedMovies(prev => [...prev, movie].sort((a, b) => new Date(b.markedAt) - new Date(a.markedAt)));
                                    alert('Erro de conexão ao remover.');
                                  }
                                }}
                                className="shrink-0 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] sm:text-xs font-medium px-2 py-1 rounded border border-red-500/20 transition-colors"
                              >
                                Remover
                              </button>
                            )}
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

        {/* ── Aba Admin ── */}
        {activeTab === 'admin' && isAdmin && (
          <div className="space-y-6 motion-safe:animate-fadeIn mt-6 max-w-4xl mx-auto">
            
            {/* ── CONTROLES MINIMALISTAS ── */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8">
              
              <div className="flex w-full flex-col sm:flex-row gap-4">
                <button
                  onClick={async () => {
                    const nextState = !votingActive;
                    setVotingActive(nextState); // OPTIMISTIC UI UPDATE instantâneo
                    try {
                      const res = await fetch(`${API_URL}/api/control`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                        },
                        body: JSON.stringify({ action: nextState ? 'start' : 'stop' })
                      });
                      if (!res.ok) {
                        setVotingActive(!nextState); // Revert on fail
                        console.error('Erro ao alterar votação. Token expirado?');
                      }
                    } catch (e) {
                      if (e.name !== 'AbortError') {
                        setVotingActive(!nextState); // Revert on fail
                        console.error(e);
                      }
                    }
                  }}
                  className={`flex-1 px-6 py-3 rounded-xl font-medium text-sm transition-all border hover:scale-[1.02] active:scale-[0.98]
                    ${votingActive 
                      ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' 
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                  }`}
                >
                  {votingActive ? 'Pausar Votação' : 'Iniciar votação'}
                </button>

                <button
                  disabled={isProcessingControl}
                  onClick={async () => {
                    setRanking([]); setTotalVotes(0); // OPTIMISTIC UI CLEAR
                    setIsProcessingControl(true);
                    try {
                      const res = await fetch(`${API_URL}/api/control`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                        },
                        body: JSON.stringify({ action: 'clear' })
                      });
                      if (!res.ok) {
                        fetchRanking(); // Revert
                        console.error('Erro ao limpar votação.');
                      }
                    } catch (e) {
                      fetchRanking(); // Revert
                      console.error(e);
                    } finally {
                      setIsProcessingControl(false);
                    }
                  }}
                  className={`flex-1 px-6 py-3 rounded-xl font-medium text-sm transition-all border
                    ${isProcessingControl ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] hover:bg-white/10'}
                    bg-white/5 text-gray-300 border-white/10
                  `}
                >
                  Limpar votos
                </button>
              </div>

              {/* Botão de migração de gêneros */}
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${API_URL}/api/migrate-genres`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                      }
                    });
                    const data = await res.json();
                    if (res.ok) {
                      alert(`✅ ${data.message} (${data.updated} votos atualizados)`);
                      fetchRanking();
                    } else {
                      alert(`Erro: ${data.error}`);
                    }
                  } catch (e) {
                    alert('Erro de conexão.');
                  }
                }}
                className="w-full mt-3 px-4 py-2 rounded-xl text-xs font-medium transition-all border bg-white/[0.03] text-gray-500 border-white/10 hover:text-gray-300 hover:border-white/20 hover:bg-white/5"
              >
                🔄 Atualizar Gêneros dos Votos
              </button>
            </div>

            {/* ── LISTA MINIMALISTA DE VENCEDORES ── */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8">
              <h3 className="text-gray-300 font-medium mb-5 text-sm">Transferir do ranking para assistidos</h3>
              {ranking.length === 0 ? (
                <div className="text-center text-gray-600 text-sm py-8">
                  Nenhum voto no momento.
                </div>
              ) : (
                <div className="space-y-2">
                  {ranking.slice(0, 10).map((movie, index) => {
                    const alreadyWatched = watchedMovies.some(w => (w.title || w.name || '').toLowerCase() === movie.name.toLowerCase());
                    return (
                    <div key={movie.name} className="flex flex-col sm:flex-row items-center justify-between bg-white/[0.01] p-3 rounded-xl hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/5 gap-4">
                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        <span className="text-gray-600 font-mono text-xs w-4">{(index + 1)}</span>
                        <div className="flex flex-col">
                          <span className="text-gray-200 font-medium text-sm">{movie.name}</span>
                          <span className="text-gray-500 text-xs mt-0.5">{movie.count} votos</span>
                        </div>
                      </div>
                      <button
                        disabled={alreadyWatched}
                        onClick={async () => {
                          // Optimistic remove from ranking
                          setRanking(prev => prev.filter(m => m.name !== movie.name));
                          try {
                            const res = await fetch(`${API_URL}/api/movies/watch`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                              },
                              body: JSON.stringify({ movieName: movie.name, markedBy: 'Moderador', tmdbData: movie })
                            });
                            if (res.ok) {
                              fetchRanking();
                            } else {
                              fetchRanking();
                              const err = await res.json();
                              alert(err.error || 'Erro ao transferir.');
                            }
                          } catch (e) {
                            fetchRanking();
                            console.error(e);
                          }
                        }}
                        className={`w-full sm:w-auto text-xs px-4 py-2 rounded-lg transition-colors border ${
                          alreadyWatched 
                            ? 'border-gray-800 text-gray-600 cursor-not-allowed' 
                            : 'border-gray-700 text-gray-400 hover:text-white hover:border-white bg-transparent'
                        }`}
                      >
                        {alreadyWatched ? 'Já assistido' : 'Marcar como visto'}
                      </button>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Botão Admin Twitch (Footer) ── */}
        <div className="mt-12 flex justify-center opacity-40 hover:opacity-100 transition-opacity">
          {isAdmin ? (
            <button 
              onClick={() => {
                localStorage.removeItem('adminToken');
                setIsAdmin(false);
                setActiveTab('votacao');
              }}
              className="text-xs px-4 py-2 rounded-full border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 transition-all flex items-center gap-2"
            >
              🔒 Navegador Master Autenticado (Sair)
            </button>
          ) : (
            <button 
              onClick={() => {
                const clientId = process.env.REACT_APP_TWITCH_CLIENT_ID;
                if (!clientId) {
                  alert('Falta o REACT_APP_TWITCH_CLIENT_ID no .env do frontend.');
                  return;
                }
                const redirectUri = window.location.origin; // ex: http://localhost:3000
                const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code`;
                window.location.href = authUrl;
              }}
              disabled={isLoggingIn}
              className="text-sm px-6 py-2.5 rounded-full bg-[#9146FF] text-white hover:bg-[#772ce8] font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#9146FF]/20"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>
              {isLoggingIn ? 'Autenticando...' : 'Entrar com Twitch'}
            </button>
          )}
        </div>

      </main>
    </div>
  );
}
