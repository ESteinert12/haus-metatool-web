// Mock music library data - replace with real database later
const MOCK_TRACKS = [
  {
    sku: 'R12a0001',
    title: 'Epic Adventure',
    composer: 'John Smith',
    genre: 'ALTERNATIVE ROCK',
    mood: 'Epic',
    bpm: 120,
    key_sig: 'Cm',
    duration: 245,
    licensing: 'Full Rights',
    vox: false,
    submixes: ['DNB', 'FULL', 'ALT', 'NoDrums']
  },
  {
    sku: 'R12a0002',
    title: 'Mysterious Night',
    composer: 'Jane Doe',
    genre: 'AMBIENT',
    mood: 'Mysterious',
    bpm: 90,
    key_sig: 'Am',
    duration: 180,
    licensing: 'Full Rights',
    vox: false,
    submixes: ['FULL', 'Instrumental']
  },
  {
    sku: 'R12a0003',
    title: 'Electric Dreams',
    composer: 'Alex Turner',
    genre: 'ELECTRONIC',
    mood: 'Energetic',
    bpm: 130,
    key_sig: 'Dm',
    duration: 210,
    licensing: 'Full Rights',
    vox: true,
    submixes: ['DNB', 'FULL', 'NoDrums']
  },
  {
    sku: 'R12a0004',
    title: 'Summer Breeze',
    composer: 'The Folk Kings',
    genre: 'FOLK',
    mood: 'Playful',
    bpm: 110,
    key_sig: 'G',
    duration: 200,
    licensing: 'Full Rights',
    vox: true,
    submixes: ['FULL', 'Instrumental', 'Acapella']
  },
  {
    sku: 'R12a0005',
    title: 'Urban Heat',
    composer: 'MC Flow',
    genre: 'HIP HOP/RAP',
    mood: 'Intense',
    bpm: 95,
    key_sig: 'Fm',
    duration: 220,
    licensing: 'Full Rights',
    vox: true,
    submixes: ['DNB', 'FULL', 'Beats Only']
  }
];

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { bpm, genre, mood, minBpm, maxBpm } = req.query;

  // Filter tracks based on search parameters
  let filtered = MOCK_TRACKS;

  if (genre) {
    filtered = filtered.filter(t => t.genre === genre);
  }

  if (mood) {
    filtered = filtered.filter(t => t.mood === mood);
  }

  if (minBpm && maxBpm) {
    const min = parseInt(minBpm);
    const max = parseInt(maxBpm);
    filtered = filtered.filter(t => t.bpm >= min && t.bpm <= max);
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
  });
}
