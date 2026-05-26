// Filemaker Server API Helper
const FILEMAKER_SERVER = '24.39.66.158:16001';
const FILEMAKER_DB = 'HAUS_v5';
const FILEMAKER_LAYOUT = 'TITLES_Table';
const FILEMAKER_USER = 'eriks';
const FILEMAKER_PASS = '#DoYourJob12';

// Create basic auth header
function getAuthHeader() {
  const credentials = Buffer.from(`${FILEMAKER_USER}:${FILEMAKER_PASS}`).toString('base64');
  return `Basic ${credentials}`;
}

// Query Filemaker database
export async function queryFilemaker(query = {}) {
  try {
    const url = `https://${FILEMAKER_SERVER}/fmi/data/v1/databases/${FILEMAKER_DB}/layouts/${FILEMAKER_LAYOUT}/records`;

    // Build query parameters
    const params = new URLSearchParams();

    // Map filter parameters to Filemaker field queries
    if (query.genre) {
      params.append('_find', JSON.stringify([{ GENRE_SA: query.genre }]));
    }
    if (query.mood) {
      params.append('_find', JSON.stringify([{ MOOD_SA: query.mood }]));
    }
    if (query.bpm) {
      // Exact BPM match (or could do range with tolerance)
      params.append('_find', JSON.stringify([{ BPM: query.bpm }]));
    }

    const response = await fetch(`${url}${params.toString() ? '?' + params.toString() : ''}`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Filemaker API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response || [];
  } catch (error) {
    console.error('Filemaker query error:', error);
    throw error;
  }
}

// Format Filemaker records for display
export function formatTracks(records) {
  return records.map((record) => {
    const fields = record.fieldData;
    return {
      sku: fields.cSKUROOT || 'N/A',
      title: fields.Title || 'Untitled',
      composer: fields.ComposerTeamID_fk || 'Unknown',
      bpm: fields.BPM ? parseInt(fields.BPM) : null,
      genre: fields.GENRE_SA || 'Unknown',
      mood: fields.MOOD_SA || 'Unknown',
      key_sig: 'N/A', // Not available in database
      duration: 0, // Not available in database
      submixes: [], // Will populate from Dropbox if added later
    };
  });
}
