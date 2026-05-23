# Deployment Guide - Get Live in 5 Minutes

## Prerequisites
- GitHub account (you have this ✓)
- Vercel account (free, linked to GitHub)
- Terminal access

## Step-by-Step Deployment

### 1. Prepare Your Local Code
```bash
cd /Users/HAUS/Documents/Claude/Projects/MusicMatch/web

# Initialize git if not already done
git init
git add .
git commit -m "Initial: HAUS Metatool web MVP"
```

### 2. Create GitHub Repository
Go to https://github.com/new and create a new repo called `haus-metatool-web`

Then:
```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/haus-metatool-web.git
git push -u origin main
```

### 3. Deploy to Vercel
1. Visit https://vercel.com/new
2. Click "Import Git Repository"
3. Paste your GitHub repo URL
4. Click "Import"
5. Keep default settings
6. Click "Deploy"

**Wait 2-3 minutes...**

### 4. Done! 🎉
Your live URL appears at the top. It looks like:
```
https://haus-metatool-web.vercel.app
```

### 5. Share with UK Team Mate
Send him:
```
Hey! Check out the HAUS Metatool web version:
https://haus-metatool-web.vercel.app

You can search the music library, filter by genre/mood/BPM, and see results instantly.
```

---

## Local Testing (Before Deploying)

Want to test locally first?

```bash
npm install
npm run dev
```

Then open http://localhost:3000 and try the search!

---

## Troubleshooting

**"command not found: npm"**
- Install Node.js from https://nodejs.org (v18+)

**"port 3000 already in use"**
```bash
npm run dev -- -p 3001
```

**Deployment fails on Vercel**
- Check build logs in Vercel dashboard
- Ensure all files were committed to GitHub
- Try `npm run build` locally first

---

## Next: Real Data Integration

Once deployed, we can:
1. Connect to your SQLite database
2. Add Dropbox file browsing
3. Add audio playback
4. Add BPM detection

But for now - you have a **working web app** your UK team can access! 🚀
