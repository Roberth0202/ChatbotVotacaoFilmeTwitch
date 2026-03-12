// server.js - Backend do sistema de votação
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const tmi = require('tmi.js');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Armazenamento de votos
let votes = {}; // { username: "nome_do_filme" }
let movies = {}; // { "nome_do_filme": { count: X, voters: [...] } }

// Configuração do bot da Twitch
const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: process.env.TWITCH_USERNAME || 'seu_bot',
    password: process.env.TWITCH_OAUTH_TOKEN || 'oauth:seu_token'
  },
  channels: [process.env.TWITCH_CHANNEL || 'seu_canal']
});

// Conectar ao chat da Twitch
client.connect().catch(console.error);

// Função para processar voto
function processVote(username, movieName) {
  // Normalizar nome do filme
  const normalizedMovie = movieName.trim();
  
  if (!normalizedMovie || normalizedMovie.length < 2) {
    return null;
  }

  // Verificar se usuário já votou antes
  const previousVote = votes[username];
  
  if (previousVote) {
    // Remover voto anterior
    if (movies[previousVote]) {
      movies[previousVote].count--;
      movies[previousVote].voters = movies[previousVote].voters.filter(v => v !== username);
      
      // Remover filme se não tiver mais votos
      if (movies[previousVote].count === 0) {
        delete movies[previousVote];
      }
    }
  }
  
  // Adicionar novo voto
  votes[username] = normalizedMovie;
  
  if (!movies[normalizedMovie]) {
    movies[normalizedMovie] = {
      count: 0,
      voters: []
    };
  }
  
  movies[normalizedMovie].count++;
  movies[normalizedMovie].voters.push(username);
  
  return {
    username,
    movie: normalizedMovie,
    previousVote,
    totalVotes: Object.keys(votes).length
  };
}

// Função para obter ranking
function getRanking() {
  return Object.entries(movies)
    .map(([name, data]) => ({
      name,
      count: data.count,
      voters: data.voters
    }))
    .sort((a, b) => b.count - a.count);
}

// Escutar mensagens do chat
client.on('message', (channel, tags, message, self) => {
  if (self) return;
  
  const username = tags.username;
  const msg = message.trim();
  
  // Comandos especiais
  if (msg.startsWith('!')) {
    handleCommand(channel, tags, msg);
    return;
  }
  
  // Processar como voto
  const result = processVote(username, msg);
  
  if (result) {
    // Emitir atualização para todos os clientes conectados
    io.emit('vote-update', {
      ranking: getRanking(),
      lastVote: result
    });
    
    // Confirmar no chat (opcional - pode deixar comentado para não poluir)
    // client.say(channel, `@${username} votou em "${result.movie}"! ✅`);
  }
});

// Lidar com comandos
function handleCommand(channel, tags, message) {
  const username = tags.username;
  const isMod = tags.mod || tags.badges?.broadcaster;
  
  // Comando: ver meu voto
  if (message === '!meuvoto' || message === '!myvote') {
    const currentVote = votes[username];
    if (currentVote) {
      client.say(channel, `@${username} seu voto atual é: ${currentVote}`);
    } else {
      client.say(channel, `@${username} você ainda não votou!`);
    }
  }
  
  // Comando: ver top 3
  if (message === '!top3') {
    const ranking = getRanking().slice(0, 3);
    if (ranking.length === 0) {
      client.say(channel, 'Nenhum voto ainda!');
    } else {
      const top = ranking.map((m, i) => `${i+1}. ${m.name} (${m.count})`).join(' | ');
      client.say(channel, `Top 3: ${top}`);
    }
  }
  
  // Comandos de moderador
  if (isMod) {
    if (message === '!limparvotos' || message === '!clearvotes') {
      votes = {};
      movies = {};
      io.emit('vote-update', { ranking: [], lastVote: null });
      client.say(channel, 'Votação limpa! Vote digitando o nome do filme.');
    }
    
    if (message === '!encerrar' || message === '!endvote') {
      const ranking = getRanking();
      if (ranking.length > 0) {
        const winner = ranking[0];
        client.say(channel, `🏆 Votação encerrada! Vencedor: ${winner.name} com ${winner.count} votos!`);
      }
    }
  }
}

// WebSocket - quando cliente conecta
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  // Enviar estado atual
  socket.emit('initial-state', {
    ranking: getRanking(),
    totalVotes: Object.keys(votes).length
  });
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Rotas API
app.get('/api/ranking', (req, res) => {
  res.json({
    ranking: getRanking(),
    totalVotes: Object.keys(votes).length
  });
});

app.post('/api/clear', (req, res) => {
  votes = {};
  movies = {};
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📺 Conectado ao canal: ${process.env.TWITCH_CHANNEL || 'seu_canal'}`);
});
