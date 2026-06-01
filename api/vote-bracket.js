const { connectToDatabase } = require('./_lib/mongodb');
const { applyCors } = require('./_lib/cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, choice } = req.body || {};

  if (!username || ![1, 2].includes(choice)) {
    return res.status(400).json({ error: 'username and choice (1 or 2) are required' });
  }

  try {
    const { db } = await connectToDatabase();

    const session = await db.collection('session').findOne({ _id: 'current' });

    if (!session?.votingActive || session?.mode !== 'bracket') {
      return res.status(400).json({ error: 'No active bracket', code: 'NO_BRACKET' });
    }

    const bracket = session.bracket;
    if (!bracket || bracket.status !== 'voting') {
      return res.status(400).json({ error: 'Bracket is not in voting phase', code: 'NOT_VOTING' });
    }

    const currentRound = bracket.rounds[bracket.currentRound];
    if (!currentRound) {
      return res.status(400).json({ error: 'No active round', code: 'NO_ROUND' });
    }

    const movie = choice === 1 ? currentRound.movieA : currentRound.movieB;

    await db.collection('votes').updateOne(
      { username },
      {
        $set: {
          username,
          movie,
          choice,
          round: bracket.currentRound,
          votedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    return res.status(200).json({
      success: true,
      username,
      movie,
      choice
    });
  } catch (error) {
    console.error('[API /vote-bracket] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
