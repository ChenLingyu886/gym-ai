// src/utils/detector.ts
import Roboflow from 'roboflow';
import * as tf from '@tensorflow/tfjs';

/* ========== 统一返回格式 ========== */
export interface Detection {
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  class: string;
  confidence: number;
}

/* ========== Roboflow 云端 ========== */
const CLOUD_ENABLED = true;               // 关闭则走本地
const RF_PROJECT = 'gym-ai';            // 你的项目名
const RF_VERSION = 1;                   // 版本号（数字）
const RF_KEY = 'rf_dOA1BX3ugOMZFORuFp1FyyuM18C3';
const REQ_TIMEOUT = 15000;               // 15s 超时
const MAX_RETRY = 3;                   // 失败重试

let rfModel: any; // 复用模型实例

/** 初始化 Roboflow（只执行一次） */
async function initCloud() {
  if (rfModel) return;
  const rf = new Roboflow({ publishable_key: RF_KEY });
  rfModel = await rf.model({ model: RF_PROJECT, version: RF_VERSION });
}

/** 云端推理：带重试 + 超时 */
async function cloudDetect(img: HTMLImageElement): Promise<Detection[]> {
  await initCloud();
  for (let i = 0; i < MAX_RETRY; i++) {
    try {
      const preds = await Promise.race([
        rfModel.detect(img),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), REQ_TIMEOUT)),
      ]);
      return preds.map((p: any) => ({
        bbox: { x: p.bbox.x, y: p.bbox.y, width: p.bbox.width, height: p.bbox.height },
        class: p.class,
        confidence: p.confidence,
      }));
    } catch (e) {
      if (i === MAX_RETRY - 1) throw e;
      await new Promise(r => setTimeout(r, 500)); // 简单退避
    }
  }
  return []; // 不可达，ts 需要
}

/* ========== TF.js 本地兜底 ========== */
const LOCAL_ENABLED = true;
const LOCAL_MODEL_PATH = '/model/model.json';
const CLASS_NAMES = [
  'pushup_complete', 'pushup_incomplete',
  'seated_row_complete', 'seated_row_incomplete',
  'seated_shoulder_press_complete', 'seated_shoulder_press_incomplete',
  'squat_complete', 'squat_incomplete'
];
let localModel: tf.GraphModel;

async function initLocal() {
  if (localModel) return;
  localModel = await tf.loadGraphModel(LOCAL_MODEL_PATH);
}

/** 本地推理 */
async function localDetect(video: HTMLVideoElement): Promise<Detection[]> {
  await initLocal();
  const img = tf.tidy(() => tf.browser.fromPixels(video).expandDims(0).div(255));
  const preds = localModel.execute(img) as tf.Tensor;
  const data = preds.squeeze().arraySync() as number[][];
  img.dispose(); preds.dispose();

  const CONF = 0.7;
  return data
    .filter((p) => p[4] > CONF)
    .map((p) => {
      const [x, y, w, h, conf, cls] = p;
      return {
        bbox: { x, y, width: w, height: h },
        class: CLASS_NAMES[Math.floor(cls)] ?? 'unknown',
        confidence: conf,
      };
    });
}

/* ========== 统一对外接口 ========== */
export async function detectImage(img: HTMLImageElement): Promise<Detection[]> {
  // 1. 优先云端
  if (CLOUD_ENABLED) {
    try {
      return await cloudDetect(img);
    } catch (e) {
      console.warn('[Detector] Cloud failed, fallback to local', e);
    }
  }
  // 2. 本地兜底
  if (LOCAL_ENABLED) {
    // 本地需要 video 元素，这里把 img 画到 canvas 再转成 video 帧
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const stream = canvas.captureStream();
    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();
    const res = await localDetect(video);
    stream.getTracks().forEach(t => t.stop());
    return res;
  }
  // 3. 都失败
  return [];
}