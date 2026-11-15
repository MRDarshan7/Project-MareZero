import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const out='docs/screens', quick=process.argv.includes('--quick'), refresh=process.argv.includes('--handoff-only'), storyOnly=process.argv.includes('--story-only');
await fs.mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox','--enable-webgl','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const reports=refresh||storyOnly ? JSON.parse(await fs.readFile(out+'/verification.json','utf8')).reports.filter(r=>storyOnly ? r.file&&!/^(intro-|handoff-)/.test(r.file) : !r.file?.startsWith('handoff-')) : [],errors=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try {
 for(const [width,height] of [[1440,900],[390,844]]) {
  const page=await browser.newPage();
  page.setDefaultNavigationTimeout(90000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await page.setViewport({width,height,deviceScaleFactor:1,isMobile:width<500,hasTouch:width<500});
  const click=async text=>page.evaluate(text=>{const b=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim()===text);if(!b)throw Error('Missing '+text);b.click();},text);
  const load=async query=>{await page.goto('http://127.0.0.1:5173/'+query,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.__lunarDebug?.snapshot().p!==undefined,{timeout:90000});await page.evaluate(()=>document.fonts.ready);await pause(300);};
  const shot=async(name,fullPage=false)=>{
   const skip=await page.evaluate(()=>{const e=document.querySelector('.story-skip');if(!e)return null;const s=getComputedStyle(e);return {rect:e.getBoundingClientRect().toJSON(),visibility:s.visibility,opacity:s.opacity,color:s.color,position:s.position,text:e.textContent,viewport:{top:visualViewport.offsetTop,page:visualViewport.pageTop,scale:visualViewport.scale}};});
   const audit=await page.evaluate(()=>({pageWidth:document.documentElement.scrollWidth,width:innerWidth,canvas:document.querySelectorAll('.shared-scene-canvas').length,badText:/709h|LOLA|NASA JPL|NASA HACKATHON|Occlusion Suite|mission-grade/i.test(document.body.innerText),badStyles:[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().height&&getComputedStyle(e).visibility==='visible').filter(e=>{const s=getComputedStyle(e);return s.backgroundImage.includes('gradient')||s.boxShadow!=='none'||(s.backdropFilter&&s.backdropFilter!=='none');}).map(e=>e.tagName+'.'+e.className),state:window.__lunarDebug.snapshot()}));
   if(audit.pageWidth>width||audit.badText||audit.badStyles.length)throw Error(JSON.stringify(audit));
   const file=`${name}-${width}x${height}.png`;
   await page.screenshot({path:path.join(out,file),fullPage}); reports.push({file,skip,...audit}); await fs.writeFile(out+'/verification.json',JSON.stringify({reports,errors},null,2));console.log(file);
  };
  await load('?story=1&debug=1');
  if(refresh){
   await page.evaluate(()=>{window.__lunarDebug.holdHandoff(true);window.__lunarDebug.setProgress(1);});await pause(250);
   await page.evaluate(()=>{window.__lunarDebug.holdHandoff(false);window.__lunarDebug.setProgress(1);});await page.waitForSelector('.at-dashboard');await pause(300);
   await shot('handoff');
   const visibleOverlays=await page.$$eval('.dome-labels',els=>els.filter(e=>getComputedStyle(e).visibility==='visible').length);
   if(visibleOverlays!==1)throw Error('Duplicate labels at handoff');
   for(const view of ['Dome','Panorama','Both']){await click(view);await pause(300);const aligned=await page.evaluate(()=>{const c=document.querySelector('.shared-scene-canvas');return !c.clientWidth||c.width===Math.round(c.clientWidth*Math.min(devicePixelRatio,2));});if(!aligned)throw Error('Canvas not resized for '+view);}
   reports.push({width,handoffSingleOverlay:true,viewToggleResize:true});await page.close();continue;
  }
  await page.evaluate(()=>window.__lunarDebug.holdHandoff(true));
  for(const p of quick?[0]:[0,.25,.45,.78,1]){await page.evaluate(p=>window.__lunarDebug.setProgress(p),p);await pause(250);await shot('intro-p'+p.toFixed(2));}
  if(!quick){
   const move=async p=>{await page.evaluate(p=>{const t=document.querySelector('.intro-track');window.scrollTo(0,p*(t.offsetHeight-innerHeight));},p);await page.waitForFunction(()=>Math.abs(window.__lunarDebug.snapshot().p-window.__lunarDebug.snapshot().target)<1e-10);await pause(80);};
   await move(.3);const before=await page.evaluate(()=>window.__lunarDebug.snapshot());const a=await page.screenshot();await move(.6);await move(0);await move(.3);const after=await page.evaluate(()=>window.__lunarDebug.snapshot());const b=await page.screenshot();
   const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
   const equal=hash(a)===hash(b)&&JSON.stringify(before.lander)===JSON.stringify(after.lander)&&JSON.stringify(before.camera)===JSON.stringify(after.camera);
   reports.push({width,reverseIdentical:equal,hashBefore:hash(a),hashAfter:hash(b)});if(!equal){await fs.writeFile('node_modules/.lunar-visual-baseline/reverse-before.png',a);await fs.writeFile('node_modules/.lunar-visual-baseline/reverse-after.png',b);throw Error('Reverse frame mismatch '+JSON.stringify({before,after}));}
   await fs.writeFile(`${out}/reverse-p0.30-${width}x${height}.png`,b);
   const beforeHandoff=await page.evaluate(()=>{window.__savedCanvas=document.querySelector('.shared-scene-canvas');return window.__lunarDebug.snapshot();});
   await page.evaluate(()=>{window.__lunarDebug.holdHandoff(false);window.__lunarDebug.setProgress(1);});await page.waitForSelector('.at-dashboard');await pause(250);await shot('handoff');
   const afterHandoff=await page.evaluate(()=>({...window.__lunarDebug.snapshot(),sameCanvas:window.__savedCanvas===document.querySelector('.shared-scene-canvas')}));
   if(!afterHandoff.sameCanvas||beforeHandoff.site!==afterHandoff.site||beforeHandoff.date!==afterHandoff.date)throw Error('Handoff continuity failed');reports.push({width,handoffSameCanvasSiteDate:true});
   await move(.78);await page.waitForSelector('.in-story');
   if(storyOnly){
    await click('Skip to the dashboard');await page.waitForSelector('.at-dashboard');
    for(const view of ['Dome','Panorama','Both']){await click(view);await pause(300);const aligned=await page.evaluate(()=>{const c=document.querySelector('.shared-scene-canvas');return !c.clientWidth||c.width===Math.round(c.clientWidth*Math.min(devicePixelRatio,2));});if(!aligned)throw Error('Canvas not resized for '+view);}
    if(await page.$$eval('.dome-labels',els=>els.filter(e=>getComputedStyle(e).visibility==='visible').length)!==1)throw Error('Duplicate dome labels');
    reports.push({width,viewToggleResize:true,handoffSingleOverlay:true});
    await load('?debug=1');await page.waitForSelector('.at-dashboard');reports.push({width,sessionChoice:true});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.evaluateOnNewDocument(()=>{Storage.prototype.getItem=Storage.prototype.setItem=Storage.prototype.removeItem=()=>{throw new Error('Storage unavailable');};});
    await load('?debug=1');await page.waitForSelector('.in-story');await click('Enter the dashboard');await page.waitForSelector('.at-dashboard');
    if(!await page.$('[aria-label="Play playback"]'))throw Error('Playback should be paused');
    reports.push({width,storageUnavailable:true,reducedMotionPaused:true});
    await page.close();continue;
   }
  }
  await click('Skip to the dashboard');await page.waitForSelector('.at-dashboard');await pause(350);
  if(width<500)await click('Both'); await pause(250);await shot('dashboard-both');if(width<500)await shot('dashboard-both-full',true);
  if(!quick){
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.at-dashboard');reports.push({width,sessionChoice:true});
   for(const [name,query] of [['sun-hidden','site=shackleton-connecting-ridge&date=2026-07-03T12:00:00Z'],['earth-never-visible','site=change-4&date=2026-01-18T00:00:00Z'],['technical','']]){
    await load('?skip=1&debug=1&'+query);if(width<500)await click('Both');if(name==='technical')await page.click('.technical-toggle input');await pause(300);await shot(name);if(width<500||name==='technical')await shot(name+'-full',true);
   }
  }
  if(!quick){
   await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
   await page.evaluateOnNewDocument(()=>{Storage.prototype.getItem=Storage.prototype.setItem=Storage.prototype.removeItem=()=>{throw new Error('Storage unavailable');};});
   await load('?debug=1');await page.waitForSelector('.in-story');await click('Enter the dashboard');await page.waitForSelector('.at-dashboard');
   if(!await page.$('[aria-label="Play playback"]'))throw Error('Playback should be paused');
   reports.push({width,storageUnavailable:true,reducedMotionPaused:true});
  }
  await page.close();
 }
 if(errors.length)throw Error(JSON.stringify(errors));
 await fs.writeFile(out+'/verification.json',JSON.stringify({reports,errors},null,2));
}finally{await browser.close();}
