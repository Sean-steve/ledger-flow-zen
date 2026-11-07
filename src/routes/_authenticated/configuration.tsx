import {createFileRoute,Link} from "@tanstack/react-router";
import {useEffect,useState} from "react";
import {Palette,ShieldCheck,UploadCloud,PlugZap,Trash2} from "lucide-react";
import {toast} from "sonner";
import {useWorkspace} from "@/components/app-shell";
import {useSession} from "@/lib/db";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import {
 Select,SelectContent,SelectItem,SelectTrigger,SelectValue,
} from "@/components/ui/select";
import {DOCUMENT_TEMPLATES} from "@/lib/document-templates";
import {
 useBusinessConfig,useSaveBranding,useUploadLogo,useRemoveLogo,
 useSaveTemplateRules,useSaveIntegrationFlags,useTeam,
 type BusinessBranding,type DocTemplateType,type IntegrationFlags,
} from "@/lib/business-config";

export const Route=createFileRoute("/_authenticated/configuration")({
 head:()=>({meta:[{title:"Business Configuration — Financial Document OS"}]}),
 component:BusinessConfigurationPage,
});
const TYPES:DocTemplateType[]=["INVOICE","PRO_FORMA","QUOTATION","CREDIT_NOTE","DEBIT_NOTE"];
function BusinessConfigurationPage(){
 const {business,businessId}=useWorkspace();
 const session=useSession();
 const config=useBusinessConfig(businessId);
 const team=useTeam(businessId);
 const brand=useSaveBranding();
 const upload=useUploadLogo();
 const removeLogo=useRemoveLogo();
 const templates=useSaveTemplateRules();
 const integrations=useSaveIntegrationFlags();
 const [branding,setBranding]=useState<BusinessBranding|null>(null);
 const [rules,setRules]=useState<Record<DocTemplateType,string>>({
  INVOICE:"business_default",PRO_FORMA:"business_default",QUOTATION:"business_default",
  CREDIT_NOTE:"business_default",DEBIT_NOTE:"business_default",
 });
 const [flags,setFlags]=useState<IntegrationFlags|null>(null);
 useEffect(()=>{
  if(!config.data)return;
  setBranding(config.data.branding);
  const nextRules=Object.fromEntries(TYPES.map(t=>[
    t,config.data.templates[t]??"business_default",
  ])) as Record<DocTemplateType,string>;
  setRules(nextRules);
  setFlags(config.data.integrationFlags);
 },[config.data]);
 const myRole=team.data?.members.find(member=>
  member.userId===session.userId)?.role;
 // Provider and membership permissions are enforced on the backend regardless
 // of client-side disabled state.
 async function saveBranding(){
  if(!branding||!businessId)return;
  try{
   await brand.mutateAsync({businessId,accentColor:branding.accentColor,
    headerTagline:branding.headerTagline,footerNote:branding.footerNote});
   toast.success("Branding saved; existing issued document data is unchanged");
  }catch(e){toast.error(e instanceof Error?e.message:"Could not save branding");}
 }
 async function saveTemplateRules(){
  if(!businessId)return;
  try{
   await templates.mutateAsync({businessId,
    templates:Object.fromEntries(TYPES.map(t=>[t,
     rules[t]==="business_default"?null:rules[t]]))});
   toast.success("Template defaults saved for new documents");
  }catch(e){toast.error(e instanceof Error?e.message:"Could not save templates");}
 }
 async function saveIntegrations(){
  if(!businessId||!flags)return;
  try{
   await integrations.mutateAsync({businessId,flags});
   toast.success("Business provider permissions saved");
  }catch(e){toast.error(e instanceof Error?e.message:"Could not update integration controls");}
 }
 async function fileUpload(file:File){
  if(!businessId)return;
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>262144||file.size<24){
   toast.error("Use a PNG, JPEG or WebP under 256 KB");return;
  }
  try{
   const bytes=new Uint8Array(await file.arrayBuffer());
   let binary="";for(let i=0;i<bytes.length;i+=8192){
    binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   }
   await upload.mutateAsync({businessId,mime:file.type,base64:btoa(binary)});
   toast.success("Business logo uploaded securely");
  }catch(error){toast.error(error instanceof Error?error.message:"Logo upload failed");}
 }
 async function deleteLogo(){
  if(!businessId)return;
  try{
   await removeLogo.mutateAsync(businessId);
   toast.success("Logo removed");
  }catch(error){toast.error(error instanceof Error?error.message:"Could not remove logo");}
 }
 const rows=[
  {key:"emailEnabled",title:"Email",mode:config.data?.providers.email.serverLive?"LIVE":"PREVIEW",
    ready:config.data?.providers.email.configured,
    description:"Resend requires verified domain, sender and secure HTTPS customer links."},
  {key:"whatsappEnabled",title:"WhatsApp",mode:config.data?.providers.whatsapp.serverLive?"LIVE":"PREVIEW",
    ready:config.data?.providers.whatsapp.configured,
    description:"Meta Cloud API requires approved templates and each customer's recorded opt-in."},
  {key:"mpesaEnabled",title:"M-Pesa (Daraja)",mode:config.data?.providers.mpesa.mode??"PREVIEW",
    ready:config.data?.providers.mpesa.ready,
    description:"Safaricom sandbox activation is separate; production collection is not enabled."},
  {key:"etimsSandboxEnabled",title:"KRA eTIMS (OSCU)",mode:config.data?.providers.etims.mode??"PREVIEW",
    ready:config.data?.providers.etims.ready,
    description:"KRA certification is deferred. This controls approved sandbox only."},
 ] as const;
 return <div className="space-y-6">
  <header className="flex flex-wrap items-center justify-between gap-4">
   <div><h1 className="text-3xl">Business Configuration</h1>
    <p className="mt-1 text-sm text-muted-foreground">
     Brand identity, document defaults, and integration permissions for {business.name}.
    </p></div>
   <Button asChild variant="outline"><Link to="/team">Manage team permissions</Link></Button>
  </header>
  {config.isError?<Card><CardContent className="py-6 text-destructive">{config.error.message}</CardContent></Card>:null}
  <Card><CardHeader><CardTitle className="flex items-center gap-2"><Palette className="size-5"/>Branding</CardTitle></CardHeader>
   <CardContent className="space-y-5">
    <p className="text-sm text-muted-foreground">
     Use a verified raster logo and optional color, tagline and footer on document previews, exports and receipts.
     Existing financial records, invoice numbering and KRA status are not modified.
    </p>
    {branding?<div className="space-y-4">
     <div className="grid gap-5 md:grid-cols-[180px_1fr]">
      <div className="space-y-3">
       <div className="flex min-h-32 items-center justify-center rounded-md border bg-background p-4">
        {branding.logoUrl?<img className="max-h-28 max-w-full object-contain" src={branding.logoUrl} alt="Business logo"/>:
         <span className="text-xs text-muted-foreground">No logo uploaded</span>}
       </div>
       <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-muted">
        <UploadCloud className="size-4"/>{upload.isPending?"Uploading…":"Upload logo"}
        <input aria-label="Upload logo" type="file" accept="image/png,image/jpeg,image/webp"
         className="sr-only" disabled={upload.isPending}
         onChange={e=>{const file=e.target.files?.[0];if(file)void fileUpload(file);e.target.value="";}}/>
       </label>
       {branding.hasLogo?<Button className="w-full" size="sm" variant="outline"
         disabled={removeLogo.isPending} onClick={()=>void deleteLogo()}>
         <Trash2 className="size-4"/>Remove logo</Button>:null}
       <p className="text-xs text-muted-foreground">PNG/JPEG/WebP, max 256 KB. No SVG or scripts.</p>
      </div>
      <div className="space-y-3">
       <div className="space-y-1"><Label>Brand accent color</Label>
        <div className="flex gap-2"><Input type="color" className="h-10 w-16 p-1"
         value={branding.accentColor}
         onChange={e=>setBranding(p=>p?{...p,accentColor:e.target.value}:p)}/>
         <Input value={branding.accentColor} maxLength={7}
          onChange={e=>setBranding(p=>p?{...p,accentColor:e.target.value}:p)}/></div>
       </div>
       <div className="space-y-1"><Label>Header tagline</Label>
        <Input maxLength={100} value={branding.headerTagline??""} placeholder="Quality services, delivered"
         onChange={e=>setBranding(p=>p?{...p,headerTagline:e.target.value}:p)}/></div>
       <div className="space-y-1"><Label>Additional footer note</Label>
        <Textarea maxLength={500} rows={3} value={branding.footerNote??""}
         placeholder="Thank you for your business."
         onChange={e=>setBranding(p=>p?{...p,footerNote:e.target.value}:p)}/></div>
      </div>
     </div>
     <Button disabled={brand.isPending} onClick={()=>void saveBranding()}>
      {brand.isPending?"Saving…":"Save branding"}
     </Button>
    </div>:<p className="text-sm text-muted-foreground">Loading branding…</p>}
   </CardContent></Card>
  <Card><CardHeader><CardTitle>Document-type templates</CardTitle></CardHeader>
   <CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Choose the design used when creating a new document.
      Existing documents retain their issued template. The general fallback is <strong>{business.default_template}</strong>,
      managed in <Link to="/studio" className="underline">Document Studio</Link>.</p>
    <div className="grid gap-4 md:grid-cols-2">
     {TYPES.map(t=><div key={t} className="space-y-1">
      <Label>{t.replaceAll("_"," ")}</Label>
      <Select value={rules[t]} onValueChange={v=>setRules(p=>({...p,[t]:v}))}>
       <SelectTrigger><SelectValue/></SelectTrigger>
       <SelectContent>
        <SelectItem value="business_default">Use general business default</SelectItem>
        {DOCUMENT_TEMPLATES.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
       </SelectContent>
      </Select>
     </div>)}
    </div>
    <Button disabled={templates.isPending||config.isPending}
     onClick={()=>void saveTemplateRules()}>
     {templates.isPending?"Saving…":"Save document templates"}</Button>
   </CardContent></Card>
  <Card><CardHeader><CardTitle className="flex items-center gap-2">
   <PlugZap className="size-5"/>Integration Management
   </CardTitle></CardHeader>
   <CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">{config.data?.notice}</p>
    {rows.map(row=><div className="flex flex-wrap items-start justify-between gap-4 rounded-md border p-4" key={row.key}>
     <div className="max-w-xl space-y-1">
      <div className="flex flex-wrap items-center gap-2">
       <span className="text-sm font-semibold">{row.title}</span>
       <Badge variant="secondary">{row.mode}</Badge>
       <Badge variant="outline">{row.ready?"Server configured":"Credentials not ready"}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{row.description}</p>
     </div>
     <div className="flex items-center gap-2">
      <Label className="text-xs">Permit this integration</Label>
      <Switch checked={Boolean(flags?.[row.key])}
       disabled={!flags||!config.data}
       onCheckedChange={checked=>setFlags(p=>p?{...p,[row.key]:checked}:p)}/>
     </div>
    </div>)}
    <div className="flex flex-wrap items-center justify-between gap-3">
     <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <ShieldCheck className="size-4"/>Only the business owner can save provider permissions.
      Switches never change server secrets or authorize KRA production.
     </p>
     <Button disabled={!flags||integrations.isPending||myRole!=="OWNER"}
      onClick={()=>void saveIntegrations()}>
      {integrations.isPending?"Saving…":"Save provider permissions"}</Button>
    </div>
   </CardContent></Card>
 </div>;
}
