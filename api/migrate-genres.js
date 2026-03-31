const { connectToDatabase } = require('./_lib/mongodb');
const { getTmdbHeaders, TMDB_BASE_URL } = require('./_lib/tmdb');
const { requireAdmin } = require('./_lib/auth');
const { applyCors } = require('./_lib/cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    const { db } = await connectToDatabase();

    const votes = await db.collection('votes').find({
      $or: [
        { genreIds: { $exists: false } },
        { genreIds: { $size: 0 } },
        { genreIds: null }
      ]
    }).toArray();

    if (votes.length === 0) {
      return res.status(200).json({ success: true, message: 'Todos os votos já possuem gêneros.', updated: 0 });
    }

    const uniqueMovies = [...new Set(votes.map(v => v.movie))];
    let updated = 0;

    for (const movieName of uniqueMovies) {
      try {
        const searchUrl = `${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(movieName)}&language=pt-BR`;
        const response = await fetch(searchUrl, { headers: getTmdbHeaders() });

        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.length > 0) {
            const genreIds = data.results[0].genre_ids || [];

            if (genreIds.length > 0) {
              const result = await db.collection('votes').updateMany(
                { movie: movieName },
                { $set: { genreIds } }
              );
              updated += result.modifiedCount;
              console.log(`[MIGRATE] "${movieName}" → gêneros: ${genreIds.join(', ')}`);
            }
          }
        }
      } catch (e) {
        console.error(`[MIGRATE] Erro ao buscar "${movieName}":`, e.message);
      }
    }

    return res.status(200).json({ success: true, message: 'Migração concluída.', updated, total: votes.length });
  } catch (error) {
    console.error('[MIGRATE] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
