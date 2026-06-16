/**
 * migrate-clean-votes.js
 *
 * One-time migration script to:
 * 1. Read all existing votes that still have embedded movie metadata
 * 2. Upsert that metadata into the `movies` collection (one doc per film)
 * 3. Strip the redundant fields from every vote document
 *
 * Run once: node api/migrate-clean-votes.js
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || process.env.MONGODB_DB_NAME || 'twitch-votacao';

const FIELDS_TO_REMOVE = ['posterPath', 'year', 'overview', 'voteAverage', 'certification', 'genreIds', 'runtime'];

async function migrate() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set. Check your .env file.');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    console.log(`\n📦 Connected to database: ${DB_NAME}`);

    // ── 1. Fetch all votes that still have embedded metadata ──
    const votes = await db.collection('votes').find({
      $or: FIELDS_TO_REMOVE.map(f => ({ [f]: { $exists: true } }))
    }).toArray();

    console.log(`🗳️  Found ${votes.length} vote(s) with embedded metadata`);

    if (votes.length === 0) {
      console.log('✅ Nothing to migrate. All votes are already clean.');
      return;
    }

    // ── 2. Build movie metadata map (one entry per unique film title) ──
    const moviesMap = {};
    for (const vote of votes) {
      const key = vote.movie?.toLowerCase();
      if (!key) continue;

      if (!moviesMap[key]) {
        moviesMap[key] = {
          title: vote.movie,
          posterPath: vote.posterPath || null,
          year: vote.year || null,
          overview: vote.overview || null,
          voteAverage: vote.voteAverage || null,
          certification: vote.certification || null,
          genreIds: vote.genreIds || [],
          runtime: vote.runtime || null,
          updatedAt: new Date().toISOString()
        };
      }
    }

    // ── 3. Upsert into `movies` collection ──
    const movieTitles = Object.keys(moviesMap);
    console.log(`🎬 Upserting metadata for ${movieTitles.length} unique film(s)...`);

    for (const key of movieTitles) {
      await db.collection('movies').updateOne(
        { _id: key },
        { $set: moviesMap[key] },
        { upsert: true }
      );
    }

    console.log(`✅ Movie metadata saved to 'movies' collection`);

    // ── 4. Remove redundant fields from all vote documents ──
    const unsetFields = FIELDS_TO_REMOVE.reduce((acc, f) => ({ ...acc, [f]: '' }), {});

    const result = await db.collection('votes').updateMany(
      { $or: FIELDS_TO_REMOVE.map(f => ({ [f]: { $exists: true } })) },
      { $unset: unsetFields }
    );

    console.log(`🧹 Cleaned ${result.modifiedCount} vote document(s)`);
    console.log('\n🎉 Migration complete! You should see significant storage savings in MongoDB Atlas.');

  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

migrate();
