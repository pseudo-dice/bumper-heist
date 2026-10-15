import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {server,rooms} from '../server.mjs';
import {MAX_ROOMS,cleanupRooms,LOBBY_IDLE_MS} from '../room-policy.mjs';
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base='http://127.0.0.1:'+server.address().port;
const api=async body=>{const response=await fetch(base+'/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json(),retryAfter:response.headers.get('Retry-After')};};
const connect=async p=>{const response=await fetch(base+'/events?'+new URLSearchParams({code:p.code,token:p.token}));return response.body.getReader();};
beforeEach(()=>{for(const r of rooms.values())for(const p of r.players)p.stream?.end();rooms.clear();});
after(async()=>{for(const r of rooms.values())for(const p of r.players)p.stream?.end();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});

test('Quick Play skips private rooms, creates public lobbies and fills existing ones',async()=>{
  const privateHost=(await api({action:'create',name:'Private'})).data;
  assert.equal(rooms.get(privateHost.code).isPublic,false);
  const first=(await api({action:'quick',name:'First'})).data;
  const second=(await api({action:'quick',name:'Second'})).data;
  assert.notEqual(first.code,privateHost.code);assert.equal(first.code,second.code);
  assert.equal(rooms.get(first.code).isPublic,true);
  const reader=await connect(first);
  let text='';while(!text.includes('data: '))text+=new TextDecoder().decode((await reader.read()).value);
  const snapshot=JSON.parse(text.split('\n').find(line=>line.startsWith('data: ')).slice(6));
  assert.equal(snapshot.isPublic,true);assert.ok(snapshot.expiresAt>Date.now());assert.ok(!JSON.stringify(snapshot).includes(first.token));
  assert.equal((await api({...first,action:'start'})).status,400);
  await connect(second);
  assert.equal((await api({...second,action:'visibility',isPublic:false})).status,400);
  assert.equal((await api({...first,action:'visibility',isPublic:false})).status,200);
  const third=(await api({action:'quick'})).data;assert.notEqual(third.code,first.code);
  assert.equal((await api({action:'join',code:first.code,name:'Invited'})).status,200);
  assert.equal((await api({...first,action:'start'})).status,200);
  assert.equal((await api({...first,action:'visibility',isPublic:true})).status,400);
  assert.equal(rooms.get(first.code).phase,'playing');
});
test('Quick Play skips full public lobbies and rooms outside the lobby',async()=>{
  const now=Date.now();
  rooms.set('FULL',{code:'FULL',isPublic:true,phase:'lobby',host:'0',created:now,lastActivity:now,players:Array.from({length:8},(_,i)=>({id:String(i),connected:true,seen:now}))});
  rooms.set('PLAY',{code:'PLAY',isPublic:true,phase:'finished',host:'0',created:now,lastActivity:now,players:[{id:'0',connected:true,seen:now}]});
  const result=await api({action:'quick'});assert.equal(result.status,200);
  assert.ok(!['FULL','PLAY'].includes(result.data.code));assert.equal(rooms.size,3);

});
test('five-room cap rejects creates but allows Quick Play into an existing public lobby',async()=>{
  const hosts=[];
  for(let i=0;i<MAX_ROOMS;i++){const result=await api({action:'create',isPublic:i===0});assert.equal(result.status,200);hosts.push(result.data);}
  assert.equal(rooms.size,5);
  assert.equal((await api({action:'create'})).status,503);
  const guest=await api({action:'quick'});assert.equal(guest.status,200);assert.equal(guest.data.code,hosts[0].code);
  assert.equal((await api({...hosts[0],action:'visibility',isPublic:false})).status,200);
  assert.equal((await api({action:'quick'})).status,503);
  rooms.get(hosts[1].code).lastActivity=Date.now()-LOBBY_IDLE_MS;
  assert.equal((await api({action:'create'})).status,200);assert.equal(rooms.size,5);
});
test('idle closure sends an event and removes the room even with a connected player',async()=>{
  const host=(await api({action:'create'})).data;const reader=await connect(host);
  const r=rooms.get(host.code);r.lastActivity=Date.now()-LOBBY_IDLE_MS;
  cleanupRooms(rooms);
  let text='';for(;;){const chunk=await reader.read();if(chunk.done)break;text+=new TextDecoder().decode(chunk.value);}
  assert.match(text,/event: roomClosed/);assert.ok(!rooms.has(host.code));
  assert.equal((await api({...host,action:'input',x:0,y:0})).status,400);
});
test('repeated create/join requests return 429 with Retry-After; controls are exempt',async()=>{
  const host=(await api({action:'create'})).data;
  let result;for(let i=0;i<31;i++){result=await api({action:'join',code:'INVALID'});if(result.status===429)break;}
  assert.equal(result.status,429);assert.ok(Number(result.retryAfter)>0);
  assert.equal((await api({...host,action:'input',x:0,y:0})).status,200);
});
