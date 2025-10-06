// src/utils/detector.ts
export interface Detection {
  bbox: { x: number; y: number; width: number; height: number };
  class: string;
  confidence: number;
}

export async function detectImage(img: HTMLImageElement): Promise<Detection[]> {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const base64 = canvas.toDataURL('image/jpeg').split(',')[1];

  const res = await fetch('/api/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64 }),
  });
  if (!res.ok) throw new Error('detect failed');
  const preds = await res.json();
  return preds.map((p: any) => ({
    bbox: { x: p.bbox.x, y: p.bbox.y, width: p.bbox.width, height: p.bbox.height },
    class: p.class,
    confidence: p.confidence,
  }));
}