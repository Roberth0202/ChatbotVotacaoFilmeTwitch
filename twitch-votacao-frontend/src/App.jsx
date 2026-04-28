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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isProcessingControl, setIsProcessingControl] = useState(false);
  const [isTogglingVote, setIsTogglingVote] = useState(false);
  const controlInFlightRef = useRef(0); // Usa timestamp para evitar cache stale
  const [manualSearch, setManualSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [activeFilterGenre, setActiveFilterGenre] = useState(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);

  // Security: Validate stored token with backend on mount
  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    fetch(`${API_URL}/api/auth/verify`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
      if (res.ok) {
        setIsAdmin(true);
      } else {
        localStorage.removeItem('adminToken');
        setIsAdmin(false);
      }
    })
    .catch(() => {
      localStorage.removeItem('adminToken');
      setIsAdmin(false);
    });
  }, []);


  const handleMigrateGenres = async () => {
    try {
      setIsMigrating(true);
      const res = await fetch(`${API_URL}/api/migrate-genres`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`✅ ${data.message} (${data.updated} votos atualizados)`);
        fetchRanking();
      } else {
        console.error(`Erro ao atualizar gêneros: ${data.error}`);
      }
    } catch (e) {
      console.error('Erro de conexão ao tentar atualizar gêneros.', e);
    } finally {
      setIsMigrating(false);
    }
  };
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
      setRanking(newRanking.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)));
      setTotalVotes(newTotal);
      // Evita sobrescrever com cache stale da Vercel (s-maxage=3, swr=5) por 8s
      if (Date.now() - controlInFlightRef.current > 8000) {
        setVotingActive(data.votingActive || false);
      }
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
      // Limpa a URL IMEDIATAMENTE para evitar loop de re-execução
      window.history.replaceState({}, document.title, window.location.pathname);
      setIsLoggingIn(true);

      fetch(`${API_URL}/api/auth/twitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          redirectUri: window.location.origin
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.token) {
          localStorage.setItem('adminToken', data.token);
          setIsAdmin(true);
        } else {
          setAuthError('Você não tem permissão para acessar o painel. Apenas moderadores e o streamer podem logar.');
        }
      })
      .catch(err => {
        setAuthError('Erro ao se comunicar com o servidor. Tente novamente.');
      })
      .finally(() => {
        setIsLoggingIn(false);
      });
    }
  }, [isAdmin, isLoggingIn]);

  const intervalRef = useRef(null);

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchRanking, POLLING_INTERVAL);
  }, [fetchRanking]);

  useEffect(() => {
    fetchRanking();
    startPolling();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      } else {
        fetchRanking();
        startPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchRanking, startPolling]);

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
        ).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      }
      
      // Filme novo: fetch com delay para dar tempo do backend (Node ou Vercel) buscar a API do TMDB e salvar
      setTimeout(() => fetchRanking(), 2000);
      
      // Insere ele temporariamente para aparecer visualmente
      return [...prev, {
        name: movieName,
        count: 1,
        voters: [username],
        genreIds: [], // Sem lista inicialmente
        isNewLocally: true // Flag exclusiva para ele furar o filtro enquanto carrega
      }].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
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
            <div className="flex items-center gap-3 sm:gap-4">
              <svg className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 shadow-lg shadow-violet-500/20 rounded-xl" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="#7c3aed"/>
                <polygon points="12,9 26,16 12,23" fill="white"/>
              </svg>
              <div className="flex flex-col leading-tight">
                <span className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                  Uz<span className="text-violet-400">Flix</span>
                </span>
                <span className="text-xs sm:text-sm text-white/40 tracking-wider font-medium mt-0.5 uppercase">votação de filmes</span>
              </div>
            </div>

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
                {chatConnected && !isAdmin && !votingActive && (
                  <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded ml-1 border border-red-500/20" title="Faça login como Admin para contabilizar votos">
                    Votos Pausados
                  </span>
                )}
                {chatConnected && !isAdmin && votingActive && (
                  <span className="text-[10px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded ml-1 border border-violet-500/20" title="Você está assistindo os votos entrarem">
                    Acompanhando ao vivo
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
        <div className="mb-4 flex items-center gap-2">
          <select
            value={selectedGenre || ''}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : null;
              setSelectedGenre(val);
              setActiveFilterGenre(val);
            }}
            className="bg-violet-500/15 text-white text-[11px] sm:text-xs border border-violet-500/30 rounded-lg px-2.5 py-1.5 outline-none focus:border-violet-500/60 transition-colors cursor-pointer appearance-none max-w-[180px]"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23a78bfa' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', paddingRight: '24px' }}
          >
            <option value="">Todos os gêneros</option>
            {Object.entries(TMDB_GENRES)
              .sort(([,a], [,b]) => a.localeCompare(b))
              .map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))
            }
          </select>
          {selectedGenre && (
            <button
              onClick={() => {
                setSelectedGenre(null);
                setActiveFilterGenre(null);
              }}
              className="text-[10px] text-gray-500 hover:text-white transition-colors ml-1"
            >
              ✕ Limpar
            </button>
          )}
        </div>

        {/* ── Ranking de Filmes ── */}
        {ranking.length === 0 ? (
          <div className="text-center py-16 sm:py-24">
            <TrendingUp className="w-10 h-10 mx-auto mb-4 text-gray-600" />
            <p className="text-gray-500 text-sm">Aguardando votos...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
            {ranking.filter(m => !activeFilterGenre || m.isNewLocally || (m.genreIds || []).includes(activeFilterGenre)).map((movie, index) => {
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
                      <div className="absolute w-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[100]">
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
                  disabled={isTogglingVote}
                  onClick={async () => {
                    if (isTogglingVote) return;
                    setIsTogglingVote(true);
                    const nextState = !votingActive;
                    setVotingActive(nextState);
                    controlInFlightRef.current = Date.now(); // Lock ANTES do fetch para o polling não sobrescrever
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
                        setVotingActive(!nextState);
                        controlInFlightRef.current = 0; // Libera o lock se falhou
                        console.error('Erro ao alterar votação. Token expirado?');
                      }
                    } catch (e) {
                      if (e.name !== 'AbortError') {
                        setVotingActive(!nextState);
                        controlInFlightRef.current = 0; // Libera o lock se falhou
                        console.error(e);
                      }
                    } finally {
                      setIsTogglingVote(false);
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
                onClick={handleMigrateGenres}
                disabled={isMigrating}
                className={`w-full mt-3 px-4 py-2 rounded-xl text-xs font-medium transition-all border
                  ${isMigrating ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] hover:bg-white/10'}
                  bg-white/[0.03] text-gray-500 border-white/10 hover:text-gray-300 hover:border-white/20 hover:bg-white/5
                `}
              >
                {isMigrating ? '🔄 Atualizando Gêneros...' : '🔄 Atualizar Gêneros dos Votos'}
              </button>
            </div>

            {/* ── GUIA DE COMANDOS E CONTROLES ── */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8">
              <button
                onClick={() => setGuideOpen(!guideOpen)}
                className="w-full flex items-center justify-between cursor-pointer group"
              >
                <div className="flex flex-col items-start">
                  <h3 className="text-gray-300 font-medium text-sm flex items-center gap-2 group-hover:text-white transition-colors">📖 Guia de Comandos e Controles</h3>
                  <p className="text-[10px] sm:text-xs text-gray-500 mt-1">O que funciona no chat da Twitch e o que é controlado por aqui no painel.</p>
                </div>
                <span className={`text-gray-500 group-hover:text-white transition-all duration-300 text-lg ${guideOpen ? 'rotate-180' : ''}`}>▼</span>
              </button>

              {guideOpen && (<div className="mt-5 space-y-0 motion-safe:animate-fadeIn">
              {/* ── Comando ativo no chat ── */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">✅ Ativo no Chat</span>
                  <span className="text-[10px] text-gray-600">— funciona via WebSocket (sem bot)</span>
                </div>
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-emerald-500/[0.03] rounded-xl p-3 border border-emerald-500/10 hover:border-emerald-500/20 transition-colors">
                    <code className="text-emerald-400 font-mono text-xs sm:text-sm whitespace-nowrap shrink-0">!votar &lt;filme&gt;</code>
                    <span className="text-gray-400 text-xs hidden sm:inline mt-0.5">—</span>
                    <div className="flex flex-col">
                      <span className="text-gray-300 text-xs sm:text-sm">Viewers votam em um filme pelo chat. Pode trocar o voto a qualquer momento.</span>
                      <span className="text-[10px] text-gray-600 mt-0.5">Atalho: <code className="text-gray-500 font-mono">!v &lt;filme&gt;</code></span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-gray-600 mt-2 ml-1">O site lê o chat da Twitch em tempo real e registra os votos automaticamente quando o admin está logado.</p>
              </div>

              {/* ── Controles do Painel Admin ── */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">🎛️ Painel Admin</span>
                  <span className="text-[10px] text-gray-600">— botões acima nesta página</span>
                </div>
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.02] rounded-xl p-3 border border-white/5 hover:border-violet-500/10 transition-colors">
                    <span className="text-violet-400 text-xs sm:text-sm whitespace-nowrap shrink-0 font-medium">Iniciar Votação</span>
                    <span className="text-gray-400 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-300 text-xs sm:text-sm">Abre uma nova rodada de votação e limpa os votos anteriores.</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.02] rounded-xl p-3 border border-white/5 hover:border-violet-500/10 transition-colors">
                    <span className="text-violet-400 text-xs sm:text-sm whitespace-nowrap shrink-0 font-medium">Pausar Votação</span>
                    <span className="text-gray-400 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-300 text-xs sm:text-sm">Encerra a votação atual. Os votos ficam salvos para consulta.</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.02] rounded-xl p-3 border border-white/5 hover:border-violet-500/10 transition-colors">
                    <span className="text-violet-400 text-xs sm:text-sm whitespace-nowrap shrink-0 font-medium">Limpar Votos</span>
                    <span className="text-gray-400 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-300 text-xs sm:text-sm">Apaga todos os votos sem alterar o estado da votação (aberta/fechada).</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.02] rounded-xl p-3 border border-white/5 hover:border-violet-500/10 transition-colors">
                    <span className="text-violet-400 text-xs sm:text-sm whitespace-nowrap shrink-0 font-medium">Marcar como Visto</span>
                    <span className="text-gray-400 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-300 text-xs sm:text-sm">Transfere um filme do ranking para a lista de "Assistidos" (na seção abaixo ou aba Assistidos).</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.02] rounded-xl p-3 border border-white/5 hover:border-violet-500/10 transition-colors">
                    <span className="text-violet-400 text-xs sm:text-sm whitespace-nowrap shrink-0 font-medium">Adicionar Assistido</span>
                    <span className="text-gray-400 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-300 text-xs sm:text-sm">Busca e adiciona um filme diretamente à lista de assistidos (na aba Assistidos).</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.02] rounded-xl p-3 border border-white/5 hover:border-violet-500/10 transition-colors">
                    <span className="text-violet-400 text-xs sm:text-sm whitespace-nowrap shrink-0 font-medium">Atualizar Gêneros</span>
                    <span className="text-gray-400 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-300 text-xs sm:text-sm">Preenche gêneros faltando nos votos antigos (migração de dados).</span>
                  </div>
                </div>
              </div>

              {/* ── Comandos do Bot (inativos) ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500 bg-white/5 px-2 py-0.5 rounded border border-white/10">🤖 Bot (Inativo)</span>
                  <span className="text-[10px] text-gray-600">— precisam do bot hospedado para funcionar</span>
                </div>
                <div className="space-y-2 opacity-50">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.01] rounded-xl p-3 border border-white/5">
                    <code className="text-gray-500 font-mono text-xs sm:text-sm whitespace-nowrap shrink-0">!meuvoto</code>
                    <span className="text-gray-600 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-500 text-xs sm:text-sm">Mostra em qual filme o viewer votou. <span className="text-[10px]">(atalhos: !mv, !myvote)</span></span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.01] rounded-xl p-3 border border-white/5">
                    <code className="text-gray-500 font-mono text-xs sm:text-sm whitespace-nowrap shrink-0">!top3</code>
                    <span className="text-gray-600 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-500 text-xs sm:text-sm">Mostra os 3 mais votados no chat. <span className="text-[10px]">(atalho: !t3)</span></span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.01] rounded-xl p-3 border border-white/5">
                    <code className="text-gray-500 font-mono text-xs sm:text-sm whitespace-nowrap shrink-0">!assistidos</code>
                    <span className="text-gray-600 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-500 text-xs sm:text-sm">Lista filmes já assistidos no chat.</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.01] rounded-xl p-3 border border-white/5">
                    <code className="text-gray-500 font-mono text-xs sm:text-sm whitespace-nowrap shrink-0">!ajuda</code>
                    <span className="text-gray-600 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-500 text-xs sm:text-sm">Mostra comandos disponíveis no chat. <span className="text-[10px]">(atalho: !help)</span></span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.01] rounded-xl p-3 border border-white/5">
                    <code className="text-gray-500 font-mono text-xs sm:text-sm whitespace-nowrap shrink-0">!iniciarvotacao</code>
                    <span className="text-gray-600 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-500 text-xs sm:text-sm">Abre votação pelo chat (mod). <span className="text-[10px]">(atalho: !iv)</span></span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.01] rounded-xl p-3 border border-white/5">
                    <code className="text-gray-500 font-mono text-xs sm:text-sm whitespace-nowrap shrink-0">!encerrar</code>
                    <span className="text-gray-600 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-500 text-xs sm:text-sm">Encerra e anuncia vencedor no chat (mod). <span className="text-[10px]">(atalho: !endvote)</span></span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.01] rounded-xl p-3 border border-white/5">
                    <code className="text-gray-500 font-mono text-xs sm:text-sm whitespace-nowrap shrink-0">!limparvotos</code>
                    <span className="text-gray-600 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-500 text-xs sm:text-sm">Limpa votos pelo chat (mod). <span className="text-[10px]">(atalhos: !lv, !clearvotes)</span></span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.01] rounded-xl p-3 border border-white/5">
                    <code className="text-gray-500 font-mono text-xs sm:text-sm whitespace-nowrap shrink-0">!assistido &lt;filme&gt;</code>
                    <span className="text-gray-600 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-500 text-xs sm:text-sm">Marca filme como assistido pelo chat (mod).</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-white/[0.01] rounded-xl p-3 border border-white/5">
                    <code className="text-gray-500 font-mono text-xs sm:text-sm whitespace-nowrap shrink-0">!remassistido &lt;filme&gt;</code>
                    <span className="text-gray-600 text-xs hidden sm:inline mt-0.5">—</span>
                    <span className="text-gray-500 text-xs sm:text-sm">Remove filme dos assistidos pelo chat (mod). <span className="text-[10px]">(atalho: !ra)</span></span>
                  </div>
                </div>
              </div>

              {/* Dica */}
              <div className="mt-5 bg-violet-500/5 border border-violet-500/10 rounded-xl p-3 flex items-start gap-2.5">
                <span className="text-sm mt-0.5">💡</span>
                <p className="text-[10px] sm:text-xs text-gray-400 leading-relaxed">
                  Os filmes são validados pelo TMDB — nomes inválidos são rejeitados automaticamente.
                  Viewers podem trocar o voto quantas vezes quiserem. Os comandos do bot ficam disponíveis ao hospedar o <code className="text-gray-500 font-mono">bot.js</code>.
                </p>
              </div>
              </div>)}
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
                const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=user:read:email`;
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

      {/* ── Popup de Erro de Autorização ── */}
      {authError && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setAuthError(null)}>
          <div 
            className="bg-[#1a1832] border border-red-500/20 rounded-2xl p-6 sm:p-8 max-w-sm w-full shadow-2xl shadow-red-500/10 motion-safe:animate-slideDown"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Acesso Negado</h3>
              <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                {authError}
              </p>
              <button
                onClick={() => setAuthError(null)}
                className="w-full bg-white/10 hover:bg-white/15 text-white py-2.5 rounded-xl font-medium text-sm transition-all border border-white/10"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
