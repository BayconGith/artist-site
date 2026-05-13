const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── CLOUDINARY CONFIG ─────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── DATA PERSISTENCE via Cloudinary (raw JSON file) ───
// We store data.json as a raw file in Cloudinary so it
// survives Render restarts. Public ID: "artist-site/data"

const DATA_PUBLIC_ID = 'artist-site/data';

async function loadData() {
  try {
    // Fetch the raw JSON stored in Cloudinary
    const url = cloudinary.url(DATA_PUBLIC_ID, {
      resource_type: 'raw',
      // bust cache
      version: Date.now()
    });
    const res = await fetch(url);
    if (!res.ok) throw new Error('not found');
    return await res.json();
  } catch {
    // First run — return defaults
    return {
      artist: { name: 'BAYCON', tagline: 'Independent Artist', instagram: 'https://www.instagram.com/bayconist/' },
      tracks: []
    };
  }
}

async function saveData(data) {
  const json = JSON.stringify(data, null, 2);
  await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: DATA_PUBLIC_ID, resource_type: 'raw', overwrite: true },
      (err, result) => err ? reject(err) : resolve(result)
    );
    streamifier.createReadStream(Buffer.from(json)).pipe(stream);
  });
}

// ── MULTER — memory storage (we stream to Cloudinary) ─
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const audioTypes = /mp3|wav|mpeg/;
    const imageTypes = /jpeg|jpg|png|webp|gif/;
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    const mime = file.mimetype;
    if (file.fieldname === 'audio') {
      if (audioTypes.test(ext) || audioTypes.test(mime)) return cb(null, true);
      return cb(new Error('Only MP3 and WAV audio files are allowed'));
    }
    if (file.fieldname === 'cover') {
      if (imageTypes.test(ext) || imageTypes.test(mime)) return cb(null, true);
      return cb(new Error('Only image files are allowed for cover'));
    }
    cb(null, true);
  }
});

// Helper: upload a buffer to Cloudinary
function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// ── MIDDLEWARE ────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── ROUTES ────────────────────────────────────────────

// GET /api/data
app.get('/api/data', async (req, res) => {
  try {
    res.json(await loadData());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/artist
app.put('/api/artist', async (req, res) => {
  try {
    const { name, tagline, instagram } = req.body;
    const data = await loadData();
    if (name      !== undefined) data.artist.name      = name;
    if (tagline   !== undefined) data.artist.tagline   = tagline;
    if (instagram !== undefined) data.artist.instagram = instagram;
    await saveData(data);
    res.json(data.artist);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tracks
app.post(
  '/api/tracks',
  upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
  async (req, res) => {
    try {
      const { title } = req.body;
      if (!title)                   return res.status(400).json({ error: 'Title is required' });
      if (!req.files?.audio)        return res.status(400).json({ error: 'Audio file is required' });

      const id = Date.now().toString();
      const audioFile = req.files.audio[0];
      const coverFile = req.files.cover?.[0] || null;

      // Upload audio to Cloudinary
      const audioResult = await uploadToCloudinary(audioFile.buffer, {
        public_id:     `artist-site/audio/${id}`,
        resource_type: 'video',   // Cloudinary uses "video" for audio files
        overwrite:     true,
      });

      // Upload cover image if provided
      let coverUrl = null;
      if (coverFile) {
        const coverResult = await uploadToCloudinary(coverFile.buffer, {
          public_id:     `artist-site/covers/${id}`,
          resource_type: 'image',
          overwrite:     true,
        });
        coverUrl = coverResult.secure_url;
      }

      const track = {
        id,
        title,
        audioUrl:  audioResult.secure_url,
        coverUrl,
        audioPublicId: audioResult.public_id,
        coverPublicId: coverFile ? `artist-site/covers/${id}` : null,
        fileType:  path.extname(audioFile.originalname).slice(1).toUpperCase(),
        createdAt: new Date().toISOString(),
      };

      const data = await loadData();
      data.tracks.push(track);
      await saveData(data);

      res.status(201).json(track);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  }
);

// DELETE /api/tracks/:id
app.delete('/api/tracks/:id', async (req, res) => {
  try {
    const data = await loadData();
    const idx  = data.tracks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Track not found' });

    const track = data.tracks[idx];

    // Delete files from Cloudinary
    const deletions = [];
    if (track.audioPublicId) {
      deletions.push(cloudinary.uploader.destroy(track.audioPublicId, { resource_type: 'video' }));
    }
    if (track.coverPublicId) {
      deletions.push(cloudinary.uploader.destroy(track.coverPublicId, { resource_type: 'image' }));
    }
    await Promise.all(deletions);

    data.tracks.splice(idx, 1);
    await saveData(data);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`🎵 Artist site running at http://localhost:${PORT}`);
});
