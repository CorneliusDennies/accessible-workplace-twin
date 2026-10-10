import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { scanRouter } from './routes/scan';
import { floorPlanRouter } from './routes/floorplan';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use('/api', scanRouter);
app.use('/api', floorPlanRouter);
app.use('/models', express.static(path.join(__dirname, '..', 'data', 'models')));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Scan server listening on http://localhost:${PORT}`);
});
