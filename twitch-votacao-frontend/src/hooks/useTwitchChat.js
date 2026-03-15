import { useState, useEffect } from 'react';
import tmi from 'tmi.js';

export function useTwitchChat(channel) {
  const [chatConnected, setChatConnected] = useState(false);
  const [lastVoteEvent, setLastVoteEvent] = useState(null);

  useEffect(() => {
    if (!channel) return;

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

    // Escutar as mensagens do chat em tempo real
    client.on('message', async (currentChannel, tags, message, self) => {
      if (self) return;

      const username = tags.username;
      const msg = message.trim();

      // Checa se o comando foi de voto
      if (msg.startsWith('!votar ') || msg.startsWith('!v ')) {
        const movieName = msg.startsWith('!v ') ? msg.slice(3).trim() : msg.slice(7).trim();
        
        if (!movieName) return; // Voto sem nome de filme, ignora.

        // Emite o evento do botão com um timestamp, 
        // para forçar re-render caso o msm user digite a msm coisa (e dar o feedback de erro dnv)
        setLastVoteEvent({
          username,
          movieName,
          timestamp: Date.now() 
        });
      }
    });

    client.on('disconnected', () => {
      setChatConnected(false);
    });

    return () => {
      client.disconnect();
    };
  }, [channel]);

  return { chatConnected, lastVoteEvent };
}
