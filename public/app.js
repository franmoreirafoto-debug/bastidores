'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
// Pin dialogs and preserve document scrolling when focus enters/leaves a modal.
let modalScroll=null;
function showPinnedDialog(dialog,focusTarget){
 if(!document.querySelector('dialog[open]'))modalScroll={x:window.scrollX,y:window.scrollY};
 document.documentElement.classList.add('modal-open');
 dialog.showModal();
 (focusTarget||dialog).focus({preventScroll:true});
 if(modalScroll)window.scrollTo({left:modalScroll.x,top:modalScroll.y,behavior:'instant'});
 requestAnimationFrame(()=>{if(modalScroll&&dialog.open)window.scrollTo({left:modalScroll.x,top:modalScroll.y,behavior:'instant'});});
}
for(const dialog of document.querySelectorAll('dialog')){
 dialog.addEventListener('close',()=>{
  if(document.querySelector('dialog[open]'))return;
  document.documentElement.classList.remove('modal-open');
  const position=modalScroll;modalScroll=null;
  if(position)window.scrollTo({left:position.x,top:position.y,behavior:'instant'});
 });
}
const people=['Fran','Will','Gabi'];
const statuses=['A fazer','Em andamento','Concluída','Bloqueada'];
const curations=['Em análise','Aprovado','Não aprovado'];
const negotiations=['Não iniciada','Em contato','Em negociação','Fechado','Não fechado'];
const config={task:{label:'Produção',singular:'tarefa',add:'Nova tarefa',title:'O evento acontece aqui.',desc:'Etapas, responsáveis e prazos em um só lugar.'},speaker:{label:'Palestrantes',singular:'palestrante',add:'Novo palestrante',title:'Vozes que fazem a diferença.',desc:'Da curadoria ao convite confirmado, sem perder o próximo passo.'},partner:{label:'Parceiros',singular:'parceiro',add:'Novo parceiro',title:'Boas conexões, grandes eventos.',desc:'Acompanhe a curadoria, as propostas e cada negociação.'}};
let data={event:{name:'Meu evento',date:'',location:''},items:[]},tab='task',editing=null,eventSnapshot=null,toastTimer,saveBusy=false,refreshTimer,loaded=false;
let actor='';try{actor=localStorage.getItem('bastidores-actor')||'';}catch{}if(!people.includes(actor))actor='';$('#actor').value=actor;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=(items,value,empty)=>`${empty!==undefined?`<option value="">${esc(empty)}</option>`:''}${items.map(v=>`<option value="${esc(v)}"${v===value?' selected':''}>${esc(v)}</option>`).join('')}`;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const date=v=>v?new Date(v+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.',''):'Sem prazo';
const fullDate=v=>v?new Date(v+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}):'';
const late=i=>!!i.due&&i.due<today()&&(i.kind==='task'?i.status!=='Concluída':!['Fechado','Não fechado'].includes(i.negotiation)&&i.curation!=='Não aprovado');
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
let demoState,demoPersistence=true;
function updateDemoNotice(){
 if(!window.BASTIDORES_DEMO)return;
 $('#demo-banner').textContent=demoPersistence?'Demonstração interativa · dados salvos somente neste navegador. A versão compartilhada precisa ser hospedada.':'Demonstração sem armazenamento permanente · os dados ficam nesta prévia e serão perdidos ao recarregar. Abra o HTML fora da prévia para tentar salvar no navegador.';
}
function demoId(){
 if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function demoRead(){if(demoState)return demoState;try{demoState=JSON.parse(localStorage.getItem('bastidores-demo-v1'));}catch{demoPersistence=false;}return demoState??={event:{name:'Meu evento',date:'',location:''},items:[]};}
function demoWrite(s){demoState=s;try{localStorage.setItem('bastidores-demo-v1',JSON.stringify(s));demoPersistence=true;}catch{demoPersistence=false;}updateDemoNotice();}
async function api(path,method='GET',body){if(window.BASTIDORES_DEMO){let s=structuredClone(demoRead());if(method==='GET')return s;if(!actor)throw Error('Selecione seu nome.');if(path==='/api/event'){if(body.expectedVersion!==s.event.updatedAt)throw Error('O evento mudou. Feche e abra o formulário para tentar novamente.');s.event={name:body.name,date:body.date,location:body.location,updatedBy:actor,updatedAt:new Date().toISOString()};}else if(method==='POST'){s.items.unshift({...body,id:demoId(),updatedAt:new Date().toISOString(),updatedBy:actor});}else{const id=path.split('/').pop(),old=s.items.find(i=>i.id===id);if(!old)throw Error('Registro não encontrado.');if(body.expectedVersion!==old.updatedAt)throw Error('Este registro foi alterado. Feche e abra o formulário para ver a versão mais recente.');if(method==='DELETE')s.items=s.items.filter(i=>i.id!==id);else s.items=s.items.map(i=>i.id===id?{...body,id,updatedAt:new Date().toISOString(),updatedBy:actor}:i);}demoWrite(s);return {ok:true};}
const r=await fetch(path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});let value;try{value=await r.json();}catch{throw Error('O servidor não respondeu. Confira sua conexão.');}if(!r.ok)throw Error(value.error||'Não foi possível concluir.');return value;}
function connection(text,live){$('#connection').textContent=text;$('#connection').classList.toggle('live',live);}
async function refresh(){try{data=await api('/api/state');loaded=true;render();if(!window.BASTIDORES_DEMO)connection('Dados compartilhados',true);}catch(e){connection('Sem conexão',false);if(!loaded)$('#results').innerHTML='<div class="empty"><h3>Não foi possível carregar.</h3><p>Confira sua conexão e tente novamente.</p><button class="button secondary" data-action="retry">Tentar novamente</button></div>';toast(e.message);}}
function badge(value){const c={'Em andamento':'blue','Concluída':'green','Bloqueada':'red','Em análise':'orange','Aprovado':'green','Não aprovado':'red','Em contato':'blue','Em negociação':'orange','Fechado':'green','Não fechado':'red'}[value]||'';return `<span class="badge ${c}">${esc(value)}</span>`;}
function owner(value){return value?`<span class="owner"><span class="avatar" aria-hidden="true">${esc(value[0])}</span>${esc(value)}</span>`:'<span class="muted">Sem responsável</span>';}
function safeLink(v){try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?esc(u.href):'';}catch{return '';}}
function render(){
$('#event-name').textContent=data.event.name;document.title=`${data.event.name} · Bastidores`;$('#event-details').textContent=[fullDate(data.event.date),data.event.location].filter(Boolean).join(' · ')||'Organize cada detalhe, do primeiro convite ao grande dia.';
const tasks=data.items.filter(i=>i.kind==='task'),done=tasks.filter(i=>i.status==='Concluída').length,lates=tasks.filter(late).length;$('#done-count').textContent=`${done}/${tasks.length}`;$('#progress').style.width=`${tasks.length?done/tasks.length*100:0}%`;$('#late-count').textContent=lates;$('#late-count').nextElementSibling.textContent=lates===1?'tarefa atrasada':'tarefas atrasadas';$('#late-count').classList.toggle('overdue',!!lates);$('#late-note').textContent=lates?'Vale olhar os próximos passos.':'Nenhuma tarefa atrasada.';
for(const kind of ['speaker','partner']){const arr=data.items.filter(i=>i.kind===kind);const closed=arr.filter(i=>i.negotiation==='Fechado').length;$(`#${kind}-count`).textContent=closed;$(`#${kind}-count`).nextElementSibling.textContent=closed===1?'fechado':'fechados';$(`#${kind}-note`).textContent=`${arr.filter(i=>i.curation==='Em análise').length} em curadoria`;}
for(const kind of ['task','speaker','partner'])$(`#${kind}-total`).textContent=data.items.filter(i=>i.kind===kind).length;
renderResults();}
function renderResults(){const q=$('#search').value.trim().toLocaleLowerCase('pt-BR'),o=$('#owner-filter').value,s=$('#status-filter').value,n=$('#neg-filter').value;
let rows=data.items.filter(i=>i.kind===tab).filter(i=>(!q||[i.title,i.notes,i.topic,i.contact,i.next].join(' ').toLocaleLowerCase('pt-BR').includes(q))&&(!o||(o==='unassigned'?!i.owner:i.owner===o))&&(!s||(tab==='task'?i.status:i.curation)===s)&&(tab==='task'||!n||i.negotiation===n));
rows.sort((a,b)=>{if(tab==='task'){const ca=a.status==='Concluída',cb=b.status==='Concluída';if(ca!==cb)return ca?1:-1;}return (a.due||'9999').localeCompare(b.due||'9999')||a.title.localeCompare(b.title,'pt-BR');});
const total=data.items.filter(i=>i.kind===tab).length;
if(!rows.length){$('#results').innerHTML=`<div class="empty"><div class="empty-symbol" aria-hidden="true">${tab==='task'?'✓':tab==='speaker'?'↗':'+'}</div><h3>${total?'Nenhum resultado por aqui.':tab==='task'?'O primeiro passo começa aqui.':tab==='speaker'?'Quem vai subir ao palco?':'Quem vai construir isso com vocês?'}</h3><p>${total?'Tente outro termo ou remova os filtros.':tab==='task'?'Adicione uma tarefa, escolha quem cuida dela e defina um prazo.':`Cadastre o primeiro ${config[tab].singular} e acompanhe cada conversa até o fechamento.`}</p><button class="button secondary" data-action="${total?'clear':'new'}">${total?'Limpar filtros':'+ '+config[tab].add}</button></div>`;return;}
if(tab==='task'){$('#results').innerHTML=`<div class="table-wrap"><table class="task-table"><thead><tr><th scope="col">TAREFA / ETAPA</th><th scope="col">RESPONSÁVEL</th><th scope="col">PRAZO</th><th scope="col">STATUS</th></tr></thead><tbody>${rows.map(i=>`<tr><td><button class="task-title" data-edit="${esc(i.id)}">${esc(i.title)}</button>${i.notes?`<span class="task-notes">${esc(i.notes)}</span>`:''}</td><td>${owner(i.owner)}</td><td class="date-cell ${late(i)?'overdue':''}">${esc(date(i.due))}${late(i)?'<br><span class="small-label overdue">Atrasada</span>':''}</td><td>${badge(i.status)}</td></tr>`).join('')}</tbody></table></div>`;return;}
$('#results').innerHTML=`<div class="cards">${rows.map(i=>`<article class="person-card"><div class="card-head"><div><h3>${esc(i.title)}</h3>${i.contact?`<p class="muted">${esc(i.contact)}</p>`:''}</div><button class="card-edit" data-edit="${esc(i.id)}" aria-label="Editar ${esc(i.title)}">Editar ↗</button></div>${i.topic?`<p class="card-topic">${esc(i.topic)}</p>`:''}<div class="card-statuses"><div><span class="small-label">Curadoria</span>${badge(i.curation)}</div><div><span class="small-label">Negociação</span>${badge(i.negotiation)}</div></div>${i.link||i.portfolio?`<div class="card-links">${safeLink(i.link)?`<a href="${safeLink(i.link)}" target="_blank" rel="noopener noreferrer">${tab==='partner'?'Site / perfil':'Perfil'} ↗</a>`:''}${safeLink(i.portfolio)?`<a href="${safeLink(i.portfolio)}" target="_blank" rel="noopener noreferrer">${tab==='partner'?'Proposta':'Portfólio'} ↗</a>`:''}</div>`:''}${i.next||i.due?`<div class="card-next"><span class="small-label">PRÓXIMO PASSO</span><p>${esc(i.next||'Definir próximo passo')}</p><span class="${late(i)?'overdue':'muted'}">${i.due?esc(date(i.due))+(late(i)?' · atrasado':''):'Sem prazo definido'}</span></div>`:''}${i.value?`<p class="muted">Valor / condições: ${esc(i.value)}</p>`:''}${i.notes?`<p class="muted">${esc(i.notes)}</p>`:''}<div class="card-foot">${owner(i.owner)}<span class="card-author">${i.updatedBy?'Editado por '+esc(i.updatedBy):''}</span></div></article>`).join('')}</div>`;
}
function switchTab(kind){tab=kind;document.body.dataset.area=kind;$$('.tab').forEach(b=>{const active=b.dataset.tab===tab;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});$('#section-title').textContent=config[tab].title;$('#section-desc').textContent=config[tab].desc;$('#add-item').textContent='+ '+config[tab].add;$('#search').placeholder=`Buscar ${config[tab].singular}…`;$('#search').value='';$('#owner-filter').value='';$('#status-filter').innerHTML=options(tab==='task'?statuses:curations,'',tab==='task'?'Todos os status':'Toda a curadoria');$('#neg-filter').hidden=tab==='task';$('#neg-filter').innerHTML=options(negotiations,'','Toda a negociação');renderResults();}
function ensureActor(){if(!actor){toast('Selecione seu nome no topo para começar.');$('#actor').focus();return false;}return true;}
function field(label,name,value='',type='text',full=false,extra=''){return `<label class="field ${full?'full':''}"><span>${label}</span><input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`;}
function selectField(label,name,opts,value,empty){return `<label class="field"><span>${label}</span><select name="${name}">${options(opts,value,empty)}</select></label>`;}
function notesField(value){return `<label class="field full"><span>Observações</span><textarea name="notes" maxlength="6000" rows="3">${esc(value)}</textarea></label>`;}
function openEditor(item=null,isEvent=false){if(!loaded){toast('Aguarde os dados carregarem.');return;}if(!ensureActor())return;editing=item?structuredClone(item):null;eventSnapshot=isEvent?structuredClone(data.event):null;$('#form-error').textContent='';$('#delete-item').hidden=!item;$('#save-item').disabled=false;$('#modal-kicker').textContent=isEvent?'CONFIGURAÇÕES':config[tab].label.toUpperCase();$('#modal-title').textContent=isEvent?'Detalhes do evento':item?'Editar '+config[tab].singular:config[tab].add;
if(isEvent){$('#form-fields').innerHTML=field('Nome do evento *','name',data.event.name,'text',true,'required maxlength="150"')+field('Data do evento','date',data.event.date,'date')+field('Local','location',data.event.location,'text',false,'maxlength="200"');}
else {const i=item||{owner:'',due:'',status:'A fazer',curation:'Em análise',negotiation:'Não iniciada'};let html=field(tab==='task'?'Tarefa / etapa *':tab==='speaker'?'Nome do palestrante *':'Nome do parceiro *','title',i.title,'text',true,'required maxlength="200"');
if(tab==='task')html+=selectField('Responsável','owner',people,i.owner,'Sem responsável')+field('Prazo','due',i.due,'date')+selectField('Status','status',statuses,i.status)+notesField(i.notes||'');
else html+=field('Contato — nome, e-mail ou telefone','contact',i.contact,'text',true,'maxlength="300"')+field(tab==='speaker'?'Tema / proposta de palestra':'Tipo de parceria / contrapartidas','topic',i.topic,'text',true,'maxlength="600"')+field('Link do site ou perfil','link',i.link,'url',false,'placeholder="https://…" maxlength="2000"')+field(tab==='speaker'?'Link do portfólio':'Link da proposta / apresentação','portfolio',i.portfolio,'url',false,'placeholder="https://…" maxlength="2000"')+selectField('Curadoria','curation',curations,i.curation)+selectField('Negociação','negotiation',negotiations,i.negotiation)+selectField('Responsável','owner',people,i.owner,'Sem responsável')+field('Prazo do próximo contato','due',i.due,'date')+field('Próximo passo','next',i.next,'text',true,'maxlength="600"')+field('Valor / condições combinadas','value',i.value,'text',true,'maxlength="150"')+notesField(i.notes||'');
$('#form-fields').innerHTML=html;}
showPinnedDialog($('#editor'),$('#close-modal'));$('#form-fields').scrollTop=0;}
$('#actor').addEventListener('change',e=>{actor=e.target.value;try{localStorage.setItem('bastidores-actor',actor);}catch{}if(actor)toast(`Pronto, ${actor}. As próximas alterações terão seu nome.`);});
$$('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
$('#add-item').addEventListener('click',()=>openEditor());$('#edit-event').addEventListener('click',()=>openEditor(null,true));
for(const id of ['search','owner-filter','status-filter','neg-filter'])$('#'+id).addEventListener(id==='search'?'input':'change',renderResults);
$('#results').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.edit){const i=data.items.find(i=>i.id===b.dataset.edit);if(i)openEditor(i);}if(b.dataset.action==='new')openEditor();if(b.dataset.action==='retry')refresh();if(b.dataset.action==='clear'){$('#search').value='';$('#owner-filter').value='';$('#status-filter').value='';$('#neg-filter').value='';renderResults();}});
const close=()=>{if(!saveBusy)$('#editor').close();};$('#close-modal').onclick=close;$('#cancel-modal').onclick=close;$('#editor').addEventListener('cancel',e=>{if(saveBusy)e.preventDefault();});
async function saveEditor(){
 if(saveBusy)return;
 const form=$('#editor-form');
 $('#form-error').textContent='';
 if(!actor){$('#form-error').textContent='Selecione seu nome antes de salvar.';return;}
 // Handle the action directly: some embedded previews disable native form submission.
 if(!form.checkValidity()){
  const invalid=form.querySelector(':invalid');
  const label=invalid?.closest('label')?.querySelector('span')?.textContent||'indicado';
  $('#form-error').textContent=`Confira o campo “${label.replace(' *','')}”. ${invalid?.validity.valueMissing?'Este campo é obrigatório.':'Preencha um valor válido.'}`;
  invalid?.focus({preventScroll:true});
  form.reportValidity();
  return;
 }
 const vals=Object.fromEntries(new FormData(form));
 if(!(vals.title||vals.name||'').trim()){$('#form-error').textContent='Preencha o nome.';return;}
 saveBusy=true;$('#save-item').disabled=true;$('#save-item').textContent='Salvando…';
 try{
  const isEvent=eventSnapshot!==null;
  await api(isEvent?'/api/event':editing?'/api/items/'+editing.id:'/api/items',isEvent||editing?'PUT':'POST',{...vals,actor,kind:tab,expectedVersion:isEvent?eventSnapshot.updatedAt:editing?.updatedAt});
  await refresh();
  $('#editor').close();
  toast(window.BASTIDORES_DEMO&&!demoPersistence?'Salvo nesta prévia. Os dados serão perdidos ao recarregar.':'Salvo. Tudo no lugar.');
 }catch(err){$('#form-error').textContent=err.message||'Não foi possível salvar. Tente novamente.';}
 finally{saveBusy=false;$('#save-item').disabled=false;$('#save-item').textContent='Salvar';}
}
$('#save-item').addEventListener('click',saveEditor);
$('#editor-form').addEventListener('submit',e=>{e.preventDefault();saveEditor();});
$('#editor-form').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.target.matches('input')){e.preventDefault();saveEditor();}});
$('#delete-item').onclick=()=>{showPinnedDialog($('#confirm-dialog'),$('#cancel-delete'));};$('#cancel-delete').onclick=()=>$('#confirm-dialog').close();$('#confirm-delete').onclick=async()=>{if(!editing||!ensureActor())return;$('#confirm-delete').disabled=true;try{await api('/api/items/'+editing.id,'DELETE',{actor,expectedVersion:editing.updatedAt});$('#confirm-dialog').close();$('#editor').close();await refresh();toast('Registro excluído.');}catch(e){$('#confirm-dialog').close();$('#form-error').textContent=e.message;}finally{$('#confirm-delete').disabled=false;}};
$('#backup').onclick=async()=>{try{const fresh=await api('/api/state');const blob=new Blob([JSON.stringify({...fresh,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='bastidores-backup-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);toast('Cópia dos dados exportada.');}catch(e){toast(e.message);}};
$('.brand').addEventListener('click',e=>{e.preventDefault();switchTab('task');window.scrollTo({top:0,behavior:'instant'});});
switchTab('task');refresh();
if(window.BASTIDORES_DEMO){$('#demo-banner').hidden=false;updateDemoNotice();connection('Demonstração local',false);window.addEventListener('storage',e=>{if(e.key==='bastidores-demo-v1'){demoState=null;refresh();}});}else{const source=new EventSource('/api/live');source.addEventListener('update',()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,100);});source.addEventListener('open',()=>{connection('Dados compartilhados',true);refresh();});source.onerror=()=>connection('Reconectando…',false);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});}
