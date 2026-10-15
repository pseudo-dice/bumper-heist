import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('keyboard feedback, HTTPS invites, entry options and expired-room recovery',async()=>{
  const nodes=new Map(),events={};
  const node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{dataset:{},style:{},value:'',open:false,classList:{add(name){classes.add(name);},toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},getContext:()=>({}),setPointerCapture(){},showModal(){this.open=true;},close(){this.open=false;}});}return nodes.get(id);};
  const keyNodes=['w arrowup','a arrowleft','s arrowdown','d arrowright',' '].map((keys,i)=>{const n=node('key'+i);n.dataset.keys=keys;return n;});
  const context=vm.createContext({document:{getElementById:node,querySelectorAll:selector=>selector==='[data-keys]'?keyNodes:[],addEventListener(name,fn){events[name]=fn;}},addEventListener(name,fn){events[name]=fn;},requestAnimationFrame(){},setInterval(){},sessionStorage:{getItem:()=>null},location:{search:''},URLSearchParams,console});
  const source=(await readFile(new URL('../public/client.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
  vm.runInContext(source,context);
  vm.runInContext("screen='game'",context);
  const press=key=>events.keydown({key,code:key===' '?'Space':'',preventDefault(){}});
  press('w');press('d');
  assert.ok(keyNodes[0].classList.contains('pressed'));assert.ok(keyNodes[3].classList.contains('pressed'));
  events.keyup({key:'w'});assert.ok(!keyNodes[0].classList.contains('pressed'));assert.ok(keyNodes[3].classList.contains('pressed'));
  press('ArrowUp');assert.ok(keyNodes[0].classList.contains('pressed'));
  press(' ');assert.ok(keyNodes[4].classList.contains('pressed'));assert.ok(node('bump').classList.contains('pressed'));
  events.blur();assert.ok(keyNodes.every(n=>!n.classList.contains('pressed')));assert.ok(!node('bump').classList.contains('pressed'));
  node('bump').onpointerdown({pointerId:1,preventDefault(){}});assert.ok(node('bump').classList.contains('pressed'));
  node('bump').onpointercancel();assert.ok(!node('bump').classList.contains('pressed'));
  press('a');node('rulesButton').onclick();assert.ok(!keyNodes[1].classList.contains('pressed'));
  press('s');assert.ok(!keyNodes[2].classList.contains('pressed'));

  // Public invites must use the browser origin rather than a proxy's HTTP address.
  context.location.hostname='bumper-heist-example.onrender.com';
  context.location.origin='https://bumper-heist-example.onrender.com';
  context.location.protocol='https:';
  context.document.createElement=tag=>({tag});
  node('inviteAddress').replaceChildren=(...options)=>{node('inviteAddress').value=options[0]?.value||'';};
  vm.runInContext("state={code:'ABCDE'};drawInvite=()=>{inviteUrl=document.getElementById('inviteAddress').value;}",context);
  await vm.runInContext('prepareInvite()',context);
  assert.equal(node('inviteAddress').value,'https://bumper-heist-example.onrender.com/?room=ABCDE');
  assert.match(node('inviteStatus').textContent,/online/);

  const calls=[],streamEvents={};
  context.EventSource=function(){this.close=()=>{};this.addEventListener=(name,fn)=>{streamEvents[name]=fn;};};
  context.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({code:'ROOM1',token:'secret',id:'host'})};};
  node('name').value='Driver';node('code').value='';node('publicRoom').checked=true;
  await vm.runInContext("enter('create')",context);
  assert.equal(calls.at(-1).action,'create');assert.equal(calls.at(-1).isPublic,true);
  assert.equal(node('quick').disabled,false);
  streamEvents.roomClosed({data:JSON.stringify({message:'Room closed after being idle.'})});
  assert.equal(vm.runInContext('screen',context),'entry');assert.equal(vm.runInContext('session',context),null);
  assert.match(node('error').textContent,/idle/);
  node('publicRoom').checked=false;
  await node('quick').onclick();assert.equal(calls.at(-1).action,'quick');
  context.fetch=async()=>({ok:false,status:400,json:async()=>({error:'Room not found.'})});
  await vm.runInContext('source.onerror()',context);
  assert.equal(vm.runInContext('session',context),null);assert.match(node('error').textContent,/expired/);

});
