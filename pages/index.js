import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
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
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
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
  const tapTimesRef = useRef([]);
  const fileInputRef = useRef(null);

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

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSourceFile({
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2), // MB
      });
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.get('/api/search', {
        params: {
          bpm,
          genre,
          mood,
          minBpm,
          maxBpm,
        }
      });
      setResults(response.data.results || []);
    } catch (error) {
      console.error('Search error:', error);
      alert('Search failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

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

                {/* BPM Range */}
                <div className={styles.filterGroup}>
                  <label>BPM Range: {minBpm} - {maxBpm}</label>
                  <input
                    type="range"
                    min="40"
                    max="200"
                    value={minBpm}
                    onChange={(e) => setMinBpm(parseInt(e.target.value))}
                    style={{width: '100%'}}
                  />
                  <input
                    type="range"
                    min="40"
                    max="200"
                    value={maxBpm}
                    onChange={(e) => setMaxBpm(parseInt(e.target.value))}
                    style={{width: '100%'}}
                  />
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

                {/* Manual BPM Input */}
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
            {results.length === 0 && !loading && (
              <div className={styles.placeholder}>
                <p>👋 Upload audio or tap tempo, then search to find matching tracks</p>
              </div>
            )}

            {loading && (
              <div className={styles.loading}>
                <p>🔄 Searching {29169} tracks...</p>
              </div>
            )}

            {results.length > 0 && (
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
