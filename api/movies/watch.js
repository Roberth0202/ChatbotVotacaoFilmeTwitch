const { ObjectId } = require('mongodb');
const { connectToDatabase } = require('../_lib/mongodb');
const { requireAdmin } = require('../_lib/auth');
const { applyCors } = require('../_lib/cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'POST, GET, DELETE, OPTIONS')) return;

  try {
    const { db } = await connectToDatabase();
    const watchedCollection = db.collection('watched');
    const votesCollection = db.collection('votes');

    if (req.method === 'GET') {
      const watched = await watchedCollection.find({}).sort({ watchedAt: -1 }).toArray();
      const cleanWatched = watched.map(({ _id, ...rest }) => ({
        id: _id.toString(),
        ...rest
      }));
      return res.status(200).json(cleanWatched);
    }

    if (req.method === 'POST') {
      if (!requireAdmin(req, res)) return;

      const { movieName, markedBy, tmdbData } = req.body;
      if (!movieName) {
        return res.status(400).json({ error: 'movieName is required.' });
      }

      const existing = await watchedCollection.findOne({ 
        name: { $regex: new RegExp(`^${movieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      if (existing) {
        return res.status(409).json({ error: `"${movieName}" já está na lista de assistidos.` });
      }

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
        markedAt: new Date(),
        markedBy: markedBy || 'Admin'
      });

      await votesCollection.deleteMany({ movieName: movieName });

      return res.status(200).json({ success: true, message: `${movieName} marked as watched and votes cleared.` });
    }

    if (req.method === 'DELETE') {
      if (!requireAdmin(req, res)) return;

      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      await watchedCollection.deleteOne({ _id: new ObjectId(id) });
      return res.status(200).json({ success: true, message: 'Movie removed from watched list.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[API /movies/watch] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
