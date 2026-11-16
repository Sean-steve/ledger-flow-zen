import assert from "node:assert/strict";
import {test} from "node:test";
import {assertLocalRuntime} from "../../server/local/http-security.mjs";
const isolated={
 FDOS_RELEASE_MODE:"staging",
 FDOS_STAGING_CONFIRMED:"YES",
 FDOS_STAGE_DATA_POLICY:"SYNTHETIC_ONLY",
 FDOS_API_HOST:"0.0.0.0",
 FDOS_STAGE_DOMAIN:"staging-finance.test",
 FDOS_FRONTEND_ORIGIN:"https://staging-finance.test",
 FDOS_LOCAL_ALLOW_SIGNUP:"NO",
 FDOS_COMM_MODE:"preview",
 FDOS_MPESA_MODE:"preview",
 FDOS_ETIMS_MODE:"preview",
 FDOS_AUTOMATION_LIVE_ENABLED:"NO",
 FDOS_AUTOMATION_LIVE_APPROVED:"NO",
 DATABASE_URL:"postgresql://fdos_stage:test@db:5432/fdos_staging",
 NODE_ENV:"production",
};
test("synthetic, HTTPS, internal-DB staging is explicitly permitted but never production",()=>{
 const runtime=assertLocalRuntime(isolated);
 assert.equal(runtime.stagingOnly,true);
 assert.equal(runtime.localOnly,false);
 assert.equal(runtime.productionEnabled,false);
 assert.equal(runtime.host,"0.0.0.0");
 assert.equal(runtime.origin,"https://staging-finance.test");
});
test("staging must remain separate from the local or real production database",()=>{
 for(const value of [
  "postgresql://fdos_stage:test@localhost:5432/fdos_staging",
  "postgresql://fdos_stage:test@db:5432/fdos_local",
  "postgresql://fdos_stage:test@db:5432/prod",
  "postgresql://postgres:test@db:5432/fdos_staging",
  "postgresql://fdos_stage:test@db:5432/fdos_staging?sslmode=require",
 ]) {
  assert.throws(()=>assertLocalRuntime({...isolated,DATABASE_URL:value}),/isolated internal|Staging may connect/);
 }
});
test("staging refuses public signup, live provider modes and automation delivery",()=>{
 const invalid={
  FDOS_LOCAL_ALLOW_SIGNUP:"YES",FDOS_COMM_MODE:"live",
  FDOS_MPESA_MODE:"sandbox",FDOS_ETIMS_MODE:"sandbox",
  FDOS_AUTOMATION_LIVE_ENABLED:"YES",FDOS_AUTOMATION_LIVE_APPROVED:"YES",
 };
 for(const [key,value] of Object.entries(invalid)){
  assert.throws(()=>assertLocalRuntime({...isolated,[key]:value}),/disabled external services/);
 }
});
test("staging rejects unacknowledged, cleartext, wrong-domain and production startup",()=>{
 assert.throws(()=>assertLocalRuntime({...isolated,FDOS_STAGING_CONFIRMED:"NO"}),/isolated synthetic-data/);
 assert.throws(()=>assertLocalRuntime({...isolated,FDOS_STAGE_DATA_POLICY:"REAL_CUSTOMERS"}),/isolated synthetic-data/);
 assert.throws(()=>assertLocalRuntime({...isolated,FDOS_FRONTEND_ORIGIN:"http://staging-finance.test"}),/HTTPS/);
 assert.throws(()=>assertLocalRuntime({...isolated,FDOS_STAGE_DOMAIN:"wrong.test"}),/does not match/);
 assert.throws(()=>assertLocalRuntime({...isolated,FDOS_API_HOST:"127.0.0.1"}),/container network/);
 assert.throws(()=>assertLocalRuntime({...isolated,FDOS_RELEASE_MODE:"production"}),/production runtime/);
 assert.throws(()=>assertLocalRuntime({...isolated,FDOS_RELEASE_MODE:"live"}),/production runtime/);
});
test("developer local-only security contract and loopback DB are preserved",()=>{
 const local={
  FDOS_RELEASE_MODE:"local",
  FDOS_API_HOST:"127.0.0.1",
  FDOS_FRONTEND_ORIGIN:"http://localhost:3000",
  DATABASE_URL:"postgresql://fdos_dev:test@127.0.0.1:55434/fdos_local",
 };
 assert.equal(assertLocalRuntime(local).localOnly,true);
 assert.throws(()=>assertLocalRuntime({...local,NODE_ENV:"production"}),/production\/public/);
 assert.throws(()=>assertLocalRuntime({...local,FDOS_API_HOST:"0.0.0.0"}),/production\/public/);
 assert.throws(()=>assertLocalRuntime({...local,DATABASE_URL:isolated.DATABASE_URL}),/local PostgreSQL/);
});
