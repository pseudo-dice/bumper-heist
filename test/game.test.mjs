import {request} from 'node:http';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {start,tick,collide,active} from '../physics.mjs';
import {server,rooms} from '../server.mjs';
function room(n=2){return {phase:'lobby',players:Array.from({length:n},(_,i)=>({id:String(i),name:'P'+i,connected:true,r:20,m:1,input:{x:0,y:0},inputAt:0}))};}
function aimAtGoal(r,index=0,body=r.ball){const a=r.teams[index].angle;body.x=400+Math.cos(a)*(r.arena.radius-body.r-1);body.y=400+Math.sin(a)*(r.arena.radius-body.r-1);body.vx=Math.cos(a)*100;body.vy=Math.sin(a)*100;}
test('all player counts choose balanced teams or solo goals and larger arenas',()=>{let last=0;for(let n=2;n<=8;n++){const r=room(n);start(r);assert.equal(r.arena.teamMode,n%2===0);assert.equal(r.teams.length,n%2===0?2:n);assert.ok(r.arena.radius>340);assert.ok(r.arena.radius>last);last=r.arena.radius;for(const t of r.teams)assert.equal(r.players.filter(p=>p.teamId===t.id).length,n%2===0?n/2:1);}});
test('team goals share points and finish at five',()=>{const r=room(4);start(r);for(let i=0;i<5;i++){r.pause=0;aimAtGoal(r);tick(r,1/60);}assert.equal(r.teams[0].score,5);assert.equal(r.players[0].score,5);assert.equal(r.players[2].score,5);assert.equal(r.players[1].score,0);assert.equal(r.winner,'blue');assert.equal(r.phase,'finished');});
test('solo timer ties keep only leaders in sudden death',()=>{const r=room(3);start(r);r.teams[0].score=r.teams[1].score=2;r.teams[2].score=1;r.remaining=.001;r.pause=0;tick(r,1/60);assert.deepEqual(r.finalists,['0','1']);assert.equal(active(r).length,2);r.pause=0;aimAtGoal(r);tick(r,1/60);assert.equal(r.winner,'0');});
test('team sudden death keeps the whole crews; mode locks after disconnect',()=>{const r=room(6);start(r);r.players[5].connected=false;r.remaining=.001;r.pause=0;tick(r,1/60);assert.equal(r.arena.teamMode,true);assert.equal(r.teams.length,2);assert.equal(active(r).length,6);r.pause=0;aimAtGoal(r,1);tick(r,1/60);assert.equal(r.winner,'orange');});
test('a decoy entering a goal does not score',()=>{for(const n of [2,3]){const r=room(n);start(r);r.pause=0;aimAtGoal(r,0,r.decoy);tick(r,1/60);assert.equal(r.teams[0].score,0);assert.equal(r.phase,'playing');assert.equal(r.pause,0);}});
test('spring pads launch both carts and balls in the indicated direction',()=>{for(const kind of ['cart','ball','decoy']){const r=room(4);start(r);r.pause=0;const b=kind==='cart'?r.players[0]:r[kind],pad=r.arena.pads[0];b.x=pad.x;b.y=pad.y;b.vx=b.vy=0;tick(r,1/60);assert.ok(Math.abs(b.vx-Math.cos(pad.angle)*760)<.001);assert.ok(Math.abs(b.vy-Math.sin(pad.angle)*760)<.001);assert.ok(b.springAt>0);}});
test('dash is limited by cooldown and stale controls stop',()=>{const r=room();start(r);r.pause=0;const p=r.players[0];p.input={x:1,y:0,bump:true};p.inputAt=1000;tick(r,1/60,1000);assert.equal(p.cooldown,3);assert.ok(p.vx>500);p.input.bump=true;tick(r,1/60,1017);assert.ok(p.cooldown<3);assert.ok(p.vx<700);p.input={x:1,y:0};const before=p.vx;tick(r,1/60,3000);assert.ok(p.vx<before);});
test('collisions transfer momentum and separate objects',()=>{const a={x:0,y:0,vx:200,vy:0,r:20,m:1},b={x:35,y:0,vx:0,vy:0,r:20,m:1};collide(a,b);assert.ok(b.vx>150);assert.ok(b.x-a.x>=40);});
test('eight player simulation stays finite and inside arena',()=>{const r=room(8);start(r);r.pause=0;for(let i=0;i<10000&&r.phase==='playing';i++){for(const p of r.players){p.input={x:Math.sin(i*.2+Number(p.id)),y:Math.cos(i*.17),bump:i%40===0};p.inputAt=i*17;}tick(r,1/60,i*17);for(const b of [...r.players,r.ball,r.decoy]){assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y));assert.ok(Math.hypot(b.x-400,b.y-400)<=r.arena.radius+1);}}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const api=async(body)=>{const r=await fetch(base+'/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
test('server serves the playable screen and browser assets',async()=>{for(const path of ['/','/client.mjs','/style.css','/favicon.svg','/arena.mjs','/render.mjs','/qrcodegen.mjs']){const res=await fetch(base+path);assert.equal(res.status,200);assert.ok((await res.text()).length>50);}assert.equal((await fetch(base+'/missing')).status,404);});
test('invite links preserve public HTTPS behind a hosting proxy and LAN HTTP',async()=>{
  const host=(await api({action:'create',name:'Invite host'})).data;
  for(const [headers,origin] of [
    [{host:'bumper-heist-example.onrender.com','x-forwarded-proto':'https'},'https://bumper-heist-example.onrender.com'],
    [{host:'bumper-heist-example.onrender.com','x-forwarded-proto':'https, http'},'https://bumper-heist-example.onrender.com'],
    [{host:'192.168.1.25:3000'},'http://192.168.1.25:3000'],
    [{host:'192.168.1.25:3000','x-forwarded-proto':'invalid'},'http://192.168.1.25:3000']
  ]){
    // Node fetch rewrites Host; use raw HTTP to simulate the hosting proxy.
    const result=await new Promise((resolve,reject)=>{
      const req=request(base+'/invite?room='+host.code,{headers},res=>{
        let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);
        res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(body)}));res.on('error',reject);
      });req.on('error',reject);req.end();
    });
    assert.equal(result.status,200);
    assert.deepEqual(result.data.urls,[origin+'/?room='+host.code]);
  }
});
test('real HTTP rooms synchronize clients, allow guest starts and rematches, and reject invalid sessions and overflow',async()=>{
  const host=(await api({action:'create',name:'Host'})).data;
  const invite=await fetch(base+'/invite?room='+host.code);
  assert.equal(invite.status,200);
  const {urls}=await invite.json();
  for(const address of urls){const url=new URL(address);assert.equal(url.searchParams.get('room'),host.code);assert.equal(url.port,String(server.address().port));assert.ok(!['localhost','127.0.0.1'].includes(url.hostname));assert.ok(!address.includes(host.token));}
  assert.equal((await fetch(base+'/invite?room=INVALID')).status,404);
  const guest=(await api({action:'join',code:host.code,name:'Guest'})).data;
  assert.equal((await api({...guest,action:'start'})).status,400);
  const players=[host,guest];
  for(let i=2;i<8;i++){const result=await api({action:'join',code:host.code,name:'P'+i});assert.equal(result.status,200);players.push(result.data);}
  const controllers=players.map(()=>new AbortController());
  const streams=await Promise.all(players.map((p,i)=>fetch(base+'/events?'+new URLSearchParams({code:p.code,token:p.token}),{signal:controllers[i].signal})));
  const readers=streams.map(s=>s.body.getReader());
  assert.equal((await api({action:'join',code:host.code,name:'Overflow'})).status,400);
  assert.equal((await api({...guest,token:'invalid',action:'start'})).status,400);
  assert.equal((await api({...guest,action:'start'})).status,200);
  assert.equal((await api({...host,action:'start'})).status,400);
  assert.equal((await api({action:'join',code:host.code})).status,400);
  const readPlaying=async reader=>{let data='';for(let i=0;i<30;i++){data+=new TextDecoder().decode((await reader.read()).value);const snapshots=data.split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));const s=snapshots.find(s=>s.phase==='playing');if(s)return s;}throw Error('No playing snapshot');};
  const snapshots=await Promise.all(readers.map(readPlaying));for(const s of snapshots){assert.equal(s.players.length,8);assert.equal(s.code,host.code);assert.equal(s.teams.length,2);assert.equal(s.arena.radius,560);assert.equal(s.decoy.id,'decoy');assert.ok(s.arena.pads.length===4);assert.ok(!JSON.stringify(s).includes(host.token));}
  assert.equal((await api({...guest,action:'input',x:1,y:0,bump:true})).status,200);
  assert.equal((await api({...guest,token:'invalid',action:'input',x:1,y:0})).status,400);
  assert.equal((await api({...guest,action:'rematch'})).status,400);
  rooms.get(host.code).phase='finished';
  assert.equal((await api({...guest,token:'invalid',action:'rematch'})).status,400);
  const rematches=await Promise.all([guest,host].map(p=>api({...p,action:'rematch'})));
  assert.deepEqual(rematches.map(r=>r.status).sort(),[200,400]);
  assert.equal(rooms.get(host.code).phase,'lobby');
  assert.ok(rooms.get(host.code).players.every(p=>p.score===0));
  assert.equal((await api({...host,action:'start'})).status,200);
  rooms.get(host.code).phase='finished';
  assert.equal((await api({...host,action:'rematch'})).status,200);
  assert.equal(rooms.get(host.code).phase,'lobby');
  controllers.forEach(c=>c.abort());
});
after(async()=>{for(const r of rooms.values())for(const p of r.players)p.stream?.end();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
