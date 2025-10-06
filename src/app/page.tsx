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
  lastUpdated: number;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastDetect = useRef<number>(0);
  const detectionHistory = useRef<{ action: string, timestamp: number }[]>([]);
  const motionState = useRef<'idle' | 'active'>('idle');

  const [res, setRes] = useState<DetResult>({ reps: 0, kcal: 0, action: '', lastUpdated: 0 });
  const [user] = useState({ weight: 70 }); // 后续可弹窗修改
  const [loading, setLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(true);

  /* ---------- 1. 打开网页 → 立即申请摄像头 ---------- */
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        videoRef.current!.srcObject = stream;
        streamRef.current = stream;
        videoRef.current!.play();
      } catch (err) {
        console.error('摄像头访问失败:', err);
        alert('请允许摄像头访问以使用此应用');
      }
    })();

    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  /* ---------- 2. 实时取帧 → 识别 → 画框 → 计数 (优化版) ---------- */
  useEffect(() => {
    if (!videoRef.current) return;

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    // 优化识别频率控制，根据动作类型动态调整
    const getDetectionInterval = (action: string) => {
      switch (action) {
        case 'pushup': return 300; // 俯卧撑识别间隔
        case 'squat': return 400; // 深蹲识别间隔
        default: return 350; // 其他动作默认间隔
      }
    };

    const processDetection = async (blob: Blob) => {
      setLoading(true);
      const form = new FormData();
      form.append('file', blob);

      try {
        const res = await fetch(`${RF_URL}?api_key=${RF_KEY}&format=json`, {
          method: 'POST',
          body: form,
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!res.ok) throw new Error(`识别请求失败: ${res.status}`);

        const data = await res.json();
        const preds: any[] = data.predictions || [];

        // 过滤低置信度结果
        const validPreds = preds.filter(p => p.confidence > 0.7);

        /* 3. 实时画框 + 只统计「完成」动作 */
        let detected = false;
        let mainAction = '';

        // 清除之前的绘制
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 绘制视频帧
        ctx.drawImage(videoRef.current!, 0, 0, canvas.width, canvas.height);

        validPreds.forEach((p) => {
          const [action, status] = p.class.split('_');
          if (status === 'complete') {
            detected = true;
            mainAction = action;

            // 绘制检测框和标签
            const { x, y, width, height, confidence } = p;
            const left = x - width / 2;
            const top = y - height / 2;

            // 绘制半透明背景
            ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
            ctx.fillRect(left, top, width, height);

            // 绘制边框
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2;
            ctx.strokeRect(left, top, width, height);

            // 绘制标签背景
            ctx.fillStyle = '#00FF00';
            const text = `${p.class} ${(confidence * 100).toFixed(0)}%`;
            const textMetrics = ctx.measureText(text);
            ctx.fillRect(left, top - 20, textMetrics.width + 8, 20);

            // 绘制标签文字
            ctx.fillStyle = '#000';
            ctx.font = '14px Arial';
            ctx.fillText(text, left + 4, top - 5);
          }
        });

        /* 4. 实时计数 & 热量 (优化计数逻辑) */
        if (detected && mainAction) {
          const now = Date.now();
          // 记录检测历史，用于去重和验证
          detectionHistory.current.push({ action: mainAction, timestamp: now });

          // 只保留最近5条记录
          if (detectionHistory.current.length > 5) {
            detectionHistory.current.shift();
          }

          // 检查是否是有效的动作完成（避免重复计数）
          const isNewRep = detectionHistory.current.filter(
            h => h.action === mainAction && now - h.timestamp < 1000
          ).length <= 2;

          if (isNewRep) {
            // 计算热量消耗（基于动作持续时间估算）
            const minutes = getDetectionInterval(mainAction) / 1000 / 60;
            const kcalBurned = (ACTION_MET[mainAction] || 5) * user.weight * minutes;

            setRes(prev => ({
              reps: prev.action === mainAction ? prev.reps + 1 : 1,
              kcal: Number((prev.kcal + kcalBurned).toFixed(1)),
              action: mainAction,
              lastUpdated: now
            }));

            // 更新运动状态
            motionState.current = 'active';
          }
        }
      } catch (e) {
        console.error('实时识别失败', e);
      } finally {
        setLoading(false);
      }
    };

    const loop = () => {
      if (!videoRef.current || !isDetecting) {
        requestAnimationFrame(loop);
        return;
      }

      // 调整画布尺寸以匹配视频
      if (canvas.width !== videoRef.current.videoWidth ||
        canvas.height !== videoRef.current.videoHeight) {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
      }

      const now = performance.now();
      const currentInterval = res.action ? getDetectionInterval(res.action) : 350;

      // 基于当前动作动态调整检测间隔
      if (now - lastDetect.current > currentInterval) {
        lastDetect.current = now;

        // 使用更高效的toDataURL替代toBlob，提高处理速度
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7); // 降低画质以提高速度
        fetch(dataUrl)
          .then(res => res.blob())
          .then(blob => processDetection(blob))
          .catch(err => console.error('转换图片失败:', err));
      }

      requestAnimationFrame(loop);
    };

    const animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [user.weight, isDetecting]);

  // 检测动作超时，重置当前动作
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - res.lastUpdated > 5000 && res.action) {
        setRes(prev => ({ ...prev, action: '' }));
        motionState.current = 'idle';
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [res.lastUpdated, res.action]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/20">
        {/* 顶部标题栏 */}
        <div className="bg-white/5 px-6 py-4 border-b border-white/10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-center bg-clip-text text-transparent bg-gradient-to-r from-green-300 to-blue-200">
            AI 健身热量计数器
          </h1>
        </div>

        <div className="p-4 md:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
            {/* 实时视频 & 画框 */}
            <div className="lg:col-span-3 bg-black/30 rounded-2xl overflow-hidden relative group">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />

              {/* 加载状态指示器 */}
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-t-transparent border-green-400 rounded-full animate-spin mb-2"></div>
                    <span className="text-green-300 font-medium">识别中...</span>
                  </div>
                </div>
              )}

              {/* 控制按钮 */}
              <div className="absolute bottom-4 right-4 flex gap-2">
                <button
                  onClick={() => setIsDetecting(!isDetecting)}
                  className={`p-3 rounded-full backdrop-blur-md transition-all duration-300 ${isDetecting
                      ? 'bg-red-500/80 hover:bg-red-600'
                      : 'bg-green-500/80 hover:bg-green-600'
                    }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {isDetecting ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* 实时仪表盘 */}
            <div className="lg:col-span-2 bg-white/5 rounded-2xl p-6 flex flex-col justify-center">
              <div className="space-y-6">
                {/* 当前动作 */}
                <div className="bg-black/20 rounded-xl p-4 backdrop-blur-sm">
                  <div className="text-sm text-gray-300 mb-1">当前动作</div>
                  <div className="text-3xl md:text-4xl font-bold text-white flex items-center">
                    {res.action
                      ? res.action.replace(/_/g, ' ').split(' ').map(word =>
                        word.charAt(0).toUpperCase() + word.slice(1)
                      ).join(' ')
                      : <span className="text-gray-400">等待检测...</span>
                    }
                    {motionState.current === 'active' && (
                      <span className="ml-2 w-3 h-3 bg-green-400 rounded-full animate-pulse"></span>
                    )}
                  </div>
                </div>

                {/* 完成次数 */}
                <div className="bg-black/20 rounded-xl p-4 backdrop-blur-sm">
                  <div className="text-sm text-gray-300 mb-1">完成次数</div>
                  <div className="text-5xl md:text-6xl font-extrabold text-green-400 transition-all duration-300 transform hover:scale-105">
                    {res.reps}
                  </div>
                </div>

                {/* 消耗热量 */}
                <div className="bg-black/20 rounded-xl p-4 backdrop-blur-sm">
                  <div className="text-sm text-gray-300 mb-1">消耗热量</div>
                  <div className="text-5xl md:text-6xl font-extrabold text-orange-400 transition-all duration-300 transform hover:scale-105">
                    {res.kcal} <span className="text-2xl md:text-3xl align-text-top">kcal</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 底部信息栏 */}
        <div className="bg-white/5 px-6 py-3 border-t border-white/10 text-center text-sm text-gray-300">
          支持动作: 俯卧撑、坐姿划船、坐姿肩推、深蹲 | 数据仅供参考
        </div>
      </div>
    </div>
  );
}