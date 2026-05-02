// Validates that a Twitch username actually exists using the Helix API.
// Uses Client Credentials (app access token) — no user login needed.

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAppAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
  const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET not configured');
  }

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials'
    })
  });

  const data = await res.json();

  if (!res.ok || !data.access_token) {
    throw new Error('Failed to get Twitch app access token');
  }

  cachedToken = data.access_token;
  // Token dura ~60 dias, mas renovamos com margem de 1h
  tokenExpiresAt = Date.now() + (data.expires_in - 3600) * 1000;

  return cachedToken;
}

async function validateTwitchUsername(username) {
  // Twitch usernames: 3-25 chars, alphanumeric + underscore
  const usernameRegex = /^[a-zA-Z0-9_]{3,25}$/;
  if (!usernameRegex.test(username)) {
    return { valid: false, reason: 'Invalid username format' };
  }

  try {
    const token = await getAppAccessToken();
    const CLIENT_ID = process.env.TWITCH_CLIENT_ID;

    const res = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(username.toLowerCase())}`,
      {
        headers: {
          'Client-ID': CLIENT_ID,
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!res.ok) {
      // If Twitch API fails, allow the vote (fail-open to not block legitimate votes)
      console.error('[TwitchUser] API error:', res.status);
      return { valid: true, reason: 'Twitch API unavailable, allowing vote' };
    }

    const data = await res.json();

    if (!data.data || data.data.length === 0) {
      return { valid: false, reason: 'Twitch username does not exist' };
    }

    return { valid: true, twitchUser: data.data[0] };
  } catch (err) {
    // Fail-open: if we can't verify, allow the vote
    console.error('[TwitchUser] Validation error:', err.message);
    return { valid: true, reason: 'Validation skipped due to error' };
  }
}

module.exports = { validateTwitchUsername };
