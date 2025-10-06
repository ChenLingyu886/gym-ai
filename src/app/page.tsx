'use client';

import { useEffect, useRef, useState } from 'react';

/* ========== Roboflow 云端 ========== */
const RF_URL = 'https://detect.roboflow.com/fitness-activity-all-woacc/1';
const RF_KEY = 'rf_dOA1BX3ugOMZF0RuFp1FyyuM18C3';

/* ========== 代谢当量 (MET) ========== */
const ACTION_MET: Record<string, number> = {
  pushup: 8.0,
  seated_row: 4.5,
  seated_shoulder_press: 5.0,
  squat: 5.5,
};

/* ========== 统一返回格式 ========== */
interface DetResult {
  reps: number;
  kcal: number;
  action: string;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastDetect = useRef<number>(0);

  const [res, setRes] = useState<DetResult>({ reps: 0, kcal: 0, action: '' });
  const [user] = useState({ weight: 70 }); // 后续可弹窗修改
  const [loading, setLoading] = useState(false);

  /* ---------- 1. 打开网页 → 立即申请摄像头 ---------- */
  useEffect(() => {
    (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      videoRef.current!.srcObject = stream;
      streamRef.current = stream;
      videoRef.current!.play();
    })();
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  /* ---------- 2. 实时取帧 → 识别 → 画框 → 计数 ---------- */
  useEffect(() => {
    if (!videoRef.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const loop = () => {
      if (videoRef.current && canvas) {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        const now = performance.now();
        if (now - lastDetect.current > 500) { // 500ms 防抖
          lastDetect.current = now;
          canvas.toBlob(async (blob) => {
            if (!blob) return;
            setLoading(true);
            const form = new FormData();
            form.append('file', blob);
            try {
              const res = await fetch(`${RF_URL}?api_key=${RF_KEY}&format=json`, { method: 'POST', body: form });
              const data = await res.json();
              const preds: any[] = data.predictions || [];

              /* 3. 实时画框 + 只统计「完成」动作 */
              let detected = false;
              preds.forEach((p) => {
                const [action, status] = p.class.split('_');
                if (status === 'complete') {
                  detected = true;
                  const { x, y, width, height, confidence } = p;
                  ctx.strokeStyle = '#00FF00';
                  ctx.lineWidth = 2;
                  ctx.strokeRect(x - width / 2, y - height / 2, width, height);
                  ctx.fillStyle = '#00FF00';
                  ctx.font = '16px Arial';
                  ctx.fillText(`${p.class} ${(confidence * 100).toFixed(0)}%`, x - width / 2, y - height / 2 - 5);
                }
              });

              /* 4. 实时计数 & 热量 */
              if (detected) {
                const [action] = preds[0].class.split('_');
                const minutes = 0.5 / 60; // 半秒
                const kcal = Math.round((ACTION_MET[action] || 5) * user.weight * minutes);
                setRes((prev) => ({
                  reps: prev.reps + 1,
                  kcal: Number((prev.kcal + kcal).toFixed(1)),
                  action,
                }));
              }
            } catch (e) {
              console.error('实时识别失败', e);
            } finally {
              setLoading(false);
            }
          }, 'image/jpeg');
        }
      }
      requestAnimationFrame(loop);
    };
    loop();
  }, [user.weight]);

  /* ---------- 5. 渲染：实时视频 + 大数字仪表盘 ---------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-8 text-white">
        <h1 className="text-4xl font-extrabold text-center mb-6">AI 健身热量计数器</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 实时视频 & 画框 */}
          <div className="bg-white/10 rounded-2xl p-4 relative">
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl" />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover rounded-xl pointer-events-none" />
            {loading && <div className="absolute inset-0 flex items-center justify-center text-sm">识别中...</div>}
          </div>

          {/* 实时仪表盘 */}
          <div className="bg-white/10 rounded-2xl p-6 flex flex-col justify-center items-center text-center">
            <div className="text-sm text-gray-200">当前动作</div>
            <div className="text-3xl font-bold mt-1">{res.action || '---'}</div>
            <div className="text-sm text-gray-200 mt-4">完成次数</div>
            <div className="text-5xl font-extrabold text-green-300">{res.reps}</div>
            <div className="text-sm text-gray-200 mt-4">消耗热量</div>
            <div className="text-5xl font-extrabold text-orange-300">{res.kcal} kcal</div>
            <a href={canvasRef.current?.toDataURL() || ''} download="result.jpg" className="mt-6 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 rounded-full text-sm transition">下载结果图</a>
          </div>
        </div>

        {/* 可扩展：个人信息弹窗、动作选择、历史记录…… */}

      </div>
    </div>
  );
}