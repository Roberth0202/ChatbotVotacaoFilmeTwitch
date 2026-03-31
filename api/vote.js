const { connectToDatabase } = require('./_lib/mongodb');
const { requireAdmin } = require('./_lib/auth');
const { validateMovie } = require('./_lib/tmdb');
const { sanitizeInput } = require('./_lib/sanitize');
const { applyCors } = require('./_lib/cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  const { username, movieName } = req.body || {};

  if (!username || !movieName) {
    return res.status(400).json({ error: 'username and movieName are required' });
  }

  const sanitizedMovie = sanitizeInput(movieName);
  if (!sanitizedMovie || sanitizedMovie.length < 2) {
    return res.status(400).json({ error: 'Invalid movie name' });
  }

  try {
    const { db } = await connectToDatabase();

    const [session, validation, previousVoteDoc] = await Promise.all([
      db.collection('session').findOne({ _id: 'current' }),
      validateMovie(sanitizedMovie),
      db.collection('votes').findOne({ username })
    ]);

    if (!session?.votingActive) {
      return res.status(400).json({ error: 'Voting is not active', code: 'VOTING_CLOSED' });
    }

    if (!validation.valid) {
      return res.status(400).json({
        error: `"${sanitizedMovie}" is not a valid movie`,
        code: 'INVALID_MOVIE'
      });
    }

    const movieTitle = validation.title || sanitizedMovie;
    const previousVote = previousVoteDoc?.movie || null;

    await db.collection('votes').updateOne(
      { username },
      {
        $set: {
          username,
          movie: movieTitle,
          posterPath: validation.posterPath,
          year: validation.year,
          overview: validation.overview,
          voteAverage: validation.voteAverage,
          certification: validation.certification,
          genreIds: validation.genreIds || [],
          votedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    return res.status(200).json({
      success: true,
      username,
      movie: movieTitle,
      previousVote,
      year: validation.year
    });
  } catch (error) {
    console.error('[API /vote] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
