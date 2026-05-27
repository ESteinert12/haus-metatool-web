// Temporary mock data while debugging Filemaker integration
const MOCK_TRACKS = [
  { sku: 'S33a', title: 'Epic Journey', composer: 'Unknown', genre: 'Classic Rock', mood: 'Dramatic', bpm: 150, key_sig: 'E', duration: 0, dropboxLink: null },
  { sku: 'S33b', title: 'Uplifting Vibes', composer: 'Unknown', genre: 'Alternative Rock', mood: 'Uplifting', bpm: 120, key_sig: 'G', duration: 0, dropboxLink: null },
  { sku: 'S33c', title: 'Blues Soul', composer: 'Unknown', genre: 'Blues', mood: 'Melancholic', bpm: 90, key_sig: 'D', duration: 0, dropboxLink: null },
  { sku: 'S33d', title: 'Electronic Pulse', composer: 'Unknown', genre: 'Electronic', mood: 'Energetic', bpm: 130, key_sig: 'A', duration: 0, dropboxLink: null },
  { sku: 'S33e', title: 'Folk Tale', composer: 'Unknown', genre: 'Folk', mood: 'Peaceful', bpm: 80, key_sig: 'C', duration: 0, dropboxLink: null },
  { sku: 'S33f', title: 'Hip Hop Beat', composer: 'Unknown', genre: 'Hip Hop/Rap', mood: 'Energetic', bpm: 95, key_sig: 'F', duration: 0, dropboxLink: null },
  { sku: 'S33g', title: 'Country Roads', composer: 'Unknown', genre: 'Country', mood: 'Hopeful', bpm: 110, key_sig: 'B', duration: 0, dropboxLink: null },
  { sku: 'S33h', title: 'Ambient Dreams', composer: 'Unknown', genre: 'Ambient', mood: 'Peaceful', bpm: 70, key_sig: 'Am', duration: 0, dropboxLink: null },
  { sku: 'S33i', title: 'Rock Anthem', composer: 'Unknown', genre: 'Classic Rock', mood: 'Epic', bpm: 140, key_sig: 'G#', duration: 0, dropboxLink: null },
  { sku: 'S33j', title: 'Dark Electronic', composer: 'Unknown', genre: 'Electronic', mood: 'Dark', bpm: 125, key_sig: 'Dm', duration: 0, dropboxLink: null },
];
 
export default async function handler(req, res) {
  // ✅ FIX #1: Disable caching for this API
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
 
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  try {
    const { bpm, genre, mood, minBpm, maxBpm } = req.query;
 
    // Filter mock tracks
    let filtered = MOCK_TRACKS;
 
    if (genre) {
      filtered = filtered.filter(t => t.genre === genre);
    }
 
    if (mood) {
      filtered = filtered.filter(t => t.mood === mood);
    }
 
    // ✅ FIX #2: Support minBpm/maxBpm range filtering
    if (minBpm || maxBpm) {
      const min = minBpm ? parseInt(minBpm) : 0;
      const max = maxBpm ? parseInt(maxBpm) : Infinity;
      filtered = filtered.filter(t => t.bpm >= min && t.bpm <= max);
    } else if (bpm) {
      // If single BPM provided, sort by closest match
      const refBpm = parseInt(bpm);
      filtered.sort((a, b) => {
        const aDiff = Math.abs(a.bpm - refBpm);
        const bDiff = Math.abs(b.bpm - refBpm);
        return aDiff - bDiff;
      });
    }
 
    // ✅ FIX #3: Ensure results is always an array
    const results = Array.isArray(filtered) ? filtered : [];
 
    res.status(200).json({
      results,
      total: results.length,
      source: 'MOCK DATA - Filemaker integration coming soon',
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      results: [], // ✅ FIX #4: Always return results array, even on error
      error: 'Search failed',
      details: error.message,
    });
  }
}
 
