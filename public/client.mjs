import {QrCode} from './qrcodegen.mjs';
import {renderArena} from './render.mjs';
const $=id=>document.getElementById(id);let session=null,state=null,source=null,pending=false,screen='',keys={},joy={x:0,y:0},bump=false,frame=0,lastMessage=0;
const canvas=$('canvas'),ctx=canvas.getContext('2d'),visual=new Map();
function error(message){$('error').textContent=message;$('error').classList.toggle('hidden',!message);}
async function api(action,extra={}){const response=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...session,action,...extra})});const data=await response.json();if(!response.ok){const failure=Error(data.error||'Connection failed.');failure.status=response.status;throw failure;}return data;}
function saveSession(){try{if(session)sessionStorage.setItem('heist-session',JSON.stringify(session));else sessionStorage.removeItem('heist-session');}catch{}}
async function enter(action){if(pending)return;pending=true;error('');$('quick').disabled=$('create').disabled=$('join').disabled=true;try{session=await api(action,{name:$('name').value,code:$('code').value.trim().toUpperCase(),isPublic:$('publicRoom').checked===true});saveSession();connect();}catch(e){error(e.message);}finally{pending=false;$('quick').disabled=$('create').disabled=$('join').disabled=false;}}
function returnToEntry(message=''){source?.close();session=state=null;saveSession();visual.clear();show('entry');$('idleNotice').classList.add('hidden');$('connection').textContent='';error(message);}
function connect(){const connectedSession=session;source?.close();source=new EventSource('/events?'+new URLSearchParams({code:session.code,token:session.token}));source.addEventListener('roomClosed',e=>returnToEntry(JSON.parse(e.data).message));source.onmessage=e=>{state=JSON.parse(e.data);lastMessage=performance.now();$('connection').textContent='';render();};source.onerror=async()=>{if(session!==connectedSession)return;$('connection').textContent='Reconnecting… keep this tab open.';try{await api('input',{x:0,y:0});}catch(e){if(session===connectedSession&&e.status===400)returnToEntry('This room or session has expired. Join Quick Play or start a new room.');}};}
function show(which){if(screen===which)return;resetControls();screen=which;for(const id of ['entry','lobby','game','result'])$(id).classList.toggle('hidden',id!==which);}
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function render(){
  if(!state)return;updateIdleNotice();document.body.dataset.mode=state.arena?.teamMode?'teams':'solo';const me=state.players.find(p=>p.id===session.id),isHost=state.host===session.id;show(state.phase==='lobby'?'lobby':state.phase==='finished'?'result':'game');
  if(screen==='lobby'){$('lobbyPublic').checked=state.isPublic;$('lobbyPublic').disabled=!isHost;$('lobbyVisibility').textContent=state.isPublic?'Public · Quick Play players can join.':'Private · only players with your invite can join.';$('roomCode').textContent=state.code;prepareInvite();$('players').replaceChildren(...state.players.map(p=>{const row=el('div',undefined,'player'),swatch=el('i');swatch.style.background=p.color;row.append(swatch,el('span',p.name+(p.id===session.id?' (you)':'')),el('small',!p.connected?'OFFLINE':(state.arena.teamMode?(p.teamId==='blue'?'BLUE':'ORANGE'):'SOLO')+(p.id===state.host?' · HOST':'')));return row;}));$('hostHint').textContent=`${state.players.length}/8 players · `+'Any player can start once two drivers are connected.';$('modeInfo').textContent=state.players.length<2?'Waiting for another driver':`${state.arena.theme} · ${state.arena.teamMode?state.players.length/2+' vs '+state.players.length/2:'FREE-FOR-ALL'} · ${state.players.length>=6?'XL ARENA':'EXPANDED ARENA'}`;$('start').disabled=!me?.connected||state.players.filter(p=>p.connected).length<2;}
  if(screen==='game'){
    $('gameCode').textContent=state.code;const sec=Math.ceil(state.remaining);$('timer').textContent=state.finalists?'OT':Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');$('event').textContent=state.event||(state.warning?'INCOMING: '+state.warning:'FIRST TO 5');
    $('arenaName').textContent=state.arena.theme+' · '+(state.arena.teamMode?'TEAM HEIST':'SOLO HEIST');const scores=state.teams.map(p=>{const div=el('div',undefined,'score'+(p.id===me?.teamId?' mine':''));div.style.setProperty('--color',p.color);div.append(el('span',p.name+(p.id===me?.teamId?' • YOUR SIDE':'')),el('b',p.score));return div;});$('scores').replaceChildren(...scores);
    $('announcement').textContent=state.pause>0?state.message+' '+Math.ceil(state.pause):state.finalists&&!state.finalists.includes(me?.teamId)?'Spectating sudden death':'';
    $('cooldown').textContent=me?.cooldown>0?me.cooldown.toFixed(1)+'s':'READY';$('bump').classList.toggle('charging',me?.cooldown>0);
  }
  if(screen==='result'){
    const winner=state.teams.find(p=>p.id===state.winner);$('winner').textContent=(winner?.name||'Someone')+' wins!';$('standings').replaceChildren(...[...state.teams].sort((a,b)=>b.score-a.score).map(p=>{const row=el('div',undefined,'result-row');row.append(el('span',p.name),el('b',p.score+' pts'));return row;}));
    const menace=[...state.players].sort((a,b)=>b.bumps-a.bumps)[0];$('menace').textContent=menace?.bumps?`Biggest Menace: ${menace.name} · ${menace.bumps} bumps`:'Clean getaway. No dash collisions this round.';$('rematch').disabled=!me?.connected;$('rematchHint').textContent='Any player can choose Rematch to return everyone to the lobby.';
  }
}
async function action(name){try{error('');await api(name);}catch(e){error(e.message);}}
$('publicRoom').onchange=()=>{$('visibilityHint').textContent=$('publicRoom').checked?'Public · Quick Play players can join.':'Private · only players with your invite can join.';};
$('lobbyPublic').onchange=async()=>{const value=$('lobbyPublic').checked;$('lobbyPublic').disabled=true;try{await api('visibility',{isPublic:value});}catch(e){$('lobbyPublic').checked=state?.isPublic===true;error(e.message);}finally{$('lobbyPublic').disabled=!session||state?.host!==session.id;}};
$('quick').onclick=()=>enter('quick');$('create').onclick=()=>enter('create');$('join').onclick=()=>enter('join');$('code').onkeydown=e=>{if(e.key==='Enter')enter('join');};$('start').onclick=()=>action('start');$('rematch').onclick=()=>action('rematch');
document.querySelectorAll('.leave').forEach(b=>b.onclick=async()=>{try{await api('leave');}catch{}returnToEntry();});
function updateIdleNotice(){
  const seconds=state?.expiresAt?Math.max(0,Math.ceil((state.expiresAt-Date.now())/1000)):null;
  $('idleNotice').classList.toggle('hidden',seconds===null);
  $('idleNotice').textContent=seconds===null?'':`Idle room closes in ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}. `+(state.phase==='lobby'?'Start a match when your crew is ready.':'Choose Rematch to keep playing.');
}
setInterval(updateIdleNotice,1000);
let inviteCode='',inviteUrl='';
function drawInvite(){
  inviteUrl=$('inviteAddress').value;
  $('inviteQr').classList.toggle('hidden',!inviteUrl);
  $('inviteLink').textContent=inviteUrl;$('inviteLink').href=inviteUrl||'#';
  if(!inviteUrl)return;
  const qr=QrCode.encodeText(inviteUrl,QrCode.Ecc.MEDIUM),border=4,scale=6,size=(qr.size+border*2)*scale;
  const canvas=$('inviteQr');canvas.width=canvas.height=size;
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,size,size);context.fillStyle='#000';
  for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y))context.fillRect((x+border)*scale,(y+border)*scale,scale,scale);
}
async function prepareInvite(){
  if(inviteCode===state.code)return;
  const code=state.code;inviteCode=code;inviteUrl='';$('inviteAddress').replaceChildren();drawInvite();$('inviteStatus').textContent='Preparing invite…';
  try{
    let data;
    if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)){
      const response=await fetch('/invite?room='+encodeURIComponent(code));data=await response.json();if(!response.ok)throw Error(data.error);
    }else{
      // The browser already knows the public HTTPS origin, even behind a proxy.
      data={urls:[location.origin+'/?room='+encodeURIComponent(code)]};
    }
    if(inviteCode!==code)return;
    $('inviteAddress').replaceChildren(...data.urls.map(url=>{const option=el('option',url);option.value=url;return option;}));
    $('inviteStatus').textContent=data.urls.length?(location.protocol==='https:'?'Share this invite with friends to join online.':'Keep the server running while friends join on the same Wi-Fi.'):'No Wi-Fi address found. Connect the server to Wi-Fi and rejoin the room.';drawInvite();
  }catch{if(inviteCode===code){inviteCode='';$('inviteStatus').textContent='Could not prepare the invite. Check your connection.';}}
}
$('inviteAddress').onchange=drawInvite;
$('copy').onclick=async()=>{const url=inviteUrl||location.origin+'/?room='+state.code;try{await navigator.clipboard.writeText(url);$('copy').textContent='Copied!';setTimeout(()=>$('copy').textContent='Copy invite',1800);}catch{error('Invite: '+url);}};
function highlightControls(){
  document.querySelectorAll('[data-keys]').forEach(key=>{const names=key.dataset.keys===' '?[' ']:key.dataset.keys.split(' ');key.classList.toggle('pressed',names.some(name=>keys[name]));});
  $('bump').classList.toggle('pressed',Boolean(keys[' ']||bumpPointer));
}
let bumpPointer=false;
function resetControls(){keys={};joy={x:0,y:0};bump=false;bumpPointer=false;$('knob').style.transform='';highlightControls();}
$('rulesButton').onclick=()=>{resetControls();$('rules').showModal();};$('closeRules').onclick=()=>$('rules').close();$('code').value=new URLSearchParams(location.search).get('room')||'';
addEventListener('keydown',e=>{if(screen!=='game'||$('rules').open)return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys[e.key.toLowerCase()]=true;if(e.code==='Space'&&!e.repeat)bump=true;highlightControls();});
addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;highlightControls();});
addEventListener('blur',resetControls);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetControls();});
let stickId=null;function stickMove(e){if(e.pointerId!==stickId)return;const r=$('stick').getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/40,y=(e.clientY-r.top-r.height/2)/40;const d=Math.max(1,Math.hypot(x,y));joy={x:x/d,y:y/d};$('knob').style.transform=`translate(${joy.x*27}px,${joy.y*27}px)`;}
$('stick').onpointerdown=e=>{stickId=e.pointerId;$('stick').setPointerCapture(e.pointerId);stickMove(e);};$('stick').onpointermove=stickMove;function stopStick(){stickId=null;joy={x:0,y:0};$('knob').style.transform='';}$('stick').onpointerup=stopStick;$('stick').onpointercancel=stopStick;$('bump').onpointerdown=e=>{e.preventDefault();bump=true;bumpPointer=true;$('bump').setPointerCapture(e.pointerId);highlightControls();};$('bump').onpointerup=$('bump').onpointercancel=$('bump').onlostpointercapture=()=>{bumpPointer=false;highlightControls();};$('bump').onclick=e=>{if(e.detail===0)bump=true;};
let sending=false;setInterval(async()=>{if(!session||state?.phase!=='playing'||sending)return;let x=joy.x+(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),y=joy.y+(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);sending=true;const doBump=bump;bump=false;try{await api('input',{x,y,bump:doBump});}catch{$('connection').textContent='Controls disconnected. Reconnecting…';}finally{sending=false;}},50);
function draw(){requestAnimationFrame(draw);frame++;if(screen!=='game'||!state?.ball)return;renderArena(ctx,state,session.id,visual,frame);if(performance.now()-lastMessage>2500)$('connection').textContent='Connection interrupted. Waiting for the server…';}
draw();show('entry');
try{const saved=JSON.parse(sessionStorage.getItem('heist-session')||'null');if(saved?.code&&saved?.token){session=saved;api('input',{x:0,y:0}).then(connect).catch(()=>{session=null;saveSession();});}}catch{}
const mc=document.modelContext;if(mc?.registerTool){const life=new AbortController();try{Promise.resolve(mc.registerTool({name:'get_heist_room',description:'Read the current Bumper Heist room and scores.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>state?{code:state.code,phase:state.phase,mode:state.arena.theme,teams:state.teams.map(t=>({name:t.name,score:t.score}))}:{phase:'entry'}},{signal:life.signal})).catch(()=>{});}catch{}addEventListener('pagehide',()=>life.abort(),{once:true});}
