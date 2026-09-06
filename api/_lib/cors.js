const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/votacao-filme\.vercel\.app$/,
  /^https:\/\/.*\.vercel\.app$/,          // preview deployments
  /^https?:\/\/(www\.)?twitch\.tv$/,      // twitch console tests
  /^http:\/\/localhost:\d+$/              // local dev
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGIN_PATTERNS.some(pattern => pattern.test(origin));
}

function applyCors(req, res, methods = 'GET, POST, OPTIONS') {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}

module.exports = { applyCors };
