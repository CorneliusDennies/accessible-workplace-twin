import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { extractFrames } from '../extractFrames';
import { uploadFramesToKiri, getKiriStatus, getKiriModelZipUrl } from '../kiri';
import { downloadAndExtractGlb } from '../downloadModel';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const FRAMES_DIR = path.join(DATA_DIR, 'frames');
const MODELS_DIR = path.join(DATA_DIR, 'models');

const upload = multer({ dest: UPLOADS_DIR });

export const scanRouter = Router();

// POST /api/scan — upload a walkthrough video, kick off reconstruction, return a serialize id.
scanRouter.post('/scan', upload.single('video'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No video file uploaded (expected field "video")' });
    return;
  }

  const videoPath = req.file.path;
  const framesDir = path.join(FRAMES_DIR, req.file.filename);

  try {
    const frames = await extractFrames(videoPath, framesDir);
    if (frames.length < 20) {
      res.status(400).json({
        error: `Only extracted ${frames.length} frames; KIRI Engine needs at least 20. Try a longer or slower walkthrough video.`,
      });
      return;
    }

    const serialize = await uploadFramesToKiri(frames);
    res.json({ serialize });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Reconstruction failed to start' });
  } finally {
    fs.rm(videoPath, { force: true }, () => {});
    fs.rm(framesDir, { recursive: true, force: true }, () => {});
  }
});

// GET /api/scan/:serialize/status — poll KIRI Engine processing status.
scanRouter.get('/scan/:serialize/status', async (req, res) => {
  try {
    const status = await getKiriStatus(req.params.serialize);
    res.json({ status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Status check failed' });
  }
});

// GET /api/scan/:serialize/model — once successful, download + unzip the GLB and serve it.
scanRouter.get('/scan/:serialize/model', async (req, res) => {
  const { serialize } = req.params;
  const glbPath = path.join(MODELS_DIR, `${serialize}.glb`);

  try {
    if (!fs.existsSync(glbPath)) {
      const modelUrl = await getKiriModelZipUrl(serialize);
      await downloadAndExtractGlb(modelUrl, serialize, MODELS_DIR);
    }
    res.json({ modelUrl: `/models/${serialize}.glb` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Model fetch failed' });
  }
});
