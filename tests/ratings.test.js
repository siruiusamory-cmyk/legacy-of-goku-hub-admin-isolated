import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {handle,random,digest,cleanup} from '../ratings/worker.js';
import {recoverySQL} from '../tools/ratings/recover.js';
const origin='https://site.example',api='https://ratings.example',ids=['gh-1398951057','gh-1429374563','gh-1432341427'];
function binding(db){return {prepare(query){return {bind(...args){const stmt=db.prepare(query);return {first:async()=>stmt.get(...args)||null,run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}}),_all:()=>({results:stmt.all(...args)})};}};},async batch(statements){db.exec('BEGIN');try{const out=statements.map(s=>s._all());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};}
async function setup(t){
 const db=new DatabaseSync(':memory:');for(const name of ['0001_ratings.sql','0002_erasures.sql','0003_exclusion_triggers.sql'])db.exec(await fs.readFile(new URL('../ratings/migrations/'+name,import.meta.url),'utf8'));
 const env={DB:binding(db),RATINGS_ENABLED:'true',SITE_ORIGIN:origin,API_ORIGIN:api,RATE_SALT:random()};
 const original=globalThis.fetch;let projects=ids.map(id=>({id,availability:'available'})),down=false;
 globalThis.fetch=async url=>{assert.equal(url,origin+'/catalog.json');if(down)throw Error('offline');return Response.json({projects});};t.after(()=>{globalThis.fetch=original;db.close();});
 const call=(path,method='GET',data,token,extra={})=>handle(new Request(api+path,{method,headers:{Origin:origin,...(data!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...extra},body:data===undefined?undefined:JSON.stringify(data)}),env);
 return {db,env,call,setCatalog:v=>projects=v,down:()=>down=true};
}
test('all three anonymous projects save, reload, change and remove without accounts',async t=>{
 const x=await setup(t),token=random();for(const id of ids){const route='/projects/'+id;assert.deepEqual(await (await x.call(route)).json(),{average:null,count:0});assert.equal((await x.call(route+'/mine','PUT',{score:7},token)).status,200);assert.equal((await (await x.call(route+'/mine','GET',undefined,token)).json()).score,7);await x.call(route+'/mine','PUT',{score:3},token);assert.deepEqual(await (await x.call(route)).json(),{average:3,count:1});await x.call(route+'/mine','DELETE',undefined,token);assert.deepEqual(await (await x.call(route)).json(),{average:null,count:0});}
 assert.deepEqual(x.db.prepare('PRAGMA table_info(votes)').all().map(c=>c.name),['project_id','credential_hash','score','excluded']);assert.doesNotMatch(JSON.stringify(x.db.prepare('SELECT * FROM erasures').all()),new RegExp(token));
});
test('concurrent upserts preserve one current vote and accurate multi-browser aggregates',async t=>{
 const x=await setup(t),token=random(),other=random(),route='/projects/'+ids[0]+'/mine';await Promise.all([1,2,3,4,5,6,7].map(score=>x.call(route,'PUT',{score},token)));assert.equal(x.db.prepare('SELECT count(*) n FROM votes').get().n,1);await x.call(route,'PUT',{score:7},token);await x.call(route,'PUT',{score:2},other);assert.deepEqual(await (await x.call('/projects/'+ids[0])).json(),{average:4.5,count:2});await x.call('/identity','DELETE',undefined,token);assert.deepEqual(await (await x.call('/projects/'+ids[0])).json(),{average:2,count:1});
});
test('another browser cannot read, edit or remove a credential identity vote',async t=>{
 const x=await setup(t),a=random(),b=random(),route='/projects/'+ids[0]+'/mine';await x.call(route,'PUT',{score:6},a);assert.equal((await (await x.call(route,'GET',undefined,b)).json()).score,null);await x.call(route,'DELETE',undefined,b);assert.equal((await (await x.call(route,'GET',undefined,a)).json()).score,6);assert.equal((await x.call(route,'PUT',{score:4})).status,401);assert.equal((await x.call(route,'DELETE',undefined,'invalid')).status,401);
});
test('input, origin and project validation fail closed',async t=>{
 const x=await setup(t),token=random(),route='/projects/'+ids[0]+'/mine';for(const score of [0,8,1.1,'7',null,true])assert.equal((await x.call(route,'PUT',{score},token)).status,400);assert.equal((await x.call(route,'PUT',{score:4},token,{Origin:'https://attacker.example'})).status,403);assert.equal((await x.call('/projects/gh-9/mine','PUT',{score:4},token)).status,404);assert.equal((await x.call('/projects/fixture-1')).status,404);assert.equal((await x.call(route,'POST',{},token)).status,405);
 const preflight=await handle(new Request(api+route,{method:'OPTIONS',headers:{Origin:origin}}),x.env);assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null);assert.equal((await handle(new Request(api+route,{method:'OPTIONS',headers:{Origin:'https://evil.example'}}),x.env)).status,403);
});
test('deletion removes own rows only; identity persists without storing raw credential',async t=>{
 const x=await setup(t),a=random(),b=random();for(const id of ids)await x.call('/projects/'+id+'/mine','PUT',{score:6},a);await x.call('/projects/'+ids[0]+'/mine','PUT',{score:4},b);await x.call('/identity','DELETE',undefined,a);const rows=x.db.prepare('SELECT * FROM votes').all();assert.equal(rows.length,1);assert.equal(rows[0].credential_hash,await digest(b));assert.doesNotMatch(JSON.stringify(rows),new RegExp(b));
});
test('fraud exclusion removes scores and prevents deletion/recreation bypass',async t=>{
 const x=await setup(t),a=random(),hash=await digest(a),route='/projects/'+ids[0]+'/mine';await x.call(route,'PUT',{score:7},a);x.db.prepare('INSERT INTO excluded_credentials VALUES(?,?)').run(hash,'automated-abuse');assert.deepEqual(await (await x.call('/projects/'+ids[0])).json(),{average:null,count:0});await x.call(route,'DELETE',undefined,a);const r=await (await x.call(route,'PUT',{score:5},a)).json();assert.equal(r.excluded,true);assert.equal(r.count,0);x.db.prepare('DELETE FROM excluded_credentials WHERE credential_hash=?').run(hash);assert.equal((await (await x.call('/projects/'+ids[0])).json()).average,5);
});
test('deleted projects disappear immediately; scheduled cleanup purges their votes',async t=>{
 const x=await setup(t),token=random();await x.call('/projects/'+ids[0]+'/mine','PUT',{score:6},token);x.setCatalog([]);assert.equal((await x.call('/projects/'+ids[0])).status,404);await cleanup(x.env);assert.equal(x.db.prepare('SELECT count(*) n FROM votes').get().n,0);
});
test('database enforces range and unique identity/project without handler',async t=>{
 const x=await setup(t),hash=await digest(random());assert.throws(()=>x.db.prepare('INSERT INTO votes VALUES(?,?,?,0)').run(ids[0],hash,9));assert.throws(()=>x.db.prepare('INSERT INTO votes VALUES(?,?,?,0)').run(ids[0],hash,1.5));x.db.prepare('INSERT INTO votes VALUES(?,?,?,0)').run(ids[0],hash,3);assert.throws(()=>x.db.prepare('INSERT INTO votes VALUES(?,?,?,0)').run(ids[0],hash,4));
});
test('credential and IP abuse limits; service failures are unavailable, never zero',async t=>{
 const x=await setup(t),token=random(),route='/projects/'+ids[0]+'/mine';for(let i=0;i<15;i++)await x.call(route,'PUT',{score:4},token);assert.equal((await x.call(route,'PUT',{score:7},token)).status,429);assert.equal((await (await x.call('/projects/'+ids[0])).json()).average,4);x.down();const response=await x.call('/projects/'+ids[0]);assert.equal(response.status,503);assert.equal((await response.json()).count,undefined);x.env.RATINGS_ENABLED='false';assert.equal((await x.call('/projects/'+ids[0])).status,503);
});
test('network mutation limits apply across fresh identities',async t=>{
 const x=await setup(t),route='/projects/'+ids[0]+'/mine';for(let i=0;i<30;i++)assert.equal((await x.call(route,'PUT',{score:4},random())).status,200);assert.equal((await x.call(route,'PUT',{score:7},random())).status,429);assert.equal(x.db.prepare('SELECT count(*) n FROM votes').get().n,30);
});
test('oversized inputs and database quota failures do not create votes or zero aggregates',async t=>{
 const x=await setup(t),route='/projects/'+ids[0]+'/mine';assert.equal((await x.call(route,'PUT',{score:7,padding:'x'.repeat(2048)},random())).status,413);assert.equal(x.db.prepare('SELECT count(*) n FROM votes').get().n,0);const env={...x.env,DB:{prepare(){throw Error('D1 quota exhausted');}}};const response=await handle(new Request(api+'/projects/'+ids[0]),env);assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Ratings unavailable'});
});
test('recovery excludes erased and fraudulent identities and removed projects',async()=>{
 const hash=await digest(random()),time=2000000,snapshot={exported_at:time-100,votes:[{project_id:ids[0],credential_hash:hash,score:7,excluded:0}]};const ledger={exported_at:time,erasures:[{credential_hash:hash,project_id:'*',erased_at:time-50}],excluded_credentials:[]};const output=await recoverySQL(snapshot,ledger,{projects:ids.map(id=>({id,availability:'available'}))},time);assert.doesNotMatch(output,/INSERT INTO votes/);await assert.rejects(recoverySQL({...snapshot,exported_at:0},ledger,{projects:[]},time));await assert.rejects(recoverySQL(snapshot,{...ledger,exported_at:time-301},{projects:[]},time));
});
test('recovery honors a successful appeal after an excluded snapshot was exported',async()=>{
 const hash=await digest(random()),time=2000000,snapshot={exported_at:time-100,votes:[{project_id:ids[0],credential_hash:hash,score:7,excluded:1}]};const ledger={exported_at:time,erasures:[],excluded_credentials:[]};const sql=await recoverySQL(snapshot,ledger,{projects:[{id:ids[0],availability:'available'}]},time);const db=new DatabaseSync(':memory:');try{for(const name of ['0001_ratings.sql','0002_erasures.sql','0003_exclusion_triggers.sql'])db.exec(await fs.readFile(new URL('../ratings/migrations/'+name,import.meta.url),'utf8'));db.exec(sql);assert.equal(db.prepare('SELECT excluded FROM votes').get().excluded,0);assert.equal(db.prepare('SELECT count,total FROM totals').get().count,1);assert.equal(db.prepare('SELECT total FROM totals').get().total,7);}finally{db.close();}
});

