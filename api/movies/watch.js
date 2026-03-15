const { connectToDatabase } = require('../_lib/mongodb');
const { requireAdmin } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  // Configuração básica do CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { db } = await connectToDatabase();
    const watchedCollection = db.collection('watched_movies');
    const votesCollection = db.collection('votes');

    // GET: Retornar lista de filmes assistidos
    if (req.method === 'GET') {
      const watched = await watchedCollection.find({}).sort({ watchedAt: -1 }).toArray();
      return res.status(200).json(watched);
    }

    // POST: Marcar filme como assistido (Apenas Admin)
    if (req.method === 'POST') {
      if (!requireAdmin(req, res)) return; // Se falhar, requireAdmin já envia a resposta 401/403

      const { movieName, markedBy } = req.body;
      if (!movieName) {
        return res.status(400).json({ error: 'movieName is required.' });
      }

      // 1. Inserir na coleção de assistidos
      await watchedCollection.insertOne({
        name: movieName,
        watchedAt: new Date(),
        markedBy: markedBy || 'Admin'
      });

      // 2. Opcional: Remover os votos desse filme para limpar o ranking
      await votesCollection.deleteMany({ movieName: movieName });

      return res.status(200).json({ success: true, message: `${movieName} marked as watched and votes cleared.` });
    }

    // Método não permitido
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[API /movies/watch] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
