"use client";
import { useEffect, useRef, useState } from "react";
import type { Request, Response, Frame } from "../lib/life-protocol";
import { WASM_PATH } from "../lib/wasm-asset";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const names = ["RED", "GREEN", "BLUE"];
export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const previews = useRef<(HTMLCanvasElement | null)[]>([]);
  const worker = useRef<Worker | null>(null);
  const source = useRef<HTMLImageElement | null>(null);
  const running = useRef(false);
  const inFlight = useRef(false);
  const requestId = useRef(0);
  const initialized = useRef(false);
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [playing,setPlaying] = useState(false);
  const [generation,setGeneration] = useState(0);
  const [population,setPopulation] = useState([0,0,0]);
  const [width,setWidth] = useState(1920);
  const [thresholds,setThresholds] = useState([127,127,127]);
  const [auto,setAuto] = useState(true);
  const [density,setDensity] = useState(30);
  const [appliedThresholds,setAppliedThresholds] = useState([127,127,127]);
  const [dither,setDither] = useState(true);
  const [invert,setInvert] = useState(false);
  const [wrap,setWrap] = useState(true);
  const [speed,setSpeed] = useState(12);
  const [layers,setLayers] = useState([true,true,true]);
  const [filename,setFilename] = useState("色の干渉 / sample image");
  const [sourceUrl,setSourceUrl] = useState(`${base}/seed.png`);
  const [error,setError] = useState("");
  const [dragging,setDragging] = useState(false);
  const settings = useRef({width,thresholds,auto,density,dither,invert,wrap,speed,layers});
  settings.current = {width,thresholds,auto,density,dither,invert,wrap,speed,layers};
  const fileInput = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);
  function pause() { running.current=false; setPlaying(false); }
  function mask(){return settings.current.layers.reduce((m,v,i)=>m|(v?1<<i:0),0);}
  function post(data:Request, transfer:Transferable[]=[]){
    inFlight.current=true;setBusy(true);worker.current?.postMessage(data,transfer);
  }
  function draw(data:Frame) {
    const targets=[canvas.current,...previews.current];
    targets.forEach((target,i)=>{if(!target)return;
      const w=i===0?data.width:data.previewWidth,h=i===0?data.height:data.previewHeight;
      if(target.width!==w)target.width=w;if(target.height!==h)target.height=h;
      const buffer=i===0?data.pixels:data.previews[i-1];
      target.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(buffer),w,h),0,0);
    });
    setAppliedThresholds(data.appliedThresholds);setPopulation(data.population);setGeneration(data.generation);setReady(true);
  }
  function reset() {
    const img=source.current;if(!worker.current||!initialized.current||!img)return;
    pause();const s=settings.current,w=s.width,h=Math.round(w*9/16);
    const scratch=document.createElement("canvas");scratch.width=w;scratch.height=h;
    const ctx=scratch.getContext("2d")!;ctx.clearRect(0,0,w,h);
    const scale=Math.min(w/img.naturalWidth,h/img.naturalHeight);
    const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;
    ctx.drawImage(img,(w-iw)/2,(h-ih)/2,iw,ih);
    const pixels=ctx.getImageData(0,0,w,h).data.buffer as ArrayBuffer;
    post({kind:"seed",id:++requestId.current,width:w,height:h,pixels,thresholds:s.thresholds,auto:s.auto,density:s.density,dither:s.dither,invert:s.invert,mask:mask()},[pixels]);
  }
  async function loadImage(url:string,label:string){
    const sequence=++loadSequence.current;const img=new Image();img.src=url;
    try{await img.decode();if(sequence!==loadSequence.current)return;source.current=img;setFilename(label);setSourceUrl(url);setError("");reset();}
    catch{if(sequence===loadSequence.current)setError("画像を読み込めませんでした。PNG・JPEG・WebPなどの画像を選んでください。");}
  }
  async function upload(file?:File){
    if(!file)return;
    if(!file.type.startsWith("image/")){setError("画像ファイルを選んでください。");return;}
    if(file.size>20*1024*1024){setError("20MB以下の画像を選んでください。");return;}
    pause();const reader=new FileReader();
    reader.onload=()=>void loadImage(String(reader.result),file.name);
    reader.onerror=()=>setError("ファイルを読み込めませんでした。");reader.readAsDataURL(file);
  }
  useEffect(()=>{
    const w=new Worker(new URL("../lib/life.worker.ts",import.meta.url));worker.current=w;
    w.onmessage=({data}:MessageEvent<Response>)=>{
      if(worker.current!==w)return;
      if(data.kind==="ready"){initialized.current=true;void loadImage(`${base}/seed.png`,"色の干渉 / sample image");return;}
      if(data.id!==requestId.current)return;
      inFlight.current=false;setBusy(false);
      if(data.kind==="error"){pause();setError(data.message);return;}
      draw(data);
    };
    w.onerror=()=>{pause();inFlight.current=false;setBusy(false);setError("計算Workerを起動できませんでした。ページを再読み込みしてください。");};
    w.postMessage({kind:"boot",id:0,wasmUrl:`${base}${WASM_PATH}`} satisfies Request);
    return()=>{loadSequence.current++;w.terminate();worker.current=null;initialized.current=false;running.current=false;};
  },[]);
  useEffect(()=>{reset();},[width,thresholds,auto,density,dither,invert]);
  useEffect(()=>{if(worker.current&&initialized.current&&source.current)post({kind:"render",id:++requestId.current,mask:mask()});},[layers]);
  useEffect(()=>{
    let frame=0,last=0;
    function tick(time:number){
      if(running.current&&initialized.current&&!inFlight.current&&time-last>=1000/settings.current.speed){
        post({kind:"step",id:++requestId.current,wrap:settings.current.wrap,mask:mask()});last=time;
      }
      frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[]);
  function toggle(){running.current=!running.current;setPlaying(running.current);}
  function step(){pause();if(inFlight.current||!ready)return;post({kind:"step",id:++requestId.current,wrap:settings.current.wrap,mask:mask()});}
  function save(){const original=canvas.current;if(!original)return;const a=document.createElement("a");a.href=original.toDataURL("image/png");a.download=`rgb-life-${generation}-${original.width}x${original.height}.png`;a.click();}
  return <main>
    <header><a className="brand" href="#"><span className="mark"><i/><i/><i/></span> RGB LIFE <span className="brand-sub">CELLULAR LAB</span></a><span className="header-note">3 LAYERS / ONE WORLD</span></header>
    <section className="intro"><div><p className="eyebrow">IMAGE → CELLS → LIFE</p><h1>ひとつの画像から、<br/><span>三つの世界が動き出す。</span></h1><p className="description">赤・緑・青、それぞれに生まれるライフゲーム。<br/>重なり合う色の、その先を観察しよう。</p></div><div className="intro-side"><span className="tiny-label">THE RULE</span><p>B3 / S23</p><small>3で誕生。2・3で生存。<br/>RGBは独立して、同時に進む。</small></div></section>
    <section className="workspace">
      <div className="simulation"><div className="panel-head"><span><i className={playing?"status active":"status"}/>{playing?"RUNNING":"PAUSED"}</span><span>GEN <b>{generation.toString().padStart(5,"0")}</b></span></div>
      <div className="canvas-wrap"><canvas ref={canvas} aria-label="RGBを合成したライフゲームの現在の盤面"/>{!ready&&!error&&<div className="loading">計算エンジンを準備中…</div>}</div>
      <div className="transport"><button className="primary" disabled={!ready} onClick={toggle}>{playing?"一時停止":"再生する"}<span>{playing?"Ⅱ":"▷"}</span></button><button disabled={!ready || busy} onClick={step}>1世代進める</button><button disabled={!ready} onClick={reset}>初期状態へ</button><button className="export" disabled={!ready} onClick={save}>PNG保存 ↗</button></div>
      <div className="speed-row"><label htmlFor="speed">進む速さ</label><input id="speed" type="range" min="1" max="60" value={speed} onChange={e=>setSpeed(+e.target.value)}/><span>{speed} <small>世代 / 秒</small></span></div>
      <div className="layer-grid">{names.map((name,i)=><article key={name} className={`layer layer-${i}`}><div className="layer-heading"><span>{name}</span><label><input type="checkbox" checked={layers[i]} onChange={e=>setLayers(layers.map((v,j)=>j===i?e.target.checked:v))}/><span>合成に表示</span></label></div><canvas ref={el=>{previews.current[i]=el;}} aria-label={`${name}レイヤーの盤面`}/><div className="layer-bottom"><span>ALIVE</span><strong>{population[i].toLocaleString()}</strong></div></article>)}</div>
      <p className="view-note">盤面は1920×1080セルまで対応。速度は目標値で、実際の速度は端末の性能によって変わります。</p></div>
      <aside><section className="control-section"><div className="section-heading"><span className="section-number">01</span><h2>画像を種にする</h2></div><button className={`dropzone ${dragging?"dragging":""}`} onClick={()=>fileInput.current?.click()} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void upload(e.dataTransfer.files[0]);}}><span className="upload-symbol">＋</span><strong>画像を選ぶ / ドロップ</strong><small>PNG, JPEG, WebP など · 20MBまで</small></button><input ref={fileInput} type="file" accept="image/*" hidden onChange={e=>{void upload(e.target.files?.[0]);e.target.value="";}}/><div className="source-image"><img src={sourceUrl} alt="初期状態に使用する元画像"/><div><span className="tiny-label">SOURCE IMAGE</span><p title={filename}>{filename}</p><button className="text-button" onClick={()=>void loadImage(`${base}/seed.png`,"色の干渉 / sample image")}>サンプルに戻す ↗</button></div></div><p className="hint">画像は端末内で処理します。サーバーへの送信はありません。</p></section>
      <section className="control-section"><div className="section-heading"><span className="section-number">02</span><h2>生まれる条件</h2></div><p className="hint">画像の明るさに合わせて、各色の初期セル数を調整。<br/>変更すると第0世代から作り直します。</p><label className="check-row"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/><span>しきい値を画像に合わせて自動調整</span></label>{auto&&<><div className="threshold"><label htmlFor="density">初期密度の目安<span>{density}% / 色</span></label><input id="density" type="range" min="5" max="70" value={density} onChange={e=>setDensity(+e.target.value)}/></div><p className="hint">色ごとの明るさ分布から算出。余白は除外します。<br/>自動しきい値: {names.map((n,i)=>`${n} ${appliedThresholds[i]>383?"信号なし":appliedThresholds[i]}`).join(" / ")}<br/>同じ明るさが多い画像では、密度は目安になります。</p></>}{!auto&&names.map((name,i)=><div className={`threshold threshold-${i}`} key={name}><label htmlFor={`threshold-${i}`}>{name}<span>{thresholds[i]}</span></label><input id={`threshold-${i}`} type="range" min="0" max="255" value={thresholds[i]} onChange={e=>setThresholds(thresholds.map((v,j)=>j===i?+e.target.value:v))}/></div>)}<label className="check-row"><input type="checkbox" checked={dither} onChange={e=>setDither(e.target.checked)}/><span>ディザで濃淡を模様にする</span></label><label className="check-row"><input type="checkbox" checked={invert} onChange={e=>setInvert(e.target.checked)}/><span>明暗を反転する</span></label></section>
      <section className="control-section last"><div className="section-heading"><span className="section-number">03</span><h2>世界の設定</h2></div><label className="select-row" htmlFor="resolution">盤面の解像度<select id="resolution" value={width} onChange={e=>setWidth(+e.target.value)}><option value="640">640 × 360</option><option value="1280">1280 × 720</option><option value="1920">1920 × 1080 · Full HD</option></select></label><label className="check-row"><input type="checkbox" checked={wrap} onChange={e=>setWrap(e.target.checked)}/><span>上下・左右の端をつなぐ</span></label><div className="color-key"><span>R + G = 黄</span><span>G + B = シアン</span><span>B + R = マゼンタ</span><span>R + G + B = 白</span></div></section>
      {error&&<p className="error" role="alert">{error}</p>}</aside>
    </section><footer><span>RGB LIFE <span className="footer-dash">/</span> THREE INDEPENDENT UNIVERSES.</span><span>Next.js 16.3.8 + Rust 1.99.0 / WebAssembly</span></footer>
  </main>;
}
