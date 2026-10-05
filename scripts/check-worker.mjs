import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
const source=stripTypeScriptTypes(readFileSync("lib/life.worker.ts","utf8"),{mode:"strip"}).replace(/export\s*\{\s*\};?/g,"");
const messages=[];
const scope={postMessage(message,transfer=[]){messages.push({message,transfer});}};
runInNewContext(source,{self:scope,WebAssembly,Uint8Array,fetch:async()=>({ok:true,arrayBuffer:async()=>readFileSync("public/wasm/rgb_life.wasm")})});
await scope.onmessage({data:{kind:"boot",id:0,wasmUrl:"test"}});
assert.equal(messages.pop().message.kind,"ready");
const width=1920,height=1080,pixels=new Uint8Array(width*height*4);
for(const x of [10,11,12]){const i=(10*width+x)*4;pixels[i]=255;pixels[i+1]=255;pixels[i+3]=255;}
await scope.onmessage({data:{kind:"seed",id:1,width,height,pixels:pixels.buffer,thresholds:[127,127,127],dither:false,invert:false,mask:7}});
let result=messages.pop();assert.equal(result.message.kind,"frame");assert.equal(result.message.generation,0);assert.deepEqual([...result.message.population],[3,3,0]);assert.equal(result.message.pixels.byteLength,width*height*4);assert.equal(result.message.previewWidth,320);assert.equal(result.message.previewHeight,180);assert.equal(result.transfer.length,4);
await scope.onmessage({data:{kind:"step",id:2,wrap:true,mask:7}});
result=messages.pop();assert.equal(result.message.generation,1);assert.deepEqual([...result.message.population],[3,3,0]);
const image=new Uint8Array(result.message.pixels);assert.deepEqual([...image.slice((9*width+11)*4,(9*width+11)*4+4)],[255,255,0,255]);
await scope.onmessage({data:{kind:"render",id:3,mask:4}});
result=messages.pop();assert.equal(result.message.generation,1);assert.equal(new Uint8Array(result.message.pixels).filter((v,i)=>i%4!==3).every(v=>v===0),true);
console.log("Full-HD worker protocol passed: boot, image seed, independent RGB, transferred frame buffers, 320×180 previews, step, layer render.");

const darkW=320,darkH=180,dark=new Uint8Array(darkW*darkH*4);
for(let y=0;y<darkH;y++)for(let x=0;x<darkW/2;x++){
 const i=(y*darkW+x)*4;dark[i]=5+x%35;dark[i+1]=2+y%25;dark[i+3]=255;
}
await scope.onmessage({data:{kind:"seed",id:4,width:darkW,height:darkH,pixels:dark.buffer,thresholds:[127,127,127],dither:true,invert:false,mask:7}});
result=messages.pop();assert.deepEqual([...result.message.population],[0,0,0]);
await scope.onmessage({data:{kind:"seed",id:5,width:darkW,height:darkH,pixels:dark.buffer,thresholds:[127,127,127],auto:true,density:30,dither:true,invert:false,mask:7}});
result=messages.pop();assert.equal(result.message.kind,"frame");
const eligible=darkW/2*darkH;
for(const n of result.message.population.slice(0,2))assert.ok(Math.abs(n/eligible-.30)<.02);
assert.equal(result.message.population[2],0);
const autoPixels=new Uint8Array(result.message.pixels);
for(let y=0;y<darkH;y++)for(let x=darkW/2;x<darkW;x++){const i=(y*darkW+x)*4;assert.equal(autoPixels[i]|autoPixels[i+1]|autoPixels[i+2],0);}
await scope.onmessage({data:{kind:"seed",id:6,width:darkW,height:darkH,pixels:dark.buffer,thresholds:[127,127,127],auto:true,density:50,dither:true,invert:false,mask:7}});
const denser=messages.pop();assert.ok(denser.message.population[0]>result.message.population[0]);
console.log("Dark-image auto density passed: 0 manual → about 30% per nonempty channel, density control, empty blue channel, transparent padding.");
