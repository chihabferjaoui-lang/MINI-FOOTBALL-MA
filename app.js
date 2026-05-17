const pitch=document.getElementById('pitch');
const redList=document.getElementById('redList');
const blueList=document.getElementById('blueList');
const messages=document.getElementById('messages');
const drawingLayer=document.getElementById('drawingLayer');
const ball=document.getElementById('ball');
const toolHint=document.getElementById('toolHint');

let players={red:['R1','R2','R3','R4','R5'],blue:['B1','B2','B3','B4','B5']};
let currentTool='move';
let drawing=false;
let previewLine=null;
let startPoint=null;
let marquageSelection=[];
let localStream=null;
let micMuted=false;
let sequence=[];
let playingSequence=false;
let selectedArea=null;
let pickingArea=false;
let areaMarker=null;

const formations={
  box:{red:[[50,89],[32,69],[68,69],[28,45],[72,45]],blue:[[50,11],[32,31],[68,31],[28,55],[72,55]]},
  diamond:{red:[[50,89],[30,72],[70,72],[50,61],[50,45]],blue:[[50,11],[30,28],[70,28],[50,39],[50,55]]},
  defensive:{red:[[50,89],[23,73],[42,73],[58,73],[77,73]],blue:[[50,11],[23,27],[42,27],[58,27],[77,27]]},
  attacking:{red:[[50,89],[35,73],[65,73],[35,55],[65,55]],blue:[[50,11],[35,27],[65,27],[35,45],[65,45]]}
};

function renderLists(){
  redList.innerHTML=''; blueList.innerHTML='';
  Object.entries(players).forEach(([team,list])=>list.forEach((name,i)=>{
    const el=document.createElement('div');
    el.className='player-card';
    el.innerHTML=`<span>${name}</span><small>${team} #${i+1}</small>`;
    (team==='red'?redList:blueList).appendChild(el);
  }));
}

function makeToken(team,name,i,x,y){
  const t=document.createElement('div');
  t.className=`token ${team}`;
  t.dataset.team=team;
  t.dataset.name=name;
  t.innerHTML=`${i+1}<small>${name}</small>`;
  pitch.appendChild(t);
  move(t,x,y,64);
  drag(t,64);
  t.addEventListener('click',e=>handleMarquagePick(e,t));
}

function move(t,x,y,size=64){
  const offset=size/2;
  t.style.left=`calc(${x}% - ${offset}px)`;
  t.style.top=`calc(${y}% - ${offset}px)`;
}

function renderPitch(type='box'){
  pitch.querySelectorAll('.token').forEach(t=>t.remove());
  Object.entries(players).forEach(([team,list])=>list.slice(0,5).forEach((name,i)=>makeToken(team,name,i,...formations[type][team][i])));
  move(ball,50,50,42);
  refreshSequenceSelects();
}

function drag(el,size=64){
  let active=false;
  el.addEventListener('pointerdown',e=>{
    if(currentTool!=='move')return;
    active=true;
    el.setPointerCapture(e.pointerId);
    el.style.cursor='grabbing';
    e.stopPropagation();
  });
  el.addEventListener('pointermove',e=>{
    if(!active)return;
    const p=getPitchPoint(e);
    const edge=(size/2)/pitch.getBoundingClientRect().width*100;
    move(el,Math.max(edge,Math.min(100-edge,p.x)),Math.max(3,Math.min(97,p.y)),size);
  });
  el.addEventListener('pointerup',()=>{active=false;el.style.cursor='grab'});
}

function getPitchPoint(e){
  const r=pitch.getBoundingClientRect();
  return {x:(e.clientX-r.left)/r.width*100,y:(e.clientY-r.top)/r.height*100};
}

function getTokenCenter(token){
  const pr=pitch.getBoundingClientRect();
  const tr=token.getBoundingClientRect();
  return {x:(tr.left+tr.width/2-pr.left)/pr.width*100,y:(tr.top+tr.height/2-pr.top)/pr.height*100};
}

function setTool(tool){
  currentTool=tool;
  marquageSelection.forEach(t=>t.classList.remove('selected-mark'));
  marquageSelection=[];
  drawingLayer.classList.toggle('active',tool!=='move'&&tool!=='marquage');
  drawingLayer.classList.toggle('erase-mode',tool==='eraser');
  document.querySelectorAll('#selectTool,#lineTool,#arrowTool,#eraserTool,#marquageTool').forEach(btn=>btn.classList.remove('active-tool'));
  const ids={move:'selectTool',line:'lineTool',arrow:'arrowTool',eraser:'eraserTool',marquage:'marquageTool'};
  document.getElementById(ids[tool]).classList.add('active-tool');
  const hints={
    move:'Move mode: drag players and the ball.',
    line:'Line mode: drag on the pitch to draw a normal line.',
    arrow:'Arrow mode: drag on the pitch to draw an arrow.',
    eraser:'Eraser mode: click a line or arrow to delete only that drawing.',
    marquage:'Marquage: click 2 defenders, then click the opponent they should catch/double-team.'
  };
  toolHint.textContent=hints[tool];
}

function createSvgLine(a,b,arrow=false,extraClass=''){
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1',a.x); line.setAttribute('y1',a.y);
  line.setAttribute('x2',b.x); line.setAttribute('y2',b.y);
  line.setAttribute('class',`drawing-line ${extraClass}`.trim());
  if(arrow)line.setAttribute('marker-end','url(#arrowHead)');
  line.addEventListener('click',e=>{if(currentTool==='eraser'){line.remove();e.stopPropagation();}});
  return line;
}

function handleMarquagePick(e,token){
  if(currentTool!=='marquage')return;
  e.stopPropagation();
  if(marquageSelection.includes(token))return;
  marquageSelection.push(token);
  token.classList.add('selected-mark');
  if(marquageSelection.length===3){
    const a=getTokenCenter(marquageSelection[0]);
    const b=getTokenCenter(marquageSelection[1]);
    const target=getTokenCenter(marquageSelection[2]);
    drawingLayer.appendChild(createSvgLine(a,target,true,'marking-line'));
    drawingLayer.appendChild(createSvgLine(b,target,true,'marking-line'));
    marquageSelection.forEach(t=>t.classList.remove('selected-mark'));
    marquageSelection=[];
    messages.insertAdjacentHTML('beforeend','<div class="msg">Coach: Marquage added - two players double-team one opponent.</div>');
    messages.scrollTop=messages.scrollHeight;
  }
}

drawingLayer.addEventListener('pointerdown',e=>{
  if(currentTool==='move'||currentTool==='eraser'||currentTool==='marquage')return;
  drawing=true;
  startPoint=getPitchPoint(e);
  previewLine=createSvgLine(startPoint,startPoint,currentTool==='arrow');
  drawingLayer.appendChild(previewLine);
});

drawingLayer.addEventListener('pointermove',e=>{
  if(!drawing||!previewLine)return;
  const p=getPitchPoint(e);
  previewLine.setAttribute('x2',p.x);
  previewLine.setAttribute('y2',p.y);
});

drawingLayer.addEventListener('pointerup',e=>{
  if(!drawing)return;
  const p=getPitchPoint(e);
  previewLine.setAttribute('x2',p.x);
  previewLine.setAttribute('y2',p.y);
  drawing=false;
  previewLine=null;
});

pitch.addEventListener('click',e=>{
  if(!pickingArea)return;
  const target=e.target;
  if(target.closest && (target.closest('.token') || target.closest('.ball') || target.closest('.toolbar')))return;
  const p=getPitchPoint(e);
  setAreaMarker(p);
  pickingArea=false;
  pitch.classList.remove('picking-area');
  setTool('move');
  toolHint.textContent='Area selected. Add the sequence step when ready.';
});


function allPlayerOptions(){
  const tokens=[...pitch.querySelectorAll('.token')];
  return tokens.map(t=>({label:t.dataset.name, value:t.dataset.name, team:t.dataset.team}));
}

function refreshSequenceSelects(){
  const from=document.getElementById('sequenceFrom');
  const to=document.getElementById('sequenceTo');
  if(!from||!to)return;
  const opts=allPlayerOptions();
  const html=opts.map(o=>`<option value="${o.value}">${o.label}</option>`).join('');
  from.innerHTML=html;
  updateTargetControls();
}

function findTokenByName(name){
  return [...pitch.querySelectorAll('.token')].find(t=>t.dataset.name===name);
}

function updateTargetControls(){
  const action=document.getElementById('sequenceAction')?.value;
  const mode=document.getElementById('targetMode')?.value;
  const to=document.getElementById('sequenceTo');
  const pick=document.getElementById('pickArea');
  const areaStatus=document.getElementById('areaStatus');
  if(!to||!pick)return;
  if(action==='run'){
    document.getElementById('targetMode').value='area';
  }
  const finalMode=document.getElementById('targetMode').value;
  to.style.display=finalMode==='area'?'none':'block';
  pick.style.display=finalMode==='area'?'block':'none';
  if(finalMode==='player'){
    to.innerHTML=allPlayerOptions().map(o=>`<option value="${o.value}">${o.label}</option>`).join('');
  }else if(finalMode==='goal'){
    to.innerHTML='<option value="goal-top">Top goal</option><option value="goal-bottom">Bottom goal</option>';
    const fromToken=findTokenByName(document.getElementById('sequenceFrom').value);
    if(fromToken)to.value=fromToken.dataset.team==='red'?'goal-top':'goal-bottom';
  }
  if(areaStatus){
    areaStatus.textContent=selectedArea?`Selected area: ${selectedArea.x.toFixed(1)}%, ${selectedArea.y.toFixed(1)}%`:'No area selected yet.';
  }
}

function setAreaMarker(p){
  selectedArea=p;
  if(!areaMarker){
    areaMarker=document.createElement('div');
    areaMarker.className='area-marker';
    areaMarker.textContent='TARGET';
    pitch.appendChild(areaMarker);
  }
  areaMarker.style.left=`calc(${p.x}% - 38px)`;
  areaMarker.style.top=`calc(${p.y}% - 14px)`;
  updateTargetControls();
}

function pointForTarget(target){
  if(typeof target==='object' && target.type==='area')return target.point;
  const name=typeof target==='object'?target.value:target;
  if(name==='goal-top')return {x:50,y:2};
  if(name==='goal-bottom')return {x:50,y:98};
  const token=findTokenByName(name);
  return token?getTokenCenter(token):{x:50,y:50};
}

function targetLabel(target){
  if(typeof target==='object' && target.type==='area')return `area (${target.point.x.toFixed(0)}%, ${target.point.y.toFixed(0)}%)`;
  return target;
}

function renderSequenceList(){
  const list=document.getElementById('sequenceList');
  if(!list)return;
  if(sequence.length===0){list.innerHTML='<div class="sequence-step"><span>No steps yet. Add a pass, run line, or shot.</span></div>';return;}
  list.innerHTML=sequence.map((st,i)=>{
    const label=st.action==='pass'?`Pass ${st.from} → ${targetLabel(st.to)}`:st.action==='run'?`Run ${st.from} → ${targetLabel(st.to)}`:`Shoot ${st.from} → ${targetLabel(st.to)}`;
    return `<div class="sequence-step"><span><strong>${i+1}.</strong> ${label}</span><button class="btn ghost" data-del-step="${i}">Delete</button></div>`;
  }).join('');
  list.querySelectorAll('[data-del-step]').forEach(btn=>btn.onclick=()=>{sequence.splice(Number(btn.dataset.delStep),1);renderSequenceList();});
}

function addSequenceStep(){
  const action=document.getElementById('sequenceAction').value;
  const from=document.getElementById('sequenceFrom').value;
  const mode=document.getElementById('targetMode').value;
  let to;
  if(mode==='area' || action==='run'){
    if(!selectedArea){
      alert('Pick an area on the pitch first.');
      return;
    }
    to={type:'area',point:{...selectedArea}};
  }else{
    to=document.getElementById('sequenceTo').value;
    if(action==='shoot' && !String(to).startsWith('goal-')){
      const token=findTokenByName(from);
      to=token?.dataset.team==='red'?'goal-top':'goal-bottom';
    }
  }
  if(!from||!to||to===from)return;
  sequence.push({action,from,to,mode});
  renderSequenceList();
}

function drawSequenceStep(st){
  const a=pointForTarget(st.from);
  const b=pointForTarget(st.to);
  const cls=st.action==='pass'?'sequence-line':st.action==='run'?'run-line':'shoot-line';
  const line=createSvgLine(a,b,true,cls);
  line.classList.add('sequence-active');
  drawingLayer.appendChild(line);
  return line;
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

function moveBallToPoint(p){
  move(ball,Math.max(3,Math.min(97,p.x)),Math.max(3,Math.min(97,p.y)),42);
}

function movePlayerToPoint(name,p){
  const token=findTokenByName(name);
  if(token)move(token,Math.max(4,Math.min(96,p.x)),Math.max(4,Math.min(96,p.y)),64);
}

async function playSequence(){
  if(playingSequence||sequence.length===0)return;
  playingSequence=true;
  clearDrawings();
  for(const st of sequence){
    const fromPoint=pointForTarget(st.from);
    moveBallToPoint(fromPoint);
    await sleep(350);
    const line=drawSequenceStep(st);
    await sleep(400);
    const targetPoint=pointForTarget(st.to);
    if(st.action==='pass'||st.action==='shoot')moveBallToPoint(targetPoint);
    if(st.action==='run')movePlayerToPoint(st.from,targetPoint);
    await sleep(700);
    line.classList.remove('sequence-active');
  }
  playingSequence=false;
}

function clearSequence(){
  sequence=[];
  renderSequenceList();
}

function clearDrawings(){
  drawingLayer.querySelectorAll('.drawing-line').forEach(line=>line.remove());
}

async function startMic(){
  try{
    localStream=await navigator.mediaDevices.getUserMedia({audio:true});
    micMuted=false;
    document.getElementById('voiceStatus').textContent='Mic is on locally. To talk with the team online, use the voice link button or add a WebRTC server later.';
    document.getElementById('micBtn').textContent='Mic On';
    document.getElementById('muteBtn').disabled=false;
  }catch(err){
    document.getElementById('voiceStatus').textContent='Microphone permission was blocked or not available.';
  }
}

function toggleMute(){
  if(!localStream)return;
  micMuted=!micMuted;
  localStream.getAudioTracks().forEach(track=>track.enabled=!micMuted);
  document.getElementById('muteBtn').textContent=micMuted?'Unmute':'Mute';
  document.getElementById('voiceStatus').textContent=micMuted?'Mic muted.':'Mic is on locally.';
}

function joinVoice(){
  const link=document.getElementById('voiceLink').value.trim();
  if(!link){alert('Paste a Discord or Google Meet voice link first.');return;}
  window.open(link,'_blank');
}

document.getElementById('selectTool').onclick=()=>setTool('move');
document.getElementById('lineTool').onclick=()=>setTool('line');
document.getElementById('arrowTool').onclick=()=>setTool('arrow');
document.getElementById('eraserTool').onclick=()=>setTool('eraser');
document.getElementById('marquageTool').onclick=()=>setTool('marquage');
document.getElementById('clearDrawings').onclick=clearDrawings;
document.getElementById('formationSelect').addEventListener('change',e=>renderPitch(e.target.value));
document.getElementById('resetBtn').onclick=()=>{clearDrawings();renderPitch(document.getElementById('formationSelect').value)};
document.getElementById('micBtn').onclick=startMic;
document.getElementById('muteBtn').onclick=toggleMute;
document.getElementById('joinVoice').onclick=joinVoice;
document.getElementById('addSequenceStep').onclick=addSequenceStep;
document.getElementById('pickArea').onclick=()=>{pickingArea=true;pitch.classList.add('picking-area');setTool('move');toolHint.textContent='Click any open area on the pitch to select the target location.';};
document.getElementById('targetMode').addEventListener('change',updateTargetControls);
document.getElementById('playSequence').onclick=playSequence;
document.getElementById('clearSequence').onclick=clearSequence;
document.getElementById('sequenceAction').addEventListener('change',()=>{
  const action=document.getElementById('sequenceAction').value;
  const mode=document.getElementById('targetMode');
  if(action==='run')mode.value='area';
  if(action==='shoot')mode.value='goal';
  updateTargetControls();
});
document.getElementById('sequenceFrom').addEventListener('change',updateTargetControls);

document.getElementById('addPlayer').onclick=()=>{
  const name=document.getElementById('playerName').value.trim();
  const team=document.getElementById('teamSelect').value;
  if(!name||players[team].length>=5)return;
  players[team].push(name);
  document.getElementById('playerName').value='';
  renderLists();
  renderPitch(document.getElementById('formationSelect').value);
};

document.getElementById('sendChat').onclick=()=>{
  const input=document.getElementById('chatText');
  if(!input.value.trim())return;
  const msg=document.createElement('div');
  msg.className='msg';
  msg.textContent=`Coach: ${input.value.trim()}`;
  messages.appendChild(msg);
  input.value='';
  messages.scrollTop=messages.scrollHeight;
};

document.getElementById('saveBtn').onclick=()=>{
  localStorage.setItem('miniFootPlayers',JSON.stringify(players));
  alert('Tactic saved in this browser.');
};

document.getElementById('shareBtn').onclick=()=>navigator.clipboard?.writeText(location.href).then(()=>alert('Lobby link copied!'));

drag(ball,42);
renderLists();
renderPitch();
setTool('move');
refreshSequenceSelects();
updateTargetControls();
renderSequenceList();
messages.innerHTML='<div class="msg">System: Lobby created. Invite both teams and set your 5v5 tactic.</div>';
