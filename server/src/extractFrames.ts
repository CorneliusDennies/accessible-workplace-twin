import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

const MAX_FRAMES = 120; // stay comfortably under KIRI's 300-image cap

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (error, _stdout, stderr) => {
      if (error) reject(new Error(`${cmd} failed: ${stderr || error.message}`));
      else resolve();
    });
  });
}

async function getVideoDurationSeconds(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath],
      (error, stdout, stderr) => {
        if (error) reject(new Error(`ffprobe failed: ${stderr || error.message}`));
        else resolve(parseFloat(stdout.trim()));
      }
    );
  });
}

export async function extractFrames(videoPath: string, outDir: string): Promise<string[]> {
  fs.mkdirSync(outDir, { recursive: true });

  const duration = await getVideoDurationSeconds(videoPath);
  // Pick an fps that yields roughly MAX_FRAMES frames across the whole video,
  // bounded to a sane range for a slow walkthrough video.
  const targetFps = Math.min(2, Math.max(0.5, MAX_FRAMES / Math.max(duration, 1)));

  const pattern = path.join(outDir, 'frame_%04d.jpg');
  await run('ffmpeg', ['-y', '-i', videoPath, '-vf', `fps=${targetFps}`, '-q:v', '2', pattern]);

  const frames = fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
    .sort()
    .map((f) => path.join(outDir, f));

  return frames.slice(0, MAX_FRAMES);
}
