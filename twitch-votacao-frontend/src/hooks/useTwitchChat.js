import { useState, useEffect, useRef } from 'react';
import tmi from 'tmi.js';

export function useTwitchChat(channel) {
  const [chatConnected, setChatConnected] = useState(false);
  const [lastVoteEvent, setLastVoteEvent] = useState(null);
  const msgCountRef = useRef(0);

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

    // Log de todos os eventos raw do IRC para debug
    client.on('raw_message', (messageCloned, message) => {
      if (msgCountRef.current < 3) {
        console.log('[TMI RAW]', message.raw);
      }
    });

    // Escutar as mensagens do chat em tempo real
    client.on('message', (currentChannel, tags, message, self) => {
      msgCountRef.current++;

      // Log das primeiras 5 mensagens para confirmar recebimento
      if (msgCountRef.current <= 5) {
        console.log(`[TMI MSG #${msgCountRef.current}] ${tags.username}: "${message.substring(0, 80)}" (self=${self})`);
      }

      // Log a cada 100 mensagens para mostrar que continua recebendo
      if (msgCountRef.current % 100 === 0) {
        console.log(`[TMI] Total de mensagens recebidas: ${msgCountRef.current}`);
      }

      if (self) return;

      const username = tags.username;
      const msg = message.trim();

      // Checa se o comando foi de voto
      if (msg.startsWith('!votar ') || msg.startsWith('!v ')) {
        const movieName = msg.startsWith('!v ') ? msg.slice(3).trim() : msg.slice(7).trim();

        console.log(`🎬 [VOTO DETECTADO] ${username} → "${movieName}" (msg original: "${msg}")`);
        
        if (!movieName) {
          console.warn(`[TMI] Voto ignorado: nome do filme vazio (user: ${username})`);
          return;
        }

        const event = {
          username,
          movieName,
          timestamp: Date.now() 
        };

        console.log(`📤 [EMITINDO EVENTO]`, event);
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
      console.log(`[TMI] Desconectando do canal ${channel}...`);
      client.disconnect();
    };
  }, [channel]);

  return { chatConnected, lastVoteEvent };
}
