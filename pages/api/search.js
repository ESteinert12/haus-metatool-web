import { queryFilemaker, formatTracks } from './filemaker.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { bpm, genre, mood } = req.query;

    // Build Filemaker query
    const query = {};
    if (genre) query.genre = genre;
    if (mood) query.mood = mood;
    if (bpm) query.bpm = bpm;

    // Query Filemaker database
    const records = await queryFilemaker(query);
    const tracks = await formatTracks(records);

    // Filter and sort by BPM match if reference BPM provided
    let filtered = tracks;

    if (genre) {
      filtered = filtered.filter(t => t.genre === genre);
    }

    if (mood) {
      filtered = filtered.filter(t => t.mood === mood);
    }

    if (bpm) {
      const refBpm = parseInt(bpm);
      // Sort by closest BPM match
      filtered.sort((a, b) => {
        const aDiff = Math.abs(a.bpm - refBpm);
        const bDiff = Math.abs(b.bpm - refBpm);
        return aDiff - bDiff;
      });
    }

    res.status(200).json({
      results: filtered,
      total: filtered.length,
      source: 'Filemaker Database',
    });
  } catch (error) {
    console.error('Search error:', error);
    console.error('Full error:', JSON.stringify(error, null, 2));
    res.status(500).json({
      error: 'Search failed',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}
