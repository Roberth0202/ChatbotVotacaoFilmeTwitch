const { connectToDatabase } = require('./_lib/mongodb');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=3, stale-while-revalidate=5');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { db } = await connectToDatabase();

    const session = await db.collection('session').findOne({ _id: 'current' });
    const votingActive = session?.votingActive || false;

    const votesArr = await db.collection('votes').find({}).toArray();

    const movies = {};
    for (const v of votesArr) {
      const title = v.movie;
      if (!movies[title]) {
        movies[title] = {
          count: 0,
          voters: [],
          posterPath: v.posterPath || null,
          year: v.year || null,
          overview: v.overview || null,
          voteAverage: v.voteAverage || null,
          certification: v.certification || null
        };
      }
      movies[title].count++;
      movies[title].voters.push(v.username);
    }

    const ranking = Object.entries(movies)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);

    const watchedMovies = await db.collection('watched').find({}).sort({ markedAt: -1 }).toArray();

    // Remove _id do MongoDB antes de enviar
    const cleanWatched = watchedMovies.map(({ _id, ...rest }) => rest);

    return res.status(200).json({
      ranking,
      totalVotes: votesArr.length,
      votingActive,
      watchedMovies: cleanWatched
    });
  } catch (error) {
    console.error('[API /ranking] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      hint: error.message.includes('MONGODB_URI')
        ? 'MONGODB_URI não está configurada nas variáveis de ambiente da Vercel'
        : error.message.includes('authentication')
        ? 'Credenciais do MongoDB incorretas na connection string'
        : error.message.includes('connect')
        ? 'Não foi possível conectar ao MongoDB. Verifique: 1) IP 0.0.0.0/0 no Network Access do Atlas, 2) Connection string correta'
        : 'Erro inesperado'
    });
  }
};
