// bot.js - Bot da Twitch (roda no seu PC)
// Escuta o chat e envia comandos para a API na Vercel
require('dotenv').config();
const tmi = require('tmi.js');

const API_BASE_URL = process.env.API_BASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!API_BASE_URL) {
  console.error('❌ API_BASE_URL não configurada no .env!');
  process.exit(1);
}

if (!ADMIN_TOKEN) {
  console.error('❌ ADMIN_TOKEN não configurado no .env!');
  process.exit(1);
}

const TWITCH_USERNAME = process.env.TWITCH_USERNAME;
const TWITCH_OAUTH = process.env.TWITCH_OAUTH_TOKEN;
const TWITCH_CHANNEL = process.env.TWITCH_CHANNEL;

if (!TWITCH_USERNAME || !TWITCH_OAUTH || !TWITCH_CHANNEL) {
  console.error('❌ Variáveis TWITCH_USERNAME, TWITCH_OAUTH_TOKEN e/ou TWITCH_CHANNEL não configuradas no .env!');
  process.exit(1);
}

const client = new tmi.Client({
  options: { debug: true },
  identity: {
    username: TWITCH_USERNAME,
    password: TWITCH_OAUTH
  },
  channels: [TWITCH_CHANNEL]
});

// Helper: fazer requisição para API da Vercel
async function apiRequest(endpoint, body) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      },
      body: JSON.stringify(body)
    });
    return await response.json();
  } catch (error) {
    console.error(`[API] Erro ao chamar /api/${endpoint}:`, error.message);
    return { error: error.message };
  }
}

// Sanitizar input
const MAX_INPUT_LENGTH = 100;
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, MAX_INPUT_LENGTH).replace(/[<>{}]/g, '');
}



// Escutar mensagens do chat
client.on('message', async (channel, tags, message, self) => {
  console.log(`[MSG] self=${self} user=${tags.username} msg="${message}"`);
  if (self) return;

  const msg = sanitizeInput(message);
  if (!msg.startsWith('!')) return;

  const username = tags.username;
  const isMod = tags.mod || tags.badges?.broadcaster === '1' || tags.username === TWITCH_CHANNEL.toLowerCase();
  console.log(`[CMD] user=${username} isMod=${isMod} cmd="${msg}"`);

  // ── !votar / !v ──
  if (msg.startsWith('!votar ') || msg.startsWith('!v ')) {
    const movieName = msg.startsWith('!v ') ? msg.slice(3).trim() : msg.slice(7).trim();
    if (!movieName) {
      client.say(channel, `@${username} use: !votar nome do filme 🎬`);
      return;
    }

    const result = await apiRequest('vote', { username, movieName });

    if (result.error) {
      if (result.code === 'VOTING_CLOSED') {
        client.say(channel, `❌ Nenhuma votação aberta no momento!`);
      } else if (result.code === 'INVALID_MOVIE') {
        client.say(channel, `@${username} não encontrei "${movieName}"!`);
      } else {
        client.say(channel, `@${username} erro ao registrar voto.`);
      }
    } else if (result.success) {
      if (result.previousVote) {
        client.say(channel, `@${username} mudou seu voto de "${result.previousVote}" para "${result.movie}" ✅`);
      } else {
        client.say(channel, `@${username} votou em "${result.movie}" ✅`);
      }
    }
    return;
  }

  // ── !meuvoto / !mv ──
  if (msg === '!meuvoto' || msg === '!myvote' || msg === '!mv') {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ranking`);
      const data = await response.json();
      const userMovie = data.ranking?.find(m => m.voters?.includes(username));
      if (userMovie) {
        client.say(channel, `@${username} seu voto atual é: ${userMovie.name}${userMovie.year ? ` (${userMovie.year})` : ''}`);
      } else {
        client.say(channel, `@${username} você ainda não votou!`);
      }
    } catch (e) {
      client.say(channel, `@${username} erro ao consultar seu voto.`);
    }
    return;
  }

  // ── !top3 / !t3 ──
  if (msg === '!top3' || msg === '!t3') {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ranking`);
      const data = await response.json();
      const ranking = (data.ranking || []).slice(0, 3);
      if (ranking.length === 0) {
        client.say(channel, 'Nenhum voto ainda! Use !votar nome do filme 🎬');
      } else {
        const top = ranking.map((m, i) => `${i+1}. ${m.name} (${m.count})`).join(' | ');
        client.say(channel, `🏆 Top 3: ${top}`);
      }
    } catch (e) {
      client.say(channel, 'Erro ao consultar ranking.');
    }
    return;
  }

  // ── !ajuda ──
  if (msg === '!ajuda' || msg === '!help') {
    client.say(channel, '🎬 Comandos: !votar(!v) | !meuvoto(!mv) | !top3(!t3) | !assistidos');
    return;
  }

  // ── !assistidos ──
  if (msg === '!assistidos') {
    try {
      const response = await fetch(`${API_BASE_URL}/api/watched`);
      const data = await response.json();
      const watched = data.watchedMovies || [];
      if (watched.length === 0) {
        client.say(channel, 'Nenhum filme assistido ainda! 🎬');
      } else {
        const last3 = watched.slice(0, 3).map(m => m.title).join(', ');
        client.say(channel, `✅ Últimos assistidos: ${last3} (${watched.length} total)`);
      }
    } catch (e) {
      client.say(channel, 'Erro ao consultar filmes assistidos.');
    }
    return;
  }

  // ── Comandos de Mod ──
  if (isMod) {
    if (msg === '!iniciarvotacao' || msg === '!iv') {
      const result = await apiRequest('control', { action: 'start' });
      if (result.success) {
        client.say(channel, '🎬 Votação ABERTA! Use !votar nome do filme para votar!');
      } else {
        client.say(channel, 'Erro ao iniciar votação.');
      }
      return;
    }

    if (msg === '!limparvotos' || msg === '!clearvotes' || msg === '!lv') {
      const result = await apiRequest('control', { action: 'clear' });
      if (result.success) {
        client.say(channel, '🗑️ Os votos foram limpos!');
      }
      return;
    }

    if (msg === '!encerrar' || msg === '!endvote') {
      const result = await apiRequest('control', { action: 'end' });
      if (result.success) {
        if (result.winner) {
          client.say(channel, `🏆 Votação encerrada! Vencedor: ${result.winner.name}${result.winner.year ? ` (${result.winner.year})` : ''} com ${result.winner.count} votos!`);
        } else {
          client.say(channel, 'Votação encerrada. Nenhum voto foi registrado.');
        }
      }
      return;
    }

    if (msg.startsWith('!assistido ')) {
      const movieName = msg.slice(11).trim();
      if (!movieName) {
        client.say(channel, `@${username} use: !assistido nome do filme 🎬`);
        return;
      }

      const result = await apiRequest('watched', { movieName, markedBy: username });

      if (result.error) {
        if (result.code === 'ALREADY_WATCHED') {
          client.say(channel, `@${username} esse filme já está na lista de assistidos! ✅`);
        } else if (result.code === 'INVALID_MOVIE') {
          client.say(channel, `@${username} "${movieName}" não parece ser um filme válido.`);
        } else {
          client.say(channel, `@${username} erro ao marcar filme.`);
        }
      } else if (result.success) {
        const movie = result.movie;
        client.say(channel, `✅ "${movie.title}"${movie.year ? ` (${movie.year})` : ''} marcado como assistido por @${username}!`);
      }
      return;
    }

    // ── !remassistido / !ra ──
    if (msg.startsWith('!remassistido ') || msg.startsWith('!ra ')) {
      const movieName = msg.startsWith('!ra ') ? msg.slice(4).trim() : msg.slice(14).trim();
      if (!movieName) {
        client.say(channel, `@${username} use: !remassistido nome do filme 🎬`);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/watched`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ADMIN_TOKEN}`
          },
          body: JSON.stringify({ movieName })
        });
        const result = await response.json();

        if (result.success) {
          client.say(channel, `🗑️ "${movieName}" removido da lista de assistidos por @${username}!`);
        } else if (result.code === 'NOT_FOUND') {
          client.say(channel, `@${username} esse filme não está na lista de assistidos.`);
        } else {
          client.say(channel, `@${username} erro ao remover filme.`);
        }
      } catch (e) {
        client.say(channel, `@${username} erro ao remover filme.`);
      }
      return;
    }
  }
});

client.connect().then(() => {
  console.log('🤖 Bot conectado à Twitch!');
  console.log(`📺 Canal: ${TWITCH_CHANNEL}`);
  console.log(`🌐 API: ${API_BASE_URL}`);
}).catch(err => {
  console.error('❌ Erro ao conectar à Twitch:', err.message);
});
