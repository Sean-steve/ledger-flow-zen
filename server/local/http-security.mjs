// Phase 8: local-only security policy. This is NOT a public production server.
import {randomUUID} from "node:crypto";

function error(message,status=400){
 const e=new Error(message);e.httpStatus=status;return e;
}
function localUrl(value) {
 let url;
 try {url=new URL(value);}catch{throw error("Invalid local frontend origin");}
 if(url.protocol!=="http:"||
    !["127.0.0.1","localhost","[::1]"].includes(url.hostname)||
    url.pathname!=="/"||url.username||url.password||url.search||url.hash||
    !url.port)
   throw error("Local frontend origin must be http://localhost:PORT or http://127.0.0.1:PORT");
 return url.origin;
}
export function assertLocalRuntime(env=process.env){
 if(env.FDOS_RELEASE_MODE==="production"||env.FDOS_RELEASE_MODE==="live"||
    env.NODE_ENV==="production"||env.FDOS_API_HOST&&!["127.0.0.1","localhost"].includes(env.FDOS_API_HOST))
   throw error("Local financial API cannot start as a production/public server");
 const frontend=localUrl(env.FDOS_FRONTEND_ORIGIN??"http://localhost:3000");
 const db=String(env.DATABASE_URL??"");
 let databaseUrl;
 try{databaseUrl=new URL(db);}catch{throw error("DATABASE_URL must be a local PostgreSQL connection");}
 if(!["postgresql:","postgres:"].includes(databaseUrl.protocol)||
    !["localhost","127.0.0.1","[::1]"].includes(databaseUrl.hostname)||
    !databaseUrl.pathname||databaseUrl.pathname==="/")
   throw error("Financial API only allows local PostgreSQL, not remote or managed databases");
 return {origin:frontend,host:env.FDOS_API_HOST??"127.0.0.1",localOnly:true,productionEnabled:false};
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
