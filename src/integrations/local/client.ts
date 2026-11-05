// Development-only compatibility client for our own Node/PostgreSQL backend.
// No Supabase SDK is initialized or contacted in this local development mode.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const listeners=new Set<(event:string,session:{user:unknown}|null)=>void>();
function notify(event:string,user:unknown|null) {
  for(const listener of listeners) listener(event,user?{user}:null);
}
async function send(path:string,payload:unknown):Promise<{data:any;error:{message:string}|null}> {
  if(typeof window==="undefined") return {data:null,error:{message:"Browser-only local API"}};
  try {
    const resp=await fetch(path,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload),credentials:"same-origin",cache:"no-store",
    });
    const result=await resp.json() as {data:any;error:{message:string}|null};
    if(!resp.ok) return {data:null,error:result.error??{message:"Local API error"}};
    return result;
  } catch {
    return {data:null,error:{message:"Cannot connect to the local PostgreSQL API. Start scripts/local/run-api.sh"}};
  }
}
async function whoAmI() {
  if(typeof window==="undefined") return {data:{user:null},error:null};
  try {
    const resp=await fetch("/api/local/auth/user",{credentials:"same-origin",cache:"no-store"});
    const result=await resp.json() as {data:any;error:{message:string}|null};
    return {data:{user:result.data??null},error:result.error??null};
  } catch {
    return {data:{user:null},error:{message:"Local API unavailable"}};
  }
}
class LocalQuery {
  private mode:"select"|"insert"|"update"="select";
  private filters:Array<{field:string;value:unknown}>=[];
  private sort?:{field:string;ascending:boolean};
  private cap?:number;
  private one=false;
  private optional=false;
  private selection="*";
  private values:unknown;
  constructor(private readonly table:string) {}
  select(cols="*") { this.selection=cols;return this; }
  eq(field:string,value:unknown) {this.filters.push({field,value});return this;}
  order(field:string,options?:{ascending?:boolean}) {
    this.sort={field,ascending:options?.ascending??true};return this;
  }
  limit(count:number) {this.cap=count;return this;}
  single() {this.one=true;return this;}
  maybeSingle() {this.optional=true;return this;}
  insert(row:unknown) {this.mode="insert";this.values=row;return this;}
  update(row:unknown) {this.mode="update";this.values=row;return this;}
  then<TResult1=any,TResult2=never>(
    ok?:((value:{data:any;error:{message:string}|null})=>TResult1|PromiseLike<TResult1>)|null,
    failed?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null,
  ):Promise<TResult1|TResult2> {
    return send("/api/local/query",{
      table:this.table,mode:this.mode,filters:this.filters,sort:this.sort,
      limit:this.cap,single:this.one,maybeSingle:this.optional,
      selection:this.selection,values:this.values,
    }).then(ok,failed);
  }
}
const local={
  from(table:string) {return new LocalQuery(table);},
  rpc(name:string,args:Record<string,unknown>) {
    return send("/api/local/rpc",{name,args});
  },
  auth:{
    getUser:whoAmI,
    async getSession() {
      const {data,error}=await whoAmI();
      return {data:{session:data.user?{user:data.user}:null},error};
    },
    onAuthStateChange(listener:(event:string,session:{user:unknown}|null)=>void) {
      listeners.add(listener);
      return {data:{subscription:{unsubscribe:()=>listeners.delete(listener)}}};
    },
    async signInWithPassword({email,password}:{email:string;password:string}) {
      const result=await send("/api/local/auth/signin",{email,password});
      if(!result.error)notify("SIGNED_IN",result.data);
      return {data:{user:result.data,session:result.data?{user:result.data}:null},error:result.error};
    },
    async signUp({email,password,options}:{email:string;password:string;options?:{data?:{full_name?:string}}}) {
      const result=await send("/api/local/auth/signup",{
        email,password,fullName:options?.data?.full_name??"",
      });
      if(!result.error)notify("SIGNED_IN",result.data);
      return {data:{user:result.data,session:result.data?{user:result.data}:null},error:result.error};
    },
    async signOut() {
      const result=await send("/api/local/auth/signout",{});
      if(!result.error)notify("SIGNED_OUT",null);
      return {error:result.error};
    },
  },
};
// Preserve the validated repository schema types at the frontend boundary.
// The development gateway is tested separately; no Supabase SDK runtime is used.
export const supabase=local as unknown as SupabaseClient<Database>;
