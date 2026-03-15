const jwt = require('jsonwebtoken');

function requireAdmin(req, res) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Access denied. Missing or invalid Authorization header.' });
    return false;
  }

  const token = authHeader.split(' ')[1];
  const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_jwt_only_in_dev';

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Opcional: Se quiser checar explicitamente a 'role', o token da rota twitch.js passa 'admin'
    if (decoded.role !== 'admin') {
      res.status(403).json({ error: 'Access denied. You do not have admin roles.' });
      return false;
    }

    // Se chegou até aqui, está autenticado e é do canal dono
    return true;

  } catch (err) {
    console.error('[Auth Error]:', err.message);
    res.status(401).json({ error: 'Invalid or expired token' });
    return false;
  }
}

module.exports = { requireAdmin };
