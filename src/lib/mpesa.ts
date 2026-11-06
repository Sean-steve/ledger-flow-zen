import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
export type MpesaConfig={
 mode:"PREVIEW"|"SANDBOX";sandboxReady:boolean;configured:boolean;
 productionEnabled:false;notice:string;
};
export type MpesaProfile={
 businessId:string;businessName:string;shortcode:string|null;
 shortcodeType:"PAYBILL"|"TILL";businessMpesaInstructions:string|null;
};
export type MpesaIntent={
 id:string;businessId:string;invoiceId:string;clientId:string;
 mode:"PREVIEW"|"SANDBOX";status:"PREVIEW"|"PENDING"|"CONFIRMED"|"FAILED"|"UNKNOWN"|"REVIEW_REQUIRED";
 shortcode:string;amount:number;currency:"KES";phoneMasked:string;
 checkoutRequestId:string|null;providerReceipt:string|null;
 errorCode:string|null;paymentId:string|null;receiptId:string|null;
 createdAt:string;updatedAt:string;duplicate?:boolean;
};
export type MpesaMetrics={
 pending_simulations:number;pending_stk:number;confirmed:number;exceptions:number;
 simulated_amount:string;sandbox_amount:string;c2b_review_count:number;
};
export type C2bReview={
 id:string;shortcode:string;provider_receipt:string;amount:string;
 bill_reference:string|null;phone_masked:string|null;
 status:string;review_reason:string;created_at:string;reviewed_at:string|null;
};
export async function mpesaRequest<T>(action:string,body:Record<string,unknown>={}):Promise<T>{
 const response=await fetch("/api/local/mpesa/"+action,{
  method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(body),
 });
 const result=await response.json() as {data:T;error?:{message:string}|null};
 if(!response.ok||result.error)throw new Error(result.error?.message??"M-Pesa request failed");
 return result.data;
}
export function useMpesaConfig(){
 return useQuery({queryKey:["mpesa-config"],queryFn:()=>mpesaRequest<MpesaConfig>("config"),staleTime:30000});
}
export function useMpesaProfile(businessId:string|null){
 return useQuery({enabled:!!businessId,queryKey:["mpesa-profile",businessId],
  queryFn:()=>mpesaRequest<MpesaProfile>("profile",{businessId})});
}
export function useMpesaIntents(businessId:string|null){
 return useQuery({enabled:!!businessId,queryKey:["mpesa-intents",businessId],
  queryFn:()=>mpesaRequest<MpesaIntent[]>("intents",{businessId})});
}
export function useMpesaMetrics(businessId:string|null){
 return useQuery({enabled:!!businessId,queryKey:["mpesa-metrics",businessId],
  queryFn:()=>mpesaRequest<MpesaMetrics>("metrics",{businessId})});
}
export function useMpesaC2bInbox(businessId:string|null){
 return useQuery({enabled:!!businessId,queryKey:["mpesa-c2b",businessId],
  queryFn:()=>mpesaRequest<C2bReview[]>("inbox",{businessId})});
}
function invalidate(qc:ReturnType<typeof useQueryClient>,businessId:string){
 for(const key of ["mpesa-profile","mpesa-intents","mpesa-metrics","mpesa-c2b"]){
  void qc.invalidateQueries({queryKey:[key,businessId]});
 }
 for(const key of ["invoice_ledger","payments","receipts","documents","client_balances"]){
  void qc.invalidateQueries({queryKey:[key]});
 }
}
export function useSaveMpesaProfile(){
 const qc=useQueryClient();
 return useMutation({mutationFn:(input:{businessId:string;shortcode:string;shortcodeType:"PAYBILL"|"TILL"})=>
  mpesaRequest<MpesaProfile>("profile/update",input),
 onSuccess:(_,input)=>invalidate(qc,input.businessId)});
}
export function useCreateMpesaRequest(){
 const qc=useQueryClient();
 return useMutation({mutationFn:(input:{
  businessId:string;invoiceId:string;phone:string;amount:number;requestKey:string;
 })=>mpesaRequest<MpesaIntent>("request",input),
 onSuccess:(_,input)=>invalidate(qc,input.businessId)});
}
export function useSimulateMpesaConfirmation(){
 const qc=useQueryClient();
 return useMutation({mutationFn:(input:{businessId:string;intentId:string})=>
  mpesaRequest<MpesaIntent>("simulate",input),
 onSuccess:(_,input)=>invalidate(qc,input.businessId)});
}
