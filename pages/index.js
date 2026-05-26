export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [sourceFile, setSourceFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [bpm, setBpm] = useState('');
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('');

  // Mark as mounted
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const audioUrl = URL.createObjectURL(file);
      setSourceFile({
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2),
        url: audioUrl,
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

        setSourceFile(prev => ({
          ...prev,
          analysis: analysis,
        }));
        setAnalyzing(false);
      } catch (error) {
        console.error('Analysis failed:', error);
        setAnalyzing(false);
      }
    }
  };

  if (!mounted) {
    return <div className={styles.container}><main className={styles.main}></main></div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <img src="/HAUS V2 Logo (1500x413).png" alt="HAUS Metatool Logo" className={styles.logoImg} />
        <div className={styles.subtitle}>Music Search & Matching</div>
      </header>

      <main className={styles.main}>
        <div className={styles.grid}>
          <aside className={styles.sidebar}>
            <div className={styles.section}>
              <h2>Source Audio</h2>

              <div className={styles.sourceBox}>
                <label className={styles.uploadLabel}>
                  <input
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

                {sourceFile?.url && (
                  <div className={styles.playerBox}>
                    <audio controls className={styles.audioPlayer} src={sourceFile.url}>
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                )}

                {analyzing && (
                  <div className={styles.analyzing}>🔄 Analyzing audio...</div>
                )}

                {sourceFile?.analysis && (
                  <div className={styles.analysisResults}>
                    <strong>Auto-Detected:</strong>
                    <div className={styles.analysisMeta}>
                      {sourceFile.analysis.bpm && <span>🎵 {sourceFile.analysis.bpm} BPM</span>}
                      {sourceFile.analysis.genre && <span>🎭 {sourceFile.analysis.genre}</span>}
                      {sourceFile.analysis.mood && <span>😊 {sourceFile.analysis.mood}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <section className={styles.results}>
            <div className={styles.placeholder}>
              <p>👋 This is a test version to isolate the error</p>
              <p>Upload an audio file to test analysis</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}