export const COLORS=['#39bfff','#ff8a3d','#e36cff','#62e3b4','#ffdb64','#a6a0ff','#ff6c99','#def3ff'];
export function layout(count){
  const teamMode=count%2===0;
  const radius=teamMode?410+25*(count-2):430+25*(count-3);
  const pads=Array.from({length:teamMode?4:count},(_,i)=>{
    const a=teamMode?Math.PI/4+i*Math.PI/2:-Math.PI/2+i*2*Math.PI/count;
    return {id:'pad'+i,x:400+Math.cos(a)*radius*.55,y:400+Math.sin(a)*radius*.55,angle:teamMode?(Math.cos(a)>0?0:Math.PI):a+Math.PI+.35,r:30};
  });
  return {teamMode,radius,pads,theme:teamMode?'VOLT STADIUM':'ORBIT YARD',goalWidth:teamMode?.24:.19};
}
