// Phase 8.1 — bounded runtime modes: local development or explicitly isolated staging.
// This API never supports production mode or production payment/fiscal transport.
import {randomUUID} from "node:crypto";
function error(message,status=400){const e=new Error(message);e.httpStatus=status;return e;}
function parsedUrl(value,label) {
  try {return new URL(String(value??""));} catch {throw error("Invalid "+label);}
}
function sameOrigin(url) {
  return !url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==="/";
}
export function assertLocalRuntime(env=process.env){
 const mode=String(env.FDOS_RELEASE_MODE??"local").toLowerCase();
 if(!["local","staging"].includes(mode))
   throw error("Financial Document OS public production runtime is not enabled");
 const db=parsedUrl(env.DATABASE_URL,"PostgreSQL URL");
 if(!["postgresql:","postgres:"].includes(db.protocol)||!db.pathname||db.pathname==="/")
   throw error("DATABASE_URL must contain a valid PostgreSQL database");
 const frontend=parsedUrl(env.FDOS_FRONTEND_ORIGIN??"http://localhost:3000","frontend origin");
 if(!sameOrigin(frontend))throw error("Invalid frontend origin");
 if(mode==="staging") {
   if(env.FDOS_STAGING_CONFIRMED!=="YES"||
      env.FDOS_STAGE_DATA_POLICY!=="SYNTHETIC_ONLY")
     throw error("Staging requires explicit isolated synthetic-data approval");
   if(env.FDOS_API_HOST!=="0.0.0.0")
     throw error("Staging API must bind only to its internal container network");
   if(frontend.protocol!=="https:"||!frontend.hostname||frontend.port)
     throw error("Staging requires a dedicated HTTPS frontend origin");
   if(["localhost","127.0.0.1","[::1]"].includes(frontend.hostname)||
      frontend.hostname.endsWith(".localhost"))
     throw error("Staging must use a dedicated, non-loopback HTTPS host");
   if(env.FDOS_STAGE_DOMAIN!==frontend.hostname)
     throw error("Staging HTTPS host does not match configured staging domain");
   // Never allow remote managed/production databases from this deploy profile.
   if(db.hostname!=="db"||db.pathname!=="/fdos_staging"||
      decodeURIComponent(db.username)!=="fdos_stage"||db.port!=="5432"||
      !db.password||!["disable","prefer",""].includes(db.searchParams.get("sslmode")??""))
     throw error("Staging may connect only to isolated internal fdos_staging PostgreSQL");
   for(const [key,expected] of Object.entries({
     FDOS_COMM_MODE:"preview",FDOS_MPESA_MODE:"preview",FDOS_ETIMS_MODE:"preview",
     FDOS_AUTOMATION_LIVE_ENABLED:"NO",FDOS_AUTOMATION_LIVE_APPROVED:"NO",
     FDOS_LOCAL_ALLOW_SIGNUP:"NO",
   })) {
     if(env[key]!==expected)throw error("Staging requires disabled external services and signup: "+key);
   }
   return {origin:frontend.origin,host:"0.0.0.0",
     localOnly:false,stagingOnly:true,productionEnabled:false};
 }
 if(env.NODE_ENV==="production"||
    !["127.0.0.1","localhost"].includes(env.FDOS_API_HOST??"127.0.0.1"))
   throw error("Local financial API cannot start as a production/public server");
 if(frontend.protocol!=="http:"||!frontend.port||
    !["localhost","127.0.0.1","[::1]"].includes(frontend.hostname))
   throw error("Local frontend origin must be http://localhost:PORT or http://127.0.0.1:PORT");
 if(!["127.0.0.1","localhost","[::1]"].includes(db.hostname))
   throw error("Financial API only allows local PostgreSQL, not remote or managed databases");
 return {origin:frontend.origin,host:env.FDOS_API_HOST??"127.0.0.1",
   localOnly:true,stagingOnly:false,productionEnabled:false};
}
export function attachSecurityHeaders(res){
 res.setHeader("X-Request-Id",randomUUID());
 res.setHeader("X-Content-Type-Options","nosniff");
 res.setHeader("Referrer-Policy","no-referrer");
 res.setHeader("X-Frame-Options","DENY");
 res.setHeader("Cross-Origin-Resource-Policy","same-origin");
 res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=(), payment=()");
 res.setHeader("Content-Security-Policy","default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
 res.setHeader("Cache-Control","no-store");
}
export function safeContentType(req){
 const value=String(req.headers["content-type"]??"").toLowerCase();
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/.test(value))
  throw error("JSON Content-Type required",415);
}
export function expectedOrigin(req,origin){
 if(req.headers.origin!==origin)throw error("Origin not allowed",403);
}
export async function readJsonBody(req,maxBytes=256000){
 safeContentType(req);
 const claimed=Number(req.headers["content-length"]);
 if(req.headers["content-length"]!==undefined&&
    (!Number.isSafeInteger(claimed)||claimed<0||claimed>maxBytes))
   throw error("Request exceeds the allowed body size",413);
 const blocks=[];let received=0;
 for await(const part of req){
  received+=part.length;
  if(received>maxBytes)throw error("Request exceeds the allowed body size",413);
  blocks.push(part);
 }
 try{
   const body=received?JSON.parse(Buffer.concat(blocks,received).toString("utf8")):{};
   if(!body||typeof body!=="object"||Array.isArray(body))
     throw error("JSON object required");
   return body;
 }catch(ex){
   if(ex?.httpStatus)throw ex;
   throw error("Invalid JSON body");
 }
}
