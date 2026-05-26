// Dropbox API Helper
const DROPBOX_TOKEN = 'sl.u.AGjO9odQbEldC4s1tdOcWiQsKQhquxBy-bfHTpdJZ2vNWJcrVKuTMglPLfuDAK4IsYn1xtnGC2j8kTLOOxc0Gdfmst5y1StvuCrl2X_SMrcnny7JnJMk5qMesiashAKX7FaVKSM9kQztHFRk9mbFij6GRUaSTQgr8l8k74Q235IP-aCO_-GeiAaujnJIOP3Ion0XtKGvjtmmueDFWM6aWOrV0wsyAy2WeatII5REwuNEGplsEgnjnwksqYoAmqNmLDIetxeAdVvCvbwaKBoF1QpFaYA5t40YgYYFYlamLUkOPXt_tdnCoVdQp2Ly8q9TAN5O6S7mGBG68NdWagGQS2rZlpPMy97j2Mo_O5aOVwaILaI8mk08BGhbGixmIDBY7ggdtAl6G62_Qi-ECe1mIsgLq-FXWsmGAPqItV0-VxEkXY9Mug9FNvDO16vAmz7lB6A6pnJY5H4oyuzvGhseWr6DnnHL6glpMzOw9EnXIHpYmCABa_jC85zMgRWbbPKmC42PSJ8lX7Gyor7OiP1VuDdvi4c3uPdc0Dx1ApMq2lt01Fzl5Ykkn1CWniOCosUUU5SREytAYgOSTpu1IDlGPh_QlfzsJakLFtIuQrHG7qC2bN_dojGHF9IOgywU5DW01nPEtTZcrB4xLnhmcA8Wrp1QVrzKPlwAWOfGeXQOnCfuolo1066CQe-jdWX3tmWeQb9qHLrXoSaXFxEfBZEyouXKInPFe6LVseelHpKUW6Z5PAHCflb5V-sKOqN903fOaSMR9psZ5ZFtyQxJLQ3bzAV98Z2VADJZeQy-wyNzZ_K3saAUy5r5aXMlYYmSjPJ-P9UAxe1Nxo35CLZDl6Vv7qN0tbOsXQQDFZuNwWvlhm4d6WkUXYHMzI4wZpk-iYIaVIws9G-GDmuZXEoAWFQWEZRmKxitNeuZHCzxUoINJTcMqpAty8ALggIa3rWvcq4_8KRaTUhoq-8QI0FpgaDH5p1QRi6MM8ZF6yP9MDH45l6eTKq_T0U1q5QSmo1MlSnYQvBNgC6jpSWGaL96dR_rcD8tIxSw0p7POURXSMbxIUz6U3RRAQs0yqSIxdF21-S88Y8py-_1_VLRs1QKRrqZZG2jGiiVS_tLXDBjRzJcJyEEW5WPvUkLmM1jrulqbDLJR_ByZl4N4kKKlc23ANxI9BVZbfhzo14aRYTD-PHnW6uGJCoeY2-aZSmRSCydglod16BbKTg-_5ujnzkwq0fsbg3Q7Gz-u8r4VFOyLzA-1XNF7R4E9hS2BMKCY67IW44iD-HG7xpvFrZnlJQAesK6i0RSpTx4jFZe-49bY0tOxi9MWQ';

const ARCHIVE_FOLDERS = [
  'ARCHIVE_Stratus',
  'ARCHIVE_Cumulus',
  'ARCHIVE_Cirrus',
  'ARCHIVE_Nimbus'
];

// Search for audio file in Dropbox by SKU
export async function findAudioFileBySKU(sku) {
  try {
    // Try each archive folder
    for (const folder of ARCHIVE_FOLDERS) {
      const response = await fetch('https://api.dropboxapi.com/2/files/search_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DROPBOX_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: sku,
          options: {
            path: `/${folder}`,
            max_results: 20,
          },
        }),
      });

      if (!response.ok) {
        console.warn(`Failed to search in ${folder}:`, response.status);
        continue;
      }

      const data = await response.json();
      const matches = data.matches || [];

      // Look for MP3 file first, then WAV
      const mp3File = matches.find(m => m.metadata.name?.toLowerCase().endsWith('.mp3'));
      const wavFile = matches.find(m => m.metadata.name?.toLowerCase().endsWith('.wav'));
      const audioFile = mp3File || wavFile;

      if (audioFile) {
        return {
          path: audioFile.metadata.path_display,
          name: audioFile.metadata.name,
          folder: folder,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Dropbox search error:', error);
    return null;
  }
}

// Get temporary preview link from Dropbox
export async function getPreviewLink(filePath) {
  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: filePath,
      }),
    });

    if (!response.ok) {
      console.warn('Failed to get preview link:', response.status);
      return null;
    }

    const data = await response.json();
    return data.link;
  } catch (error) {
    console.error('Error getting preview link:', error);
    return null;
  }
}
