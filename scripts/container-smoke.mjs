import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {setTimeout as pause} from 'node:timers/promises';

// All containers and volumes belong to this isolated run; no existing deployment is touched.
const name='propcare-smoke-'+Date.now(), image=name+':test';
const database=name+'-db', application=name+'-app';
const volumes=[name+'-postgres',name+'-photos'];
const password='Test1!'+randomBytes(16).toString('hex');
const jwt=randomBytes(48).toString('hex');
const version=process.env.GITHUB_SHA || 'container-smoke';
const base='http://127.0.0.1:5129', checks=[];
function docker(...args){return execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024}).trim();}
function pass(check){checks.push(check);console.log('PASS',check);}
async function ready(){
 for(let i=0;i<90;i++){
  try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(1500)});if(r.ok)return await r.json();}catch{}
  await pause(1000);
 }
 throw Error('Container health endpoint did not become ready.');
}
async function call(path,token,body){
 const r=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-PropCare':'1',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.ok(r.ok,`${path}: HTTP ${r.status}`);
 const j=await r.json();return j.data??j;
}
function launch(){docker('run','-d','--name',application,'--network',name,'-p','127.0.0.1:5129:8080','-v',volumes[1]+':/app/storage','-e','ASPNETCORE_ENVIRONMENT=Production','-e',`ConnectionStrings__PropCare=Host=${database};Database=propcare;Username=propcare;Password=${password}`,'-e','Jwt__Key='+jwt,'-e','SeedDemo=true','-e','DemoPassword='+password,'-e','RELEASE_SHA='+version,image);}
try{
 docker('build','-t',image,'.');pass('Production Docker image builds');
 docker('network','create',name);
 for(const volume of volumes)docker('volume','create',volume);
 docker('run','-d','--name',database,'--network',name,'-v',volumes[0]+':/var/lib/postgresql','-e','POSTGRES_DB=propcare','-e','POSTGRES_USER=propcare','-e','POSTGRES_PASSWORD='+password,'postgres:18');
 for(let i=0;i<60;i++){try{docker('exec',database,'pg_isready','-U','propcare');break;}catch{if(i===59)throw Error('PostgreSQL did not become ready');await pause(1000);}}
 launch();const health=await ready();assert.equal(health.version,version);assert.equal(health.database,'PostgreSQL');
 assert.notEqual(docker('exec',application,'id','-u'),'0');pass('Non-root production host connects to PostgreSQL and reports its release');
 const page=await fetch(base);assert.equal(page.status,200);assert.match(await page.text(),/id="root"/);pass('Container serves the React application');
 const login=await call('/auth/login',null,{email:'sarahwilliams@example.com',password});
 const units=await call('/units',login.token);assert.ok(units.length);
 const request=await call('/requests',login.token,{title:'Container persistence check',detail:'Isolated test record created before restart.',unitId:units[0].id,categoryId:'plumbing',urgency:'normal'});
 await call(`/requests/${request.id}/photos`,login.token,{filename:'repair.png',kind:'issue',data:readFileSync('scripts/fixtures/repair.png').toString('base64')});
 const before=await call(`/requests/${request.id}`,login.token);
 const photo=base+`/api/requests/${request.id}/photos/${before.photos[0].id}`;
 const getPhoto=async()=>{const r=await fetch(photo,{headers:{Authorization:'Bearer '+login.token}});assert.equal(r.status,200);return Buffer.from(await r.arrayBuffer());};
 const bytes=await getPhoto();assert.ok(bytes.length);assert.equal((await fetch(photo)).status,401);pass('Uploaded photo is persisted and requires authentication');
 docker('rm','-f',application);docker('restart',database);launch();await ready();
 const after=await call(`/requests/${request.id}`,login.token);
 assert.equal(after.request.id,request.id);assert.equal(after.request.title,'Container persistence check');assert.deepEqual(await getPhoto(),bytes);
 pass('Request, session and byte-identical photo survive container recreation and database restart');
}catch(error){
 console.error(error.message.replaceAll(password,'[redacted]').replaceAll(jwt,'[redacted]'));
 try{console.error(docker('logs','--tail','60',application).replaceAll(password,'[redacted]').replaceAll(jwt,'[redacted]'));}catch{}
 process.exitCode=1;
}finally{
 mkdirSync('test-results/container',{recursive:true});writeFileSync('test-results/container/results.json',JSON.stringify({version,checks,passed:!process.exitCode},null,2));
 for(const container of [application,database])try{docker('rm','-f',container);}catch{}
 for(const volume of volumes)try{docker('volume','rm',volume);}catch{}
 try{docker('network','rm',name);}catch{}
 try{docker('image','rm',image);}catch{}
}
