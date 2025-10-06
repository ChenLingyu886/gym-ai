import { ACTION_MET } from './met';

const T: Record<string, number> = {};      // 全程时间 ms
let tLast = performance.now();
const LAST_STATUS: Record<string, string> = {}; // 跳变计数用
let globalReps = 0;                        // 总完成次数

export function countCalorie(detected: { action: string; status: string } | null, weightKg: number) {
  const now = performance.now();
  if (!detected) { tLast = now; return { reps: globalReps, kcal: 0, action: '' }; }

  const { action, status } = detected;
  const key = action;

  // ① 全程时间累加（不管 complete/incomplete）
  T[key] = (T[key] || 0) + (now - tLast);
  tLast = now;

  // ② 跳变计数：incomplete → complete 才 +1
  const prev = LAST_STATUS[key] || 'incomplete';
  if (prev === 'incomplete' && status === 'complete') globalReps += 1;
  LAST_STATUS[key] = status;

  // ③ 热量 = MET × 体重 × 全程小时
  const minutes = T[key] / 1000 / 60;
  const kcal = Math.round(ACTION_MET[key] * weightKg * minutes);

  return { reps: globalReps, kcal, action };
}