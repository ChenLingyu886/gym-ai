// src/app/api/detect/route.ts
import { NextRequest } from 'next/server';
import Roboflow from 'roboflow';

const PROJECT = 'gym-ai';
const VERSION = 1; // 数字
const MAX_INIT = 3;

let rfModel: any;

async function getModel() {
  if (rfModel) return rfModel;
  const key = process.env.ROBOFLOW_KEY;
  if (!key) throw new Error('ROBOFLOW_KEY is missing');
  for (let i = 0; i < MAX_INIT; i++) {
    try {
      const rf = new Roboflow({ publishable_key: key });
      rfModel = await rf.model({ model: PROJECT, version: VERSION });
      return rfModel;
    } catch (e) {
      if (i === MAX_INIT - 1) throw e;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('Unreachable');
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();
    const buf = Buffer.from(imageBase64, 'base64');
    const model = await getModel();
    const preds = await model.detect(buf);
    return Response.json(preds);
  } catch (e) {
    console.error('[/api/detect]', e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}