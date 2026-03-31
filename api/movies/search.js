const { requireAdmin } = require('../_lib/auth');
const { searchMovies } = require('../_lib/tmdb');
const { applyCors } = require('../_lib/cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'GET, OPTIONS')) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  const { query } = req.query || {};

  if (!query || query.trim().length === 0) {
    return res.status(200).json({ results: [] });
  }

  try {
    const data = await searchMovies(query);
    if (data.error) {
      return res.status(500).json({ error: data.error });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error('[API /movies/search] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
