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
    return res.status(400).json({ error: 'action is required (start, stop, end, clear, start-bracket, next-round, end-bracket)' });
  }

  try {
    const { db } = await connectToDatabase();

    switch (action) {
      case 'start': {
        await db.collection('votes').deleteMany({});
        await db.collection('session').updateOne(
          { _id: 'current' },
          {
            $set: { votingActive: true, mode: 'general', startedAt: new Date().toISOString() },
            $unset: { bracket: '' }
          },
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

      // ── BRACKET / MATA-MATA ──

      case 'start-bracket': {
        const { movies, movieData, roundDuration } = req.body;

        if (!movies || !Array.isArray(movies) || movies.length !== 4) {
          return res.status(400).json({ error: 'Exactly 4 movies are required for the bracket' });
        }

        const duration = roundDuration && Number(roundDuration) > 0 ? Number(roundDuration) : 60;

        // Build bracket: Semi1, Semi2, Final
        const rounds = [
          { movieA: movies[0], movieB: movies[1], winner: null, votesA: 0, votesB: 0 },
          { movieA: movies[2], movieB: movies[3], winner: null, votesA: 0, votesB: 0 },
          { movieA: null, movieB: null, winner: null, votesA: 0, votesB: 0 }
        ];

        const roundStartedAt = new Date().toISOString();

        await db.collection('votes').deleteMany({});
        await db.collection('session').updateOne(
          { _id: 'current' },
          {
            $set: {
              votingActive: true,
              mode: 'bracket',
              bracket: {
                movies,
                movieData: movieData || {},
                rounds,
                currentRound: 0,
                roundDuration: duration,
                roundStartedAt,
                status: 'voting'
              },
              startedAt: new Date().toISOString()
            }
          },
          { upsert: true }
        );

        return res.status(200).json({
          success: true,
          message: 'Bracket started',
          bracket: {
            movies,
            movieData: movieData || {},
            rounds,
            currentRound: 0,
            roundDuration: duration,
            roundStartedAt,
            status: 'voting'
          }
        });
      }

      case 'next-round': {
        const session = await db.collection('session').findOne({ _id: 'current' });

        if (!session?.bracket || session.mode !== 'bracket') {
          return res.status(400).json({ error: 'No active bracket', code: 'NO_BRACKET' });
        }

        const bracket = session.bracket;
        const currentIdx = bracket.currentRound;
        const currentRound = bracket.rounds[currentIdx];

        if (!currentRound) {
          return res.status(400).json({ error: 'No active round' });
        }

        // Count votes for this round
        const votesArr = await db.collection('votes').find({}).toArray();
        let votesA = 0, votesB = 0;
        for (const v of votesArr) {
          if (v.choice === 1) votesA++;
          else if (v.choice === 2) votesB++;
        }

        // Determine winner (tie = movieA wins)
        const winner = votesA >= votesB ? currentRound.movieA : currentRound.movieB;

        // Update the round result
        bracket.rounds[currentIdx].winner = winner;
        bracket.rounds[currentIdx].votesA = votesA;
        bracket.rounds[currentIdx].votesB = votesB;

        const nextIdx = currentIdx + 1;
        const isLastRound = nextIdx >= bracket.rounds.length;

        if (isLastRound) {
          // Tournament finished
          bracket.status = 'finished';
          bracket.champion = winner;

          await db.collection('votes').deleteMany({});
          await db.collection('session').updateOne(
            { _id: 'current' },
            {
              $set: {
                votingActive: false,
                bracket,
                endedAt: new Date().toISOString()
              }
            }
          );

          return res.status(200).json({
            success: true,
            message: 'Tournament finished!',
            champion: winner,
            bracket
          });
        }

        // Advance to next round — fill in the final round participants from semifinal winners
        if (nextIdx === 2) {
          // Final: movieA = winner of Semi1, movieB = winner of Semi2
          bracket.rounds[2].movieA = bracket.rounds[0].winner;
          bracket.rounds[2].movieB = bracket.rounds[1].winner;
        }

        bracket.currentRound = nextIdx;
        bracket.status = 'voting';
        bracket.roundStartedAt = new Date().toISOString();

        await db.collection('votes').deleteMany({});
        await db.collection('session').updateOne(
          { _id: 'current' },
          { $set: { bracket } }
        );

        return res.status(200).json({
          success: true,
          message: `Round ${nextIdx + 1} started`,
          bracket
        });
      }

      case 'end-bracket': {
        await db.collection('votes').deleteMany({});
        await db.collection('session').updateOne(
          { _id: 'current' },
          {
            $set: {
              votingActive: false,
              mode: 'general',
              endedAt: new Date().toISOString()
            },
            $unset: { bracket: '' }
          }
        );

        return res.status(200).json({ success: true, message: 'Bracket ended' });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Use: start, stop, end, clear, start-bracket, next-round, end-bracket' });
    }
  } catch (error) {
    console.error('[API /control] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
