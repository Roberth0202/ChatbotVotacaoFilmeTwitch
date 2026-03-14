const { connectToDatabase } = require('./_lib/mongodb');
const { requireAdmin } = require('./_lib/auth');
const { validateMovie } = require('./_lib/tmdb');

const MAX_INPUT_LENGTH = 100;

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, MAX_INPUT_LENGTH).replace(/[<>{}]/g, '');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

    // Roda essas 3 tarefas PESADAS ao mesmo tempo (em paralelo) em vez de uma por uma!
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

    // Upsert vote
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
          votedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    // Retirada da contagem de `countDocuments` pois o bot não utiliza isso e é lento em coleções grandes.
    
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
