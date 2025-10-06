'use client';

import { useState, useRef } from 'react';
import { detectImage } from '@/utils/detector';

const KCAL_PER_REP = 0.4;

export default function Home() {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [kcal, setKcal] = useState(0);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    const url = URL.createObjectURL(file);
    setImgUrl(url);

    const img = new Image();
    img.src = url;
    img.onload = async () => {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const preds = await detectImage(img);
      const hasPushUp = preds.some((p: any) => p.class === 'push-up');
      if (hasPushUp) {
        const newCount = count + 1;
        setCount(newCount);
        setKcal(Number((newCount * KCAL_PER_REP).toFixed(1)));
      }

      preds.forEach((pred: any) => {
        const { x, y, width, height, class: label, confidence } = pred.bbox;
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - width / 2, y - height / 2, width, height);
        ctx.fillStyle = '#00FF00';
        ctx.font = '16px Arial';
        ctx.fillText(`${label} ${(confidence * 100).toFixed(0)}%`, x - width / 2, y - height / 2 - 5);
      });
      setLoading(false);
    };
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      video.onloadedmetadata = () => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const capture = () => {
          ctx.drawImage(video, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) handleFile(new File([blob], 'camera.jpg', { type: 'image/jpeg' }));
            stream.getTracks().forEach(t => t.stop());
          }, 'image/jpeg');
        };
        setTimeout(capture, 500);
      };
    } catch (e) {
      alert('摄像头打开失败，请允许权限');
    }
  };

  const reset = () => {
    setImgUrl(null);
    setCount(0);
    setKcal(0);
    fileInputRef.current && (fileInputRef.current.value = '');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-8 text-white">
        <h1 className="text-3xl font-extrabold text-center mb-6">AI 健身计数器</h1>

        {!imgUrl && (
          <div className="flex flex-col items-center gap-4">
            <button onClick={openCamera} className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-full font-semibold transition">📷 打开摄像头</button>
            <label className="px-6 py-3 bg-green-500 hover:bg-green-600 rounded-full font-semibold cursor-pointer transition">
              📁 上传图片
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            </label>
          </div>
        )}

        {imgUrl && (
          <div className="space-y-4">
            {loading && <p className="text-center">识别中...</p>}
            <canvas ref={canvasRef} className="mx-auto rounded-xl shadow" />
            <div className="bg-white/10 rounded-2xl p-4 text-center">
              <div className="text-lg">当前动作：俯卧撑</div>
              <div className="text-2xl font-bold">完成次数：{count}</div>
              <div className="text-xl">消耗热量：{kcal} kcal</div>
            </div>
            <div className="flex gap-4 justify-center">
              <button onClick={reset} className="px-5 py-2 bg-gray-600 hover:bg-gray-700 rounded-full transition">再来一张</button>
              <a href={imgUrl} download="result.jpg" className="px-5 py-2 bg-yellow-500 hover:bg-yellow-600 rounded-full transition">下载结果</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}