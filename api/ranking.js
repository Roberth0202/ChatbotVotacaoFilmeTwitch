const { connectToDatabase } = require('./_lib/mongodb');
const { getTmdbHeaders, TMDB_BASE_URL } = require('./_lib/tmdb');
const { applyCors } = require('./_lib/cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'GET, OPTIONS')) return;
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { db } = await connectToDatabase();

    const session = await db.collection('session').findOne({ _id: 'current' });
    const votingActive = session?.votingActive || false;

    // Aggregate votes and join with movies collection for metadata
    const rankingData = await db.collection('votes').aggregate([
      {
        $group: {
          _id: '$movie',
          count: { $sum: 1 },
          voters: { $push: '$username' }
        }
      },
      {
        $sort: { count: -1, _id: 1 }
      },
      {
        $lookup: {
          from: 'movies',
          localField: '_id',
          foreignField: 'title',
          as: 'movieInfo'
        }
      },
      {
        $addFields: {
          info: { $arrayElemAt: ['$movieInfo', 0] }
        }
      },
      {
        $project: {
          movieInfo: 0
        }
      }
    ]).toArray();

    const totalVotes = rankingData.reduce((acc, curr) => acc + curr.count, 0);

    // Movies missing metadata in `movies` collection (legacy votes or new)
    const missingMeta = rankingData.filter(m => !m.info && process.env.TMDB_API_KEY);

    if (missingMeta.length > 0) {
      // Fetch and persist missing metadata without blocking the response
      Promise.all(missingMeta.map(async (item) => {
        try {
          const searchUrl = `${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(item._id)}&language=pt-BR`;
          const resp = await fetch(searchUrl, { headers: getTmdbHeaders() });
          if (!resp.ok) return;

          const data = await resp.json();
          if (!data.results?.length) return;

          const tmdbMovie = data.results[0];
          const genreIds = tmdbMovie.genre_ids || [];

          let runtime = null;
          const detailResp = await fetch(
            `${TMDB_BASE_URL}/movie/${tmdbMovie.id}?language=pt-BR`,
            { headers: getTmdbHeaders() }
          );
          if (detailResp.ok) {
            const detail = await detailResp.json();
            runtime = detail.runtime || null;
          }

          // Upsert into movies collection — one doc per film, not per vote
          db.collection('movies').updateOne(
            { _id: item._id.toLowerCase() },
            {
              $set: {
                title: item._id,
                posterPath: tmdbMovie.poster_path || null,
                year: tmdbMovie.release_date?.split('-')[0] || null,
                overview: tmdbMovie.overview || null,
                voteAverage: tmdbMovie.vote_average || null,
                genreIds,
                runtime,
                updatedAt: new Date().toISOString()
              }
            },
            { upsert: true }
          ).catch(() => {});
        } catch (e) {
          // Silent fallback
        }
      })).catch(() => {});
    }

    const ranking = rankingData.map(data => ({
      name: data._id,
      count: data.count,
      voters: data.voters,
      posterPath: data.info?.posterPath || null,
      year: data.info?.year || null,
      overview: data.info?.overview || null,
      voteAverage: data.info?.voteAverage || null,
      certification: data.info?.certification || null,
      genreIds: data.info?.genreIds || [],
      runtime: data.info?.runtime || null
    }));

    const watchedMovies = await db.collection('watched').find({}).sort({ markedAt: -1 }).toArray();

    const cleanWatched = watchedMovies.map(({ _id, ...rest }) => ({
      id: _id.toString(),
      ...rest
    }));

    return res.status(200).json({
      ranking,
      totalVotes,
      votingActive,
      watchedMovies: cleanWatched,
      mode: session?.mode || 'general',
      bracket: session?.bracket || null
    });
  } catch (error) {
    console.error('[API /ranking] Error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};
