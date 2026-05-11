import { useState, useEffect } from 'react';
import tmi from 'tmi.js';

export function useTwitchChat(channel) {
  const [chatConnected, setChatConnected] = useState(false);
  const [lastVoteEvent, setLastVoteEvent] = useState(null);

  useEffect(() => {
    if (!channel) return;

    // Twitch IRC exige canal em lowercase
    const safeChannel = channel.toLowerCase().trim();

    const client = new tmi.Client({
      options: { debug: false },
      connection: {
        reconnect: true,
        secure: true
      },
      channels: [safeChannel]
    });

    client.connect()
      .then(() => setChatConnected(true))
      .catch(() => setChatConnected(false));

    client.on('message', (currentChannel, tags, message, self) => {
      if (self) return;

      const username = tags.username || '';
      const msg = (message || '').trim();

      if (msg.startsWith('!votar ') || msg.startsWith('!v ')) {
        const movieName = msg.startsWith('!v ') ? msg.slice(3).trim() : msg.slice(7).trim();
        if (!movieName) return;

        setLastVoteEvent({ username, movieName, timestamp: Date.now() });
      }
    });

    client.on('disconnected', () => setChatConnected(false));
    client.on('connected', () => setChatConnected(true));

    return () => {
      client.disconnect();
    };
  }, [channel]);

  return { chatConnected, lastVoteEvent };
}
