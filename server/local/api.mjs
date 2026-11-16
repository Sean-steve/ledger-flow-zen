import { createServer } from "node:http";
import {assertLocalRuntime,attachSecurityHeaders,expectedOrigin,readJsonBody} from "./http-security.mjs";
import {releaseReadiness} from "./release-readiness.mjs";
import { database } from "./database.mjs";
import { currentUser, handleAuth, revokeAllSessions } from "./auth.mjs";
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
 getBusinessConfig,saveBranding,saveLogo,removeLogo,loadLogo,
 saveTemplateRules,saveIntegrationFlags,listTeam,inviteTeamMember,
 acceptTeamInvitation,revokeTeamInvitation,updateTeamRole,removeTeamMember,
} from "./business-config.mjs";
import {
  automationRuntime,getAutomationPolicy,saveAutomationPolicy,scanAutomation,
  listAutomationJobs,dispatchAutomationJob,listFinancialNotifications,
  markNotificationRead,
} from "./automation.mjs";
import {
 mpesaRuntime,mpesaProfile,saveMpesaProfile,listMpesaIntents,listMpesaInbox,
 mpesaMetrics,createMpesaRequest,simulateMpesaConfirmation,
 receiveStkCallback,receiveC2bConfirmation,reconcileC2bManually,
} from "./mpesa-payments.mjs";

const {host:HOST,origin:ORIGIN}=assertLocalRuntime(process.env);
const PORT=Number(process.env.FDOS_API_PORT??5012);
if(!Number.isInteger(PORT)||PORT<1024||PORT>65535)
  throw new Error("Invalid local financial API port");
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

export function createLocalApiServer() {
  return createServer(async (req,res)=>{
    attachSecurityHeaders(res);
    const path=new URL(req.url??"/","http://localhost").pathname;
    if(req.method==="GET"&&path.startsWith("/api/local/config/logo/")){
      // Private, authenticated, bounded raster assets; never expose SQL blobs.
      try{
        const user=await currentUser(req);
        if(!user)return json(res,401,{data:null,error:{message:"Sign in required"}});
        const businessId=path.slice("/api/local/config/logo/".length);
        const logo=await loadLogo(user.id,{businessId});
        res.writeHead(200,{
          "Content-Type":logo.mime,"Content-Length":logo.bytes.length,
          "Cache-Control":"private, max-age=120","X-Content-Type-Options":"nosniff",
          "Content-Security-Policy":"default-src 'none'; sandbox",
          "Referrer-Policy":"no-referrer",
        });
        return res.end(logo.bytes);
      }catch(error){
        return json(res,error?.httpStatus??404,{data:null,error:{message:"Logo unavailable"}});
      }
    }
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
        const body=await readJsonBody(req);
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
      const body=await readJsonBody(req,path==="/api/local/config/branding/logo/upload"?365000:256000);
      if (path.startsWith("/api/local/auth/")) {
        const action=path.slice("/api/local/auth/".length);
        const result=await handleAuth(req,res,action,body);
        return json(res,200,{data:result.user,error:null});
      }
      const user=await currentUser(req);
      if(path==="/api/local/ops/revoke-sessions"){
        if(!user)return json(res,401,{data:null,error:{message:"Sign in required"}});
        return json(res,200,{data:await revokeAllSessions(user.id,res),error:null});
      }
      if(path==="/api/local/ops/readiness"){
        if(!user)return json(res,401,{data:null,error:{message:"Sign in required"}});
        return json(res,200,{data:await releaseReadiness(user.id,body),error:null});
      }
      if(path.startsWith("/api/local/config/")){
        if(!user)return json(res,401,{data:null,error:{message:"Sign in required"}});
        const action=path.slice("/api/local/config/".length);
        if(action==="business")return json(res,200,{data:await getBusinessConfig(user.id,body),error:null});
        if(action==="branding/save")return json(res,200,{data:await saveBranding(user.id,body),error:null});
        if(action==="branding/logo/upload")return json(res,200,{data:await saveLogo(user.id,body),error:null});
        if(action==="branding/logo/remove")return json(res,200,{data:await removeLogo(user.id,body),error:null});
        if(action==="templates/save")return json(res,200,{data:await saveTemplateRules(user.id,body),error:null});
        if(action==="integrations/save")return json(res,200,{data:await saveIntegrationFlags(user.id,body),error:null});
        if(action==="team")return json(res,200,{data:await listTeam(user.id,body),error:null});
        if(action==="team/invite")return json(res,200,{data:await inviteTeamMember(user.id,body),error:null});
        if(action==="team/accept")return json(res,200,{data:await acceptTeamInvitation(user.id,body),error:null});
        if(action==="team/revoke")return json(res,200,{data:await revokeTeamInvitation(user.id,body),error:null});
        if(action==="team/role")return json(res,200,{data:await updateTeamRole(user.id,body),error:null});
        if(action==="team/remove")return json(res,200,{data:await removeTeamMember(user.id,body),error:null});
        return json(res,404,{data:null,error:{message:"Unknown business configuration endpoint"}});
      }
      if(path.startsWith("/api/local/automation/")){
        if(!user)return json(res,401,{data:null,error:{message:"Sign in required"}});
        const action=path.slice("/api/local/automation/".length);
        if(action==="config")return json(res,200,{data:automationRuntime(),error:null});
        if(action==="policy")return json(res,200,{data:await getAutomationPolicy(user.id,body),error:null});
        if(action==="policy/update")return json(res,200,{data:await saveAutomationPolicy(user.id,body),error:null});
        if(action==="scan")return json(res,200,{data:await scanAutomation(user.id,body),error:null});
        if(action==="jobs")return json(res,200,{data:await listAutomationJobs(user.id,body),error:null});
        if(action==="dispatch")return json(res,200,{data:await dispatchAutomationJob(user.id,body),error:null});
        if(action==="notifications")return json(res,200,{data:await listFinancialNotifications(user.id,body),error:null});
        if(action==="notifications/read")return json(res,200,{data:await markNotificationRead(user.id,body),error:null});
        return json(res,404,{data:null,error:{message:"Unknown automation endpoint"}});
      }
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
      if(error?.httpStatus && [400,401,403,404,409,413,415,429].includes(error.httpStatus)){
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
