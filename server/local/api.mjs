import { createServer } from "node:http";
import { database } from "./database.mjs";
import { currentUser, handleAuth } from "./auth.mjs";
import { queryTable, runRpc } from "./domain.mjs";
import {
  communicationConfig,listCommunicationOutbox,getCommunicationPreferences,
  updateCommunicationPreferences,sendCommunication,
} from "./communications.mjs";
import {
  fiscalConfig,getFiscalProfile,saveFiscalProfile,listFiscalSubmissions,
  listFiscalDocument,prepareFiscalSubmission,
} from "./fiscal-etims.mjs";
import { callbackTokenMatches } from "./mpesa-daraja.mjs";
import {
 mpesaRuntime,mpesaProfile,saveMpesaProfile,listMpesaIntents,listMpesaInbox,
 mpesaMetrics,createMpesaRequest,simulateMpesaConfirmation,
 receiveStkCallback,receiveC2bConfirmation,reconcileC2bManually,
} from "./mpesa-payments.mjs";

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
    // Safaricom callbacks do not carry browser Origin or session cookies.
    // This endpoint is sandbox-only, bound to loopback in local development,
    // and requires an independent long random shared secret in the route.
    if(req.method==="POST"&&path.startsWith("/api/provider/mpesa/")) {
      const parts=path.split("/");
      const kind=parts[4],secret=parts[5];
      if(parts.length!==6||!["stk","c2b"].includes(kind)||
         !callbackTokenMatches(secret)) {
        return json(res,404,{error:"Not found"});
      }
      try {
        const body=await parseBody(req);
        const evidence=kind==="stk"?
          await receiveStkCallback(body):await receiveC2bConfirmation(body);
        // No evidence (amount, sender, receipt) is reflected to the caller.
        return json(res,200,kind==="c2b"?
          {ResultCode:0,ResultDesc:"Accepted for manual reconciliation"}:
          {ResultCode:0,ResultDesc:"Callback processed",status:evidence.status});
      }catch{
        return json(res,400,{ResultCode:1,ResultDesc:"Callback could not be accepted"});
      }
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
      if(path.startsWith("/api/local/mpesa/")){
        if(!user)return json(res,401,{data:null,error:{message:"Sign in required"}});
        const action=path.slice("/api/local/mpesa/".length);
        if(action==="config")return json(res,200,{data:mpesaRuntime(),error:null});
        if(action==="profile")return json(res,200,{data:await mpesaProfile(user.id,body),error:null});
        if(action==="profile/update")return json(res,200,{data:await saveMpesaProfile(user.id,body),error:null});
        if(action==="intents")return json(res,200,{data:await listMpesaIntents(user.id,body),error:null});
        if(action==="inbox")return json(res,200,{data:await listMpesaInbox(user.id,body),error:null});
        if(action==="metrics")return json(res,200,{data:await mpesaMetrics(user.id,body),error:null});
        if(action==="request")return json(res,200,{data:await createMpesaRequest(user.id,body),error:null});
        if(action==="simulate")return json(res,200,{data:await simulateMpesaConfirmation(user.id,body),error:null});
        if(action==="c2b/reconcile")return json(res,200,{data:await reconcileC2bManually(user.id,body),error:null});
        return json(res,404,{data:null,error:{message:"Unknown M-Pesa action"}});
      }
      if(path.startsWith("/api/local/fiscal/")){
        if(!user)return json(res,401,{data:null,error:{message:"Sign in required"}});
        const action=path.slice("/api/local/fiscal/".length);
        if(action==="config")return json(res,200,{data:fiscalConfig(),error:null});
        if(action==="profile")return json(res,200,{data:await getFiscalProfile(user.id,body),error:null});
        if(action==="profile/update")return json(res,200,{data:await saveFiscalProfile(user.id,body),error:null});
        if(action==="submissions")return json(res,200,{data:await listFiscalSubmissions(user.id,body),error:null});
        if(action==="document")return json(res,200,{data:await listFiscalDocument(user.id,body),error:null});
        if(action==="prepare")return json(res,200,{data:await prepareFiscalSubmission(user.id,body),error:null});
        return json(res,404,{data:null,error:{message:"Unknown fiscal endpoint"}});
      }
      if(path.startsWith("/api/local/communications/")) {
        if(!user)return json(res,401,{data:null,error:{message:"Sign in required"}});
        const action=path.slice("/api/local/communications/".length);
        if(action==="config")return json(res,200,{data:communicationConfig(),error:null});
        if(action==="outbox")return json(res,200,{data:await listCommunicationOutbox(user.id,body),error:null});
        if(action==="preferences")return json(res,200,{data:await getCommunicationPreferences(user.id,body),error:null});
        if(action==="preferences/update")return json(res,200,{data:await updateCommunicationPreferences(user.id,body),error:null});
        if(action==="send")return json(res,200,{data:await sendCommunication(user.id,body),error:null});
        return json(res,404,{data:null,error:{message:"Unknown communication endpoint"}});
      }
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
      if(error?.httpStatus && [400,401,403,404,409].includes(error.httpStatus)){
        return json(res,error.httpStatus,{data:null,error:{message:safe}});
      }
      // No database detail, stack trace or financial arguments in logs.
      const known=safe.startsWith("Invalid")||safe.startsWith("Not ")||
        safe.startsWith("Unsupported")||safe.startsWith("This table")||safe.startsWith("Business ")||
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
