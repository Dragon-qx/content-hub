const WebSocket = require('ws');
const http = require('http');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
function getJSON(url){return new Promise((res,rej)=>{http.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej)})}
async function main(){
  const email=`fl_${Date.now()}@example.com`;
  const reg=JSON.parse(execSync(`curl.exe -s -X POST -H "Content-Type: application/json" -d "{\"email\":\"${email}\",\"name\":\"Flow\",\"password\":\"TestPass123\"}" "http://localhost/api/v1/auth/register"`,{encoding:'utf8'}));
  const token=reg.accessToken;
  const edge=String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
  const prof='C:\\Users\\Administrator\\flowtest';
  if(fs.existsSync(prof))fs.rmSync(prof,{recursive:true,force:true});
  const proc=spawn(edge,['--headless=new','--disable-gpu','--no-sandbox','--remote-debugging-port=9228','--user-data-dir='+prof,'about:blank']);
  await new Promise(r=>setTimeout(r,4000));
  const targets=await getJSON('http://127.0.0.1:9228/json');
  const page=targets.find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  let id=1;const pen={};const logs=[];
  ws.on('message',d=>{const m=JSON.parse(d);if(m.id&&pen[m.id]){pen[m.id](m);delete pen[m.id];}});
  const send=(method,params)=>new Promise(r=>{const i=id++;pen[i]=r;ws.send(JSON.stringify({id:i,method,params:params||{}}));});
  await new Promise(r=>ws.on('open',r));
  await send('Runtime.enable');await send('Network.enable');await send('Log.enable');
  ws.on('message',d=>{
    const m=JSON.parse(d);
    if(m.method==='Network.responseReceived'&&m.params.response.url.includes('/api/'))logs.push(`RES ${m.params.response.status} ${m.params.response.url}`);
    if(m.method==='Network.requestWillBeSent'&&m.params.request.url.includes('/api/')&&m.params.request.method==='POST')logs.push(`REQ ${m.params.request.method} ${m.params.request.url} body=${m.params.request.postData}`);
    if(m.method==='Runtime.exceptionThrown')logs.push(`EXC ${m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text}`);
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')logs.push(`ERR ${m.params.args.map(a=>a.value||a.description||'').join(' ')}`);
    if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')logs.push(`LOG.ERR ${m.params.entry.text}`);
  });
  const evalJS = async (expr) => { const r = await send('Runtime.evaluate',{expression:expr}); return r?.result?.result?.value; };
  const wait = (ms) => new Promise(r=>setTimeout(r,ms));

  // Login
  await send('Page.navigate',{url:'http://localhost/login'});
  await wait(2000);
  await evalJS(`localStorage.setItem('accessToken','${token}');localStorage.setItem('refreshToken','x');`);

  // === TEAMS: create a team ===
  console.log('\n=== TEST: Create team ===');
  await send('Page.navigate',{url:'http://localhost/teams'});
  await wait(6000);
  let body = await evalJS(`document.body.innerText.slice(0,400).replace(/\\s+/g,' ').trim()`);
  console.log('Before create:', body.slice(0,150));
  // click + New team
  await evalJS(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('新建团队'))?.click()||'none'`);
  await wait(1500);
  // fill form
  await evalJS(`(function(){
    const I=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    const inputs=document.querySelectorAll('input,textarea');
    for(const i of inputs){if(i.placeholder&&(i.placeholder.includes('名称')||i.placeholder.includes('name'))){I.call(i,'TestTeam_'+Date.now());i.dispatchEvent(new Event('input',{bubbles:true}));}}
    return inputs.length;
  })()`);
  await wait(500);
  // submit
  await evalJS(`Array.from(document.querySelectorAll('button')).find(b=>b.type==='submit'||b.textContent.includes('创建团队'))?.click()||'none'`);
  await wait(3000);
  body = await evalJS(`document.body.innerText.slice(0,500).replace(/\\s+/g,' ').trim()`);
  console.log('After create:', body.slice(0,200));

  // === ACCOUNTS: bind ===
  console.log('\n=== TEST: Bind account ===');
  await send('Page.navigate',{url:'http://localhost/accounts'});
  await wait(6000);
  await evalJS(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('绑定账号'))?.click()||'none'`);
  await wait(2000);
  // fill
  await evalJS(`(function(){
    const I=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    const fields={};
    document.querySelectorAll('input').forEach(i=>{
      const ph=i.placeholder||'';
      if(ph.includes('账号')&&!ph.includes('App')&&!ph.includes('ID')){I.call(i,'wx_'+Date.now());i.dispatchEvent(new Event('input',{bubbles:true}));fields.account=ph;}
      else if(ph.includes('名称')){I.call(i,'TName');i.dispatchEvent(new Event('input',{bubbles:true}));fields.name=ph;}
      else if(ph.includes('App ID')||ph.includes('AppID')||ph.includes('Key')){I.call(i,'app123');i.dispatchEvent(new Event('input',{bubbles:true}));fields.app=ph;}
      else if(ph.includes('Secret')||ph.includes('密码')||ph.includes('secret')){I.call(i,'sec456');i.dispatchEvent(new Event('input',{bubbles:true}));fields.sec=ph;}
    });
    return JSON.stringify(fields);
  })()`);
  await wait(500);
  // submit
  await evalJS(`Array.from(document.querySelectorAll('button')).find(b=>b.type==='submit'||(b.textContent.includes('绑定')&&b.textContent.includes('账号')))?.click()||'none'`);
  await wait(4000);
  body = await evalJS(`document.body.innerText.slice(0,600).replace(/\\s+/g,' ').trim()`);
  console.log('After bind:', body.slice(0,250));

  console.log('\n=== NETWORK/ERROR LOGS ===');
  logs.forEach(l=>console.log(l));
  ws.close();proc.kill();process.exit(0);
}
main();
