// Temporary mock data while debugging Filemaker integration
const MOCK_TRACKS = [
  {
    sku: 'S33a',
    title: 'Nice With Thrust',
    composer: 'Unknown',
    genre: 'Classic Rock',
    mood: 'Dramatic',
    bpm: 150,
    key_sig: 'E',
    duration: 0,
    dropboxLink: null,
  },
  {
    sku: 'S33b',
    title: 'Classic Rock Anthem',
    composer: 'Unknown',
    genre: 'Classic Rock',
    mood: 'Energetic',
    bpm: 140,
    key_sig: 'G',
    duration: 0,
    dropboxLink: null,
  },
  {
    sku: 'S33c',
    title: 'Dramatic Journey',
    composer: 'Unknown',
    genre: 'Classic Rock',
    mood: 'Dramatic',
    bpm: 155,
    key_sig: 'D',
    duration: 0,
    dropboxLink: null,
  },
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { bpm, genre, mood } = req.query;

    // Filter mock tracks
    let filtered = MOCK_TRACKS;

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
      source: 'MOCK DATA - Filemaker integration coming soon',
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      details: error.message,
    });
  }
}
