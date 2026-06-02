const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const { connectToDatabase } = require('./mongodb');

function getTmdbHeaders() {
  return {
    'Authorization': `Bearer ${process.env.TMDB_API_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function fetchCertification(movieId) {
  try {
    const certUrl = `${TMDB_BASE_URL}/movie/${movieId}/release_dates`;
    const certResponse = await fetch(certUrl, { headers: getTmdbHeaders() });
    if (!certResponse.ok) return null;

    const certData = await certResponse.json();

    const brRelease = certData.results?.find(r => r.iso_3166_1 === 'BR');
    if (brRelease && brRelease.release_dates?.length > 0) {
      const cert = brRelease.release_dates[0].certification;
      if (cert) return cert;
    }

    const usRelease = certData.results?.find(r => r.iso_3166_1 === 'US');
    if (usRelease && usRelease.release_dates?.length > 0) {
      return usRelease.release_dates[0].certification || null;
    }

    return null;
  } catch (e) {
    console.error('[TMDB] Error fetching certification:', e.message);
    return null;
  }
}

async function fetchRuntime(movieId) {
  try {
    const detailUrl = `${TMDB_BASE_URL}/movie/${movieId}?language=pt-BR`;
    const response = await fetch(detailUrl, { headers: getTmdbHeaders() });
    if (!response.ok) return null;
    const data = await response.json();
    return data.runtime || null;
  } catch (e) {
    console.error('[TMDB] Error fetching runtime:', e.message);
    return null;
  }
}

async function validateMovie(movieName) {
  const TMDB_TOKEN = process.env.TMDB_API_KEY;
  if (!TMDB_TOKEN) {
    return { valid: false, error: 'TMDB_API_KEY not configured' };
  }

  const normalizedQuery = movieName.trim().toLowerCase();

  try {
    const { db } = await connectToDatabase();
    
    const cachedMovie = await db.collection('movie_cache').findOne({ query: normalizedQuery });
    if (cachedMovie && (!cachedMovie.result.valid || cachedMovie.result.genreIds !== undefined)) {
      console.log(`[TMDB CACHE HIT] "${movieName}"`);
      return cachedMovie.result;
    }

    console.log(`[TMDB API FETCH] "${movieName}"`);
    let cleanName = movieName.trim();
    let yearParam = '';
    const yearMatch = cleanName.match(/^(.*?)\s*\(\s*(\d{4})\s*\)\s*$/);
    
    if (yearMatch && yearMatch[1].trim() !== '') {
      cleanName = yearMatch[1].trim();
      yearParam = `&primary_release_year=${yearMatch[2]}`;
    }

    const searchUrl = `${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(cleanName)}&language=pt-BR${yearParam}`;
    const response = await fetch(searchUrl, { headers: getTmdbHeaders() });

    if (!response.ok) {
      return { valid: false };
    }

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      let selectedMovie = null;

      // If a year was explicitly requested, we trust TMDB's top result (which filtered by year)
      if (yearParam) {
        selectedMovie = data.results[0];
      } else {
        // If no year was requested, we want the *most recent* exact match
        const exactMatches = data.results.filter(m => 
          (m.title && m.title.toLowerCase() === cleanName.toLowerCase()) || 
          (m.original_title && m.original_title.toLowerCase() === cleanName.toLowerCase())
        );

        if (exactMatches.length > 0) {
          // Sort exact matches by release date descending (newest first)
          exactMatches.sort((a, b) => {
            const dateA = a.release_date ? new Date(a.release_date).getTime() : 0;
            const dateB = b.release_date ? new Date(b.release_date).getTime() : 0;
            return dateB - dateA;
          });
          selectedMovie = exactMatches[0];
        } else {
          // Fallback to the most popular result if there's no exact match
          selectedMovie = data.results[0];
        }
      }

      const [certification, runtime] = await Promise.all([
        fetchCertification(selectedMovie.id),
        fetchRuntime(selectedMovie.id)
      ]);

      const resultObj = {
        valid: true,
        title: selectedMovie.title,
        originalTitle: selectedMovie.original_title,
        posterPath: selectedMovie.poster_path,
        year: selectedMovie.release_date ? selectedMovie.release_date.split('-')[0] : null,
        overview: selectedMovie.overview || null,
        voteAverage: selectedMovie.vote_average || null,
        genreIds: selectedMovie.genre_ids || [],
        runtime,
        certification
      };

      await db.collection('movie_cache').insertOne({
        query: normalizedQuery,
        result: resultObj,
        createdAt: new Date()
      });

      return resultObj;
    }

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

async function searchMovies(query) {
  const TMDB_TOKEN = process.env.TMDB_API_KEY;
  if (!TMDB_TOKEN) {
    return { results: [], error: 'TMDB_API_KEY not configured' };
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return { results: [] };

  try {
    let cleanName = query.trim();
    let yearParam = '';
    const yearMatch = cleanName.match(/^(.*?)\s*\(\s*(\d{4})\s*\)\s*$/);
    
    if (yearMatch && yearMatch[1].trim() !== '') {
      cleanName = yearMatch[1].trim();
      yearParam = `&primary_release_year=${yearMatch[2]}`;
    }

    const searchUrl = `${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(cleanName)}&language=pt-BR&page=1${yearParam}`;
    const response = await fetch(searchUrl, { headers: getTmdbHeaders() });

    if (!response.ok) {
      return { results: [] };
    }

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const results = await Promise.all(
        data.results.slice(0, 5).map(async (movie) => {
          const [certification, runtime] = await Promise.all([
            fetchCertification(movie.id),
            fetchRuntime(movie.id)
          ]);
          return {
            id: movie.id,
            title: movie.title,
            originalTitle: movie.original_title,
            posterPath: movie.poster_path,
            year: movie.release_date ? movie.release_date.split('-')[0] : null,
            overview: movie.overview || null,
            voteAverage: movie.vote_average || null,
            runtime,
            certification
          };
        })
      );
      return { results };
    }
    return { results: [] };
  } catch (error) {
    console.error('[TMDB] Search request error:', error.message);
    return { results: [] };
  }
}

module.exports = { validateMovie, searchMovies, getTmdbHeaders, TMDB_BASE_URL };
