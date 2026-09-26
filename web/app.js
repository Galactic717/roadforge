"use strict";

const canvas = document.getElementById("world-canvas");
const ctx = canvas.getContext("2d");
const chart = document.getElementById("loss-chart");
const cc = chart.getContext("2d");
const $ = (id) => document.getElementById(id);
const S = {world:null,start:null,goal:null,route:[],cars:[],mode:"expert",modelReady:false,training:{},
  running:false,busy:false,tool:"inspect",pending:null,pendingBase:null,routeStart:null,selected:null,
  history:[],zoom:1,panX:0,panY:0,drag:null,mission:null,speedCap:19};
const hints = {inspect:"Click a car to inspect it. Drag the map to pan.",draw:"Click a node or empty space; click again to connect a road. Esc cancels.",route:"Click a start node, then a destination node.",erase:"Click a road or node to remove it. Connected routes must remain valid."};

async function api(path, body) {
  const response = await fetch(path, {method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json"},
    body:body===undefined?undefined:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function toast(message) { const el=$("toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),4000); }
function clone(value) {return JSON.parse(JSON.stringify(value));}
function apply(data) {
  S.world=data.world; S.start=data.start; S.goal=data.goal; S.route=data.route; S.cars=data.cars;
  S.mode=data.mode; S.modelReady=data.model_ready; S.training=data.training; S.mission=data.mission; S.speedCap=data.speed_cap;
  $("driver-mode").value=S.mode; $("driver-mode").querySelector('option[value="learned"]').disabled=!S.modelReady;
  $("route-label").textContent=`· ${S.start} → ${S.goal}`;
  updateUI();
}
function updateUI() {
  if (!S.world) return;
  const total=routeLength(); const lead=S.cars.at(-1); const arrived=S.cars.filter(c=>c.finished).length;
  const active=S.cars.filter(c=>c.alive&&!c.finished);
  const avg=active.length?active.reduce((sum,c)=>sum+c.speed,0)/active.length:0;
  $("stat-progress").textContent=`${Math.round((lead?.progress||0)/Math.max(total,1)*100)}%`;
  $("stat-fleet").textContent=`${arrived} / ${S.cars.length}`;
  $("stat-speed").innerHTML=`${avg.toFixed(1)} <em>m/s</em>`;
  $("stat-driver").textContent=S.mode==="learned"?"NEURAL":"EXPERT";
  $("driver-caption").textContent=S.mode==="learned"?"Trained local policy":"Geometry reference";
  $("play-btn").innerHTML=S.running?"Ⅱ <span>Pause simulation</span>":"▶ <span>Start simulation</span>";
  const tr=S.training||{};
  $("train-btn").disabled=!!tr.running;
  if (tr.running) {$("train-status").textContent=`Training ${tr.epoch}/${tr.epochs} epochs · loss ${tr.loss??"—"}`; $("status-title").textContent="Neural driver is learning"; $("status-detail").textContent="Backpropagation is fitting road situation examples. The fleet can keep driving with the reference policy.";}
  else if (tr.error) {$("train-status").textContent=`Training error: ${tr.error}`;}
  else if (tr.metrics) {const m=tr.metrics; $("train-status").textContent=`Complete · ${(m.learned.completion*100).toFixed(1)}% route · ${m.learned.arrived?"arrived":"not yet arrived"}`; drawChart(m.loss);}
  if (S.selected!==null && S.cars[S.selected]) {
    const car=S.cars[S.selected]; $("vehicle-title").textContent=`Car ${String(S.selected+1).padStart(2,"0")}`;
    $("vehicle-detail").textContent=`Heading ${(car.heading*180/Math.PI).toFixed(0)}° · ${car.reason}`;
    $("vehicle-progress").textContent=`${Math.round(car.progress/Math.max(total,1)*100)}%`;
    $("vehicle-speed").textContent=`${car.speed.toFixed(1)} m/s`;
    $("vehicle-state").textContent=car.finished?"ARRIVED":car.alive?"DRIVING":"STOPPED";
  }
  if (S.cars.length && !tr.running) {
    const failed=S.cars.filter(c=>!c.alive).length;
    $("status-title").textContent=arrived===S.cars.length?"All vehicles arrived":failed?`${failed} vehicle${failed>1?"s":""} stopped`:S.running?"Fleet in motion":"Simulation ready";
    $("status-detail").textContent=arrived===S.cars.length?"The current route has been completed.":"Build a route, train a driver, and compare the learned policy with the reference expert.";
    $("status-line").textContent=`${S.world.roads.length} road segments · ${S.world.nodes&&Object.keys(S.world.nodes).length} intersections · speed cap ${S.speedCap} m/s`;
  }
}
function drawChart(loss) {
  cc.clearRect(0,0,chart.width,chart.height); cc.strokeStyle="#254052"; cc.lineWidth=1;
  for (let y=20;y<chart.height;y+=20){cc.beginPath();cc.moveTo(0,y);cc.lineTo(chart.width,y);cc.stroke();}
  if (!loss?.length) return;
  const top=Math.max(...loss,0.001); cc.strokeStyle="#dffa61";cc.lineWidth=2;cc.beginPath();
  loss.forEach((v,i)=>{const x=8+i/Math.max(1,loss.length-1)*(chart.width-16), y=chart.height-9-v/top*(chart.height-18); if(i)cc.lineTo(x,y);else cc.moveTo(x,y);});cc.stroke();
}
function routeLength(){if(!S.world||S.route.length<2)return 1;let sum=0;for(let i=1;i<S.route.length;i++){const a=S.world.nodes[S.route[i-1]],b=S.world.nodes[S.route[i]];sum+=Math.hypot(a.x-b.x,a.y-b.y);}return sum;}
function screenToWorld(event){const r=canvas.getBoundingClientRect();const x=(event.clientX-r.left)/r.width*canvas.width,y=(event.clientY-r.top)/r.height*canvas.height;return {x:(x-S.panX)/S.zoom,y:(y-S.panY)/S.zoom};}
function nearestNode(p,max=19){let best=null,d=max/S.zoom;for(const [id,n] of Object.entries(S.world.nodes)){const distance=Math.hypot(n.x-p.x,n.y-p.y);if(distance<d){best=id;d=distance;}}return best;}
function roadDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function nearestRoad(p,max=15){let found=-1,d=max/S.zoom;S.world.roads.forEach((r,i)=>{const v=roadDistance(p,S.world.nodes[r.a],S.world.nodes[r.b]);if(v<d){d=v;found=i;}});return found;}
async function commit(world,start=S.start,goal=S.goal,before=null) {
  const saved=before||{world:clone(S.world),start:S.start,goal:S.goal};
  try {const data=await api("/api/world",{world,start,goal});S.history.push(saved);apply(data);toast("World saved locally.");}
  catch(e){S.world=saved.world;S.start=saved.start;S.goal=saved.goal;toast(e.message);}
}
function setTool(tool){S.tool=tool;S.pending=null;S.pendingBase=null;S.routeStart=null;document.querySelectorAll(".tool").forEach(b=>b.classList.toggle("active",b.dataset.tool===tool));$("tool-hint").textContent=hints[tool];$("map-hint").textContent=tool==="inspect"?"ROAD NETWORK · CLICK A TOOL TO EDIT":hints[tool].toUpperCase();}
function newNode(p){let id,n=1;do{id=`n${n++}`;}while(S.world.nodes[id]);S.world.nodes[id]={x:Math.round(p.x),y:Math.round(p.y)};return id;}
async function mapClick(p){
  if(S.tool==="inspect"){let nearest=null,d=16/S.zoom;S.cars.forEach((c,i)=>{const v=Math.hypot(c.x-p.x,c.y-p.y);if(v<d){nearest=i;d=v;}});S.selected=nearest;updateUI();return;}
  if(S.tool==="draw"){
    if(!S.pending) {S.pendingBase={world:clone(S.world),start:S.start,goal:S.goal};S.pending=nearestNode(p)||newNode(p);return;}
    const end=nearestNode(p)||newNode(p);if(end===S.pending)return;
    if(S.world.roads.some(r=>(r.a===S.pending&&r.b===end)||(r.b===S.pending&&r.a===end))){toast("That road already exists.");return;}
    S.world.roads.push({a:S.pending,b:end});const before=S.pendingBase;S.pending=null;S.pendingBase=null;
    await commit(clone(S.world),S.start,S.goal,before);return;
  }
  if(S.tool==="route"){
    const id=nearestNode(p);if(!id){toast("Click an intersection node.");return;}
    if(!S.routeStart){S.routeStart=id;toast(`Start: ${id}. Now choose a destination.`);return;}
    try{const data=await api("/api/route",{start:S.routeStart,goal:id});apply(data);toast("Route updated.");}catch(e){toast(e.message);}S.routeStart=null;return;
  }
  if(S.tool==="erase"){
    const before={world:clone(S.world),start:S.start,goal:S.goal},world=clone(S.world),node=nearestNode(p);
    if(node){delete world.nodes[node];world.roads=world.roads.filter(r=>r.a!==node&&r.b!==node);}
    else{const index=nearestRoad(p);if(index<0)return;world.roads.splice(index,1);}
    await commit(world,S.start,S.goal,before);
  }
}
canvas.addEventListener("pointerdown",e=>{S.drag={start:screenToWorld(e),clientX:e.clientX,clientY:e.clientY,panX:S.panX,panY:S.panY,moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener("pointermove",e=>{if(!S.drag)return;const dx=(e.clientX-S.drag.clientX)/canvas.getBoundingClientRect().width*canvas.width,dy=(e.clientY-S.drag.clientY)/canvas.getBoundingClientRect().height*canvas.height;if(Math.abs(dx)+Math.abs(dy)>5)S.drag.moved=true;if(S.tool==="inspect"&&S.drag.moved){S.panX=S.drag.panX+dx;S.panY=S.drag.panY+dy;}});
canvas.addEventListener("pointerup",e=>{if(S.drag&&!S.drag.moved)mapClick(screenToWorld(e));S.drag=null;});
canvas.addEventListener("wheel",e=>{e.preventDefault();S.zoom=Math.max(.65,Math.min(2.5,S.zoom*(e.deltaY<0?1.1:.9)));},{passive:false});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(S.pendingBase)S.world=S.pendingBase.world;S.pending=null;S.pendingBase=null;S.routeStart=null;toast("Selection cancelled.");}});
document.querySelectorAll(".tool").forEach(button=>button.addEventListener("click",()=>setTool(button.dataset.tool)));
$("zoom-in").onclick=()=>S.zoom=Math.min(2.5,S.zoom*1.15);$("zoom-out").onclick=()=>S.zoom=Math.max(.65,S.zoom/1.15);$("zoom-reset").onclick=()=>{S.zoom=1;S.panX=0;S.panY=0;};
$("play-btn").onclick=()=>{S.running=!S.running;updateUI();};
$("reset-btn").onclick=async()=>{try{apply(await api("/api/fleet",{mode:$("driver-mode").value,count:Number($("fleet-size").value)}));S.running=false;toast("Fleet reset.");}catch(e){toast(e.message);}};
$("driver-mode").onchange=async()=>{try{apply(await api("/api/fleet",{mode:$("driver-mode").value,count:Number($("fleet-size").value)}));S.running=false;}catch(e){toast(e.message);$("driver-mode").value=S.mode;}};
$("fleet-size").onchange=()=>$("reset-btn").click();
$("train-btn").onclick=async()=>{try{const epochs=Number($("epochs").value),samples=Number($("samples").value);await api("/api/train",{epochs,samples,seed:7});S.training={running:true,epoch:0,epochs};updateUI();toast("Training started.");}catch(e){toast(e.message);}};
$("mission-btn").onclick=async()=>{try{const result=await api("/api/mission",{note:$("mission-note").value});S.mission=result;S.speedCap=result.speed_cap;$("mission-result").textContent=`${result.mode.toUpperCase()} · confidence ${Math.round(result.confidence*100)}% · speed cap ${result.speed_cap} m/s`;toast("Local mission decision applied.");updateUI();}catch(e){toast(e.message);$("mission-result").textContent=e.message;}};
$("undo-btn").onclick=async()=>{const previous=S.history.pop();if(!previous){toast("Nothing to undo.");return;}try{apply(await api("/api/world",previous));toast("Change undone.");}catch(e){toast(e.message);S.history.push(previous);}};
$("export-btn").onclick=()=>{const content=JSON.stringify({world:S.world,start:S.start,goal:S.goal},null,2),blob=new Blob([content],{type:"application/json"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="roadforge-world.json";link.click();URL.revokeObjectURL(url);};
$("import-btn").onclick=()=>$("import-file").click();
$("import-file").onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>1_000_000){toast("World file is too large.");return;}try{const data=JSON.parse(await file.text());await commit(data.world,data.start,data.goal);}catch(error){toast(error.message);}e.target.value="";};

function line(a,b){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}
function render(){
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle="#091824";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.save();ctx.translate(S.panX,S.panY);ctx.scale(S.zoom,S.zoom);
  ctx.strokeStyle="#142a36";ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<=1040;x+=32){ctx.moveTo(x,0);ctx.lineTo(x,800);}for(let y=0;y<=800;y+=32){ctx.moveTo(0,y);ctx.lineTo(1040,y);}ctx.stroke();
  for(let y=0;y<3;y++)for(let x=0;x<4;x++){const bx=169+x*205,by=170+y*192;ctx.fillStyle="#102333";ctx.fillRect(bx,by,91,74);ctx.fillStyle="#183141";ctx.fillRect(bx+8,by+8,25,15);ctx.fillRect(bx+46,by+38,33,22);}
  if(S.world){
    const roads=S.world.roads.map(r=>[S.world.nodes[r.a],S.world.nodes[r.b]]);
    ctx.lineCap="round";ctx.lineJoin="round";
    for(const [width,color] of [[S.world.width+10,"#142938"],[S.world.width+3,"#273c48"],[S.world.width-5,"#3a4b54"]]){ctx.beginPath();roads.forEach(([a,b])=>line(a,b));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
    ctx.setLineDash([12,14]);ctx.beginPath();roads.forEach(([a,b])=>line(a,b));ctx.strokeStyle="#79909a86";ctx.lineWidth=1.4;ctx.stroke();ctx.setLineDash([]);
    if(S.route.length>1){ctx.beginPath();S.route.forEach((id,i)=>{const p=S.world.nodes[id];if(!p)return;if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.strokeStyle="#60e4dc33";ctx.lineWidth=21;ctx.stroke();ctx.strokeStyle="#87f0d898";ctx.lineWidth=3;ctx.setLineDash([4,9]);ctx.stroke();ctx.setLineDash([]);}
    for(const [id,p] of Object.entries(S.world.nodes)){ctx.beginPath();ctx.arc(p.x,p.y,id===S.pending||id===S.routeStart?10:5,0,Math.PI*2);ctx.fillStyle=id===S.pending||id===S.routeStart?"#e3fa62":"#9baeb4";ctx.fill();}
    if(S.route.length){for(const [id,color] of [[S.start,"#dff75b"],[S.goal,"#f8a86d"]]){const p=S.world.nodes[id];if(p){ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.fillStyle=color+"33";ctx.fill();ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}}}
    S.cars.forEach((car,i)=>{ctx.save();ctx.translate(car.x,car.y);ctx.rotate(car.heading);if(i===S.selected){ctx.beginPath();ctx.arc(0,0,23,0,Math.PI*2);ctx.strokeStyle="#dffa60";ctx.lineWidth=2;ctx.stroke();}ctx.shadowColor=car.finished?"#e4f76b":car.alive?"#64e8dc":"#f0706b";ctx.shadowBlur=15;ctx.fillStyle=car.finished?"#dff75c":car.alive?i%2?"#84b6f5":"#63ded7":"#ee756f";ctx.beginPath();ctx.roundRect(-10,-5,20,10,3);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#102333";ctx.fillRect(2,-3,4,6);ctx.restore();});
  }
  ctx.restore();requestAnimationFrame(render);
}
async function tick(){if(!S.running||S.busy)return;S.busy=true;try{const result=await api("/api/tick",{frames:1});S.cars=result.cars;updateUI();if(S.cars.every(c=>c.finished||!c.alive)){S.running=false;updateUI();}}catch(e){S.running=false;toast(e.message);}finally{S.busy=false;}}
setInterval(tick,100);
setInterval(async()=>{if(S.training?.running){try{const data=await api("/api/state");apply(data);}catch(e){toast(e.message);}}},550);
api("/api/state").then(data=>{apply(data);$("engine-state").textContent="ENGINE ONLINE";render();}).catch(e=>{$("engine-state").textContent="ENGINE OFFLINE";toast(e.message);render();});
