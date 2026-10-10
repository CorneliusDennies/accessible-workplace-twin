import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { scanRouter } from './routes/scan';
import { floorPlanRouter } from './routes/floorplan';
import { planRouter } from './routes/plan';
import { scansRouter } from './routes/scans';
import { loadListings, shoppingEnabled } from './agent/shopping';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use('/api', scanRouter);
app.use('/api', floorPlanRouter);
app.use('/api', planRouter);
app.use('/api', scansRouter);
app.use('/models', express.static(path.join(__dirname, '..', 'data', 'models')));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Scan server listening on http://localhost:${PORT}`);
  // Warm the product-listing cache in the background (each live search takes ~35s).
  if (shoppingEnabled()) {
    loadListings(undefined, (t) => console.log(t))
      .then((r) => console.log(`Product listings ready for ${Object.keys(r ?? {}).length} products`))
      .catch((err) => console.error('Product listing warm-up failed:', err));
  }
});
