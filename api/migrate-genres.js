const { connectToDatabase } = require('./_lib/mongodb');
const { requireAdmin } = require('./_lib/auth');

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

function getTmdbHeaders() {
  return {
    'Authorization': `Bearer ${process.env.TMDB_API_KEY}`,
    'Content-Type': 'application/json'
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    const { db } = await connectToDatabase();

    // Buscar votos sem genreIds
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

    // Agrupar votos por filme (evita buscar o mesmo filme várias vezes)
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

    return res.status(200).json({ success: true, message: `Migração concluída.`, updated, total: votes.length });
  } catch (error) {
    console.error('[MIGRATE] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
