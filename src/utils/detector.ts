import * as tf from '@tensorflow/tfjs';

let model: tf.GraphModel;
const CLASS_NAMES = [
  'pushup_complete','pushup_incomplete',
  'seated_row_complete','seated_row_incomplete',
  'seated_shoulder_press_complete','seated_shoulder_press_incomplete',
  'squat_complete','squat_incomplete'
];

export async function initModel(){
  model = await tf.loadGraphModel('/model/model.json');
}

export function detect(video: HTMLVideoElement){
  const img = tf.tidy(()=> tf.browser.fromPixels(video).expandDims(0).div(255));
  const preds   = model.execute(img) as tf.Tensor;
  const data    = preds.squeeze().arraySync() as number[][];
  img.dispose(); preds.dispose();

  const CONF = 0.7;
  const res = data.filter((p:any) => p[4] > CONF);
  if (!res.length) return null;
  const [,,,,conf,cls] = res[0];
  const label = CLASS_NAMES[Math.floor(cls)];
  const [action, status] = label.split('_');
  return { action, status, conf };
}