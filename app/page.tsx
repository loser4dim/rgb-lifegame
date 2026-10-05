"use client";
import { useEffect, useRef, useState } from "react";

type Engine = { memory: WebAssembly.Memory; init(w: number,h: number): number; image_ptr(): number; cells_ptr(): number; seed(r:number,g:number,b:number,dither:number,invert:number): void; step(wrap:number): void; render(mask:number): number };
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const names = ["RED", "GREEN", "BLUE"];
export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const previews = useRef<(HTMLCanvasElement | null)[]>([]);
  const engine = useRef<Engine | null>(null);
  const source = useRef<HTMLImageElement | null>(null);
  const gen = useRef(0);
  const running = useRef(false);
  const [ready,setReady] = useState(false);
  const [playing,setPlaying] = useState(false);
  const [generation,setGeneration] = useState(0);
  const [population,setPopulation] = useState([0,0,0]);
  const [width,setWidth] = useState(192);
  const [thresholds,setThresholds] = useState([127,127,127]);
  const [dither,setDither] = useState(true);
  const [invert,setInvert] = useState(false);
  const [wrap,setWrap] = useState(true);
  const [speed,setSpeed] = useState(12);
  const [layers,setLayers] = useState([true,true,true]);
  const [filename,setFilename] = useState("色の干渉 / sample image");
  const [sourceUrl,setSourceUrl] = useState(`${base}/seed.png`);
  const [error,setError] = useState("");
  const [dragging,setDragging] = useState(false);
  const settings = useRef({width,thresholds,dither,invert,wrap,speed,layers});
  settings.current = {width,thresholds,dither,invert,wrap,speed,layers};
  const fileInput = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);
  function pause() { running.current=false; setPlaying(false); }
  function draw() {
    const e=engine.current; if (!e) return;
    const w=settings.current.width, h=Math.round(w*2/3);
    const targets=[canvas.current,...previews.current];
    const masks=[settings.current.layers.reduce((m,v,i)=>m|(v?1<<i:0),0),1,2,4];
    targets.forEach((target,i)=>{ if (!target) return; target.width=w; target.height=h; const ptr=e.render(masks[i]); const pixels=new Uint8ClampedArray(w*h*4); pixels.set(new Uint8Array(e.memory.buffer,ptr,w*h*4)); target.getContext("2d")?.putImageData(new ImageData(pixels,w,h),0,0); });
    const cells=new Uint8Array(e.memory.buffer,e.cells_ptr(),w*h); const counts=[0,0,0];
    for (const cell of cells) for(let c=0;c<3;c++) if(cell&(1<<c)) counts[c]++;
    setPopulation(counts); setGeneration(gen.current);
  }
  function reset() {
    const e=engine.current, img=source.current; if(!e||!img) return;
    pause(); const s=settings.current,w=s.width,h=Math.round(w*2/3);
    e.init(w,h);
    const scratch=document.createElement("canvas"); scratch.width=w;scratch.height=h;
    const ctx=scratch.getContext("2d")!;
    ctx.fillStyle="black";ctx.fillRect(0,0,w,h);
    const scale=Math.min(w/img.naturalWidth,h/img.naturalHeight);
    const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;
    ctx.drawImage(img,(w-iw)/2,(h-ih)/2,iw,ih);
    new Uint8Array(e.memory.buffer,e.image_ptr(),w*h*4).set(ctx.getImageData(0,0,w,h).data);
    e.seed(s.thresholds[0],s.thresholds[1],s.thresholds[2],Number(s.dither),Number(s.invert));
    gen.current=0;draw();
  }
  async function loadImage(url:string, label:string) {
    const sequence=++loadSequence.current;
    const img=new Image();img.src=url;
    try { await img.decode(); if(sequence!==loadSequence.current)return;source.current=img;setFilename(label);setSourceUrl(url);setError("");reset(); }
    catch { if(sequence===loadSequence.current)setError("画像を読み込めませんでした。PNG・JPEG・WebPなどの画像を選んでください。"); }
  }
  async function upload(file?:File) {
    if(!file)return;
    if(!file.type.startsWith("image/")){setError("画像ファイルを選んでください。");return;}
    if(file.size>20*1024*1024){setError("20MB以下の画像を選んでください。");return;}
    pause();const reader=new FileReader();
    reader.onload=()=>void loadImage(String(reader.result),file.name);
    reader.onerror=()=>setError("ファイルを読み込めませんでした。");
    reader.readAsDataURL(file);
  }
  useEffect(()=>{
    let cancelled=false;
    async function start(){try{
      const response=await fetch(`${base}/wasm/rgb_life.wasm`);if(!response.ok)throw new Error("WASM");
      const {instance}=await WebAssembly.instantiate(await response.arrayBuffer(),{});
      if(cancelled)return;engine.current=instance.exports as unknown as Engine;setReady(true);
      await loadImage(`${base}/seed.png`,"色の干渉 / sample image");
    }catch{if(!cancelled)setError("計算エンジンを読み込めませんでした。ページを再読み込みしてください。");}}
    void start();return()=>{cancelled=true;running.current=false;};
  },[]);
  useEffect(()=>{reset();},[width,thresholds,dither,invert]);
  useEffect(()=>{draw();},[layers]);
  useEffect(()=>{
    let frame=0,last=0;
    function tick(time:number){if(running.current&&engine.current&&time-last>=1000/settings.current.speed){engine.current.step(Number(settings.current.wrap));gen.current++;draw();last=time;}frame=requestAnimationFrame(tick);}
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[]);
  function toggle(){running.current=!running.current;setPlaying(running.current);}
  function step(){pause();engine.current?.step(Number(wrap));gen.current++;draw();}
  function save(){const original=canvas.current;if(!original)return;const out=document.createElement("canvas");out.width=original.width*4;out.height=original.height*4;const ctx=out.getContext("2d")!;ctx.imageSmoothingEnabled=false;ctx.drawImage(original,0,0,out.width,out.height);const a=document.createElement("a");a.href=out.toDataURL("image/png");a.download=`rgb-life-${gen.current}.png`;a.click();}
  return <main>
    <header><a className="brand" href="#"><span className="mark"><i/><i/><i/></span> RGB LIFE <span className="brand-sub">CELLULAR LAB</span></a><span className="header-note">3 LAYERS / ONE WORLD</span></header>
    <section className="intro"><div><p className="eyebrow">IMAGE → CELLS → LIFE</p><h1>ひとつの画像から、<br/><span>三つの世界が動き出す。</span></h1><p className="description">赤・緑・青、それぞれに生まれるライフゲーム。<br/>重なり合う色の、その先を観察しよう。</p></div><div className="intro-side"><span className="tiny-label">THE RULE</span><p>B3 / S23</p><small>3で誕生。2・3で生存。<br/>RGBは独立して、同時に進む。</small></div></section>
    <section className="workspace">
      <div className="simulation"><div className="panel-head"><span><i className={playing?"status active":"status"}/>{playing?"RUNNING":"PAUSED"}</span><span>GEN <b>{generation.toString().padStart(5,"0")}</b></span></div>
      <div className="canvas-wrap"><canvas ref={canvas} aria-label="RGBを合成したライフゲームの現在の盤面"/>{!ready&&!error&&<div className="loading">計算エンジンを準備中…</div>}</div>
      <div className="transport"><button className="primary" disabled={!ready} onClick={toggle}>{playing?"一時停止":"再生する"}<span>{playing?"Ⅱ":"▷"}</span></button><button disabled={!ready} onClick={step}>1世代進める</button><button disabled={!ready} onClick={reset}>初期状態へ</button><button className="export" disabled={!ready} onClick={save}>PNG保存 ↗</button></div>
      <div className="speed-row"><label htmlFor="speed">進む速さ</label><input id="speed" type="range" min="1" max="60" value={speed} onChange={e=>setSpeed(+e.target.value)}/><span>{speed} <small>世代 / 秒</small></span></div>
      <div className="layer-grid">{names.map((name,i)=><article key={name} className={`layer layer-${i}`}><div className="layer-heading"><span>{name}</span><label><input type="checkbox" checked={layers[i]} onChange={e=>setLayers(layers.map((v,j)=>j===i?e.target.checked:v))}/><span>合成に表示</span></label></div><canvas ref={el=>{previews.current[i]=el;}} aria-label={`${name}レイヤーの盤面`}/><div className="layer-bottom"><span>ALIVE</span><strong>{population[i].toLocaleString()}</strong></div></article>)}</div>
      <p className="view-note">レイヤーの表示を切り替えても、3色の計算は同時に続きます。</p></div>
      <aside><section className="control-section"><div className="section-heading"><span className="section-number">01</span><h2>画像を種にする</h2></div><button className={`dropzone ${dragging?"dragging":""}`} onClick={()=>fileInput.current?.click()} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void upload(e.dataTransfer.files[0]);}}><span className="upload-symbol">＋</span><strong>画像を選ぶ / ドロップ</strong><small>PNG, JPEG, WebP など · 20MBまで</small></button><input ref={fileInput} type="file" accept="image/*" hidden onChange={e=>{void upload(e.target.files?.[0]);e.target.value="";}}/><div className="source-image"><img src={sourceUrl} alt="初期状態に使用する元画像"/><div><span className="tiny-label">SOURCE IMAGE</span><p title={filename}>{filename}</p><button className="text-button" onClick={()=>void loadImage(`${base}/seed.png`,"色の干渉 / sample image")}>サンプルに戻す ↗</button></div></div><p className="hint">画像は端末内で処理します。サーバーへの送信はありません。</p></section>
      <section className="control-section"><div className="section-heading"><span className="section-number">02</span><h2>生まれる条件</h2></div><p className="hint">各成分がしきい値を超えると、生きたセルに。<br/>変更すると第0世代から作り直します。</p>{names.map((name,i)=><div className={`threshold threshold-${i}`} key={name}><label htmlFor={`threshold-${i}`}>{name}<span>{thresholds[i]}</span></label><input id={`threshold-${i}`} type="range" min="0" max="255" value={thresholds[i]} onChange={e=>setThresholds(thresholds.map((v,j)=>j===i?+e.target.value:v))}/></div>)}<label className="check-row"><input type="checkbox" checked={dither} onChange={e=>setDither(e.target.checked)}/><span>ディザで濃淡を模様にする</span></label><label className="check-row"><input type="checkbox" checked={invert} onChange={e=>setInvert(e.target.checked)}/><span>明暗を反転する</span></label></section>
      <section className="control-section last"><div className="section-heading"><span className="section-number">03</span><h2>世界の設定</h2></div><label className="select-row" htmlFor="resolution">盤面の解像度<select id="resolution" value={width} onChange={e=>setWidth(+e.target.value)}><option value="96">96 × 64</option><option value="192">192 × 128</option><option value="384">384 × 256</option></select></label><label className="check-row"><input type="checkbox" checked={wrap} onChange={e=>setWrap(e.target.checked)}/><span>上下・左右の端をつなぐ</span></label><div className="color-key"><span>R + G = 黄</span><span>G + B = シアン</span><span>B + R = マゼンタ</span><span>R + G + B = 白</span></div></section>
      {error&&<p className="error" role="alert">{error}</p>}</aside>
    </section><footer><span>RGB LIFE <span className="footer-dash">/</span> THREE INDEPENDENT UNIVERSES.</span><span>Next.js 16.3.8 + Rust 1.99.0 / WebAssembly</span></footer>
  </main>;
}
