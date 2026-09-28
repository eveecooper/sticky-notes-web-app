(() => {
  const KEY = 'threadboard.v1';
  const SKIP_CONFIRM_KEY = 'threadboard.skipDeleteConfirm';
  const COLORS = ['yellow', 'pink', 'blue', 'green', 'lilac'];
  const viewport = document.getElementById('viewport');
  const world = document.getElementById('world');
  const notesLayer = document.getElementById('notes');
  const svg = document.getElementById('strings');
  const hint = document.getElementById('connectionHint');
  const zoomValue = document.getElementById('zoomValue');
  const status = document.getElementById('saveStatus');
  const helpDialog = document.getElementById('helpDialog');
  const removeButton = document.getElementById('removeButton');
  const removeHint = document.getElementById('removeHint');
  const confirmDialog = document.getElementById('confirmDialog');
  const confirmTitle = document.getElementById('confirmTitle');
  const confirmBody = document.getElementById('confirmBody');
  const confirmSkip = document.getElementById('confirmSkip');
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
  const sample = () => {
    const a = uid(), b = uid(), c = uid();
    return { notes: [
      {id:a,x:4800,y:4770,w:260,h:225,color:'yellow',text:'A place for your ideas\n\nClick here to edit this note. Drag its top edge to move it.'},
      {id:b,x:5180,y:4680,w:255,h:205,color:'pink',text:'Connect your thoughts\n\nClick a pin, then another pin to tie notes together.'},
      {id:c,x:5110,y:5070,w:270,h:190,color:'blue',text:'Make it yours\n\nAdd notes from the left. Resize them from the corner.'}
    ], links:[{id:uid(),from:a,to:b},{id:uid(),from:b,to:c}] };
  };
  let data;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    data = saved && Array.isArray(saved.notes) && Array.isArray(saved.links) ? saved : sample();
  } catch { data = sample(); }
  let scale = 1, panX = 0, panY = 0;
  let active = null, pending = null, pointerWorld = null;
  let selectedNote = null, selectedLink = null, openMenu = null, saveTimer = null;
  let removing = false;
  const HISTORY_MAX = 60;
  const clone = value => JSON.parse(JSON.stringify(value));
  let history = [clone(data)], historyAt = 0, historyKey = null, historyStamp = 0;
  function commit(key) {
    const now=Date.now(), merge=key&&key===historyKey&&now-historyStamp<900;
    historyKey=key||null;historyStamp=now;
    if(merge) {history[historyAt]=clone(data);return;}
    history=history.slice(0,historyAt+1);history.push(clone(data));
    if(history.length>HISTORY_MAX) history.shift();
    historyAt=history.length-1;
  }
  function applyHistory(step) {
    const next=historyAt+step;
    if(next<0||next>=history.length)return;
    historyAt=next;data=clone(history[historyAt]);historyKey=null;
    if(pending) cancelConnection();
    selectedNote=null;selectedLink=null;openMenu=null;render();save();
  }
  const undo = () => applyHistory(-1);
  const redo = () => applyHistory(1);
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  const noteById = id => data.notes.find(n => n.id === id);
  const save = () => {
    clearTimeout(saveTimer);
    status.textContent = 'Saving…';
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY,JSON.stringify(data)); status.textContent = 'Saved on this device'; }
      catch { status.textContent = 'Could not save on this device'; }
    }, 180);
  };
  const screenPoint = e => { const r=viewport.getBoundingClientRect(); return {x:e.clientX-r.left,y:e.clientY-r.top}; };
  const boardPoint = e => { const p=screenPoint(e); return {x:(p.x-panX)/scale,y:(p.y-panY)/scale}; };
  const pinPoint = n => ({x:n.x+n.w/2,y:n.y+3});
  const updateTransform = () => {
    world.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
    viewport.style.backgroundSize = `${32*scale}px ${32*scale}px,${32*scale}px ${32*scale}px,${6*scale}px ${6*scale}px`;
    viewport.style.backgroundPosition = `${panX}px ${panY}px`;
    zoomValue.textContent = `${Math.round(scale*100)}%`;
  };
  function renderLinks() {
    svg.replaceChildren();
    const ns='http://www.w3.org/2000/svg';
    const path = (d,cls) => { const el=document.createElementNS(ns,'path'); el.setAttribute('d',d); el.setAttribute('class',cls); return el; };
    for(const link of data.links) {
      const from=noteById(link.from),to=noteById(link.to);
      if(!from||!to) continue;
      const a=pinPoint(from),b=pinPoint(to), d=`M ${a.x} ${a.y} L ${b.x} ${b.y}`;
      const g=document.createElementNS(ns,'g');
      g.setAttribute('class',`string-group${selectedLink===link.id?' selected':''}${removing?' removable':''}`);
      g.append(path(d,'string-shadow'),path(d,'string-line'));
      const hit=path(d,'string-hit');
      hit.addEventListener('pointerdown',e=>{
        e.stopPropagation(); e.preventDefault();
        if(removing) {confirmDelete('link',()=>removeLink(link.id));return;}
        selectedLink=link.id;selectedNote=null;openMenu=null;render();
      });
      g.append(hit);svg.append(g);
    }
    if(pending && pointerWorld) {
      const a=pinPoint(noteById(pending));
      const preview=path(`M ${a.x} ${a.y} L ${pointerWorld.x} ${pointerWorld.y}`,'string-line');
      preview.style.strokeDasharray='7 5';svg.append(preview);
    }
  }
  function render() {
    notesLayer.replaceChildren();
    for(const n of data.notes) {
      const el=document.createElement('article');
      el.className=`note ${COLORS.includes(n.color)?n.color:'yellow'}${selectedNote===n.id?' selected':''}${removing?' removable':''}`;
      el.style.cssText=`left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px`;
      el.dataset.id=n.id;
      if(removing) el.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();confirmDelete('note',()=>removeNote(n.id));});
      const head=document.createElement('div');head.className='note-header';head.title='Drag to move';
      head.addEventListener('pointerdown',e=>{
        if(e.target.closest('button')) return;
        e.preventDefault();e.stopPropagation();
        selectNote(n.id);
        begin(e,'move',n);
      });
      const pin=document.createElement('button');pin.className=`pin${pending===n.id?' active':''}`;
      pin.type='button';pin.title='Tie a string to another note';pin.setAttribute('aria-label','Connect this note');
      pin.addEventListener('pointerdown',e=>{
        e.preventDefault();e.stopPropagation();
        if(pending && pending!==n.id) { connect(pending,n.id);return; }
        if(pending===n.id) {cancelConnection();return;}
        pending=n.id;pointerWorld=pinPoint(n);hint.hidden=false;viewport.classList.add('connecting');render();
        active={type:'wire',id:n.id,pointerId:e.pointerId};
      });
      head.append(pin);
      const menuButton=document.createElement('button');menuButton.className='note-menu-button';menuButton.type='button';menuButton.textContent='⋯';menuButton.title='Note options';menuButton.setAttribute('aria-label','Note options');
      menuButton.addEventListener('click',e=>{e.stopPropagation();openMenu=openMenu===n.id?null:n.id;selectedNote=n.id;selectedLink=null;render();});
      head.append(menuButton);
      if(openMenu===n.id) {
        const menu=document.createElement('div');menu.className='note-menu';menu.addEventListener('pointerdown',e=>e.stopPropagation());
        const label=document.createElement('span');label.className='menu-label';label.textContent='NOTE COLOR';menu.append(label);
        const swatches=document.createElement('div');swatches.className='swatches';
        for(const color of COLORS) {
          const swatch=document.createElement('button');swatch.type='button';swatch.className=`swatch ${color}${n.color===color?' active':''}`;
          swatch.style.setProperty('--paper',getComputedStyle(document.querySelector(`.add-note.${color}`)).getPropertyValue('--paper'));
          swatch.setAttribute('aria-label',`${color} note`);
          swatch.addEventListener('click',e=>{e.stopPropagation();n.color=color;openMenu=null;render();save();});swatches.append(swatch);
        }
        menu.append(swatches);
        const del=document.createElement('button');del.className='menu-delete';del.type='button';del.textContent='Delete note';
        del.addEventListener('click',e=>{e.stopPropagation();confirmDelete('note',()=>removeNote(n.id));});menu.append(del);head.append(menu);
      }
      el.append(head);
      const text=document.createElement('textarea');text.className='note-text';text.placeholder='Write an idea…';text.value=n.text||'';text.setAttribute('aria-label','Note text');
      text.addEventListener('focus',()=>{selectedNote=n.id;selectedLink=null;highlightSelection();});
      text.addEventListener('input',()=>{n.text=text.value;save();});el.append(text);
      const resize=document.createElement('div');resize.className='resize-handle';resize.title='Resize note';resize.setAttribute('role','button');resize.setAttribute('aria-label','Resize note');
      resize.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();selectNote(n.id);begin(e,'resize',n);});
      el.append(resize);notesLayer.append(el);
    }
    renderLinks();
  }
  function highlightSelection() {
    for(const el of notesLayer.children) el.classList.toggle('selected',el.dataset.id===selectedNote);
    renderLinks();
  }
  function selectNote(id) {selectedNote=id;selectedLink=null;openMenu=null;highlightSelection();}
  function begin(e,type,n) {
    const p=boardPoint(e);
    active={type,id:n.id,pointerId:e.pointerId,start:p,x:n.x,y:n.y,w:n.w,h:n.h};
    try {viewport.setPointerCapture(e.pointerId);}catch{}
  }
  function cancelConnection() {pending=null;pointerWorld=null;active=null;hint.hidden=true;viewport.classList.remove('connecting');render();}
  function connect(a,b) {
    if(a!==b&&!data.links.some(l=>(l.from===a&&l.to===b)||(l.from===b&&l.to===a))) {
      data.links.push({id:uid(),from:a,to:b});save();
    }
    cancelConnection();
  }
  function removeNote(id) {
    data.notes=data.notes.filter(n=>n.id!==id);data.links=data.links.filter(l=>l.from!==id&&l.to!==id);
    if(pending===id) cancelConnection();selectedNote=null;openMenu=null;render();save();
  }
  function removeLink(id) {
    data.links=data.links.filter(l=>l.id!==id);
    if(selectedLink===id) selectedLink=null;
    renderLinks();save();
  }
  function confirmDelete(kind,run) {
    let skip=false;
    try {skip=localStorage.getItem(SKIP_CONFIRM_KEY)==='1';} catch {skip=true;}
    if(skip) {run();return;}
    const note=kind==='note';
    confirmTitle.textContent=note?'Delete this note?':'Delete this string?';
    confirmBody.textContent=note?'Its strings come off with it.':'The notes it ties stay where they are.';
    confirmSkip.checked=false;confirmDialog.returnValue='';
    confirmDialog.addEventListener('close',()=>{
      if(confirmDialog.returnValue!=='ok')return;
      if(confirmSkip.checked) {try {localStorage.setItem(SKIP_CONFIRM_KEY,'1');} catch {}}
      run();
    },{once:true});
    confirmDialog.showModal();
  }
  function setRemoveMode(on) {
    if(on&&pending) cancelConnection();
    removing=on;selectedNote=null;selectedLink=null;openMenu=null;
    removeButton.classList.toggle('active',on);removeButton.setAttribute('aria-pressed',String(on));
    removeHint.hidden=!on;viewport.classList.toggle('removing',on);render();
  }
  viewport.addEventListener('pointerdown',e=>{
    if(e.button!==0 || e.target.closest?.('.note') || e.target.closest?.('.string-hit'))return;
    if(pending) {cancelConnection();return;}
    selectedNote=null;selectedLink=null;openMenu=null;render();
    active={type:'pan',pointerId:e.pointerId,start:screenPoint(e),x:panX,y:panY};viewport.classList.add('panning');
    try{viewport.setPointerCapture(e.pointerId);}catch{}
  });
  window.addEventListener('pointermove',e=>{
    if(pending && (!active || active.type==='wire')) {pointerWorld=boardPoint(e);renderLinks();}
    if(!active||e.pointerId!==active.pointerId)return;
    if(active.type==='wire')return;
    if(active.type==='pan') {
      const p=screenPoint(e);panX=active.x+p.x-active.start.x;panY=active.y+p.y-active.start.y;updateTransform();return;
    }
    const n=noteById(active.id),p=boardPoint(e);if(!n)return;
    if(active.type==='move') {n.x=clamp(active.x+p.x-active.start.x,0,9700);n.y=clamp(active.y+p.y-active.start.y,0,9700);}
    if(active.type==='resize') {n.w=clamp(active.w+p.x-active.start.x,170,700);n.h=clamp(active.h+p.y-active.start.y,145,650);}
    const el=[...notesLayer.children].find(el=>el.dataset.id===n.id);
    if(el){el.style.left=`${n.x}px`;el.style.top=`${n.y}px`;el.style.width=`${n.w}px`;el.style.height=`${n.h}px`;}
    renderLinks();
  });
  window.addEventListener('pointerup',e=>{
    if(!active||e.pointerId!==active.pointerId)return;
    if(active.type==='wire') {
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.note');
      if(target && target.dataset.id!==pending) connect(pending,target.dataset.id);
    } else if(active.type==='move'||active.type==='resize') save();
    viewport.classList.remove('panning');active=null;
  });
  window.addEventListener('pointercancel',()=>{active=null;viewport.classList.remove('panning');});
  function zoomAt(next,x,y) {
    next=clamp(next,.35,2.4);const worldX=(x-panX)/scale,worldY=(y-panY)/scale;
    scale=next;panX=x-worldX*scale;panY=y-worldY*scale;updateTransform();
  }
  viewport.addEventListener('wheel',e=>{
    e.preventDefault();const p=screenPoint(e);
    if(e.ctrlKey||e.metaKey) zoomAt(scale*Math.exp(-e.deltaY*.005),p.x,p.y);
    else {panX-=e.deltaX;panY-=e.deltaY;updateTransform();}
  },{passive:false});
  function fitView() {
    const r=viewport.getBoundingClientRect();
    if(!data.notes.length){scale=1;panX=r.width/2-5000;panY=r.height/2-5000;updateTransform();return;}
    const minX=Math.min(...data.notes.map(n=>n.x)),minY=Math.min(...data.notes.map(n=>n.y));
    const maxX=Math.max(...data.notes.map(n=>n.x+n.w)),maxY=Math.max(...data.notes.map(n=>n.y+n.h));
    const marginX=r.width<700?85:150,marginY=85;
    scale=clamp(Math.min((r.width-marginX*2)/(maxX-minX),(r.height-marginY*2)/(maxY-minY),1.15),.35,1.15);
    panX=r.width/2-(minX+maxX)/2*scale;panY=r.height/2-(minY+maxY)/2*scale;updateTransform();
  }
  document.getElementById('zoomIn').addEventListener('click',()=>zoomAt(scale*1.2,viewport.clientWidth/2,viewport.clientHeight/2));
  document.getElementById('zoomOut').addEventListener('click',()=>zoomAt(scale/1.2,viewport.clientWidth/2,viewport.clientHeight/2));
  document.getElementById('resetView').addEventListener('click',fitView);
  removeButton.addEventListener('click',()=>setRemoveMode(!removing));
  document.querySelectorAll('.add-note').forEach(button=>button.addEventListener('click',()=>{
    if(removing) setRemoveMode(false);
    const center={x:(viewport.clientWidth/2-panX)/scale,y:(viewport.clientHeight/2-panY)/scale};
    const offset=(data.notes.length%4)*22;
    const n={id:uid(),x:clamp(center.x-125+offset,0,9700),y:clamp(center.y-100+offset,0,9700),w:250,h:200,color:button.dataset.color,text:''};
    data.notes.push(n);selectedNote=n.id;selectedLink=null;openMenu=null;render();save();
    notesLayer.lastElementChild?.querySelector('textarea')?.focus();
  }));
  document.getElementById('helpButton').addEventListener('click',()=>helpDialog.showModal());
  document.addEventListener('keydown',e=>{
    if(confirmDialog.open)return;
    if(e.key==='Escape'&&pending){cancelConnection();return;}
    if(e.key==='Escape'&&removing){setRemoveMode(false);return;}
    const typing=e.target.closest?.('textarea, input, [contenteditable]');
    if(typing||helpDialog.open)return;
    if((e.key==='Delete'||e.key==='Backspace')&&selectedLink){const id=selectedLink;confirmDelete('link',()=>removeLink(id));}
    else if((e.key==='Delete'||e.key==='Backspace')&&selectedNote){const id=selectedNote;confirmDelete('note',()=>removeNote(id));}
    else if(e.key.toLowerCase()==='n'&&!e.ctrlKey&&!e.metaKey){document.querySelector('.add-note.yellow').click();}
  });
  render();fitView();
  if(!localStorage.getItem(KEY))save();
})();
