export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const GENRES = [
  'ALTERNATIVE ROCK', 'AMBIENT', 'BLUES', 'CLASSIC ROCK', 'COUNTRY', 'ELECTRONIC', 'FOLK', 'HIP HOP/RAP'
];

const MOODS = [
  'Uplifting', 'Epic', 'Dramatic', 'Mysterious', 'Romantic',
  'Melancholic', 'Energetic', 'Calm', 'Tense', 'Playful',
  'Dark', 'Hopeful', 'Intense', 'Peaceful', 'Joyful'
];

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [bpm, setBpm] = useState('');
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('');
  const [minBpm, setMinBpm] = useState(80);
  const [maxBpm, setMaxBpm] = useState(140);
  const [sourceFile, setSourceFile] = useState(null);
  const [isTapping, setIsTapping] = useState(false);
  const [tapBpm, setTapBpm] = useState(null);
  const [tapCount, setTapCount] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);

  const tapTimesRef = useRef([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.code === 'Space' && isTapping) {
        e.preventDefault();
        recordTap();
      }
    };

    if (isTapping) {
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
    }
  }, [isTapping, tapCount]);

  const recordTap = () => {
    const now = Date.now();
    tapTimesRef.current.push(now);
    setTapCount(tapTimesRef.current.length);

    if (tapTimesRef.current.length >= 8) {
      const intervals = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);
      setTapBpm(calculatedBpm);
      setBpm(calculatedBpm.toString());
    }
  };

  const startTapTempo = () => {
    setIsTapping(true);
    setTapCount(0);
    tapTimesRef.current = [];
    setTapBpm(null);
  };

  const stopTapTempo = () => {
    setIsTapping(false);
  };

  const resetTapTempo = () => {
    setIsTapping(false);
    setTapCount(0);
    tapTimesRef.current = [];
    setTapBpm(null);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const audioUrl = URL.createObjectURL(file);
      setSourceFile({
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2),
        url: audioUrl,
        analyzing: true,
      });

      setAnalyzing(true);
      try {
        const response = await axios.post('/api/analyze', {
          fileName: file.name,
        });

        const { analysis } = response.data;
        console.log('Analysis received:', analysis);

        if (analysis?.bpm) setBpm(analysis.bpm.toString());
        if (analysis?.genre) setGenre(analysis.genre);
        if (analysis?.mood) setMood(analysis.mood);

        setSourceFile({
          name: file.name,
          size: (file.size / 1024 / 1024).toFixed(2),
          url: audioUrl,
          analysis: analysis,
        });
        setAnalyzing(false);
      } catch (error) {
        console.error('Analysis failed:', error);
        setSourceFile(prev => ({
          ...prev,
          analyzing: false,
          error: 'Failed to analyze audio',
        }));
        setAnalyzing(false);
      }
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSearchError(null);
    setResults([]);

    try {
      const response = await axios.get('/api/search', {
        params: { bpm, genre, mood, minBpm, maxBpm },
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
      });

      const searchResults = response.data?.results;
      if (Array.isArray(searchResults)) {
        setResults(searchResults);
        console.log('Search successful:', searchResults.length, 'results');
      } else {
        setResults([]);
        setSearchError('No valid results returned from API');
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setSearchError('Search failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const hasResults = Array.isArray(results) && results.length > 0;

  if (!mounted) {
    return <div style={{ minHeight: '100vh' }}></div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <header style={{ background: 'rgba(0,0,0,0.1)', padding: '20px', textAlign: 'center', borderBottom: '2px solid rgba(255,255,255,0.2)' }}>
        <img src="/HAUS V2 Logo (1500x413).png" alt="HAUS" style={{ maxWidth: '300px', marginBottom: '10px' }} />
        <div style={{ color: 'white', fontSize: '18px', fontWeight: 500 }}>Music Search & Matching</div>
      </header>

      <main style={{ padding: '30px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '30px' }}>
          <aside>
            {/* SOURCE AUDIO SECTION */}
            <div style={{ background: 'white', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
              <h2 style={{ marginTop: 0, borderBottom: '2px solid #667eea', paddingBottom: '10px' }}>Source Audio</h2>

              <div style={{ border: '2px dashed #667eea', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                <label style={{ cursor: 'pointer' }}>
                  <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                  <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '15px', borderRadius: '5px', fontWeight: 600 }}>📁 Import Audio File</div>
                </label>

                {sourceFile && (
                  <div style={{ marginTop: '15px', padding: '10px', background: '#f0f0f0', borderRadius: '5px' }}>
                    <p style={{ margin: '5px 0', fontWeight: 600 }}>✓ {sourceFile.name}</p>
                    <small>{sourceFile.size} MB</small>
                  </div>
                )}

                {sourceFile?.url && (
                  <div style={{ marginTop: '15px' }}>
                    <audio controls style={{ width: '100%', marginTop: '10px' }} src={sourceFile.url} />
                  </div>
                )}

                {analyzing && <div style={{ color: '#667eea', fontWeight: 600, marginTop: '10px' }}>🔄 Analyzing audio...</div>}

                {sourceFile?.analysis && (
                  <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '5px', marginTop: '15px', borderLeft: '4px solid #4caf50' }}>
                    <strong>Auto-Detected:</strong>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', fontSize: '14px' }}>
                      {sourceFile.analysis.bpm && <span>🎵 {sourceFile.analysis.bpm} BPM</span>}
                      {sourceFile.analysis.genre && <span>🎭 {sourceFile.analysis.genre}</span>}
                      {sourceFile.analysis.mood && <span>😊 {sourceFile.analysis.mood}</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* TAP TEMPO */}
              <div style={{ border: '2px solid #667eea', padding: '15px', borderRadius: '8px', marginTop: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0' }}>Tap Tempo</h3>
                {!isTapping ? (
                  <button onClick={startTapTempo} style={{ width: '100%', padding: '10px', background: '#4caf50', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 600, cursor: 'pointer' }}>▶ Start Tapping</button>
                ) : (
                  <>
                    <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '5px', marginBottom: '15px', textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 600 }}>Taps: {tapCount}</div>
                      {tapBpm && <div style={{ fontSize: '24px', color: '#667eea', fontWeight: 700, marginTop: '10px' }}>{tapBpm} BPM</div>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <button onClick={stopTapTempo} style={{ padding: '10px', background: '#f44336', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 600, cursor: 'pointer' }}>⏹ Stop</button>
                      <button onClick={resetTapTempo} style={{ padding: '10px', background: '#ff9800', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 600, cursor: 'pointer' }}>↻ Reset</button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* SEARCH FILTERS SECTION */}
            <div style={{ background: 'white', padding: '20px', borderRadius: '10px' }}>
              <h2 style={{ marginTop: 0, borderBottom: '2px solid #667eea', paddingBottom: '10px' }}>Search Filters</h2>
              <form onSubmit={handleSearch}>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>Genre</label>
                  <select value={genre} onChange={(e) => setGenre(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '5px' }}>
                    <option value="">All Genres</option>
                    {GENRES && GENRES.length > 0 && GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>Mood</label>
                  <select value={mood} onChange={(e) => setMood(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '5px' }}>
                    <option value="">All Moods</option>
                    {MOODS && MOODS.length > 0 && MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>BPM Range</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <input type="number" placeholder="Min" value={minBpm} onChange={(e) => setMinBpm(e.target.value)} style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '5px' }} />
                    <input type="number" placeholder="Max" value={maxBpm} onChange={(e) => setMaxBpm(e.target.value)} style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '5px' }} />
                  </div>
                </div>

                <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 600, cursor: 'pointer', marginTop: '20px', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Searching...' : '🔍 Search Collection'}
                </button>
              </form>
            </div>
          </aside>

          {/* RESULTS SECTION */}
          <section style={{ background: 'white', padding: '30px', borderRadius: '10px', minHeight: '400px' }}>
            {!loading && !hasResults && !searchError && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
                <p style={{ fontSize: '18px' }}>👋 Upload audio or tap tempo, then search to find matching tracks</p>
              </div>
            )}

            {loading && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#667eea', fontWeight: 600 }}>
                <p>🔄 Searching tracks...</p>
              </div>
            )}

            {searchError && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'red' }}>
                <p>❌ {searchError}</p>
              </div>
            )}

            {hasResults && (
              <div>
                <h2>Results ({results.length} found)</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginTop: '20px' }}>
                  {results.map((track, idx) => (
                    <div key={idx} style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px', background: '#f9f9f9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', borderBottom: '2px solid #667eea', paddingBottom: '10px' }}>
                        <h3 style={{ margin: 0, flex: 1 }}>{track.title}</h3>
                        <span style={{ background: '#667eea', color: 'white', padding: '5px 10px', borderRadius: '3px', fontSize: '12px', fontWeight: 600 }}>SKU: {track.sku}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '15px', fontSize: '14px', color: '#666' }}>
                        <span>📝 {track.composer}</span>
                        <span>🎵 {track.bpm} BPM</span>
                        <span>🎼 {track.key_sig || 'N/A'}</span>
                        <span>😊 {track.mood}</span>
                        <span>🎭 {track.genre}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                        <button style={{ flex: 1, padding: '10px', background: '#667eea', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 600 }}>Copy SKU</button>
                        <button style={{ flex: 1, padding: '10px', background: '#4caf50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 600 }}>▶ Play</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}