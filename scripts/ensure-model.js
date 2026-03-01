/**
 * 若 public/models 下没有 .task 文件，则从官方 CDN 下载 hand_landmarker.task（构建/部署用）
 */
import fs from 'fs';
import path from 'path';

const MODEL_DIR = path.join(process.cwd(), 'public', 'models');
const MODEL_FILE = path.join(MODEL_DIR, 'hand_landmarker.task');
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

if (fs.existsSync(MODEL_FILE)) {
  console.log('[ensure-model] hand_landmarker.task 已存在，跳过下载');
  process.exit(0);
}

if (!fs.existsSync(MODEL_DIR)) {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
}

console.log('[ensure-model] 正在下载 hand_landmarker.task ...');
try {
  const res = await fetch(MODEL_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status}`);
  const buf = await res.arrayBuffer();
  fs.writeFileSync(MODEL_FILE, Buffer.from(buf));
  console.log('[ensure-model] 下载完成:', MODEL_FILE);
} catch (err) {
  console.warn('[ensure-model] 下载失败，请手动将 .task 放入 public/models/', err.message);
}
process.exit(0);
