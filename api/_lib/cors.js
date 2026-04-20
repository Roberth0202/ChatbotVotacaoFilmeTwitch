const ALLOWED_ORIGINS = [
  'https://votacao-filme.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173'
];

function applyCors(req, res, methods = 'GET, POST, OPTIONS') {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
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
