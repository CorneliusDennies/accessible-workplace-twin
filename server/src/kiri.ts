import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';

const BASE_URL = 'https://api.kiriengine.app';

function authHeaders() {
  const apiKey = process.env.KIRI_API_KEY;
  if (!apiKey) {
    throw new Error('KIRI_API_KEY is not set. Add it to server/.env');
  }
  return { Authorization: `Bearer ${apiKey}` };
}

export type KiriStatus = 'uploading' | 'processing' | 'failed' | 'success' | 'queuing' | 'expired';

const STATUS_MAP: Record<number, KiriStatus> = {
  [-1]: 'uploading',
  0: 'processing',
  1: 'failed',
  2: 'success',
  3: 'queuing',
  4: 'expired',
};

export async function uploadFramesToKiri(framePaths: string[]): Promise<string> {
  const form = new FormData();
  for (const framePath of framePaths) {
    form.append('imagesFiles', fs.createReadStream(framePath), path.basename(framePath));
  }
  form.append('modelQuality', '1'); // Medium — faster turnaround for a demo
  form.append('textureQuality', '1'); // 2K
  form.append('isMask', '0');
  form.append('textureSmoothing', '1');
  form.append('fileFormat', 'glb');

  const res = await axios.post(`${BASE_URL}/api/v1/open/photo/image`, form, {
    headers: { ...authHeaders(), ...form.getHeaders() },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  if (res.data?.code !== 0 || !res.data?.data?.serialize) {
    throw new Error(`KIRI upload failed: ${JSON.stringify(res.data)}`);
  }

  return res.data.data.serialize as string;
}

export async function getKiriStatus(serialize: string): Promise<KiriStatus> {
  const res = await axios.get(`${BASE_URL}/api/v1/open/model/getStatus`, {
    headers: authHeaders(),
    params: { serialize },
  });

  if (res.data?.code !== 0) {
    throw new Error(`KIRI status check failed: ${JSON.stringify(res.data)}`);
  }

  return STATUS_MAP[res.data.data.status] ?? 'processing';
}

export async function getKiriModelZipUrl(serialize: string): Promise<string> {
  const res = await axios.get(`${BASE_URL}/api/v1/open/model/getModelZip`, {
    headers: authHeaders(),
    params: { serialize },
  });

  if (res.data?.code !== 0 || !res.data?.data?.modelUrl) {
    throw new Error(`KIRI model fetch failed: ${JSON.stringify(res.data)}`);
  }

  return res.data.data.modelUrl as string;
}
