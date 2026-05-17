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
let recordingSequence=false;

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
    recordManualStep({type:'marquage',a,b,target});
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
  recordManualStep({type:currentTool,a:startPoint,b:p});
  drawing=false;
  previewLine=null;
});


function getBallPoint(){
  return getTokenCenter(ball);
}

function setBallPoint(p){
  move(ball,Math.max(3,Math.min(97,p.x)),Math.max(3,Math.min(97,p.y)),42);
}

function clonePoint(p){
  return {x:Number(p.x),y:Number(p.y)};
}

function recordManualStep(step){
  if(!recordingSequence)return;
  sequence.push({...step, ball:clonePoint(getBallPoint())});
  renderSequenceList();
}

function toggleRecording(){
  recordingSequence=!recordingSequence;
  const btn=document.getElementById('recordSequence');
  btn.textContent=recordingSequence?'■ Stop recording':'● Record';
  btn.classList.toggle('recording',recordingSequence);
  toolHint.textContent=recordingSequence
    ? 'Recording: draw a line or arrow. Each completed drawing becomes one replay step.'
    : 'Recording stopped. Press Play to replay your manual sequence.';
}

function renderSequenceList(){
  const list=document.getElementById('sequenceList');
  if(!list)return;
  if(sequence.length===0){list.innerHTML='<div class="sequence-step"><span>No recorded steps yet. Press Record, then draw lines or arrows on the pitch.</span></div>';return;}
  list.innerHTML=sequence.map((st,i)=>{
    const label=st.type==='arrow'?'Arrow step':st.type==='marquage'?'Marquage step':'Line step';
    return `<div class="sequence-step"><span><strong>${i+1}.</strong> ${label} <small>ball at ${Math.round(st.ball.x)}%, ${Math.round(st.ball.y)}%</small></span><button class="btn ghost" data-del-step="${i}">Delete</button></div>`;
  }).join('');
  list.querySelectorAll('[data-del-step]').forEach(btn=>btn.onclick=()=>{sequence.splice(Number(btn.dataset.delStep),1);renderSequenceList();});
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

function drawRecordedStep(st){
  if(st.type==='marquage'){
    const l1=createSvgLine(st.a,st.target,true,'marking-line sequence-active');
    const l2=createSvgLine(st.b,st.target,true,'marking-line sequence-active');
    drawingLayer.appendChild(l1); drawingLayer.appendChild(l2);
    return [l1,l2];
  }
  const line=createSvgLine(st.a,st.b,st.type==='arrow','sequence-active');
  drawingLayer.appendChild(line);
  return [line];
}

async function playSequence(){
  if(playingSequence||sequence.length===0)return;
  playingSequence=true;
  const wasRecording=recordingSequence;
  if(wasRecording)toggleRecording();
  clearDrawings();
  for(const st of sequence){
    setBallPoint(st.ball);
    await sleep(350);
    const lines=drawRecordedStep(st);
    await sleep(900);
    lines.forEach(line=>line.classList.remove('sequence-active'));
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
document.getElementById('recordSequence').onclick=toggleRecording;
document.getElementById('playSequence').onclick=playSequence;
document.getElementById('clearSequence').onclick=clearSequence;

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
renderSequenceList();
messages.innerHTML='<div class="msg">System: Lobby created. Invite both teams and set your 5v5 tactic.</div>';
