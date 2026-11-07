import {createFileRoute} from "@tanstack/react-router";
import {useState} from "react";
import {toast} from "sonner";
import {ShieldCheck,UserPlus,Copy,Users,LockKeyhole} from "lucide-react";
import {useWorkspace} from "@/components/app-shell";
import {useSession} from "@/lib/db";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {
 Select,SelectContent,SelectItem,SelectTrigger,SelectValue,
} from "@/components/ui/select";
import {
 useTeam,useInviteTeamMember,useAcceptTeamInvitation,useRevokeInvite,
 useChangeMemberRole,useRemoveMember,
 type TeamRole,type InviteResult,
} from "@/lib/business-config";

export const Route=createFileRoute("/_authenticated/team")({
 head:()=>({meta:[{title:"Team & Permissions — Financial Document OS"}]}),
 component:TeamPage,
});
function TeamPage(){
 const {businessId,business}=useWorkspace();
 const session=useSession();
 const team=useTeam(businessId);
 const invite=useInviteTeamMember();
 const accept=useAcceptTeamInvitation();
 const revoke=useRevokeInvite();
 const change=useChangeMemberRole();
 const remove=useRemoveMember();
 const [email,setEmail]=useState("");
 const [role,setRole]=useState<Exclude<TeamRole,"OWNER">>("VIEWER");
 const [token,setToken]=useState("");
 const [created,setCreated]=useState<InviteResult|null>(null);
 const myRole=team.data?.members.find(m=>m.userId===session.userId)?.role;
 const canInvite=myRole==="OWNER"||myRole==="ADMIN";
 async function create(){
  if(!businessId)return;
  try{
   const result=await invite.mutateAsync({businessId,email,role});
   setCreated(result);setEmail("");
   toast.success("Invitation created. Share the one-time code securely.");
  }catch(e){toast.error(e instanceof Error?e.message:"Could not create invitation");}
 }
 async function acceptCode(){
  try{
   const result=await accept.mutateAsync(token.trim());
   toast.success("Invitation accepted. Your workspace list has been refreshed.");
   setToken("");setCreated(null);
   if(result.businessId!==businessId)window.location.reload();
  }catch(e){toast.error(e instanceof Error?e.message:"Could not accept invitation");}
 }
 async function roleChange(memberId:string,next:Exclude<TeamRole,"OWNER">){
  if(!businessId)return;
  try{
   await change.mutateAsync({businessId,memberId,role:next});
   toast.success("Member role updated");
  }catch(e){toast.error(e instanceof Error?e.message:"Role update failed");}
 }
 async function removeMember(memberId:string){
  if(!businessId||!window.confirm("Remove this user from this business?"))return;
  try{
   await remove.mutateAsync({businessId,memberId});
   toast.success("Member removed from business");
  }catch(e){toast.error(e instanceof Error?e.message:"Could not remove member");}
 }
 async function revokeInvite(invitationId:string){
  if(!businessId)return;
  try{
   await revoke.mutateAsync({businessId,invitationId});
   toast.success("Invitation revoked");
  }catch(e){toast.error(e instanceof Error?e.message:"Could not revoke invitation");}
 }
 return <div className="space-y-6">
  <header><h1 className="text-3xl">Team & Permissions</h1>
   <p className="mt-1 text-sm text-muted-foreground">
    Access to {business.name} is tied to signed-in accounts and business-specific roles.
   </p></header>
  <Card><CardContent className="flex items-start gap-3 py-4 text-sm">
   <ShieldCheck className="mt-1 size-5 text-muted-foreground"/>
   <div className="space-y-1"><p className="font-semibold">Role permissions</p>
    <p className="text-xs text-muted-foreground">
     OWNER manages integrations, admins and membership; ADMIN manages business branding, templates,
     invitations and accountants/viewers; ACCOUNTANT manages financial workflows; VIEWER has read access.
     Owner role cannot be reassigned or deleted from this screen.
    </p>
    <p className="text-xs text-muted-foreground">Your role: <strong>{myRole??"Loading…"}</strong></p>
   </div>
  </CardContent></Card>
  <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-5"/>Current members</CardTitle></CardHeader>
   <CardContent className="space-y-3">
    {team.isError?<p className="text-sm text-destructive">{team.error.message}</p>:null}
    {team.isPending?<p className="text-sm text-muted-foreground">Loading members…</p>:
     (team.data?.members??[]).map(member=>{
      const self=member.userId===session.userId;
      const owner=member.role==="OWNER";
      const edit=!self&&!owner&&canInvite&&(myRole==="OWNER"||member.role!=="ADMIN");
      return <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
       <div className="space-y-1 text-sm">
        <p className="font-medium">{member.fullName||member.email}</p>
        <p className="text-xs text-muted-foreground">{member.email}</p>
        {self?<Badge variant="secondary">You</Badge>:null}
       </div>
       <div className="flex flex-wrap items-center gap-2">
        {edit?<Select value={member.role} disabled={change.isPending}
         onValueChange={v=>void roleChange(member.id,v as Exclude<TeamRole,"OWNER">)}>
         <SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
         <SelectContent>
          {myRole==="OWNER"?<SelectItem value="ADMIN">Admin</SelectItem>:null}
          <SelectItem value="ACCOUNTANT">Accountant</SelectItem>
          <SelectItem value="VIEWER">Viewer</SelectItem>
         </SelectContent>
        </Select>:<Badge variant="outline">{member.role}</Badge>}
        {edit?<Button variant="outline" size="sm" disabled={remove.isPending}
         onClick={()=>void removeMember(member.id)}>Remove</Button>:null}
       </div>
      </div>;
     })}
   </CardContent></Card>
  <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="size-5"/>Invite an existing or new account</CardTitle></CardHeader>
   <CardContent className="space-y-4">
    <p className="text-xs text-muted-foreground">
     An invitation is valid for seven days, can only be accepted by an account
     registered with the exact email address, and has no OWNER permission.
     Invitees can register locally, then enter the one-time code below.
     Invitation codes are not automatically emailed.
    </p>
    {canInvite?<div className="flex flex-wrap items-end gap-3">
     <div className="min-w-48 flex-1 space-y-1"><Label>Invitee email</Label>
      <Input type="email" value={email} onChange={e=>setEmail(e.target.value)}
       placeholder="colleague@example.com"/></div>
     <div className="w-44 space-y-1"><Label>Role</Label>
      <Select value={role} onValueChange={v=>setRole(v as typeof role)}>
       <SelectTrigger><SelectValue/></SelectTrigger>
       <SelectContent>
        {myRole==="OWNER"?<SelectItem value="ADMIN">Admin</SelectItem>:null}
        <SelectItem value="ACCOUNTANT">Accountant</SelectItem>
        <SelectItem value="VIEWER">Viewer</SelectItem>
       </SelectContent>
      </Select>
     </div>
     <Button disabled={invite.isPending||!email.trim()} onClick={()=>void create()}>
      {invite.isPending?"Creating…":"Create invitation"}
     </Button>
    </div>:<p className="text-sm text-muted-foreground">Only owners and admins can issue invitations.</p>}
    {created?<div className="space-y-2 rounded-md border border-primary/40 p-4">
     <p className="text-sm font-semibold">One-time invitation token</p>
     <p className="text-xs text-muted-foreground">
      Share privately with <strong>{created.email}</strong>. The token cannot be recovered
      after you leave this page. It is not an account password.
     </p>
     <code className="block break-all rounded bg-muted p-2 text-xs">{created.token}</code>
     <Button size="sm" variant="outline" onClick={()=>void navigator.clipboard.writeText(created.token)
       .then(()=>toast.success("Code copied")).catch(()=>toast.error("Clipboard unavailable"))}>
      <Copy className="size-4"/>Copy code
     </Button>
     <p className="text-xs text-muted-foreground">Expires {new Date(created.expiresAt).toLocaleString()}</p>
    </div>:null}
    {canInvite&&(team.data?.invitations?.length??0)>0?<div className="space-y-2">
     <p className="text-sm font-medium">Pending invitations</p>
     {team.data?.invitations.map(item=><div key={item.id}
       className="flex flex-wrap items-center justify-between gap-3 rounded border p-3">
       <div className="text-xs"><p className="font-semibold">{item.email} · {item.role}</p>
        <p className="text-muted-foreground">Expires {new Date(item.expiresAt).toLocaleString()}</p></div>
       <Button size="sm" variant="outline" onClick={()=>void revokeInvite(item.id)}
        disabled={revoke.isPending}>Revoke</Button>
      </div>)}
    </div>:null}
   </CardContent></Card>
  <Card><CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="size-5"/>Accept invitation</CardTitle></CardHeader>
   <CardContent className="space-y-3">
    <p className="text-xs text-muted-foreground">
     Enter the 64-character invitation code sent to you by the business owner or admin.
     Only the matching signed-in email account can accept it.
    </p>
    <Input aria-label="Invitation token" value={token} maxLength={64}
     onChange={e=>setToken(e.target.value.trim())} placeholder="Paste invitation code"/>
    <Button onClick={()=>void acceptCode()} disabled={accept.isPending||token.length!==64}>
     {accept.isPending?"Joining…":"Accept invitation"}
    </Button>
   </CardContent></Card>
 </div>;
}
