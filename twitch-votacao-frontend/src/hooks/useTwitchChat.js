import { useState, useEffect, useRef } from 'react';
import tmi from 'tmi.js';

export function useTwitchChat(channel) {
  const [chatConnected, setChatConnected] = useState(false);
  const [lastVoteEvent, setLastVoteEvent] = useState(null);
  const msgCountRef = useRef(0);
  const voteCountRef = useRef(0);

  useEffect(() => {
    if (!channel) return;

    console.log(`[TMI] Iniciando conexão ao canal: "${channel}"`);

    const client = new tmi.Client({
      options: { debug: false },
      connection: {
        reconnect: true,
        secure: true
      },
      channels: [channel]
    });

    client.connect()
      .then(() => {
        console.log(`✅ Conectado ao chat da Twitch (${channel})!`);
        setChatConnected(true);
      })
      .catch(err => {
        console.error('❌ Erro ao conectar no chat via WebSocket:', err);
        setChatConnected(false);
      });

    // Timer de resumo a cada 10s
    const summaryTimer = setInterval(() => {
      console.log(`[TMI RESUMO] ${msgCountRef.current} msgs recebidas | ${voteCountRef.current} votos detectados`);
    }, 10000);

    // Escutar as mensagens do chat em tempo real
    client.on('message', (currentChannel, tags, message, self) => {
      msgCountRef.current++;

      const username = tags.username || '???';
      const msg = (message || '').trim();

      // === LOG AGRESSIVO: qualquer msg que começa com ! ===
      if (msg.startsWith('!')) {
        console.log(`⚡ [COMANDO] #${msgCountRef.current} ${username}: "${msg}" (self=${self})`);
      }

      // === LOG: msgs do roberth0202 (o dono testando) ===
      if (username.toLowerCase() === 'roberth0202') {
        console.log(`👤 [ROBERTH0202] #${msgCountRef.current}: "${msg}" (self=${self})`);
      }

      // Log das primeiras 10 mensagens
      if (msgCountRef.current <= 10) {
        console.log(`[TMI MSG #${msgCountRef.current}] ${username}: "${msg.substring(0, 100)}" (self=${self})`);
      }

      // Log a cada 50 mensagens
      if (msgCountRef.current % 50 === 0) {
        console.log(`[TMI] Total: ${msgCountRef.current} msgs | ${voteCountRef.current} votos`);
      }

      if (self) return;

      // Checa se o comando foi de voto
      if (msg.startsWith('!votar ') || msg.startsWith('!v ')) {
        const movieName = msg.startsWith('!v ') ? msg.slice(3).trim() : msg.slice(7).trim();
        voteCountRef.current++;

        console.log(`🎬 [VOTO DETECTADO #${voteCountRef.current}] ${username} → "${movieName}" (msg: "${msg}")`);
        
        if (!movieName) {
          console.warn(`[TMI] Voto ignorado: nome do filme vazio (user: ${username})`);
          return;
        }

        const event = { username, movieName, timestamp: Date.now() };
        console.log(`📤 [EMITINDO EVENTO]`, JSON.stringify(event));
        setLastVoteEvent(event);
      }
    });

    client.on('disconnected', (reason) => {
      console.warn(`[TMI] Desconectado: ${reason}`);
      setChatConnected(false);
    });

    client.on('connected', (addr, port) => {
      console.log(`[TMI] WebSocket conectado em ${addr}:${port}`);
    });

    client.on('join', (ch, username, self) => {
      if (self) {
        console.log(`[TMI] Entrou no canal: ${ch}`);
      }
    });

    return () => {
      clearInterval(summaryTimer);
      console.log(`[TMI] Desconectando do canal ${channel}...`);
      client.disconnect();
    };
  }, [channel]);

  return { chatConnected, lastVoteEvent };
}
