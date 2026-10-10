import fs from 'fs';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';

export async function downloadAndExtractGlb(modelUrl: string, serialize: string, modelsDir: string): Promise<string> {
  fs.mkdirSync(modelsDir, { recursive: true });

  const zipPath = path.join(modelsDir, `${serialize}.zip`);
  const response = await axios.get(modelUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(zipPath, response.data);

  const zip = new AdmZip(zipPath);
  const glbEntry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.glb'));
  if (!glbEntry) {
    throw new Error('No .glb file found in the downloaded model archive');
  }

  const glbFilename = `${serialize}.glb`;
  const glbPath = path.join(modelsDir, glbFilename);
  fs.writeFileSync(glbPath, glbEntry.getData());
  fs.unlinkSync(zipPath);

  return glbFilename;
}
