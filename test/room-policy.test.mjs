import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanupRooms,expiresAt,createJoinLimiter,LOBBY_IDLE_MS,FINISHED_IDLE_MS} from '../room-policy.mjs';

const player=(extra={})=>({id:'host',connected:true,seen:1000,...extra});
const room=(extra={})=>({code:'ABCDE',host:'host',phase:'lobby',created:1000,lastActivity:1000,players:[player()],...extra});
test('idle lobby and result deadlines close streams; active matches stay open',()=>{
  const closed=[];
  const lobby=room({players:[player({stream:{end:data=>closed.push(data)}})]});
  const finished=room({code:'DONE',phase:'finished'});
  const playing=room({code:'PLAY',phase:'playing'});
  const rooms=new Map([['ABCDE',lobby],['DONE',finished],['PLAY',playing]]);
  assert.equal(expiresAt(lobby),1000+LOBBY_IDLE_MS);
  assert.equal(expiresAt(finished),1000+FINISHED_IDLE_MS);
  assert.equal(expiresAt(playing),null);
  cleanupRooms(rooms,1000+FINISHED_IDLE_MS);
  assert.ok(!rooms.has('DONE'));assert.ok(rooms.has('ABCDE'));
  cleanupRooms(rooms,1000+LOBBY_IDLE_MS);
  assert.deepEqual([...rooms.keys()],['PLAY']);
  assert.match(closed[0],/event: roomClosed/);
  assert.match(closed[0],/idle/);
});
test('pending streams expire, reconnect grace is preserved and host transfers',()=>{
  const pending=room({players:[player({connected:false})]});
  const survivor=player({id:'guest'});
  const active=room({code:'HOST',players:[player({connected:false}),survivor]});
  const rooms=new Map([['ABCDE',pending],['HOST',active]]);
  cleanupRooms(rooms,1000+14000);assert.equal(pending.players.length,1);assert.equal(active.host,'host');
  cleanupRooms(rooms,1000+15000);assert.equal(pending.players.length,0);assert.equal(active.host,'guest');
  cleanupRooms(rooms,1000+30000);assert.ok(!rooms.has('ABCDE'));assert.ok(rooms.has('HOST'));
});
test('meaningful room activity extends the deadline',()=>{
  const lobby=room({lastActivity:LOBBY_IDLE_MS});const rooms=new Map([['ABCDE',lobby]]);
  cleanupRooms(rooms,LOBBY_IDLE_MS+1000);assert.ok(rooms.has('ABCDE'));
});
test('rate limiter enforces per-address windows and bounds address storage',()=>{
  const limiter=createJoinLimiter({limit:2,windowMs:60000,maxKeys:2});
  assert.ok(limiter.check('a',0).allowed);assert.ok(limiter.check('a',1).allowed);
  assert.deepEqual(limiter.check('a',2),{allowed:false,retryAfter:60});
  assert.ok(limiter.check('b',3).allowed);assert.ok(!limiter.check('c',4).allowed);
  assert.ok(limiter.check('a',60000).allowed);assert.ok(limiter.check('c',60003).allowed);
});
