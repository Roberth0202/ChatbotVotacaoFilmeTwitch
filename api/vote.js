const { connectToDatabase } = require('./_lib/mongodb');
const { validateMovie } = require('./_lib/tmdb');
const { validateTwitchUsername } = require('./_lib/twitchUser');
const { sanitizeInput } = require('./_lib/sanitize');
const { applyCors } = require('./_lib/cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    const [session, validation, twitchCheck, previousVoteDoc] = await Promise.all([
      db.collection('session').findOne({ _id: 'current' }),
      validateMovie(sanitizedMovie),
      validateTwitchUsername(username),
      db.collection('votes').findOne({ username })
    ]);

    if (!session?.votingActive) {
      return res.status(400).json({ error: 'Voting is not active', code: 'VOTING_CLOSED' });
    }

    if (!twitchCheck.valid) {
      return res.status(403).json({
        error: `Username "${username}" is not a valid Twitch account`,
        code: 'INVALID_TWITCH_USER'
      });
    }

    if (!validation.valid) {
      return res.status(400).json({
        error: `"${sanitizedMovie}" is not a valid movie`,
        code: 'INVALID_MOVIE'
      });
    }

    const movieTitle = validation.title || sanitizedMovie;
    const previousVote = previousVoteDoc?.movie || null;

    // Save vote with only essential fields (no repeated movie metadata)
    const saveVote = db.collection('votes').updateOne(
      { username },
      {
        $set: {
          username,
          movie: movieTitle,
          votedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    // Upsert movie metadata once into the dedicated `movies` collection
    const saveMovie = db.collection('movies').updateOne(
      { _id: movieTitle.toLowerCase() },
      {
        $set: {
          title: movieTitle,
          posterPath: validation.posterPath || null,
          year: validation.year || null,
          overview: validation.overview || null,
          voteAverage: validation.voteAverage || null,
          certification: validation.certification || null,
          genreIds: validation.genreIds || [],
          runtime: validation.runtime || null,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    await Promise.all([saveVote, saveMovie]);

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
