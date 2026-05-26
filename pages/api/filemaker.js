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

    // Build request body for Filemaker Find API
    const requestBody = {
      query: []
    };

    // Map filter parameters to Filemaker field queries
    if (query.genre) {
      requestBody.query.push({ 'GENRE_SA': query.genre });
    }
    if (query.mood) {
      requestBody.query.push({ 'MOOD_SA': query.mood });
    }
    if (query.bpm) {
      requestBody.query.push({ 'BPM': query.bpm.toString() });
    }

    // If no filters, just get all records with limit
    if (requestBody.query.length === 0) {
      requestBody.limit = 50;
    }

    const response = await fetch(url + '/_find', {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Filemaker API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    return data.response || [];
  } catch (error) {
    console.error('Filemaker query error:', error);
    throw error;
  }
}

// Format Filemaker records for display
export async function formatTracks(records) {
  const { findAudioFileBySKU, getPreviewLink } = await import('./dropbox.js');

  const formatted = await Promise.all(
    records.map(async (record) => {
      const fields = record.fieldData;
      const sku = fields.cSKUROOT || 'N/A';

      // Find Dropbox file
      let dropboxLink = null;
      let dropboxFile = null;
      try {
        dropboxFile = await findAudioFileBySKU(sku);
        if (dropboxFile) {
          dropboxLink = await getPreviewLink(dropboxFile.path);
        }
      } catch (error) {
        console.warn(`Could not fetch Dropbox link for ${sku}:`, error);
      }

      return {
        sku,
        title: fields.Title || 'Untitled',
        composer: fields.ComposerTeamID_fk || 'Unknown',
        bpm: fields.BPM ? parseInt(fields.BPM) : null,
        genre: fields.GENRE_SA || 'Unknown',
        mood: fields.MOOD_SA || 'Unknown',
        key_sig: 'N/A', // Not available in database
        duration: 0, // Not available in database
        dropboxLink: dropboxLink, // Preview link from Dropbox
        dropboxFile: dropboxFile?.name, // File name
      };
    })
  );

  return formatted;
}
