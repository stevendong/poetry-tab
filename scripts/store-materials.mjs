import {chromium} from 'playwright';
import {readFile,writeFile,mkdir,mkdtemp,rm,readdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createZip} from './zip.mjs';
const root=new URL('../',import.meta.url).pathname;
const out=root+'artifacts/store-materials/';
await mkdir(out,{recursive:true});
await copyFile(root+'extension/assets/icons/icon128.png',out+'store-icon-128.png');
const profile=await mkdtemp('/tmp/yijian-materials-');
const browser=await chromium.launchPersistentContext(profile,{
 executablePath:process.env.CHROME_PATH || '/home/ubuntu/.cache/puppeteer/chrome/linux-153.0.8010.12/chrome-linux64/chrome',
 headless:true,viewport:{width:1280,height:800},
 args:['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=3','--load-extension='+root+'dist/poetry-tab','--disable-extensions-except='+root+'dist/poetry-tab']
});
const files=[]; const errors=[];
try{
 const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker');
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await worker.evaluate(async()=>chrome.storage.local.set({settings:{onlineEnabled:false},favorites:['autumn-maple','spring-river','winter-tea'],history:['autumn-fruit','clouds','autumn-stream','forest']}));
 async function ready(){await page.waitForSelector('#art.loaded');await page.waitForFunction(()=>document.querySelector('#poetry').getAttribute('aria-busy')==='false');await page.evaluate(()=>document.fonts.ready);}
 async function shot(name){await page.screenshot({path:out+name,type:'jpeg',quality:93,animations:'disabled'});files.push(name);}
 await page.goto('chrome://newtab/');await ready();
 await page.locator('#library-button').click();
 await page.locator('.saved-quote').filter({hasText:'山行'}).click();
 await page.waitForFunction(()=>document.body.dataset.quote==='autumn-maple');await ready();
 await shot('01-newtab-1280x800.jpg');
 await page.locator('#read-button').click();await shot('02-reading-1280x800.jpg');
 await page.locator('#reading-dialog [data-close]').click();
 await worker.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,onlineEnabled:true}});await chrome.storage.local.remove(['onlineState','history']);});
 await page.reload();await ready();
 try {await page.waitForFunction(()=>document.body.dataset.quote?.startsWith('online:'),null,{timeout:12000});}
 catch(error){console.log('Online diagnostics',await worker.evaluate(async()=>{const {settings,onlineState}=await chrome.storage.local.get(['settings','onlineState']);return {onlineEnabled:settings?.onlineEnabled,cacheStatus:onlineState?.status,hasQuote:!!onlineState?.quote};}));throw error;}
 await ready();
 const online={quoteId:await page.getAttribute('body','data-quote'),verse:await page.locator('#verse').innerText(),source:await page.locator('#content-source').innerText()};
 await shot('03-online-1280x800.jpg');
 await page.locator('#favorite-button').click();await page.locator('#favorite-button[aria-pressed="true"]').waitFor();
 await page.locator('#library-button').click();await shot('04-favorites-1280x800.jpg');
 await page.locator('#library-dialog [data-close]').click();
 await page.locator('#settings-button').click();await shot('05-settings-1280x800.jpg');
 await page.locator('#settings-dialog [data-close]').click();
 await page.getByRole('button',{name:'打开万年历'}).click();
 await page.locator('#calendar-dialog[open]').waitFor();await shot('06-calendar-1280x800.jpg');
 const promo=await browser.newPage();
 const art=(await readFile(root+'extension/assets/art/autumn-maple.webp')).toString('base64');
 const icon=(await readFile(root+'extension/assets/icons/icon.svg')).toString('base64');
 const fontName=(await readdir(root+'extension/assets/fonts/')).find(v=>v.endsWith('.ttf'));
 const font=(await readFile(root+'extension/assets/fonts/'+fontName)).toString('base64');
 for(const [name,w,h] of [['promo-small-440x280.png',440,280],['promo-marquee-1400x560.png',1400,560]]){
 await promo.setViewportSize({width:w,height:h});
 await promo.setContent(`<style>@font-face{font-family:Poetry;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}body{margin:0;background:#192c28;color:#faf0dd;font-family:Poetry,serif}.canvas{height:100vh;position:relative;overflow:hidden;display:flex;align-items:center;padding:9%}.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:68% 48%}.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,28,23,.93),rgba(10,28,23,.58) 47%,rgba(10,28,23,.08))}.copy{position:relative}img.logo{width:${w===440?55:86}px;margin-left:-8px;margin-bottom:6px}.name{font-size:${w===440?45:92}px;letter-spacing:.16em;margin:0 0 8px}.tag{font-size:${w===440?20:38}px;letter-spacing:.08em;margin:0}.note{font-family:system-ui;font-size:${w===440?11:18}px;letter-spacing:.12em;margin-top:${w===440?18:30}px;color:#ded2b7}</style><div class="canvas"><img class="art" src="data:image/webp;base64,${art}"><div class="shade"></div><div class="copy"><img class="logo" src="data:image/svg+xml;base64,${icon}"><p class="name">一笺</p><p class="tag">打开一页，遇见诗意</p><p class="note">诗词 · 意境插画 · 新标签页</p></div></div>`);
 await promo.evaluate(()=>document.fonts.ready);
 await promo.screenshot({path:out+name,animations:'disabled'});files.push(name);
 }
 files.unshift('store-icon-128.png');
 const entries=await Promise.all(files.map(async name=>({name,bytes:await readFile(out+name)})));
 await writeFile(out+'yijian-store-images-v0.2.1.zip',createZip(entries));
 const manifest={version:'0.2.1',screenshots:{width:1280,height:800,source:'Actual installed packaged Chrome extension'},online,errors,files:entries.map(e=>({name:e.name,bytes:e.bytes.length,sha256:createHash('sha256').update(e.bytes).digest('hex')}))};
 await writeFile(out+'materials-manifest.json',JSON.stringify(manifest,null,2));
 console.log(JSON.stringify(manifest,null,2));
 if(errors.length)throw new Error('Page errors');
}finally{await browser.close();await rm(profile,{recursive:true,force:true});}
