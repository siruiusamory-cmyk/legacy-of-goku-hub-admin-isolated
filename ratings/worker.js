const enc=new TextEncoder();
const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export const random=()=>base64(crypto.getRandomValues(new Uint8Array(32)));
export const digest=async value=>base64(await crypto.subtle.digest('SHA-256',enc.encode(value)));
const now=()=>Math.floor(Date.now()/1000);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const sql=(env,query,...args)=>env.DB.prepare(query).bind(...args);
function headers(env){return {'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':env.SITE_ORIGIN,'Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};}
const json=(env,data,status=200)=>Response.json(data,{status,headers:headers(env)});
async function body(request){
 if(request.headers.get('Content-Type')!=='application/json')fail(415,'JSON required');
 const reader=request.body?.getReader();if(!reader)fail(400,'Body required');let text='',length=0;
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1024){await reader.cancel();fail(413,'Body too large');}text+=new TextDecoder().decode(value);}
 try{return JSON.parse(text);}catch{fail(400,'Invalid JSON');}
}
async function limit(env,key,maximum){
 const bucket=Math.floor(now()/60);const row=await sql(env,'INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',`${key}:${bucket}`,now()+120).first();
 if(row.count>maximum)fail(429,'Too many requests; try again later');
}
async function catalog(env){
 const response=await fetch(env.SITE_ORIGIN+'/catalog.json',{redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'Cache-Control':'no-cache'}});
 if(!response.ok)fail(503,'Catalog unavailable');const data=await response.json();
 if(!Array.isArray(data.projects)||data.projects.some(p=>!/^(?:gh-[0-9]+|ext-[a-z0-9]{12})$/.test(p.id)))fail(503,'Catalog unavailable');return data.projects;
}
async function approved(env,id){if(!/^(?:gh-[0-9]+|ext-[a-z0-9]{12})$/.test(id))fail(404,'Project unavailable');if(!(await catalog(env)).some(p=>p.id===id&&p.availability==='available'))fail(404,'Project unavailable');}
async function aggregate(env,id){const row=await sql(env,'SELECT total,count FROM totals WHERE project_id=?',id).first();const count=row?.count||0;return {count,average:count?row.total/count:null};}
function credential(request){const raw=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];if(!raw)fail(401,'Browser voting credential required');return digest(raw);}
export async function handle(request,env){
 try{
  if(env.RATINGS_ENABLED!=='true'||!env.RATE_SALT)return json(env,{error:'Ratings unavailable'},503);
  const url=new URL(request.url);if(url.origin!==env.API_ORIGIN)fail(400,'Wrong API origin');const origin=request.headers.get('Origin');
  if(request.method==='OPTIONS'){if(origin!==env.SITE_ORIGIN)fail(403,'Origin rejected');return new Response(null,{status:204,headers:{...headers(env),'Access-Control-Allow-Methods':'GET, PUT, DELETE','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});}
  if(!['GET','PUT','DELETE'].includes(request.method))fail(405,'Method not allowed');
  if(request.method!=='GET'&&origin!==env.SITE_ORIGIN)fail(403,'Origin rejected');
  const ip=await digest(env.RATE_SALT+':'+(request.headers.get('CF-Connecting-IP')||'local'));await limit(env,'read:'+ip,120);
  if(url.pathname==='/identity'&&request.method==='DELETE'){
   const hash=await credential(request);await limit(env,'write:'+ip,30);
   await env.DB.batch([sql(env,'INSERT INTO erasures VALUES(?,?,?,?) ON CONFLICT(credential_hash,project_id) DO UPDATE SET erased_at=excluded.erased_at,expires=excluded.expires',hash,'*',now(),now()+604800),sql(env,'DELETE FROM votes WHERE credential_hash=?',hash)]);return json(env,{deleted:true});
  }
  const match=/^\/projects\/(gh-[0-9]+|ext-[a-z0-9]{12})(\/mine)?$/.exec(url.pathname);if(!match)fail(404,'Not found');
  const [,id,mine]=match;await approved(env,id);
  if(!mine&&request.method==='GET')return json(env,await aggregate(env,id));if(!mine)fail(405,'Method not allowed');
  const hash=await credential(request);
  if(request.method==='GET'){const row=await sql(env,'SELECT score,excluded FROM votes WHERE project_id=? AND credential_hash=?',id,hash).first();return json(env,{score:row?.score??null,excluded:!!row?.excluded,...await aggregate(env,id)});}
  await limit(env,'write:'+ip,30);await limit(env,'credential:'+hash,15);
  if(request.method==='PUT'){
   const data=await body(request);if(!Number.isInteger(data?.score)||data.score<1||data.score>7)fail(400,'Score must be an integer from 1 to 7');
   await sql(env,'INSERT INTO votes(project_id,credential_hash,score,excluded) VALUES(?,?,?,EXISTS(SELECT 1 FROM excluded_credentials WHERE credential_hash=?)) ON CONFLICT(project_id,credential_hash) DO UPDATE SET score=excluded.score,excluded=excluded.excluded',id,hash,data.score,hash).run();
  }else if(request.method==='DELETE')await env.DB.batch([sql(env,'INSERT INTO erasures VALUES(?,?,?,?) ON CONFLICT(credential_hash,project_id) DO UPDATE SET erased_at=excluded.erased_at,expires=excluded.expires',hash,id,now(),now()+604800),sql(env,'DELETE FROM votes WHERE project_id=? AND credential_hash=?',id,hash)]);
  const row=await sql(env,'SELECT score,excluded FROM votes WHERE project_id=? AND credential_hash=?',id,hash).first();return json(env,{score:row?.score??null,excluded:!!row?.excluded,...await aggregate(env,id)});
 }catch(error){return json(env,{error:error.status?error.message:'Ratings unavailable'},error.status||503);}
}
export async function cleanup(env){
 if(env.RATINGS_ENABLED!=='true')return;
 await env.DB.batch(['limits','erasures'].map(table=>sql(env,`DELETE FROM ${table} WHERE expires<=?`,now())));
 const ids=(await catalog(env)).map(p=>p.id);
 await env.DB.batch([sql(env,'DELETE FROM votes WHERE project_id NOT IN (SELECT value FROM json_each(?))',JSON.stringify(ids)),sql(env,'DELETE FROM totals WHERE NOT EXISTS(SELECT 1 FROM votes WHERE votes.project_id=totals.project_id)')]);
}
export default {fetch:handle,scheduled:(_event,env,ctx)=>ctx.waitUntil(cleanup(env))};


