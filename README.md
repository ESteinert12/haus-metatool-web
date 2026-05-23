# HAUS Metatool - Web Version

Next.js web application for music search and matching. Same UI as the desktop app, now accessible from anywhere.

## Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000 in browser
```

## Deploy to Vercel (30 seconds)

### Step 1: Create GitHub Repository
```bash
# From the web/ folder
git init
git add .
git commit -m "Initial commit: HAUS Metatool web version"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/haus-metatool-web.git
git push -u origin main
```

### Step 2: Deploy to Vercel
1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Paste: `https://github.com/YOUR_USERNAME/haus-metatool-web.git`
4. Click Import
5. Click "Deploy"
6. Wait 2-3 minutes...
7. ✅ Your live URL will appear (something like `haus-metatool-web.vercel.app`)

### Step 3: Share with UK Team
Send them the Vercel URL. They can use it immediately!

---

## Project Structure

```
web/
├── pages/
│   ├── _app.js           # Next.js app wrapper
│   ├── index.js          # Main search UI
│   └── api/
│       └── search.js     # Search API endpoint
├── styles/
│   ├── globals.css       # Global styles
│   └── Home.module.css   # Component styles
├── package.json
├── next.config.js
└── README.md
```

## Features

✅ Search filters (genre, mood, BPM range)  
✅ Results display with metadata  
✅ Submix version selection  
✅ Copy SKU / Play buttons  
✅ HAUS brand colors  
✅ Responsive design  

## Current Implementation

- **Frontend:** React/Next.js with responsive UI
- **Backend:** Next.js API routes with mock data
- **Database:** Mock data (5 sample tracks)
- **Search:** Genre, mood, BPM filtering

## Next Steps (To Connect to Real Data)

1. **Replace mock data** in `pages/api/search.js` with real SQLite database
2. **Add Dropbox integration** for audio file preview/download
3. **Add BPM detection** (Python backend service or Web Audio API)
4. **User authentication** (GitHub OAuth)
5. **Real-time collaboration** features

## Environment Variables

None required for MVP. Future additions:
- `DROPBOX_API_KEY`
- `FILEMAKER_API_URL`
- `DATABASE_URL`

## Troubleshooting

**Port 3000 already in use:**
```bash
npm run dev -- -p 3001
```

**Build fails:**
```bash
rm -rf .next node_modules
npm install
npm run build
```

---

## Tech Stack

- **Framework:** Next.js 14
- **UI:** React 18
- **Styling:** CSS Modules
- **HTTP Client:** Axios
- **Hosting:** Vercel

---

**For questions or contributions, contact the team.**
