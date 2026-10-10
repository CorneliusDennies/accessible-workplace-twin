import { Router } from 'express';
import multer from 'multer';
import { parseFloorPlanImage } from '../floorplan';
import { convertFloorPlanToOfficeData } from '../convertFloorPlan';

const upload = multer({ storage: multer.memoryStorage() });

export const floorPlanRouter = Router();

// POST /api/floorplan — upload a floor plan photo/scan, get back structured OfficeData.
floorPlanRouter.post('/floorplan', upload.single('image'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image uploaded (expected field "image")' });
    return;
  }

  try {
    const mediaType = req.file.mimetype;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType)) {
      res.status(400).json({ error: `Unsupported image type: ${mediaType}` });
      return;
    }

    const base64 = req.file.buffer.toString('base64');
    const plan = await parseFloorPlanImage(base64, mediaType);
    const officeData = convertFloorPlanToOfficeData(plan);
    res.json({ officeData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Floor plan parsing failed' });
  }
});
