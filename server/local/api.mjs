import { createServer } from "node:http";
import { database } from "./database.mjs";
import { currentUser, handleAuth } from "./auth.mjs";
import { queryTable, runRpc } from "./domain.mjs";

const HOST=process.env.FDOS_API_HOST??"127.0.0.1";
const PORT=Number(process.env.FDOS_API_PORT??5012);
const ORIGIN=process.env.FDOS_FRONTEND_ORIGIN??"http://localhost:3000";
if (!["127.0.0.1","localhost"].includes(HOST)) {
  throw new Error("Development financial API must bind to loopback only");
}
function json(res,status,body) {
  res.writeHead(status,{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer",
    "X-Frame-Options":"DENY",
  });
  res.end(JSON.stringify(body));
}
async function parseBody(req) {
  let text="";
  for await (const part of req) {
    text+=part.toString("utf8");
    if(text.length>256000) throw new Error("Request body too large");
  }
  try { return JSON.parse(text||"{}"); }
  catch { throw new Error("Invalid JSON body"); }
}
export function createLocalApiServer() {
  return createServer(async (req,res)=>{
    const path=new URL(req.url??"/","http://localhost").pathname;
    if (req.method==="GET" && path==="/api/local/health") {
      try {
        await database`SELECT 1`;
        return json(res,200,{status:"ok",backend:"local-postgres"});
      } catch { return json(res,503,{error:"Database unavailable"}); }
    }
    if (req.method==="GET" && path==="/api/local/auth/user") {
      try { return json(res,200,{data:await currentUser(req),error:null}); }
      catch { return json(res,503,{data:null,error:{message:"Auth store unavailable"}}); }
    }
    if (req.method!=="POST" || !path.startsWith("/api/local/")) {
      return json(res,404,{data:null,error:{message:"Not found"}});
    }
    // Exact origin check prevents cross-site POSTs against HttpOnly session cookies.
    if (req.headers.origin!==ORIGIN) return json(res,403,{data:null,error:{message:"Origin not allowed"}});
    try {
      const body=await parseBody(req);
      if (path.startsWith("/api/local/auth/")) {
        const action=path.slice("/api/local/auth/".length);
        const result=await handleAuth(req,res,action,body);
        return json(res,200,{data:result.user,error:null});
      }
      const user=await currentUser(req);
      if (path==="/api/local/query") {
        if(!user) return json(res,401,{data:null,error:{message:"Sign in required"}});
        return json(res,200,{data:await queryTable(user.id,body),error:null});
      }
      if (path==="/api/local/rpc") {
        if (!user && body.name!=="get_shared_document") {
          return json(res,401,{data:null,error:{message:"Sign in required"}});
        }
        return json(res,200,{data:await runRpc(user?.id??null,body),error:null});
      }
      return json(res,404,{data:null,error:{message:"Not found"}});
    } catch(error) {
      const safe=error instanceof Error?error.message:"Request failed";
      // No database detail, stack trace or financial arguments in logs.
      const known=safe.startsWith("Invalid")||safe.startsWith("Not ")||
        safe.startsWith("Only ")||safe.startsWith("Expected")||
        safe.startsWith("Missing")||safe.startsWith("Incorrect")||
        safe.startsWith("Unknown")||safe.startsWith("Unauthorised")||
        safe.startsWith("Already ")||safe.startsWith("Too many")||
        safe.includes("required")||safe.includes("permitted")||
        safe.includes("not allowed")||safe.includes("exceeds")||
        safe.includes("mismatch")||safe.includes("not found")||
        safe.includes("cannot")||safe.includes("must");
      return json(res,known?400:500,{data:null,error:{message:known?safe:"Database operation failed"}});
    }
  });
}
if(process.argv[1] && import.meta.url===new URL("file://"+process.argv[1]).href) {
  const server=createLocalApiServer();
  server.listen(PORT,HOST,()=>{
    console.log(`Financial Document OS local API http://${HOST}:${PORT}`);
  });
}
