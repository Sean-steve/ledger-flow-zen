import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
export type AutomationChannel="EMAIL"|"WHATSAPP";
export type AutomationPolicy={
 businessId:string;enabled:boolean;channel:AutomationChannel;
 dueSoonDays:number;onDue:boolean;overdueEveryDays:number;
 autoSendEnabled:boolean;maxPerRun:number;lastScannedAt:string|null;
};
export type AutomationRuntime={mode:"PREVIEW"|"LIVE_OPT_IN";liveEnabled:boolean;timezone:string;notice:string};
export type AutomationJob={
 id:string;businessId:string;documentId:string;clientId:string;
 kind:"DUE_SOON"|"DUE_TODAY"|"OVERDUE";channel:AutomationChannel;
 status:"READY"|"HELD"|"PREVIEWED"|"ACCEPTED"|"FAILED"|"UNKNOWN"|"SKIPPED";
 scheduledOn:string;balanceSnapshot:number;currency:string;holdCode:string|null;
 outboxId:string|null;createdAt:string;processedAt:string|null;duplicate?:boolean;
};
export type FinancialNotice={
 id:string;businessId:string;kind:"REMINDER_READY"|"PAYMENT_RECORD_CREATED"|"MPESA_REVIEW_REQUIRED";
 title:string;message:string;recordId:string|null;createdAt:string;readAt:string|null;
};
export type ScanResult={enabled:boolean;created:number;held:number;notifications:number;checkedOn:string};
export async function automationRequest<T>(action:string,input:Record<string,unknown>={}):Promise<T>{
 const response=await fetch("/api/local/automation/"+action,{
  method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(input),
 });
 const result=await response.json() as {data:T;error?:{message:string}|null};
 if(!response.ok||result.error)throw new Error(result.error?.message??"Automation API unavailable");
 return result.data;
}
export const useAutomationConfig=()=>useQuery({
 queryKey:["automation-config"],queryFn:()=>automationRequest<AutomationRuntime>("config"),
 staleTime:30_000,
});
export const useAutomationPolicy=(businessId:string|null)=>useQuery({
 enabled:!!businessId,queryKey:["automation-policy",businessId],
 queryFn:()=>automationRequest<AutomationPolicy>("policy",{businessId}),
});
export const useAutomationJobs=(businessId:string|null)=>useQuery({
 enabled:!!businessId,queryKey:["automation-jobs",businessId],
 queryFn:()=>automationRequest<AutomationJob[]>("jobs",{businessId}),
});
export const useFinancialNotifications=(businessId:string|null)=>useQuery({
 enabled:!!businessId,queryKey:["financial-notifications",businessId],
 queryFn:()=>automationRequest<FinancialNotice[]>("notifications",{businessId}),
});
function useAutomationRefresh(){
 const qc=useQueryClient();
 return (businessId:string)=>{
  void qc.invalidateQueries({queryKey:["automation-jobs",businessId]});
  void qc.invalidateQueries({queryKey:["automation-policy",businessId]});
  void qc.invalidateQueries({queryKey:["financial-notifications",businessId]});
  void qc.invalidateQueries({queryKey:["communication-outbox",businessId]});
 };
}
export function useUpdateAutomationPolicy(){
 const refresh=useAutomationRefresh();
 return useMutation({
  mutationFn:(input:AutomationPolicy)=>automationRequest<AutomationPolicy>("policy/update",input),
  onSuccess:(_,input)=>refresh(input.businessId),
 });
}
export function useScanAutomation(){
 const refresh=useAutomationRefresh();
 return useMutation({
  mutationFn:(businessId:string)=>automationRequest<ScanResult>("scan",{businessId}),
  onSuccess:(_,businessId)=>refresh(businessId),
 });
}
export function useDeliverAutomationJob(){
 const refresh=useAutomationRefresh();
 return useMutation({
  mutationFn:(input:{businessId:string;jobId:string})=>
    automationRequest<AutomationJob>("dispatch",input),
  onSuccess:(_,input)=>refresh(input.businessId),
 });
}
export function useMarkFinancialNotificationRead(){
 const refresh=useAutomationRefresh();
 return useMutation({
  mutationFn:(input:{businessId:string;notificationId:string})=>
    automationRequest<FinancialNotice>("notifications/read",input),
  onSuccess:(_,input)=>refresh(input.businessId),
 });
}
