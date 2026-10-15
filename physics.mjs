import {COLORS,layout} from './public/arena.mjs';
export {COLORS};
export const C=400;
export function configure(room){
  room.arena=layout(room.players.length);
  room.teams=room.arena.teamMode?[
    {id:'blue',name:'Blue crew',color:COLORS[0],score:0,angle:Math.PI},
    {id:'orange',name:'Orange crew',color:COLORS[1],score:0,angle:0}
  ]:room.players.map((p,i)=>({id:p.id,name:p.name,color:COLORS[i],score:0,angle:-Math.PI/2+i*2*Math.PI/room.players.length}));
  room.players.forEach((p,i)=>{const t=room.teams[room.arena.teamMode?i%2:i];p.teamId=t.id;p.color=t.color;});
}
export function reset(room){
  room.ball={id:'ball',x:C,y:C,vx:0,vy:0,r:23,m:1.5};
  room.decoy={id:'decoy',x:C+135,y:C+65,vx:0,vy:0,r:23,m:1.5};
  for(const team of room.teams){
    const ps=active(room).filter(p=>p.teamId===team.id);
    ps.forEach((p,i)=>{p.angle=team.angle;const offset=(i-(ps.length-1)/2)*.24,a=team.angle+offset;p.x=C+Math.cos(a)*(room.arena.radius-90);p.y=C+Math.sin(a)*(room.arena.radius-90);p.vx=p.vy=0;p.face=a+Math.PI;p.cooldown=0;p.springAt=-99;p.input={x:0,y:0};});
  }
  room.ball.springAt=room.decoy.springAt=-99;room.pause=2.5;
}
export function start(room){
  if(room.players.filter(p=>p.connected).length<2)throw Error('You need at least two connected players.');
  room.players=room.players.filter(p=>p.connected);configure(room);room.phase='playing';room.remaining=180;room.elapsed=0;room.finalists=null;room.winner=null;room.event='';room.warning='';room.message=room.arena.teamMode?'Crew up. Gold to your goal!':'Every driver for themselves!';
  room.players.forEach(p=>{p.score=0;p.bumps=0;p.lastBump=0;});reset(room);
}
export function active(room){return room.players.filter(p=>!room.finalists||room.finalists.includes(p.teamId));}
export function finish(room,id){room.phase='finished';room.winner=id;room.message='Heist complete!';room.event='';}
export function collide(a,b,elasticity=0.86){
  let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.r+b.r;if(d>=min)return false;
  if(d<0.001){dx=1;dy=0;d=1;}const nx=dx/d,ny=dy/d,ia=1/a.m,ib=1/b.m;
  const overlap=min-d;a.x-=nx*overlap*ia/(ia+ib);a.y-=ny*overlap*ia/(ia+ib);b.x+=nx*overlap*ib/(ia+ib);b.y+=ny*overlap*ib/(ia+ib);
  const speed=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(speed>=0)return false;
  const impulse=-(1+elasticity)*speed/(ia+ib);a.vx-=impulse*nx*ia;a.vy-=impulse*ny*ia;b.vx+=impulse*nx*ib;b.vy+=impulse*ny*ib;return speed < -90;
}
export function tick(room,dt,now=Date.now()){
  if(room.phase!=='playing')return;
  if(room.pause>0){room.pause=Math.max(0,room.pause-dt);return;}
  room.elapsed+=dt;if(!room.finalists)room.remaining=Math.max(0,room.remaining-dt);
  const cycle=Math.floor(room.elapsed/20),within=room.elapsed%20;
  const events=['SPIN CYCLE','CROSSWIND','SUPER BOUNCE'];room.event=cycle>0&&within<5?events[(cycle-1)%3]:'';room.warning=within>=17?events[cycle%3]:'';
  const ps=active(room);
  for(const p of ps){
    p.cooldown=Math.max(0,p.cooldown-dt);const fresh=p.connected&&now-p.inputAt<500;
    let {x,y,bump}=fresh?p.input:{x:0,y:0,bump:false};const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
    if(length>0.1)p.face=Math.atan2(y,x);
    p.vx+=x*660*dt;p.vy+=y*660*dt;
    if(bump&&p.cooldown===0){p.vx+=Math.cos(p.face)*570;p.vy+=Math.sin(p.face)*570;p.cooldown=3;p.lastBump=now;}p.input.bump=false;
    const friction=Math.exp(-1.9*dt);p.vx*=friction;p.vy*=friction;
  }
  const bodies=[...ps,room.ball,room.decoy];
  for(const b of bodies){
    if(room.event==='CROSSWIND')b.vx+=180*dt;
    if(b===room.ball||b===room.decoy){b.vx*=Math.exp(-0.35*dt);b.vy*=Math.exp(-0.35*dt);}
    const speed=Math.hypot(b.vx,b.vy);if(speed>1000){b.vx*=1000/speed;b.vy*=1000/speed;}
    b.x+=b.vx*dt;b.y+=b.vy*dt;
  }
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
    if(collide(bodies[i],bodies[j])&&bodies[i].teamId&&bodies[j].teamId){if(now-bodies[i].lastBump<600)bodies[i].bumps++;if(now-bodies[j].lastBump<600)bodies[j].bumps++;}
  }
  if(room.event==='SPIN CYCLE'){
    const angle=room.elapsed*2.5;
    for(const sign of [-1,1]){const bumper={x:C+Math.cos(angle)*95*sign,y:C+Math.sin(angle)*95*sign,vx:-Math.sin(angle)*238*sign,vy:Math.cos(angle)*238*sign,r:35,m:100000};for(const b of bodies)collide(b,bumper,1.1);}
  }
  for(const b of bodies){
    if(room.elapsed-(b.springAt??-99)>0.8){
      const pad=room.arena.pads.find(p=>Math.hypot(b.x-p.x,b.y-p.y)<p.r+b.r*.4);
      if(pad){b.vx=Math.cos(pad.angle)*760;b.vy=Math.sin(pad.angle)*760;b.springAt=room.elapsed;}
    }
    const R=room.arena.radius;
    const dx=b.x-C,dy=b.y-C,d=Math.hypot(dx,dy);
    if(b===room.ball&&d>R-b.r-3){const angle=Math.atan2(dy,dx);const scorer=room.teams.find(t=>(!room.finalists||room.finalists.includes(t.id))&&Math.abs(Math.atan2(Math.sin(angle-t.angle),Math.cos(angle-t.angle)))<room.arena.goalWidth);
      if(scorer){scorer.score++;room.players.filter(p=>p.teamId===scorer.id).forEach(p=>p.score=scorer.score);room.message=scorer.name+' stole a point!';room.goalSerial=(room.goalSerial||0)+1;if(scorer.score>=5||room.finalists){finish(room,scorer.id);return;}reset(room);return;}}
    if(d>R-b.r){const nx=dx/d,ny=dy/d;b.x=C+nx*(R-b.r);b.y=C+ny*(R-b.r);const dot=b.vx*nx+b.vy*ny;if(dot>0){const e=room.event==='SUPER BOUNCE'?1.35:0.8;b.vx-=(1+e)*dot*nx;b.vy-=(1+e)*dot*ny;}}
  }
  if(room.remaining<=0&&!room.finalists){const max=Math.max(...room.teams.map(t=>t.score)),tied=room.teams.filter(t=>t.score===max);if(tied.length===1)finish(room,tied[0].id);else{room.finalists=tied.map(p=>p.id);room.message='Sudden death! Next goal wins.';reset(room);}}
}
