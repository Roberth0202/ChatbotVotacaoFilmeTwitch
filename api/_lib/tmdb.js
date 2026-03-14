const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const { connectToDatabase } = require('./mongodb');

function getTmdbHeaders() {
  return {
    'Authorization': `Bearer ${process.env.TMDB_API_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function validateMovie(movieName) {
  const TMDB_TOKEN = process.env.TMDB_API_KEY;
  if (!TMDB_TOKEN) {
    return { valid: false, error: 'TMDB_API_KEY not configured' };
  }

  const normalizedQuery = movieName.trim().toLowerCase();

  try {
    const { db } = await connectToDatabase();
    
    // 1. Tentar pegar do Cache primeiro
    const cachedMovie = await db.collection('movie_cache').findOne({ query: normalizedQuery });
    if (cachedMovie) {
      console.log(`[TMDB CACHE HIT] "${movieName}"`);
      return cachedMovie.result;
    }

    console.log(`[TMDB API FETCH] "${movieName}"`);
    const searchUrl = `${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(movieName)}&language=pt-BR`;
    const response = await fetch(searchUrl, { headers: getTmdbHeaders() });

    if (!response.ok) {
      return { valid: false };
    }

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const movie = data.results[0];

      let certification = null;
      try {
        const certUrl = `${TMDB_BASE_URL}/movie/${movie.id}/release_dates`;
        const certResponse = await fetch(certUrl, { headers: getTmdbHeaders() });
        if (certResponse.ok) {
          const certData = await certResponse.json();
          const brRelease = certData.results?.find(r => r.iso_3166_1 === 'BR');
          if (brRelease && brRelease.release_dates?.length > 0) {
            certification = brRelease.release_dates[0].certification || null;
          }
          if (!certification) {
            const usRelease = certData.results?.find(r => r.iso_3166_1 === 'US');
            if (usRelease && usRelease.release_dates?.length > 0) {
              certification = usRelease.release_dates[0].certification || null;
            }
          }
        }
      } catch (e) {
        console.error('[TMDB] Error fetching certification:', e.message);
      }

      const resultObj = {
        valid: true,
        title: movie.title,
        originalTitle: movie.original_title,
        posterPath: movie.poster_path,
        year: movie.release_date ? movie.release_date.split('-')[0] : null,
        overview: movie.overview || null,
        voteAverage: movie.vote_average || null,
        certification
      };

      // 2. Salva o resultado válido no cache
      await db.collection('movie_cache').insertOne({
        query: normalizedQuery,
        result: resultObj,
        createdAt: new Date()
      });

      return resultObj;
    }

    // 3. Salva o "Não encontrado" no cache também, para evitar spam
    const notFoundResult = { valid: false };
    await db.collection('movie_cache').insertOne({
      query: normalizedQuery,
      result: notFoundResult,
      createdAt: new Date()
    });

    return notFoundResult;
  } catch (error) {
    console.error('[TMDB] Request error:', error.message);
    return { valid: false };
  }
}

module.exports = { validateMovie };
