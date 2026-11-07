import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";

export type TeamRole="OWNER"|"ADMIN"|"ACCOUNTANT"|"VIEWER";
export type DocTemplateType="INVOICE"|"PRO_FORMA"|"QUOTATION"|"CREDIT_NOTE"|"DEBIT_NOTE";
export type BusinessBranding={
 accentColor:string;headerTagline:string|null;footerNote:string|null;
 hasLogo:boolean;logoUrl:string|null;updatedAt:string|null;
};
export type IntegrationFlags={
 emailEnabled:boolean;whatsappEnabled:boolean;mpesaEnabled:boolean;etimsSandboxEnabled:boolean;
};
export type BusinessConfiguration={
 businessId:string;branding:BusinessBranding;
 templates:Partial<Record<DocTemplateType,string>>;
 integrationFlags:IntegrationFlags;
 providers:{
  email:{configured:boolean;serverLive:boolean};
  whatsapp:{configured:boolean;serverLive:boolean};
  mpesa:{mode:"PREVIEW"|"SANDBOX";ready:boolean;productionEnabled:false};
  etims:{mode:"PREVIEW"|"SANDBOX";ready:boolean;productionEnabled:false};
 };
 notice:string;
};
export type TeamMember={
 id:string;userId:string;role:TeamRole;email:string;fullName:string|null;
 createdAt:string;
};
export type TeamInvitation={
 id:string;email:string;role:Exclude<TeamRole,"OWNER">;status:string;
 expiresAt:string;createdAt:string;
};
export type TeamResult={businessId:string;members:TeamMember[];invitations:TeamInvitation[]};
export type InviteResult={id:string;businessId:string;email:string;
 role:Exclude<TeamRole,"OWNER">;expiresAt:string;token:string};
export async function configRequest<T>(action:string,input:Record<string,unknown>={}):Promise<T>{
 const res=await fetch("/api/local/config/"+action,{
  method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(input),
 });
 const body=await res.json() as {data:T;error?:{message:string}|null};
 if(!res.ok||body.error)throw new Error(body.error?.message??"Business configuration unavailable");
 return body.data;
}
export const useBusinessConfig=(businessId:string|null)=>useQuery({
 enabled:!!businessId,queryKey:["business-config",businessId],
 queryFn:()=>configRequest<BusinessConfiguration>("business",{businessId}),
});
export const useTeam=(businessId:string|null)=>useQuery({
 enabled:!!businessId,queryKey:["business-team",businessId],
 queryFn:()=>configRequest<TeamResult>("team",{businessId}),
});
function useInvalidateConfiguration(){
 const qc=useQueryClient();
 return (businessId:string)=>{
  void qc.invalidateQueries({queryKey:["business-config",businessId]});
  void qc.invalidateQueries({queryKey:["business-team",businessId]});
 };
}
export function useSaveBranding(){
 const invalidate=useInvalidateConfiguration();
 return useMutation({
  mutationFn:(input:{businessId:string;accentColor:string;
    headerTagline:string|null;footerNote:string|null})=>
    configRequest<BusinessConfiguration>("branding/save",input),
  onSuccess:(_,input)=>invalidate(input.businessId),
 });
}
export function useUploadLogo(){
 const invalidate=useInvalidateConfiguration();
 return useMutation({
  mutationFn:(input:{businessId:string;mime:string;base64:string})=>
    configRequest<BusinessConfiguration>("branding/logo/upload",input),
  onSuccess:(_,input)=>invalidate(input.businessId),
 });
}
export function useRemoveLogo(){
 const invalidate=useInvalidateConfiguration();
 return useMutation({
  mutationFn:(businessId:string)=>configRequest<BusinessConfiguration>("branding/logo/remove",{businessId}),
  onSuccess:(_,businessId)=>invalidate(businessId),
 });
}
export function useSaveTemplateRules(){
 const invalidate=useInvalidateConfiguration();
 return useMutation({
  mutationFn:(input:{businessId:string;templates:Partial<Record<DocTemplateType,string|null>>})=>
    configRequest<BusinessConfiguration>("templates/save",input),
  onSuccess:(_,input)=>invalidate(input.businessId),
 });
}
export function useSaveIntegrationFlags(){
 const invalidate=useInvalidateConfiguration();
 return useMutation({
  mutationFn:(input:{businessId:string;flags:IntegrationFlags})=>
    configRequest<BusinessConfiguration>("integrations/save",input),
  onSuccess:(_,input)=>invalidate(input.businessId),
 });
}
export function useInviteTeamMember(){
 const invalidate=useInvalidateConfiguration();
 return useMutation({
  mutationFn:(input:{businessId:string;email:string;role:Exclude<TeamRole,"OWNER">})=>
    configRequest<InviteResult>("team/invite",input),
  onSuccess:(_,input)=>invalidate(input.businessId),
 });
}
export function useAcceptTeamInvitation(){
 const qc=useQueryClient();
 return useMutation({
  mutationFn:(token:string)=>configRequest<{businessId:string;role:TeamRole}>("team/accept",{token}),
  onSuccess:()=>void qc.invalidateQueries(),
 });
}
export function useRevokeInvite(){
 const invalidate=useInvalidateConfiguration();
 return useMutation({
  mutationFn:(input:{businessId:string;invitationId:string})=>
    configRequest<{revoked:boolean}>("team/revoke",input),
  onSuccess:(_,input)=>invalidate(input.businessId),
 });
}
export function useChangeMemberRole(){
 const invalidate=useInvalidateConfiguration();
 return useMutation({
  mutationFn:(input:{businessId:string;memberId:string;role:Exclude<TeamRole,"OWNER">})=>
    configRequest<TeamResult>("team/role",input),
  onSuccess:(_,input)=>invalidate(input.businessId),
 });
}
export function useRemoveMember(){
 const invalidate=useInvalidateConfiguration();
 return useMutation({
  mutationFn:(input:{businessId:string;memberId:string})=>
    configRequest<TeamResult>("team/remove",input),
  onSuccess:(_,input)=>invalidate(input.businessId),
 });
}
