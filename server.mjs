import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const dir=process.env.DATA_DIR||join(root,'data'); mkdirSync(dir,{recursive:true});
const db=new DatabaseSync(join(dir,'bastidores.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL);`);
db.prepare('INSERT OR IGNORE INTO settings VALUES (1, ?)').run(JSON.stringify({name:'Meu evento',date:'',location:''}));
const people=['Fran','Will','Gabi'], kinds=['task','speaker','partner'];
const clients=new Set();
const state=()=>({event:JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data),items:db.prepare('SELECT data FROM items ORDER BY rowid DESC').all().map(r=>JSON.parse(r.data))});
const notify=()=>{for(const c of clients)c.write('event: update\ndata: changed\n\n');};
const str=(x,max=1000)=>typeof x==='string'?x.trim().slice(0,max):'';
function requireActor(b){if(!people.includes(b.actor))throw new Error('Selecione Fran, Will ou Gabi para editar.');}
function validDate(v){const s=str(v,10);if(s&&!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error('Data inválida.');return s;}
function validLink(v){const s=str(v,2000);if(!s)return '';let u;try{u=new URL(s);}catch{throw new Error('Informe um link completo, começando com https://.');}if(!['https:','http:'].includes(u.protocol))throw new Error('Link não permitido.');return u.href;}
function itemData(b,old){requireActor(b);if(!kinds.includes(b.kind))throw new Error('Tipo inválido.');if(old&&old.kind!==b.kind)throw new Error('Tipo não pode ser alterado.');const title=str(b.title,200);if(!title)throw new Error('Preencha o nome.');if(b.owner&&!people.includes(b.owner))throw new Error('Responsável inválido.');
 const item={id:old?.id||randomUUID(),kind:b.kind,title,owner:str(b.owner,20),notes:str(b.notes,6000),due:validDate(b.due),updatedBy:b.actor,updatedAt:new Date().toISOString(),createdAt:old?.createdAt||new Date().toISOString()};
 if(b.kind==='task'){if(!['A fazer','Em andamento','Concluída','Bloqueada'].includes(b.status))throw new Error('Status inválido.');item.status=b.status;}
 else {if(!['Em análise','Aprovado','Não aprovado'].includes(b.curation)||!['Não iniciada','Em contato','Em negociação','Fechado','Não fechado'].includes(b.negotiation))throw new Error('Status inválido.');Object.assign(item,{curation:b.curation,negotiation:b.negotiation,contact:str(b.contact,300),link:validLink(b.link),portfolio:validLink(b.portfolio),topic:str(b.topic,600),next:str(b.next,600),value:str(b.value,150)});}
 return item;
}
const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'self'; form-action 'self'");
 const path=new URL(req.url,'http://localhost').pathname;
 const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 if(req.method==='GET'&&path==='/api/state')return json(200,state());
 if(req.method==='GET'&&path==='/api/live'){res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');clients.add(res);const t=setInterval(()=>res.write(': heartbeat\n\n'),25000);req.on('close',()=>{clients.delete(res);clearInterval(t);});return;}
 if(['POST','PUT','DELETE'].includes(req.method)&&path.startsWith('/api/')){
  if(req.headers['sec-fetch-site']==='cross-site')return json(403,{error:'Origem não permitida.'});
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return json(403,{error:'Origem não permitida.'});}catch{return json(403,{error:'Origem inválida.'});}}
  try{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)return json(413,{error:'Conteúdo muito grande.'});}let b;try{b=JSON.parse(raw||'{}');}catch{return json(400,{error:'Dados inválidos.'});}requireActor(b);
   if(path==='/api/event'&&req.method==='PUT'){const current=JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data);if(b.expectedVersion!==current.updatedAt)return json(409,{error:'O evento foi alterado. Feche e abra o formulário para ver a versão mais recente.'});const name=str(b.name,150);if(!name)throw new Error('Preencha o nome do evento.');db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify({name,date:validDate(b.date),location:str(b.location,200),updatedBy:b.actor,updatedAt:new Date().toISOString()}));notify();return json(200,{ok:true});}
   if(path==='/api/items'&&req.method==='POST'){const item=itemData(b);db.prepare('INSERT INTO items VALUES (?,?,?)').run(item.id,item.kind,JSON.stringify(item));notify();return json(201,item);}
   const match=path.match(/^\/api\/items\/([a-zA-Z0-9-]+)$/);
   if(match){const row=db.prepare('SELECT data FROM items WHERE id=?').get(match[1]);if(!row)return json(404,{error:'Este registro já foi excluído. Atualize a página.'});const old=JSON.parse(row.data);if(b.expectedVersion!==old.updatedAt)return json(409,{error:'Este registro foi alterado por outra pessoa. Feche e abra o formulário para ver a versão mais recente.'});if(req.method==='DELETE'){db.prepare('DELETE FROM items WHERE id=?').run(match[1]);notify();return json(200,{ok:true});}if(req.method==='PUT'){const item=itemData(b,JSON.parse(row.data));db.prepare('UPDATE items SET data=? WHERE id=?').run(JSON.stringify(item),item.id);notify();return json(200,item);}}
   return json(404,{error:'Rota não encontrada.'});
  }catch(e){console.error(e.message);return json(400,{error:e.message||'Não foi possível salvar.'});}
 }
 if(req.method==='GET'&&files[path]){const [name,type]=files[path];res.writeHead(200,{'Content-Type':type});return res.end(readFileSync(join(root,'public',name)));}
 json(404,{error:'Não encontrado.'});
});
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log(`Bastidores em http://localhost:${process.env.PORT||3000}`));
process.on('SIGTERM',()=>{for(const c of clients)c.end();server.close(()=>{db.close();process.exit(0);});});
