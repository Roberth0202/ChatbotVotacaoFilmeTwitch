const { connectToDatabase } = require('./_lib/mongodb');
const { requireAdmin } = require('./_lib/auth');
const { applyCors } = require('./_lib/cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  const { action } = req.body || {};

  if (!action) {
    return res.status(400).json({ error: 'action is required (start, stop, end, clear)' });
  }

  try {
    const { db } = await connectToDatabase();

    switch (action) {
      case 'start': {
        await db.collection('votes').deleteMany({});
        await db.collection('session').updateOne(
          { _id: 'current' },
          { $set: { votingActive: true, startedAt: new Date().toISOString() } },
          { upsert: true }
        );
        return res.status(200).json({ success: true, message: 'Voting started' });
      }

      case 'end':
      case 'stop': {
        const votesArr = await db.collection('votes').find({}).toArray();
        const movies = {};
        for (const v of votesArr) {
          if (!movies[v.movie]) movies[v.movie] = { count: 0, year: v.year };
          movies[v.movie].count++;
        }
        const ranking = Object.entries(movies)
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.count - a.count);

        await db.collection('session').updateOne(
          { _id: 'current' },
          { $set: { votingActive: false, endedAt: new Date().toISOString() } },
          { upsert: true }
        );

        const winner = ranking.length > 0 ? ranking[0] : null;
        return res.status(200).json({ success: true, message: 'Voting ended', winner, ranking });
      }

      case 'clear': {
        await db.collection('votes').deleteMany({});
        return res.status(200).json({ success: true, message: 'Votes cleared' });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Use: start, stop, end, clear' });
    }
  } catch (error) {
    console.error('[API /control] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
