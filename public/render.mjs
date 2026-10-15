const C=400,TAU=Math.PI*2;
export function renderArena(ctx,state,myId,visual,frame){
  const {radius:R,teamMode,pads,goalWidth}=state.arena;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,800,800);
  const scale=370/(R+30);ctx.translate(400,400);ctx.scale(scale,scale);ctx.translate(-C,-C);
  const disk=(x,y,r,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();};
  const ring=(r,color,width=2)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.arc(C,C,r,0,TAU);ctx.stroke();};
  disk(C,C+10,R+25,'#020c1b');disk(C,C,R+20,teamMode?'#2b4c68':'#645037');
  disk(C,C,R,teamMode?'#0c2e49':'#242637');
  const teams=state.teams.filter(t=>!state.finalists||state.finalists.includes(t.id));
  const me=state.players.find(p=>p.id===myId);
  ctx.save();ctx.beginPath();ctx.arc(C,C,R-3,0,TAU);ctx.clip();
  if(teamMode){
    ctx.fillStyle='#1684ce22';ctx.fillRect(C-R,C-R,R,R*2);ctx.fillStyle='#ff8a3d19';ctx.fillRect(C,C-R,R,R*2);
    ctx.strokeStyle='#d6ecff33';ctx.lineWidth=3;ctx.setLineDash([14,16]);ctx.beginPath();ctx.moveTo(C,C-R);ctx.lineTo(C,C+R);ctx.stroke();ctx.setLineDash([]);
    for(let x=C-R;x<C+R;x+=65){ctx.strokeStyle='#b3dcff07';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,C-R);ctx.lineTo(x,C+R);ctx.stroke();}
    ring(R*.77,'#b3dcff0c',2);
  }else{
    for(const t of state.teams){ctx.fillStyle=t.color+'10';ctx.beginPath();ctx.moveTo(C,C);ctx.arc(C,C,R,t.angle-Math.PI/state.teams.length,t.angle+Math.PI/state.teams.length);ctx.closePath();ctx.fill();ctx.strokeStyle='#ffe3ab1c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(C,C);ctx.lineTo(C+Math.cos(t.angle+Math.PI/state.teams.length)*R,C+Math.sin(t.angle+Math.PI/state.teams.length)*R);ctx.stroke();}
    for(const r of [.35,.65,.9])ring(R*r,'#ffdc9912',2);
  }
  ctx.restore();ring(95,'#d6e7ff25');ring(R,'#afc7e033',4);
  for(let i=0;i<(teamMode?32:24);i++){
    const a=i*TAU/(teamMode?32:24);ctx.save();ctx.translate(C+Math.cos(a)*(R+17),C+Math.sin(a)*(R+17));ctx.rotate(a);ctx.fillStyle=teamMode?(Math.cos(a)<0?'#39bfff':'#ff8a3d'):'#a59a78';ctx.globalAlpha=.6;ctx.fillRect(-4,-7,9,14);ctx.restore();
  }
  for(const t of teams){
    const mine=t.id===me?.teamId;ctx.strokeStyle=t.color;ctx.lineWidth=22;ctx.beginPath();ctx.arc(C,C,R,t.angle-goalWidth,t.angle+goalWidth);ctx.stroke();
    ctx.fillStyle=t.color;ctx.textAlign='center';ctx.font='800 17px system-ui';ctx.fillText(mine?(teamMode?'YOUR CREW’S GOAL':'YOUR GOAL'):t.name,C+Math.cos(t.angle)*(R-42),C+Math.sin(t.angle)*(R-42)+5);
  }
  for(const p of pads){
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.fillStyle='#4ff0cf22';ctx.strokeStyle='#4ff0cf';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(-31,-25,62,50,9);ctx.fill();ctx.stroke();
    for(const x of [-14,3]){ctx.beginPath();ctx.moveTo(x-4,-12);ctx.lineTo(x+7,0);ctx.lineTo(x-4,12);ctx.stroke();}ctx.restore();
  }
  if(state.event==='SPIN CYCLE')for(const sign of [-1,1]){const a=state.elapsed*2.5,x=C+Math.cos(a)*95*sign,y=C+Math.sin(a)*95*sign;disk(x,y,35,'#ff8a3d');disk(x,y,24,'#ffc086');disk(x,y,9,'#6a3828');}
  if(state.event==='CROSSWIND'){ctx.strokeStyle='#a4deff66';ctx.lineWidth=3;for(let i=0;i<10;i++){const x=(frame*8+i*83)%(R*1.3)+C-R*.7,y=C-R*.55+i*R*.12;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+35,y);ctx.stroke();}}
  const ps=state.players.filter(p=>!state.finalists||state.finalists.includes(p.teamId));
  for(const b of [...ps,state.ball,state.decoy]){
    let v=visual.get(b.id);if(!v||state.pause>0)v={x:b.x,y:b.y};v.x+=(b.x-v.x)*.45;v.y+=(b.y-v.y)*.45;visual.set(b.id,v);const{x,y}=v;
    disk(x+3,y+7,b.r+2,'#02071788');
    if(b.id==='ball'||b.id==='decoy'){
      const fake=b.id==='decoy';ctx.shadowColor=fake?'transparent':'#ffcf50';ctx.shadowBlur=fake?0:20;disk(x,y,23,fake?'#bfb59c':'#ffcf50');ctx.shadowBlur=0;
      if(fake){ctx.strokeStyle='#5c5b65';ctx.lineWidth=3;ctx.setLineDash([5,4]);ctx.beginPath();ctx.arc(x,y,19,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#393a49';ctx.font='900 22px system-ui';ctx.textAlign='center';ctx.fillText('?',x,y+8);}else{disk(x-6,y-7,8,'#fff1ad');ctx.strokeStyle='#b67b22';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,19,.2,2.1);ctx.stroke();}continue;
    }
    if(b.id===myId){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,29,0,TAU);ctx.stroke();}
    if(state.elapsed-b.springAt<.3){ctx.strokeStyle='#4ff0cf';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,32,0,TAU);ctx.stroke();}
    ctx.save();ctx.translate(x,y);ctx.rotate(b.face);ctx.fillStyle='#061322';ctx.fillRect(-14,-24,24,9);ctx.fillRect(-14,15,24,9);ctx.fillStyle=b.connected?b.color:'#67718a';ctx.beginPath();ctx.roundRect(-22,-19,44,38,12);ctx.fill();ctx.fillStyle='#ffffff88';ctx.beginPath();ctx.roundRect(-15,-14,22,28,8);ctx.fill();ctx.fillStyle='#142038';ctx.fillRect(6,-11,8,8);ctx.fillRect(6,3,8,8);ctx.restore();ctx.fillStyle='#f5f8ff';ctx.font='600 14px system-ui';ctx.textAlign='center';ctx.fillText(b.name,x,y-36);
  }
  ctx.setTransform(1,0,0,1,0,0);
}
