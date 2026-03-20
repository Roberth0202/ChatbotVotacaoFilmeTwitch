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
    const watchedCollection = db.collection('watched');
    const votesCollection = db.collection('votes');

    // GET: Retornar lista de filmes assistidos
    if (req.method === 'GET') {
      const watched = await watchedCollection.find({}).sort({ watchedAt: -1 }).toArray();
      const cleanWatched = watched.map(({ _id, ...rest }) => ({
        id: _id.toString(),
        ...rest
      }));
      return res.status(200).json(cleanWatched);
    }

    // POST: Marcar filme como assistido (Apenas Admin)
    if (req.method === 'POST') {
      if (!requireAdmin(req, res)) return; // Se falhar, requireAdmin já envia a resposta 401/403

      const { movieName, markedBy, tmdbData } = req.body;
      if (!movieName) {
        return res.status(400).json({ error: 'movieName is required.' });
      }

      // Verificar duplicata (case-insensitive)
      const existing = await watchedCollection.findOne({ 
        name: { $regex: new RegExp(`^${movieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      if (existing) {
        return res.status(409).json({ error: `"${movieName}" já está na lista de assistidos.` });
      }

      // 1. Inserir na coleção de assistidos
      await watchedCollection.insertOne({
        name: movieName,
        title: tmdbData?.title || movieName,
        posterPath: tmdbData?.posterPath || null,
        year: tmdbData?.year || null,
        certification: tmdbData?.certification || null,
        overview: tmdbData?.overview || null,
        voteAverage: tmdbData?.voteAverage || null,
        tmdbId: tmdbData?.id || null,
        watchedAt: new Date(),
        markedAt: new Date(), // Manter compatibilidade com ranking api
        markedBy: markedBy || 'Admin'
      });

      // 2. Opcional: Remover os votos desse filme para limpar o ranking
      await votesCollection.deleteMany({ movieName: movieName });

      return res.status(200).json({ success: true, message: `${movieName} marked as watched and votes cleared.` });
    }

    // DELETE: Remover filme (Apenas Admin)
    if (req.method === 'DELETE') {
      if (!requireAdmin(req, res)) return;

      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const { ObjectId } = require('mongodb');
      await watchedCollection.deleteOne({ _id: new ObjectId(id) });
      return res.status(200).json({ success: true, message: 'Movie removed from watched list.' });
    }

    // Método não permitido
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[API /movies/watch] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
