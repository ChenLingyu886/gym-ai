'use client';
import { useEffect, useRef, useState } from 'react';

// 填入你的 Roboflow 信息
const RF_URL = "https://detect.roboflow.com/fitness-activity-all-woacc/1";
const RF_KEY = "rf_dOAlBX3ugOMZF0RuFp1FyyuMl8C3";

// 动作代谢当量（计算热量用）
const ACTION_MET: Record<string, number> = {
  pushup: 8.0,
  seated_row: 4.5,
  seated_shoulder_press: 5.0,
  squat: 5.5,
};

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [res, setRes] = useState({ reps: 0, kcal: 0, action: '' });
  const [user, setUser] = useState({ weight: 70, height: 170 });
  const [showForm, setShowForm] = useState(true);

  useEffect(() => {
    if (showForm) return;
    (async () => {
      // 获取摄像头权限
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
      });
      videoRef.current!.srcObject = stream;
      
      // 创建画布用于截取视频帧
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      // 循环处理视频帧
      const loop = async () => {
        canvas.width = videoRef.current!.videoWidth;
        canvas.height = videoRef.current!.videoHeight;
        ctx.drawImage(videoRef.current!, 0, 0);
        
        // 转为图片 blob 并发送到 Roboflow API
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          const fd = new FormData();
          fd.append('file', blob);
          
          const response = await fetch(
            `${RF_URL}?api_key=${RF_KEY}&format=json`, 
            { method: 'POST', body: fd }
          );
          
          const data = await response.json();
          // 处理识别结果（只关注完成的动作）
          const completeActions = data.predictions?.filter(
            (p: any) => p.class.includes('complete')
          );
          
          if (completeActions?.length) {
            const [action] = completeActions[0].class.split('_');
            const minutes = 1 / 60; // 估算每帧时间
            const kcal = Math.round(ACTION_MET[action] * user.weight * minutes);
            setRes(prev => ({ 
              reps: prev.reps + 1, 
              kcal: prev.kcal + kcal, 
              action 
            }));
          }
        }, 'image/jpeg');
        
        requestAnimationFrame(loop);
      };
      loop();
    })();
  }, [showForm, user.weight]);

  return (
    <main className="flex flex-col items-center p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">AI 健身热量计数器</h1>
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className="rounded w-full border-2 border-gray-200"
      />
      
      <div className="mt-4 grid grid-cols-3 gap-4 w-full text-center">
        <div className="bg-gray-100 p-3 rounded">
          <div className="text-sm text-gray-500">当前动作</div>
          <div className="font-medium">{res.action || '---'}</div>
        </div>
        <div className="bg-gray-100 p-3 rounded">
          <div className="text-sm text-gray-500">完成次数</div>
          <div className="font-medium">{res.reps}</div>
        </div>
        <div className="bg-orange-50 p-3 rounded">
          <div className="text-sm text-orange-600">消耗热量</div>
          <div className="font-medium text-orange-600">{res.kcal} kcal</div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm">
            <h2 className="text-xl font-semibold mb-4">个人信息</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1">体重 (kg)</label>
                <input
                  type="number"
                  min="30"
                  max="200"
                  defaultValue={user.weight}
                  onChange={(e) => setUser({ ...user, weight: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">身高 (cm)</label>
                <input
                  type="number"
                  min="100"
                  max="250"
                  defaultValue={user.height}
                  onChange={(e) => setUser({ ...user, height: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
              >
                开始训练
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}