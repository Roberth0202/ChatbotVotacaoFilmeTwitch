const { requireAdmin } = require('../_lib/auth');
const { applyCors } = require('../_lib/cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'GET, OPTIONS')) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  return res.status(200).json({ valid: true });
};
