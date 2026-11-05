import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const base=process.env.APP_URL?.replace(/\/$/,'');
const password=process.env.DEMO_PASSWORD;
const readOnly=process.argv.includes('--read-only');
assert.ok(base,'Set APP_URL to the application to check.');
if(!readOnly)assert.ok(password,'Set DEMO_PASSWORD for the isolated demonstration accounts.');
const checks=[];
const pass=message=>{checks.push(message);console.log('PASS',message);};
async function call(path,token,body){
  const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-PropCare':'1',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  assert.ok(response.ok,`${path}: HTTP ${response.status}`);
  const json=await response.json();return json.data??json;
}
let evidence, passed=false;
try {
  const health=await call('/health');assert.equal(health.database,'PostgreSQL');assert.equal(health.status,'success');
  if(process.env.EXPECTED_SHA)assert.equal(health.version,process.env.EXPECTED_SHA);
  pass('Release responds with PostgreSQL connectivity');
  const root=await fetch(base,{signal:AbortSignal.timeout(20000)});assert.equal(root.status,200);
  const html=await root.text();assert.match(html,/id="root"/);
  const script=html.match(/src="([^"]+\.js)"/);
  assert.ok(script,'React entry point must reference a JavaScript bundle');
  const assetUrl=new URL(script[1],base+'/');
  assert.equal(assetUrl.origin,new URL(base).origin,'Application bundle must use the same origin');
  const asset=await fetch(assetUrl,{signal:AbortSignal.timeout(20000)});
  assert.equal(asset.status,200,'React bundle must be available');
  assert.match(asset.headers.get('content-type') || '',/javascript/,'React bundle must not fall back to an HTML error page');
  pass('React entry point and JavaScript bundle are served');
  const specResponse=await fetch(base+'/api/openapi/v1.json',{signal:AbortSignal.timeout(20000)});
  assert.equal(specResponse.status,200,'OpenAPI specification must be served');
  const spec=await specResponse.json();assert.match(spec.openapi,/^3\./);
  assert.ok(spec.paths?.['/api/requests']?.post,'Maintenance creation endpoint must be documented');
  assert.equal(spec.components?.securitySchemes?.bearerAuth?.scheme,'bearer');
  pass('OpenAPI authentication and maintenance endpoints are available');
  evidence={base,version:health.version};
  if(!readOnly){
  const users={};
  for(const [role,email] of Object.entries({tenant:'sarahwilliams@example.com',manager:'michael.jacobs@obsrealty.co.za',technician:'johan.vdm@obsrealty.co.za',admin:'admin@obsrealty.co.za',other:'priya.naidoo@example.com'}))users[role]=(await call('/auth/login',null,{email,password})).token;
  await call('/users',users.admin);await call('/reports',users.manager);
  pass('All four roles authenticate; admin and manager screens have API data');
  const units=await call('/units',users.tenant);
  const request=await call('/requests',users.tenant,{title:'Deployment verification '+new Date().toISOString(),detail:'Fictional maintenance record created by the hosted verification script.',unitId:units[0].id,categoryId:'plumbing',urgency:'normal'});
  await call(`/requests/${request.id}/photos`,users.tenant,{filename:'repair.png',kind:'issue',data:readFileSync(new URL('./fixtures/repair.png',import.meta.url)).toString('base64')});
  const detail=await call(`/requests/${request.id}`,users.tenant);
  const photoPath=`/requests/${request.id}/photos/${detail.photos[0].id}`;
  const photo=await fetch(base+'/api'+photoPath,{headers:{Authorization:'Bearer '+users.tenant}});
  assert.equal(photo.status,200);assert.equal(photo.headers.get('content-type'),'image/jpeg');
  const bytes=Buffer.from(await photo.arrayBuffer());assert.equal(bytes[0],255);assert.equal(bytes[1],216);
  assert.equal((await fetch(base+'/api'+photoPath)).status,401);
  assert.equal((await fetch(base+'/api'+photoPath,{headers:{Authorization:'Bearer '+users.other}})).status,404);
  pass('Photo round-trip works; anonymous and unrelated tenants cannot access it');
  await call(`/requests/${request.id}/assign`,users.manager,{technicianId:'T1',urgency:'normal'});
  for(const action of ['accept','complete'])await call(`/requests/${request.id}/status`,users.technician,{action});
  await call(`/requests/${request.id}/status`,users.tenant,{action:'confirm'});
  await call(`/requests/${request.id}/rate`,users.tenant,{stars:5});
  const closed=await call(`/requests/${request.id}`,users.tenant);
  assert.equal(closed.request.status,'closed');assert.equal(closed.rating,5);
  pass('Tenant → manager → technician → tenant closure and rating succeed');
  evidence={base,version:health.version,requestId:request.id,photoId:detail.photos[0].id,photoSha256:createHash('sha256').update(bytes).digest('hex')};
  }
  passed=true;
} finally {
  const output=readOnly?'test-results/hosted-read-only':'test-results/hosted';
  mkdirSync(output,{recursive:true});
  writeFileSync(output+'/results.json',JSON.stringify({checkedAt:new Date().toISOString(),mode:readOnly?'read-only':'workflow',passed,checks,evidence},null,2));
}
