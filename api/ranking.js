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

    // O MongoDB faz todo o trabalho pesado de contar, agrupar as informações do filme e coletar os nomes dos votantes
    const rankingData = await db.collection('votes').aggregate([
      {
        $group: {
          _id: "$movie", // Agrupa pelo nome do filme
          count: { $sum: 1 }, // Conta os votos
          voters: { $push: "$username" }, // Cria um array com o nome de quem votou
          posterPath: { $first: "$posterPath" }, // Pega o primeiro poster q encontrar
          year: { $first: "$year" },
          overview: { $first: "$overview" },
          voteAverage: { $first: "$voteAverage" },
          certification: { $first: "$certification" },
          genreIds: { $first: "$genreIds" }
        }
      },
      {
        $sort: { count: -1 } // Já devolve ordenado do maior pro menor
      }
    ]).toArray();

    // Calcula o total de votos somando a contagem de cada filme
    const totalVotes = rankingData.reduce((acc, curr) => acc + curr.count, 0);

    // Formata do jeito que o frontend já espera
    const ranking = rankingData.map(data => ({
      name: data._id,
      count: data.count,
      voters: data.voters,
      posterPath: data.posterPath,
      year: data.year,
      overview: data.overview,
      voteAverage: data.voteAverage,
      certification: data.certification,
      genreIds: data.genreIds || []
    }));

    // Auto-enriquecer votos sem gêneros (awaita para incluir na resposta atual)
    const moviesWithoutGenres = ranking.filter(m => !m.genreIds || m.genreIds.length === 0);
    if (moviesWithoutGenres.length > 0 && process.env.TMDB_API_KEY) {
      const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
      const headers = {
        'Authorization': `Bearer ${process.env.TMDB_API_KEY}`,
        'Content-Type': 'application/json'
      };

      await Promise.all(moviesWithoutGenres.map(async (movie) => {
        try {
          const searchUrl = `${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(movie.name)}&language=pt-BR`;
          const resp = await fetch(searchUrl, { headers });
          if (resp.ok) {
            const data = await resp.json();
            if (data.results && data.results.length > 0) {
              const genreIds = data.results[0].genre_ids || [];
              if (genreIds.length > 0) {
                // Atualiza o objeto em memória APENAS para a resposta imediata
                movie.genreIds = genreIds;
                // Salva no banco em background (sem await) para acelerar a request
                db.collection('votes').updateMany(
                  { movie: movie.name },
                  { $set: { genreIds } }
                ).catch(() => {});
              }
            }
          }
        } catch (e) {
          // Fallback silencioso
        }
      }));
    }

    const watchedMovies = await db.collection('watched').find({}).sort({ markedAt: -1 }).toArray();

    const cleanWatched = watchedMovies.map(({ _id, ...rest }) => ({
      id: _id.toString(),
      ...rest
    }));

    return res.status(200).json({
      ranking,
      totalVotes,
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
