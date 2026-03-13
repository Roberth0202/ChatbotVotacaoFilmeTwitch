// server.js - Backend do sistema de votação com validação de filmes
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const tmi = require('tmi.js');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

// ── Security: Allowed origins ──
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');

const io = socketIo(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST']
  }
});

// ── Security: Helmet (security headers) ──
app.use(helmet());

// ── Security: CORS restritivo ──
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST'],
  optionsSuccessStatus: 200
}));

// ── Security: Rate Limiting ──
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' }
});
app.use('/api/', apiLimiter);

app.use(express.json({ limit: '1kb' }));

// ── Security: Admin token ──
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ error: 'Sem token de admin configurado. Defina ADMIN_TOKEN no .env' });
  }
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_TOKEN}`) {
    console.warn(`[SECURITY] Tentativa de acesso admin bloqueada - IP: ${req.ip}`);
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
}

// Armazenamento de votos
let votes = {};
let movies = {};
let votingActive = false;

// ── Filmes assistidos (persistente) ──
const WATCHED_FILE = path.join(__dirname, 'watched.json');
let watchedMovies = [];

function loadWatched() {
  try {
    if (fs.existsSync(WATCHED_FILE)) {
      const data = fs.readFileSync(WATCHED_FILE, 'utf-8');
      watchedMovies = JSON.parse(data);
      console.log(`📂 ${watchedMovies.length} filme(s) assistido(s) carregado(s)`);
    }
  } catch (e) {
    console.error('Erro ao carregar watched.json:', e.message);
    watchedMovies = [];
  }
}

function saveWatched() {
  try {
    fs.writeFileSync(WATCHED_FILE, JSON.stringify(watchedMovies, null, 2), 'utf-8');
  } catch (e) {
    console.error('Erro ao salvar watched.json:', e.message);
  }
}

loadWatched();

// ── Security: Cache com limite de tamanho ──
const MAX_CACHE_SIZE = 500;
let movieCache = {};

function addToCache(key, value) {
  const keys = Object.keys(movieCache);
  if (keys.length >= MAX_CACHE_SIZE) {
    delete movieCache[keys[0]];
  }
  movieCache[key] = value;
}

// TMDB Read Access Token
const TMDB_TOKEN = process.env.TMDB_API_KEY;
if (!TMDB_TOKEN) {
  console.error('❌ TMDB_API_KEY não configurada no .env! O servidor não conseguirá validar filmes.');
}
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_HEADERS = {
  'Authorization': `Bearer ${TMDB_TOKEN}`,
  'Content-Type': 'application/json'
};

// Configuração do bot da Twitch
const TWITCH_USERNAME = process.env.TWITCH_USERNAME;
const TWITCH_OAUTH = process.env.TWITCH_OAUTH_TOKEN;
const TWITCH_CHANNEL = process.env.TWITCH_CHANNEL;

if (!TWITCH_USERNAME || !TWITCH_OAUTH || !TWITCH_CHANNEL) {
  console.error('❌ Variáveis TWITCH_USERNAME, TWITCH_OAUTH_TOKEN e/ou TWITCH_CHANNEL não configuradas no .env!');
}

const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: TWITCH_USERNAME,
    password: TWITCH_OAUTH
  },
  channels: [TWITCH_CHANNEL]
});

client.connect().catch(console.error);

// ── Security: Input sanitization ──
const MAX_INPUT_LENGTH = 100;

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .slice(0, MAX_INPUT_LENGTH)
    .replace(/[<>{}]/g, '');
}

// Função para validar filme via TMDB
async function validateMovie(movieName) {
  const normalizedName = movieName.toLowerCase().trim();

  if (movieCache[normalizedName]) {
    return movieCache[normalizedName];
  }

  try {
    const searchUrl = `${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(movieName)}&language=pt-BR`;
    const response = await fetch(searchUrl, { headers: TMDB_HEADERS });

    if (!response.ok) {
      console.error(`[TMDB] API retornou status ${response.status}`);
      // Security: Fail-closed — rejeitar se API falhar
      return { valid: false };
    }

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const movie = data.results[0];

      let certification = null;
      try {
        const certUrl = `${TMDB_BASE_URL}/movie/${movie.id}/release_dates`;
        const certResponse = await fetch(certUrl, { headers: TMDB_HEADERS });
        if (certResponse.ok) {
          const certData = await certResponse.json();
          const brRelease = certData.results?.find(r => r.iso_3166_1 === 'BR');
          if (brRelease && brRelease.release_dates?.length > 0) {
            certification = brRelease.release_dates[0].certification || null;
          }
          if (!certification) {
            const usRelease = certData.results?.find(r => r.iso_3166_1 === 'US');
            if (usRelease && usRelease.release_dates?.length > 0) {
              certification = usRelease.release_dates[0].certification || null;
            }
          }
        }
      } catch (e) {
        console.error('[TMDB] Erro ao buscar classificação:', e.message);
      }

      const result = {
        valid: true,
        title: movie.title,
        originalTitle: movie.original_title,
        posterPath: movie.poster_path,
        year: movie.release_date ? movie.release_date.split('-')[0] : null,
        overview: movie.overview || null,
        voteAverage: movie.vote_average || null,
        certification
      };

      addToCache(normalizedName, result);
      return result;
    } else {
      const result = { valid: false };
      addToCache(normalizedName, result);
      return result;
    }
  } catch (error) {
    console.error('[TMDB] Erro na requisição:', error.message);
    // Security: Fail-closed — rejeitar se houver erro de rede
    return { valid: false };
  }
}

// Processar voto
async function processVote(username, movieName) {
  const normalizedMovie = sanitizeInput(movieName);

  if (!normalizedMovie || normalizedMovie.length < 2) {
    return null;
  }

  const validation = await validateMovie(normalizedMovie);

  if (!validation.valid) {
    return {
      error: true,
      message: `"${normalizedMovie}" não parece ser um filme válido.`
    };
  }

  const movieTitle = validation.title || normalizedMovie;
  const previousVote = votes[username];

  // Verificar se já votou no mesmo filme
  if (previousVote && previousVote.toLowerCase() === movieTitle.toLowerCase()) {
    return {
      error: true,
      message: `você já votou em "${movieTitle}"! Use !votar outro filme para trocar.`
    };
  }

  if (previousVote) {
    if (movies[previousVote]) {
      movies[previousVote].count--;
      movies[previousVote].voters = movies[previousVote].voters.filter(v => v !== username);
      if (movies[previousVote].count === 0) {
        delete movies[previousVote];
      }
    }
  }

  votes[username] = movieTitle;

  if (!movies[movieTitle]) {
    movies[movieTitle] = {
      count: 0,
      voters: [],
      posterPath: validation.posterPath,
      year: validation.year,
      overview: validation.overview,
      voteAverage: validation.voteAverage,
      certification: validation.certification
    };
  }

  movies[movieTitle].count++;
  movies[movieTitle].voters.push(username);

  return {
    username,
    movie: movieTitle,
    previousVote,
    totalVotes: Object.keys(votes).length,
    posterPath: validation.posterPath,
    year: validation.year,
    overview: validation.overview,
    voteAverage: validation.voteAverage,
    certification: validation.certification
  };
}

// Ranking
function getRanking() {
  return Object.entries(movies)
    .map(([name, data]) => ({
      name,
      count: data.count,
      voters: data.voters,
      posterPath: data.posterPath,
      year: data.year,
      overview: data.overview,
      voteAverage: data.voteAverage,
      certification: data.certification
    }))
    .sort((a, b) => b.count - a.count);
}

// Escutar mensagens do chat
client.on('message', async (channel, tags, message, self) => {
  if (self) return;

  const username = tags.username;
  const msg = sanitizeInput(message);

  if (msg.startsWith('!')) {
    await handleCommand(channel, tags, msg);
  }
});

// Comandos do chat
async function handleCommand(channel, tags, message) {
  const username = tags.username;
  const isMod = tags.mod || tags.badges?.broadcaster;

  // Comando: votar em um filme
  if (message.startsWith('!votar ') || message.startsWith('!v ')) {
    if (!votingActive) {
      client.say(channel, `@${username} nenhuma votação aberta no momento! Aguarde um mod iniciar com !iniciarvotacao ⏳`);
      return;
    }
    const movieName = message.startsWith('!v ') ? message.slice(3).trim() : message.slice(7).trim();
    if (!movieName) {
      client.say(channel, `@${username} use: !votar nome do filme 🎬`);
      return;
    }

    const result = await processVote(username, movieName);

    if (result) {
      if (result.error) {
        client.say(channel, `@${username} ${result.message} Tente novamente com o nome de um filme real! 🎬`);
      } else {
        io.emit('vote-update', {
          ranking: getRanking(),
          lastVote: result
        });

        if (result.previousVote) {
          client.say(channel, `@${username} mudou seu voto de "${result.previousVote}" para "${result.movie}"${result.year ? ` (${result.year})` : ''} ✅`);
        } else {
          client.say(channel, `@${username} votou em "${result.movie}"${result.year ? ` (${result.year})` : ''} ✅`);
        }
      }
    }
    return;
  }

  if (message === '!meuvoto' || message === '!myvote' || message === '!mv') {
    const currentVote = votes[username];
    if (currentVote) {
      const movieData = movies[currentVote];
      client.say(channel, `@${username} seu voto atual é: ${currentVote}${movieData?.year ? ` (${movieData.year})` : ''}`);
    } else {
      client.say(channel, `@${username} você ainda não votou!`);
    }
  }

  if (message === '!top3' || message === '!t3') {
    const ranking = getRanking().slice(0, 3);
    if (ranking.length === 0) {
      client.say(channel, 'Nenhum voto ainda! Use !votar nome do filme 🎬');
    } else {
      const top = ranking.map((m, i) => `${i+1}. ${m.name} (${m.count})`).join(' | ');
      client.say(channel, `🏆 Top 3: ${top}`);
    }
  }

  if (message === '!ajuda' || message === '!help') {
    client.say(channel, '🎬 Comandos: !votar(!v) | !meuvoto(!mv) | !top3(!t3) | !assistidos');
  }

  if (message === '!assistidos') {
    if (watchedMovies.length === 0) {
      client.say(channel, 'Nenhum filme assistido ainda! 🎬');
    } else {
      const last3 = watchedMovies.slice(-3).reverse().map(m => m.title).join(', ');
      client.say(channel, `✅ Últimos assistidos: ${last3} (${watchedMovies.length} total)`);
    }
  }

  if (isMod) {
    if (message === '!iniciarvotacao' || message === '!iv') {
      votingActive = true;
      votes = {};
      movies = {};
      io.emit('vote-update', { ranking: [], lastVote: null });
      io.emit('voting-status', { active: true });
      client.say(channel, '🎬 Votação ABERTA! Use !votar nome do filme para votar!');
    }

    if (message === '!limparvotos' || message === '!clearvotes' || message === '!lv') {
      votes = {};
      movies = {};
      movieCache = {};
      io.emit('vote-update', { ranking: [], lastVote: null });
      client.say(channel, '🗑️ Os votos foram limpos!');
    }

    if (message === '!encerrar' || message === '!endvote') {
      votingActive = false;
      const ranking = getRanking();
      io.emit('voting-status', { active: false });
      if (ranking.length > 0) {
        const winner = ranking[0];
        client.say(channel, `🏆 Votação encerrada! Vencedor: ${winner.name}${winner.year ? ` (${winner.year})` : ''} com ${winner.count} votos!`);
      } else {
        client.say(channel, 'Votação encerrada. Nenhum voto foi registrado.');
      }
    }

    // Comando: marcar filme como assistido
    if (message.startsWith('!assistido ')) {
      const movieName = message.slice(11).trim();
      if (!movieName) {
        client.say(channel, `@${username} use: !assistido nome do filme 🎬`);
        return;
      }

      // Verificar se já foi marcado
      const alreadyWatched = watchedMovies.find(
        m => m.title.toLowerCase() === movieName.toLowerCase()
      );
      if (alreadyWatched) {
        client.say(channel, `@${username} "${alreadyWatched.title}" já está na lista de assistidos! ✅`);
        return;
      }

      // Validar via TMDB
      const validation = await validateMovie(movieName);
      if (!validation.valid) {
        client.say(channel, `@${username} "${movieName}" não parece ser um filme válido.`);
        return;
      }

      const watchedEntry = {
        title: validation.title,
        originalTitle: validation.originalTitle || null,
        posterPath: validation.posterPath || null,
        year: validation.year || null,
        overview: validation.overview || null,
        voteAverage: validation.voteAverage || null,
        certification: validation.certification || null,
        markedBy: username,
        markedAt: new Date().toISOString()
      };

      watchedMovies.push(watchedEntry);
      saveWatched();

      io.emit('watched-update', { watchedMovies });
      client.say(channel, `✅ "${validation.title}"${validation.year ? ` (${validation.year})` : ''} marcado como assistido por @${username}!`);
    }
  }
}

// ── Security: Rate limit para WebSocket ──
const wsConnectionCount = {};
const WS_MAX_CONNECTIONS_PER_IP = 5;

io.on('connection', (socket) => {
  const clientIp = socket.handshake.address;

  wsConnectionCount[clientIp] = (wsConnectionCount[clientIp] || 0) + 1;
  if (wsConnectionCount[clientIp] > WS_MAX_CONNECTIONS_PER_IP) {
    console.warn(`[SECURITY] WebSocket rate limit excedido - IP: ${clientIp}`);
    socket.disconnect(true);
    return;
  }

  console.log(`Cliente conectado: ${socket.id}`);

  socket.emit('initial-state', {
    ranking: getRanking(),
    totalVotes: Object.keys(votes).length,
    votingActive,
    watchedMovies
  });

  socket.on('disconnect', () => {
    wsConnectionCount[clientIp] = Math.max(0, (wsConnectionCount[clientIp] || 1) - 1);
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

// ── Rotas API ──
app.get('/api/ranking', (req, res) => {
  res.json({
    ranking: getRanking(),
    totalVotes: Object.keys(votes).length
  });
});

// Security: Requer ADMIN_TOKEN
app.post('/api/clear', requireAdmin, (req, res) => {
  console.log(`[ADMIN] Votação limpa via API - IP: ${req.ip}`);
  votes = {};
  movies = {};
  movieCache = {};
  io.emit('vote-update', { ranking: [], lastVote: null });
  res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
  res.json({
    totalVotes: Object.keys(votes).length,
    totalMovies: Object.keys(movies).length,
    ranking: getRanking()
  });
});

// Security: Health check (sem dados sensíveis)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api/watched', (req, res) => {
  res.json({ watchedMovies });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📺 Conectado ao canal: ${TWITCH_CHANNEL || '(não configurado)'}`);
  console.log(`🎬 Validação TMDB: ${TMDB_TOKEN ? 'ATIVADA ✅' : 'DESATIVADA ⚠️'}`);
  console.log(`🛡️ Helmet: ATIVO ✅`);
  console.log(`🛡️ Rate Limit: 30 req/min ✅`);
  console.log(`🛡️ CORS: ${ALLOWED_ORIGINS.join(', ')} ✅`);
  console.log(`🛡️ Admin Token: ${ADMIN_TOKEN ? 'CONFIGURADO ✅' : 'NÃO CONFIGURADO ⚠️'}`);
});
