const { connectToDatabase } = require('./_lib/mongodb');
const { requireAdmin } = require('./_lib/auth');
const { validateMovie } = require('./_lib/tmdb');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { db } = await connectToDatabase();

    if (req.method === 'GET') {
      const watchedMovies = await db.collection('watched')
        .find({})
        .sort({ markedAt: -1 })
        .toArray();

      const cleanWatched = watchedMovies.map(({ _id, ...rest }) => rest);
      return res.status(200).json({ watchedMovies: cleanWatched });
    }

    if (req.method === 'POST') {
      if (!requireAdmin(req, res)) return;

      const { movieName, markedBy } = req.body || {};

      if (!movieName) {
        return res.status(400).json({ error: 'movieName is required' });
      }

      // Check if already watched
      const existing = await db.collection('watched').findOne({
        titleLower: movieName.toLowerCase().trim()
      });

      if (existing) {
        return res.status(400).json({
          error: `"${existing.title}" already in watched list`,
          code: 'ALREADY_WATCHED'
        });
      }

      const validation = await validateMovie(movieName);
      if (!validation.valid) {
        return res.status(400).json({
          error: `"${movieName}" is not a valid movie`,
          code: 'INVALID_MOVIE'
        });
      }

      const watchedEntry = {
        title: validation.title,
        titleLower: validation.title.toLowerCase(),
        originalTitle: validation.originalTitle || null,
        posterPath: validation.posterPath || null,
        year: validation.year || null,
        overview: validation.overview || null,
        voteAverage: validation.voteAverage || null,
        certification: validation.certification || null,
        markedBy: markedBy || 'unknown',
        markedAt: new Date().toISOString()
      };

      await db.collection('watched').insertOne(watchedEntry);

      return res.status(201).json({ success: true, movie: watchedEntry });
    }

    if (req.method === 'DELETE') {
      if (!requireAdmin(req, res)) return;

      const { movieName } = req.body || {};

      if (!movieName) {
        return res.status(400).json({ error: 'movieName is required' });
      }

      const result = await db.collection('watched').deleteOne({
        titleLower: movieName.toLowerCase().trim()
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          error: `"${movieName}" not found in watched list`,
          code: 'NOT_FOUND'
        });
      }

      return res.status(200).json({ success: true, removed: movieName });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[API /watched] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
