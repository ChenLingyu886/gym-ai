// src/app/api/detect/route.ts
import { NextRequest } from 'next/server';
import Roboflow from 'roboflow';

const rf = new Roboflow({ publishable_key: process.env.ROBOFLOW_KEY! });
const model = rf.model({ model: 'gym-ai', version: 1 });

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();
    const buf = Buffer.from(imageBase64, 'base64');
    const preds = await model.detect(buf);
    return Response.json(preds);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}