import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
export type OperationalReadiness={
 releaseGate:"BLOCKED";
 certification:"LOCAL_TESTING_ONLY";
 runtime:{origin:string;host:string;localOnly:true;productionEnabled:false;
  backend:string;publicHttpsAvailable:false};
 database:{postgresMajor:number;moduleReady:boolean;
  moduleChecks:Record<string,boolean>};
 financialWorklist:{
  uncertainMessages:number;unreconciledMpesa:number;
  uncertainAutomation:number;uncertainFiscal:number;
  invoicesWithoutEtims:number;
 };
 providers:{communications:string;mpesa:string;etims:string;
  emailConfigured:boolean;whatsappConfigured:boolean};
 productionBlockers:string[];
 checkedAt:string;
};
export async function operationsRequest<T>(action:string,payload:Record<string,unknown>={}):Promise<T>{
 const response=await fetch("/api/local/ops/"+action,{
  method:"POST",credentials:"same-origin",
  headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),
 });
 const result=await response.json() as {data:T;error?:{message:string}|null};
 if(!response.ok||result.error)throw new Error(result.error?.message??"Operational request failed");
 return result.data;
}
export const useReadiness=(businessId:string|null)=>useQuery({
 enabled:!!businessId,queryKey:["operational-readiness",businessId],
 queryFn:()=>operationsRequest<OperationalReadiness>("readiness",{businessId}),
 refetchOnWindowFocus:false,staleTime:30_000,
});
export function useRevokeAllSessions(){
 const qc=useQueryClient();
 return useMutation({
  mutationFn:()=>operationsRequest<{revokedCount:number}>("revoke-sessions"),
  onSuccess:()=>qc.clear(),
 });
}
