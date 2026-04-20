const jwt = require('jsonwebtoken');
const { applyCors } = require('../_lib/cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, redirectUri } = req.body;

  if (!code || !redirectUri) {
    return res.status(400).json({ error: 'Missing code or redirectUri' });
  }

  const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
  const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
  // ADMIN_TWITCH_USERNAME define quem pode ser admin. Suporta lista: "user1,user2"
  // Se não configurado, cai somente para o dono do canal (TWITCH_CHANNEL)
  const ADMIN_USERNAMES_RAW = process.env.ADMIN_TWITCH_USERNAME || process.env.TWITCH_CHANNEL || '';
  const ALLOWED_ADMINS = ADMIN_USERNAMES_RAW.toLowerCase().split(',').map(u => u.trim()).filter(Boolean);
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!JWT_SECRET) {
    console.error('[Auth] JWT_SECRET not configured!');
    return res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET is required' });
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'Twitch credentials not configured on the server' });
  }

  try {
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

    if (!ALLOWED_ADMINS.includes(username)) {
      return res.status(403).json({ error: `User ${username} is not authorized to be Admin.` });
    }

    const jwtToken = jwt.sign(
      { username: username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
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
