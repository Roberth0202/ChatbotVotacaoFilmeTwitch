function requireAdmin(req, res) {
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

  if (!ADMIN_TOKEN) {
    res.status(503).json({ error: 'ADMIN_TOKEN not configured' });
    return false;
  }

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_TOKEN}`) {
    res.status(403).json({ error: 'Access denied' });
    return false;
  }

  return true;
}

module.exports = { requireAdmin };
