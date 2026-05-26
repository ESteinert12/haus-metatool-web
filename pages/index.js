export const dynamic = 'force-dynamic';


import { useState, useEffect, useRef } from 'react';
import axios from 'axios'
import styles from '../styles/Home.module.css';

const GENRES = {
  'ALTERNATIVE ROCK': ['Grunge', 'Post-Grunge', 'Pop Punk', 'Indie', 'Nu-Metal'],
  'AMBIENT': ['Wallpaper', 'Ambient House', 'Acid Jazz', 'Trip Hop'],
  'BLUES': ['Delta Blues', 'Chicago Blues', 'Memphis Blues'],
  'CLASSIC ROCK': ['Garage Rock', 'Prog Rock', 'Psychedelic', 'Jazz Rock'],
  'COUNTRY': ['Americana', 'Country Rock', 'Pop Country', 'Classic Country'],
  'ELECTRONIC': ['House', 'Techno', 'Drum & Bass', 'Dubstep'],
  'FOLK': ['Acoustic', 'Indie Folk', 'Folk Rock', 'Americana'],
  'HIP HOP/RAP': ['Electro', 'East Coast', 'West Coast', 'Trap'],
};

const MOODS = [
  'Uplifting', 'Epic', 'Dramatic', 'Mysterious', 'Romantic',
  'Melancholic', 'Energetic', 'Calm', 'Tense', 'Playful',
  'Dark', 'Hopeful', 'Intense', 'Peaceful', 'Joyful'
];

export default function Home() {
  // Hydration fix: track if component is mounted
  const [mounted, setMounted] = useState(false);

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [bpm, setBpm] = useState('');
  const [genre, setGenre] = useState('');
  const [secondaryGenre, setSecondaryGenre] = useState('');
  const [mood, setMood] = useState('');
  const [minBpm, setMinBpm] = useState(80);
  const [maxBpm, setMaxBpm] = useState(140);
  const [includeVox, setIncludeVox] = useState(true);

  // Source audio & tap tempo
  const [sourceFile, setSourceFile] = useState(null);
  const [isTapping, setIsTapping] = useState(false);
  const [tapBpm, setTapBpm] = useState(null);
  const [tapCount, setTapCount] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);

  const tapTimesRef = useRef([]);
  const fileInputRef = useRef(null);

  // Mark component as mounted (fixes hydration mismatch)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Tap tempo keyboard handler
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

    // Calculate BPM after 8+ taps
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

        if (analysis?.bpm) {
          setBpm(analysis.bpm.toString());
          console.log('Setting BPM to:', analysis.bpm.toString());
        }
        if (analysis?.genre) {
          setGenre(analysis.genre);
          console.log('Setting genre to:', analysis.genre);
        }
        if (analysis?.mood) {
          setMood(analysis.mood);
          console.log('Setting mood to:', analysis.mood);
        }

        setSourceFile({
          name: file.name,
          size: (file.size / 1024 / 1024).toFixed(2),
          url: audioUrl,
          analysis: analysis,
        });
        setAnalyzing(false);
      } catch (error) {
        console.error('Analysis failed:', error);
        setSourceFile((prev) => ({
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
        params: {
          bpm,
          genre,
          mood,
          minBpm,
          maxBpm,
        },
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });

      const searchResults = response.data?.results;
      if (Array.isArray(searchResults)) {
        setResults(searchResults);
        console.log('Search successful:', searchResults.length, 'results');
      } else {
        console.error('Invalid results format:', response.data);
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

  // Don't render until mounted (prevents hydration mismatch)
  if (!mounted) {
    return <div className={styles.container}><main className={styles.main}></main></div>;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <img src="/HAUS V2 Logo (1500x413).png" alt="HAUS Metatool Logo" className={styles.logoImg} />
        <div className={styles.subtitle}>Music Search & Matching</div>
      </header>

      <main className={styles.main}>
        <div className={styles.grid}>
          {/* Sidebar - Source Audio & Filters */}
          <aside className={styles.sidebar}>
            {/* SOURCE AUDIO SECTION */}
            <div className={styles.section}>
              <h2>Source Audio</h2>

              {/* File Upload */}
              <div className={styles.sourceBox}>
                <label className={styles.uploadLabel}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  <div className={styles.uploadBtn}>
                    📁 Import Audio File
                  </div>
                </label>

                {sourceFile && (
                  <div className={styles.fileInfo}>
                    <p>✓ {sourceFile.name}</p>
                    <small>{sourceFile.size} MB</small>
                  </div>
                )}

                {sourceFile && sourceFile.url && (
                  <div className={styles.playerBox}>
                    <audio
                      controls
                      className={styles.audioPlayer}
                      src={sourceFile.url}
                    >
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                )}

                {analyzing && (
                  <div className={styles.analyzing}>
                    🔄 Analyzing audio...
                  </div>
                )}

                {sourceFile?.analysis && (
                  <div className={styles.analysisResults}>
                    <strong>Auto-Detected:</strong>
                    <div className={styles.analysisMeta}>
                      {sourceFile.analysis.bpm && (
                        <span>🎵 {sourceFile.analysis.bpm} BPM</span>
                      )}
                      {sourceFile.analysis.genre && (
                        <span>🎭 {sourceFile.analysis.genre}</span>
                      )}
                      {sourceFile.analysis.mood && (
                        <span>😊 {sourceFile.analysis.mood}</span>
                      )}
                      {sourceFile.analysis.keySig && (
                        <span>🎼 {sourceFile.analysis.keySig}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Tap Tempo */}
              <div className={styles.tapTempoBox}>
                <div className={styles.tapHeader}>
                  <h3>Tap Tempo</h3>
                  <small>Press spacebar to tap</small>
                </div>

                {!isTapping ? (
                  <button
                    type="button"
                    className={styles.tapStartBtn}
                    onClick={startTapTempo}
                  >
                    ▶ Start Tapping
                  </button>
                ) : (
                  <>
                    <div className={styles.tapDisplay}>
                      <div className={styles.tapCount}>
                        Taps: {tapCount}
                      </div>
                      {tapBpm && (
                        <div className={styles.tapBpmResult}>
                          {tapBpm} BPM
                        </div>
                      )}
                    </div>
                    <div className={styles.tapButtonGroup}>
                      <button
                        type="button"
                        className={styles.tapStopBtn}
                        onClick={stopTapTempo}
                      >
                        ⏹ Stop
                      </button>
                      <button
                        type="button"
                        className={styles.tapResetBtn}
                        onClick={resetTapTempo}
                      >
                        ↻ Reset
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Reference BPM */}
              <div className={styles.filterGroup}>
                <label>Reference BPM</label>
                <input
                  type="number"
                  placeholder={tapBpm ? `${tapBpm} (from tap)` : 'e.g., 120'}
                  value={bpm}
                  onChange={(e) => setBpm(e.target.value)}
                  min="40"
                  max="200"
                />
              </div>
            </div>

            {/* SEARCH FILTERS SECTION */}
            <div className={styles.section}>
              <h2>Search Filters</h2>

              <form onSubmit={handleSearch}>
                {/* Genre */}
                <div className={styles.filterGroup}>
                  <label>Primary Genre</label>
                  <select
                    value={genre}
                    onChange={(e) => {
                      setGenre(e.target.value);
                      setSecondaryGenre('');
                    }}
                  >
                    <option value="">All Genres</option>
                    {Object.keys(GENRES).map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                {/* Secondary Genre */}
                {genre && (
                  <div className={styles.filterGroup}>
                    <label>Sub Genre</label>
                    <select value={secondaryGenre} onChange={(e) => setSecondaryGenre(e.target.value)}>
                      <option value="">All</option>
                      {GENRES[genre].map(sg => (
                        <option key={sg} value={sg}>{sg}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Mood */}
                <div className={styles.filterGroup}>
                  <label>Mood</label>
                  <select value={mood} onChange={(e) => setMood(e.target.value)}>
                    <option value="">All Moods</option>
                    {MOODS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Vocals */}
                <div className={styles.filterGroup}>
                  <label>
                    <input
                      type="checkbox"
                      checked={includeVox}
                      onChange={(e) => setIncludeVox(e.target.checked)}
                    />
                    Include Vocals
                  </label>
                </div>

                {/* Search Button */}
                <button
                  type="submit"
                  className={styles.searchBtn}
                  disabled={loading}
                >
                  {loading ? 'Searching...' : '🔍 Search Collection'}
                </button>
              </form>
            </div>
          </aside>

          {/* Results */}
          <section className={styles.results}>
            {!loading && !hasResults && !searchError && (
              <div className={styles.placeholder}>
                <p>👋 Upload audio or tap tempo, then search to find matching tracks</p>
              </div>
            )}

            {loading && (
              <div className={styles.loading}>
                <p>🔄 Searching {29169} tracks...</p>
              </div>
            )}

            {searchError && (
              <div className={styles.placeholder} style={{ color: 'red' }}>
                <p>❌ {searchError}</p>
              </div>
            )}

            {hasResults && (
              <div>
                <h2>Results ({results.length} found)</h2>
                <div className={styles.resultsList}>
                  {results.map((track, idx) => (
                    <div key={idx} className={styles.card}>
                      <div className={styles.cardHeader}>
                        <h3>{track.title}</h3>
                        <span className={styles.sku}>SKU: {track.sku}</span>
                      </div>
                      <div className={styles.cardMeta}>
                        <span>📝 {track.composer}</span>
                        <span>🎵 {track.bpm} BPM</span>
                        <span>🎼 {track.key_sig || 'N/A'}</span>
                      </div>
                      <div className={styles.cardMeta}>
                        <span>😊 {track.mood}</span>
                        <span>🎭 {track.genre}</span>
                        <span>⏱️ {track.duration}s</span>
                      </div>
                      {track.dropboxLink && (
                        <div className={styles.dropboxPlayer}>
                          <audio
                            controls
                            className={styles.audioPreview}
                            src={track.dropboxLink}
                          >
                            Your browser does not support audio preview.
                          </audio>
                          <small className={styles.fileName}>📁 {track.dropboxFile}</small>
                        </div>
                      )}
                      {track.submixes && (
                        <div className={styles.submixes}>
                          <strong>Versions:</strong>
                          <div className={styles.submixBtns}>
                            {track.submixes.map((sub, i) => (
                              <button key={i} className={styles.submixBtn}>
                                {sub}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className={styles.actions}>
                        <button className={styles.copyBtn}>Copy SKU</button>
                        <button className={styles.playBtn}>▶ Play</button>
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