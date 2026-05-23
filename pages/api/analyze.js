import { parseBuffer } from 'music-metadata';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock BPM detection - will enhance with Essentia.js
function estimateBPMFromMetadata(metadata) {
  // Try to extract BPM from metadata if available
  if (metadata?.common?.bpm) {
    return Math.round(metadata.common.bpm);
  }

  // If not available, return a default range
  // In production, use audio analysis library to detect
  return null;
}

// Estimate mood/energy from audio features (enhanced in phase 2)
function estimateMoodFromAudio(metadata) {
  // Placeholder - will use audio analysis in production
  const moods = ['Energetic', 'Calm', 'Dramatic', 'Uplifting', 'Mysterious'];
  return moods[Math.floor(Math.random() * moods.length)];
}

// Extract genre from metadata or audio analysis
function estimateGenreFromAudio(metadata) {
  if (metadata?.common?.genre) {
    return metadata.common.genre;
  }

  const genres = ['Electronic', 'Hip Hop/Rap', 'Alternative Rock', 'Ambient', 'Classic Rock'];
  return genres[Math.floor(Math.random() * genres.length)];
}

// Extract key signature from audio analysis (enhanced later)
function estimateKeyFromAudio() {
  const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return keys[Math.floor(Math.random() * keys.length)];
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { audioData, fileName } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: 'No audio data provided' });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(audioData, 'base64');

    // Parse audio metadata
    let metadata = {};
    try {
      metadata = await parseBuffer(buffer);
    } catch (error) {
      console.warn('Could not parse metadata:', error.message);
    }

    // Extract audio features
    const bpm = estimateBPMFromMetadata(metadata);
    const mood = estimateMoodFromAudio(metadata);
    const genre = estimateGenreFromAudio(metadata);
    const key = estimateKeyFromAudio();
    const duration = metadata?.format?.duration ? Math.round(metadata.format.duration) : 0;

    return res.status(200).json({
      success: true,
      analysis: {
        fileName,
        bpm,
        mood,
        genre,
        keySig: key,
        duration,
        format: metadata?.format?.container || 'unknown',
        bitrate: metadata?.format?.bitrate || null,
      },
      message: 'Audio analysis complete',
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({
      error: 'Audio analysis failed',
      details: error.message,
    });
  }
}
