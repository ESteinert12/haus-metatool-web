import { useState } from 'react';
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
        <div className={styles.logo}>🎵 HAUS Metatool</div>
        <div className={styles.subtitle}>Music Search & Matching</div>
      </header>

      <main className={styles.main}>
        <div className={styles.grid}>
          {/* Sidebar - Filters */}
          <aside className={styles.sidebar}>
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
                <label>Reference BPM (optional)</label>
                <input
                  type="number"
                  placeholder="e.g., 120"
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
                {loading ? 'Searching...' : '🔍 Search Library'}
              </button>
            </form>
          </aside>

          {/* Results */}
          <section className={styles.results}>
            {results.length === 0 && !loading && (
              <div className={styles.placeholder}>
                <p>👋 Enter search criteria and click "Search Library" to find matching tracks</p>
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
