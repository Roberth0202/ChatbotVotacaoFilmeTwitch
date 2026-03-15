const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
  // Configuração básica do CORS (igual às outras rotas)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, redirectUri } = req.body;

  if (!code || !redirectUri) {
    return res.status(400).json({ error: 'Missing code or redirectUri' });
  }

  const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
  const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
  const ALLOWED_CHANNEL = process.env.TWITCH_CHANNEL || 'roberth0202';
  const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_jwt_only_in_dev';

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'Twitch credentials not configured on the server' });
  }

  try {
    // 1. Trocar o 'code' por um Access Token da Twitch
    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Twitch Token Error:', tokenData);
      return res.status(400).json({ error: 'Failed to authenticate with Twitch', details: tokenData });
    }

    const { access_token } = tokenData;

    // 2. Com o Access Token, pegar o perfil do usuário logado
    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      method: 'GET',
      headers: {
        'Client-ID': CLIENT_ID,
        'Authorization': `Bearer ${access_token}`
      }
    });

    const userData = await userResponse.json();

    if (!userResponse.ok || !userData.data || userData.data.length === 0) {
      return res.status(400).json({ error: 'Failed to fetch Twitch user profile' });
    }

    const user = userData.data[0];
    const username = user.login.toLowerCase();

    // 3. Verificar se é o streamer (o dono real) permitindo o admin
    // Também podemos permitir mods futuramente, mas para proteção Master,
    // o canal dono recebe o super JWT.
    if (username !== ALLOWED_CHANNEL.toLowerCase()) {
      return res.status(403).json({ error: `User ${username} is not authorized to be Admin.` });
    }

    // 4. Gerar o JWT assinado
    const jwtToken = jwt.sign(
      { username: username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '7d' } // Válido por 7 dias
    );

    return res.status(200).json({
      success: true,
      token: jwtToken,
      user: {
        username: user.login,
        displayName: user.display_name,
        profileImageUrl: user.profile_image_url
      }
    });

  } catch (error) {
    console.error('[API /auth/twitch] Error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
};
