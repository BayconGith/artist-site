# 🎵 Artist Site

Personal music streaming site. Visitors listen without logging in. You upload MP3/WAV + cover photos as admin. Files stored permanently on Cloudinary — survives server restarts.

---

## Local Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create a `.env` file in the project root
```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 3. Load env and run
```bash
node -r dotenv/config server.js
# or install dotenv: npm install dotenv
```

Or just export variables in your terminal:
```bash
export CLOUDINARY_CLOUD_NAME=xxx
export CLOUDINARY_API_KEY=xxx
export CLOUDINARY_API_SECRET=xxx
npm start
```

Open http://localhost:3000

---

## Deploy on Render (free)

1. Push to GitHub
2. Go to render.com → New Web Service → connect repo
3. Settings:
   - Root Directory: `artist-site`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Go to **Environment** tab → add these variables:
   ```
   CLOUDINARY_CLOUD_NAME = your_cloud_name
   CLOUDINARY_API_KEY    = your_api_key
   CLOUDINARY_API_SECRET = your_api_secret
   ```
5. Deploy ✅

Files now persist forever on Cloudinary across all restarts and redeploys.

---

## Get Cloudinary credentials (free)

1. Sign up at https://cloudinary.com (free — 25GB storage)
2. Go to your Dashboard
3. Copy: Cloud Name, API Key, API Secret

---

## Admin access

Double-click your artist name on the site → enter password → admin panel appears.

Default password: `admin123`

Change it in `public/index.html`:
```js
const ADMIN_PASSWORD = 'admin123'; // ← change this
```

---

## File structure

```
artist-site/
├── server.js        ← Express + Cloudinary backend
├── package.json
├── README.md
└── public/
    └── index.html   ← Frontend (guest + admin)
```
