export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
// import  from '..//Home.module.css';

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
    return <div className={container}><main className={.main}></main></div>;
  }

  return (
    <div className={.container}>
      <header className={.header}>
        <img src="/HAUS V2 Logo (1500x413).png" alt="HAUS Metatool Logo" className={.logoImg} />
        <div className={.subtitle}>Music Search & Matching</div>
      </header>

      <main className={.main}>
        <div className={.grid}>
          <aside className={.sidebar}>
            <div className={.section}>
              <h2>Source Audio</h2>

              <div className={.sourceBox}>
                <label className={.uploadLabel}>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  <div className={.uploadBtn}>
                    📁 Import Audio File
                  </div>
                </label>

                {sourceFile && (
                  <div className={.fileInfo}>
                    <p>✓ {sourceFile.name}</p>
                    <small>{sourceFile.size} MB</small>
                  </div>
                )}

                {sourceFile?.url && (
                  <div className={.playerBox}>
                    <audio controls className={.audioPlayer} src={sourceFile.url}>
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                )}

                {analyzing && (
                  <div className={.analyzing}>🔄 Analyzing audio...</div>
                )}

                {sourceFile?.analysis && (
                  <div className={.analysisResults}>
                    <strong>Auto-Detected:</strong>
                    <div className={.analysisMeta}>
                      {sourceFile.analysis.bpm && <span>🎵 {sourceFile.analysis.bpm} BPM</span>}
                      {sourceFile.analysis.genre && <span>🎭 {sourceFile.analysis.genre}</span>}
                      {sourceFile.analysis.mood && <span>😊 {sourceFile.analysis.mood}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <section className={.results}>
            <div className={.placeholder}>
              <p>👋 This is a test version to isolate the error</p>
              <p>Upload an audio file to test analysis</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}