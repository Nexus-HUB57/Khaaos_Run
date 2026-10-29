const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
 const browser = await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page = await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1.5});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error' && /Shader|WebGL|THREE/.test(m.text())) errors.push(m.text())});
 const results=[];
 for (const scenario of ['CIGKV','Barburhen','Priadus','Ckesalth','Arukheea']) {
  await page.goto(`${process.env.KR_TEST_URL || 'http://localhost:5173'}/?q=medium&scenario=${scenario}#GRAPHICS-AUDIT-01`);
  await page.waitForFunction(()=>window.KhaaosReplay3D?.game?.scene,{timeout:60000});
  const r=await page.evaluate(()=>{
   const g=window.KhaaosReplay3D.game;
   if(!g.post) throw Error('Pós-FX indisponível');
   const initial=g.post.composer.renderTarget1.width;
   g.drsScale=.55;g.applyRenderScale();
   const expected=Math.floor(innerWidth*g.renderer.getPixelRatio());
   const actual=Math.floor(g.post.composer.renderTarget1.width);
   if(actual!==expected)throw Error(`DRS ${actual} != ${expected}`);
   if(initial<=actual) throw Error('DRS não reduziu buffer');
   g.camera.position.set(105,90,155);g.camera.lookAt(0,0,0);g.post.render(0);
   return {scenario:g.scenario.id,initial,drsWidth:actual,expected,passes:g.post.composer.passes.length,aa:!!g.post.aa};
  });
  results.push(r);
  if(scenario==='Arukheea') await page.screenshot({path:'browser-runtime.png'});
 }
 const lifecycle=await page.evaluate(()=>{
   const g=window.KhaaosReplay3D.game;const old=g.post;let disposed=0;
   for(const p of old.composer.passes){const fn=p.dispose?.bind(p);p.dispose=()=>{disposed++;fn?.()};}
   g.rebuildPost();old.dispose();
   if(disposed!==5) throw Error('Descarte não idempotente '+disposed);
   g.applyTierRuntime('high');if(!g.post?.ssr)throw Error('SSR high ausente');
   g.drsScale=.55;g.applyRenderScale();g.post.render(0);
   const ssrSize={width:g.post.ssr.width,height:g.post.ssr.height};
   g.applyTierRuntime('low');if(g.post!==null)throw Error('Low criou composer');
   g.renderer.render(g.scene,g.camera);
   return {disposed,ssrSize,lowDirect:true};
 });
 await page.setViewportSize({width:800,height:600});
 await page.waitForTimeout(250);
 fs.writeFileSync('browser-results.json',JSON.stringify({environment:'Chromium headless / SwiftShader (não é benchmark mobile)',results,lifecycle,errors},null,2));
 await browser.close();if(errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
