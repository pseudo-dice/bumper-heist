export const MAX_ROOMS=5;
export const LOBBY_IDLE_MS=15*60*1000;
export const FINISHED_IDLE_MS=10*60*1000;
export const RECONNECT_MS=15000;

export function expiresAt(room){
  if(room.phase==='lobby')return room.lastActivity+LOBBY_IDLE_MS;
  if(room.phase==='finished')return room.lastActivity+FINISHED_IDLE_MS;
  return null;
}

// Controls and stream heartbeats deliberately do not extend the idle deadline.
export function cleanupRooms(rooms,now=Date.now()){
  for(const [code,room] of rooms){
    if(room.phase==='lobby')room.players=room.players.filter(p=>p.connected||now-p.seen<RECONNECT_MS);
    const present=room.players.some(p=>p.connected||now-p.seen<RECONNECT_MS);
    const deadline=expiresAt(room);
    if((!present&&now-room.created>=30000)||(deadline!==null&&now>=deadline)){
      const message=deadline!==null&&now>=deadline?'This room closed after being idle. Join Quick Play or start a new room.':'This room is closed. Start or join another room.';
      for(const p of room.players){if(p.stream&&!p.stream.writableEnded){p.stream.end('event: roomClosed\ndata: '+JSON.stringify({message})+'\n\n');}}
      rooms.delete(code);continue;
    }
    const host=room.players.find(p=>p.id===room.host);
    if(!host||!host.connected&&now-host.seen>=RECONNECT_MS)room.host=room.players.find(p=>p.connected)?.id;
  }
}

// A fixed-size, expiring rate limiter; shared-Wi-Fi players share this allowance.
export function createJoinLimiter({limit=30,windowMs=60000,maxKeys=10000}={}){
  const clients=new Map();
  function prune(now){for(const [key,value] of clients)if(now>=value.until)clients.delete(key);}
  return {prune,check(key,now=Date.now()){
    let entry=clients.get(key);
    if(!entry||now>=entry.until){
      prune(now);
      if(clients.size>=maxKeys)return {allowed:false,retryAfter:Math.ceil(windowMs/1000)};
      entry={count:0,until:now+windowMs};clients.set(key,entry);
    }
    if(entry.count>=limit)return {allowed:false,retryAfter:Math.max(1,Math.ceil((entry.until-now)/1000))};
    entry.count++;return {allowed:true};
  }};
}
