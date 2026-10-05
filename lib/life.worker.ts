import type { Request, Response } from "./life-protocol";
type Engine = { memory: WebAssembly.Memory; init(w: number,h: number): number; image_ptr(): number; cells_ptr(): number; seed(r:number,g:number,b:number,dither:number,invert:number): void; seed_auto(percent:number,dither:number,invert:number): void; thresholds_ptr(): number; step(wrap:number): void; render(mask:number): number };
const scope = self as unknown as { onmessage: ((event: MessageEvent<Request>)=>void) | null; postMessage(message: Response, transfer?: Transferable[]): void };
let engine: Engine | null = null;
let width=0,height=0,generation=0;
function frame(id:number,mask:number) {
  const e=engine!;
  const ptr=e.render(mask);
  const pixels=new Uint8Array(width*height*4);
  pixels.set(new Uint8Array(e.memory.buffer,ptr,pixels.length));
  const cells=new Uint8Array(e.memory.buffer,e.cells_ptr(),width*height);
  const population=[0,0,0];
  for(const cell of cells){population[0]+=cell&1;population[1]+=(cell>>1)&1;population[2]+=(cell>>2)&1;}
  // Thumbnails sample the full-resolution world; they are not separate simulations.
  const previewWidth=Math.min(320,width),previewHeight=Math.round(previewWidth*height/width);
  const previews=[0,1,2].map(c=>{
    const rgba=new Uint8Array(previewWidth*previewHeight*4);
    for(let y=0;y<previewHeight;y++)for(let x=0;x<previewWidth;x++){
      const sourceY=Math.floor(y*height/previewHeight),sourceX=Math.floor(x*width/previewWidth);
      const i=(y*previewWidth+x)*4;
      rgba[i+c]=(cells[sourceY*width+sourceX]&(1<<c))?255:0;rgba[i+3]=255;
    }
    return rgba.buffer;
  });
  scope.postMessage({kind:"frame",id,generation,width,height,pixels:pixels.buffer,previews,previewWidth,previewHeight,population,appliedThresholds:Array.from(new Int32Array(e.memory.buffer,e.thresholds_ptr(),3))},[pixels.buffer,...previews]);
}
scope.onmessage=async ({data})=>{
  try {
    if(data.kind==="boot"){
      const response=await fetch(data.wasmUrl);if(!response.ok)throw new Error("WASMを取得できませんでした。");
      const {instance}=await WebAssembly.instantiate(await response.arrayBuffer(),{});
      engine=instance.exports as unknown as Engine;scope.postMessage({kind:"ready",id:data.id});return;
    }
    if(!engine)throw new Error("計算エンジンが準備できていません。");
    if(data.kind==="seed"){
      if(!engine.init(data.width,data.height))throw new Error("対応していない盤面サイズです。");
      width=data.width;height=data.height;
      new Uint8Array(engine.memory.buffer,engine.image_ptr(),width*height*4).set(new Uint8Array(data.pixels));
      if(data.auto)engine.seed_auto(data.density??30,Number(data.dither),Number(data.invert));
      else engine.seed(data.thresholds[0],data.thresholds[1],data.thresholds[2],Number(data.dither),Number(data.invert));generation=0;
    }else if(data.kind==="step"){engine.step(Number(data.wrap));generation++;}
    if(width&&height)frame(data.id,data.mask);
  }catch(error){scope.postMessage({kind:"error",id:data.id,message:error instanceof Error?error.message:String(error)});}
};
