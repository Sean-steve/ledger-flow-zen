import postgres from "postgres";
import {assertLocalRuntime} from "./http-security.mjs";

if(!process.env.DATABASE_URL){
  throw new Error("DATABASE_URL is required for FDOS PostgreSQL");
}
// In staging, the only accepted database is the separate, private Docker
// service 'db/fdos_staging'. The normal development path remains loopback-only.
assertLocalRuntime(process.env);
export const database=postgres(process.env.DATABASE_URL,{
  max:6,idle_timeout:15,connect_timeout:5,prepare:true,
});
export async function withUser(userId,work,role="authenticated"){
 if(!["authenticated","anon"].includes(role))throw new Error("Invalid database role");
 if(role==="authenticated"&&!userId)throw new Error("Authentication is required");
 return database.begin(async tx=>{
   await tx.unsafe(role==="anon"?"SET LOCAL ROLE anon":"SET LOCAL ROLE authenticated");
   if(userId)await tx`SELECT set_config('request.jwt.claim.sub',${userId},true)`;
   return work(tx);
 });
}
