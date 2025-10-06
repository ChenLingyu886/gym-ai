declare module 'roboflow' {
  export default class Roboflow {
    constructor(options: { publishable_key: string });
    model(opts: { model: string; version: number }): {
      detect(img: Buffer | HTMLImageElement): Promise<any[]>;
    };
  }
}