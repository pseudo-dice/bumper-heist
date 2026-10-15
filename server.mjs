import http from 'node:http';
import {isIP} from 'node:net';
import {MAX_ROOMS,expiresAt,cleanupRooms,createJoinLimiter} from './room-policy.mjs';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {COLORS,configure,start,tick} from './physics.mjs';
export const rooms=new Map();
const root=fileURLToPath(new URL('./public/',import.meta.url));
const joinLimiter=createJoinLimiter();
const token=()=>randomBytes(18).toString('hex');
function snapshot(r){if(r.phase==='lobby')configure(r);return {arena:r.arena,teams:r.teams,decoy:r.decoy,code:r.code,isPublic:r.isPublic===true,expiresAt:expiresAt(r),phase:r.phase,host:r.host,players:r.players.map(({token,input,inputAt,stream,...p})=>p),ball:r.ball,remaining:r.remaining,pause:r.pause,elapsed:r.elapsed,event:r.event,warning:r.warning,message:r.message,winner:r.winner,finalists:r.finalists,goalSerial:r.goalSerial||0};}
function broadcast(r){const data='data: '+JSON.stringify(snapshot(r))+'\n\n';for(const p of r.players)if(p.stream&&!p.stream.writableEnded&&p.stream.writableLength<65536)p.stream.write(data);}
function player(r,t){const p=r?.players.find(p=>p.token===t);if(!p)throw Error('Your session expired. Join the room again.');return p;}
function newPlayer(name){return {id:token().slice(0,10),token:token(),name:String(name||'').trim().slice(0,16)||'Bandit',connected:false,seen:Date.now(),inputAt:0,input:{x:0,y:0},r:20,m:1,x:400,y:400,vx:0,vy:0,score:0,bumps:0,cooldown:0,face:0};}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('Request too large.');}return JSON.parse(raw||'{}');}
export const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
  const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  try{
    if(req.method==='GET'&&url.pathname==='/invite'){
      const code=String(url.searchParams.get('room')||'').toUpperCase();
      if(!rooms.has(code))return send({error:'Room not found.'},404);
      // HTTPS is terminated by the hosting proxy; keep the public scheme.
      const forwardedProto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase();
      const protocol=req.socket.encrypted||forwardedProto==='https'?'https:':'http:';
      const host=new URL(protocol+'//'+req.headers.host);
      const local=['localhost','127.0.0.1','[::1]'].includes(host.hostname);
      let origins=[host.origin];
      if(local){
        try{origins=Object.values(networkInterfaces()).flat().filter(n=>n&&n.family==='IPv4'&&!n.internal).map(n=>'http://'+n.address+':'+server.address().port);}catch{origins=[];}
      }
      return send({urls:[...new Set(origins)].map(origin=>origin+'/?room='+encodeURIComponent(code))});
    }
    if(url.pathname==='/events'){
      const r=rooms.get(url.searchParams.get('code'));const p=player(r,url.searchParams.get('token'));if(p.stream)p.stream.end();
      res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('retry: 1000\n\n');p.stream=res;p.connected=true;p.seen=Date.now();broadcast(r);
      req.on('close',()=>{if(p.stream===res){p.stream=null;p.connected=false;p.seen=Date.now();p.input={x:0,y:0};}});return;
    }
    if(req.method==='POST'&&url.pathname==='/api'){
      if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send({error:'Cross-origin request rejected.'},403);
      const b=await body(req);
      if(['create','join','quick'].includes(b.action)){
        // Render sits behind Cloudflare, which overwrites CF-Connecting-IP.
        // Fall back conservatively to the nearest forwarded address; never trust these locally.
        const cloudflare=String(req.headers['cf-connecting-ip']||'').trim();
        const forwarded=isIP(cloudflare)?cloudflare:String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();
        const address=process.env.RENDER==='true'&&isIP(forwarded)?forwarded:req.socket.remoteAddress;
        const allowance=joinLimiter.check(address);
        if(!allowance.allowed){res.setHeader('Retry-After',allowance.retryAfter);return send({error:`Too many room attempts. Try again in ${allowance.retryAfter} seconds.`},429);}
        cleanupRooms(rooms);
      }
      let r=rooms.get(String(b.code||'').toUpperCase());
      if(b.action==='quick'){
        r=[...rooms.values()].filter(room=>room.isPublic&&room.phase==='lobby'&&room.players.length>0&&room.players.length<8).sort((a,b)=>b.players.length-a.players.length)[0];
      }
      if(b.action==='create'||b.action==='quick'&&!r){
        if(rooms.size>=MAX_ROOMS)return send({error:'All 5 rooms are busy. Join an existing room or try again shortly.'},503);
        let code;do{code=randomBytes(4).toString('hex').slice(0,5).toUpperCase();}while(rooms.has(code));
        const p=newPlayer(b.name);p.color=COLORS[0];const now=Date.now();
        r={code,host:p.id,players:[p],isPublic:b.action==='quick'||b.isPublic===true,phase:'lobby',created:now,lastActivity:now,remaining:180};
        rooms.set(code,r);return send({code,token:p.token,id:p.id});
      }
      if(!r)throw Error('Room not found. Check the code.');
      if(b.action==='join'||b.action==='quick'){
        if(r.phase!=='lobby')throw Error('This match has started. Ask the host for a rematch.');if(r.players.length>=8)throw Error('This room is full (8 players).');
        const p=newPlayer(b.name);p.color=COLORS.find(c=>!r.players.some(p=>p.color===c));r.players.push(p);r.lastActivity=Date.now();broadcast(r);return send({code:r.code,token:p.token,id:p.id});
      }
      const p=player(r,b.token);if(p.connected)p.seen=Date.now();
      if(b.action==='input'){
        const x=Number(b.x),y=Number(b.y);if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid controls.');p.input={x:Math.max(-1,Math.min(1,x)),y:Math.max(-1,Math.min(1,y)),bump:p.input.bump||b.bump===true};p.inputAt=Date.now();return send({ok:true});
      }
      if(b.action==='start'){if(p.id!==r.host)throw Error('Only the host can start.');if(r.phase!=='lobby')throw Error('Match already started.');start(r);r.lastActivity=Date.now();}
      else if(b.action==='rematch'){if(p.id!==r.host)throw Error('Only the host can open the rematch.');if(r.phase!=='finished')throw Error('Finish this match first.');r.phase='lobby';r.players=r.players.filter(p=>p.connected);r.players.forEach(p=>p.score=0);r.finalists=null;r.lastActivity=Date.now();}
      else if(b.action==='visibility'){if(p.id!==r.host)throw Error('Only the host can change room visibility.');if(r.phase!=='lobby')throw Error('Room visibility can only change in the lobby.');if(typeof b.isPublic!=='boolean')throw Error('Invalid room visibility.');r.isPublic=b.isPublic;r.lastActivity=Date.now();}
      else if(b.action==='leave'){p.connected=false;p.seen=0;p.stream?.end();p.stream=null;if(r.phase==='lobby')r.players=r.players.filter(q=>q!==p);if(r.host===p.id)r.host=r.players.find(q=>q.connected)?.id;if(!r.players.length)rooms.delete(r.code);}
      else throw Error('Unknown action.');broadcast(r);return send({ok:true});
    }
    const files={'/':'index.html','/qrcodegen.mjs':'qrcodegen.mjs','/client.mjs':'client.mjs','/arena.mjs':'arena.mjs','/render.mjs':'render.mjs','/style.css':'style.css','/favicon.svg':'favicon.svg'};const file=files[url.pathname];if(!file){res.writeHead(404);return res.end('Not found');}
    const mime=file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html';res.writeHead(200,{'Content-Type':mime});res.end(await readFile(root+file));
  }catch(e){if(!res.headersSent)send({error:e.message},400);else res.end();}
});
let counter=0,previous=performance.now(),accumulator=0;const interval=setInterval(()=>{
  const current=performance.now();accumulator+=Math.min(.25,(current-previous)/1000);previous=current;
  const steps=Math.floor(accumulator*60);accumulator-=steps/60;
  const now=Date.now();cleanupRooms(rooms,now);if(counter%60===0)joinLimiter.prune(now);
  for(const r of rooms.values()){
    const phase=r.phase;
    for(let i=0;i<steps;i++)tick(r,1/60,now);
    if(phase!=='finished'&&r.phase==='finished'){r.lastActivity=now;broadcast(r);}
    if(counter%(r.phase==='playing'?2:60)===0)broadcast(r);
  }counter++;
},1000/60);
server.on('close',()=>clearInterval(interval));
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||3000);server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is in use. Set PORT to another number.`:e.message);clearInterval(interval);process.exitCode=1;});server.listen(port,'0.0.0.0',()=>{console.log(`Bumper Heist: http://localhost:${port}`);try{for(const entries of Object.values(networkInterfaces()))for(const n of entries||[])if(n.family==='IPv4'&&!n.internal)console.log(`Same Wi-Fi: http://${n.address}:${port}`);}catch{console.log('LAN address discovery is unavailable in this environment.');}});
}
