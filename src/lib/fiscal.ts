import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
export type FiscalMode="PREVIEW"|"SANDBOX";
export type FiscalStatus="PREVIEW"|"IN_FLIGHT"|"SANDBOX_ACKNOWLEDGED"|"REJECTED"|"UNKNOWN";
export type FiscalConfiguration={
 mode:FiscalMode;solution:"OSCU";sandboxReady:boolean;
 productionEnabled:false;notice:string;
};
export type FiscalProfile={
 businessId:string;taxpayerPin:string|null;businessName:string;
 solution:"OSCU";branchId:string;deviceSerial:string|null;
 taxMapping:Record<string,string>;certificationState:"UNVERIFIED";
 updatedAt:string|null;
};
export type FiscalEntry={
 id:string;businessId:string;documentId:string;mode:FiscalMode;status:FiscalStatus;
 solution:string;snapshotSha256:string;bridgeRef:string|null;
 sandboxScuId:string|null;sandboxReceiptNumber:string|null;
 errorCode:string|null;createdAt:string;completedAt:string|null;
 duplicate?:boolean;
};
export async function fiscalRequest<T>(action:string,input:Record<string,unknown>={}):Promise<T>{
 const response=await fetch("/api/local/fiscal/"+action,{
  method:"POST",credentials:"same-origin",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify(input),
 });
 const result=await response.json() as {data:T;error?:{message:string}|null};
 if(!response.ok||result.error)throw new Error(result.error?.message??"Fiscal API unavailable");
 return result.data;
}
export function useFiscalConfig(){
 return useQuery({queryKey:["fiscal-config"],queryFn:()=>fiscalRequest<FiscalConfiguration>("config"),staleTime:30000});
}
export function useFiscalProfile(businessId:string|null){
 return useQuery({enabled:!!businessId,queryKey:["fiscal-profile",businessId],
  queryFn:()=>fiscalRequest<FiscalProfile>("profile",{businessId})});
}
export function useSaveFiscalProfile(){
 const qc=useQueryClient();
 return useMutation({mutationFn:(input:{
  businessId:string;branchId:string;deviceSerial:string|null;taxMapping:Record<string,string>;
 })=>fiscalRequest<FiscalProfile>("profile/update",input),
 onSuccess:(_,args)=>void qc.invalidateQueries({queryKey:["fiscal-profile",args.businessId]})});
}
export function useFiscalSubmissions(businessId:string|null){
 return useQuery({enabled:!!businessId,queryKey:["fiscal-submissions",businessId],
  queryFn:()=>fiscalRequest<FiscalEntry[]>("submissions",{businessId})});
}
export function useFiscalDocument(businessId:string|null,documentId:string|null){
 return useQuery({enabled:!!businessId&&!!documentId,
  queryKey:["fiscal-document",businessId,documentId],
  queryFn:()=>fiscalRequest<FiscalEntry[]>("document",{businessId,documentId})});
}
export function usePrepareFiscal(){
 const qc=useQueryClient();
 return useMutation({mutationFn:(input:{
   businessId:string;documentId:string;mode:FiscalMode;requestKey:string;
 })=>fiscalRequest<FiscalEntry>("prepare",input),
 onSuccess:(_,input)=>{
  void qc.invalidateQueries({queryKey:["fiscal-submissions",input.businessId]});
  void qc.invalidateQueries({queryKey:["fiscal-document",input.businessId,input.documentId]});
 }});
}
