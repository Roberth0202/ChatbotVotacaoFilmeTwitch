const { connectToDatabase } = require('./_lib/mongodb');
const { requireAdmin } = require('./_lib/auth');
const { validateMovie } = require('./_lib/tmdb');

const MAX_INPUT_LENGTH = 100;

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, MAX_INPUT_LENGTH).replace(/[<>{}]/g, '');
}

/**
 * Endpoint otimizado para receber múltiplos votos em uma única requisição (Batch)
 * Isso salva limite gratuito de Serverless Functions (Vercel)
 */
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

  const { votes } = req.body || {};

  if (!Array.isArray(votes) || votes.length === 0) {
    return res.status(400).json({ error: 'votes array is required and cannot be empty' });
  }

  try {
    const { db } = await connectToDatabase();

    const session = await db.collection('session').findOne({ _id: 'current' });
    if (!session?.votingActive) {
      return res.status(400).json({ error: 'Voting is not active', code: 'VOTING_CLOSED' });
    }

    const results = [];
    const bulkOperations = [];

    // Otimização: Pegamos todos os votos antigos de uma vez só
    const usernames = votes.map(v => v.username);
    const previousVotesArray = await db.collection('votes').find({ username: { $in: usernames } }).toArray();
    const previousVotesMap = {};
    previousVotesArray.forEach(v => {
      previousVotesMap[v.username] = v.movie;
    });

    // Validar filmes no TMDB (usará o cache implementado anteriormente)
    for (const vote of votes) {
      const { username, movieName } = vote;
      const sanitizedMovie = sanitizeInput(movieName);

      if (!username || !sanitizedMovie || sanitizedMovie.length < 2) {
        results.push({ username, error: 'Invalid movie name', code: 'INVALID_MOVIE' });
        continue;
      }

      const validation = await validateMovie(sanitizedMovie);
      if (!validation.valid) {
        results.push({ username, error: `"${sanitizedMovie}" is not a valid movie`, code: 'INVALID_MOVIE' });
        continue;
      }

      const movieTitle = validation.title || sanitizedMovie;
      const previousVote = previousVotesMap[username] || null;

      // Adiciona na fila do BulkWrite (várias inserções em 1 requisição ao banco)
      bulkOperations.push({
        updateOne: {
          filter: { username },
          update: {
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
          upsert: true
        }
      });

      results.push({
        username,
        success: true,
        movie: movieTitle,
        previousVote,
        year: validation.year
      });
    }

    // Executa as dezenas/centenas de writes no MongoDB em um comando só
    if (bulkOperations.length > 0) {
      await db.collection('votes').bulkWrite(bulkOperations);
    }

    return res.status(200).json({
      success: true,
      results
    });
  } catch (error) {
    console.error('[API /vote-batch] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
