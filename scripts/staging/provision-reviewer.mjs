#!/usr/bin/env node
// One-time staging reviewer creation. Receives password through stdin, not argv.
// The staging DB must be pristine; public signup remains disabled.
import {randomBytes,scrypt as scryptCb} from "node:crypto";
import {promisify} from "node:util";
import {database} from "../../server/local/database.mjs";
import {assertLocalRuntime} from "../../server/local/http-security.mjs";
const scrypt=promisify(scryptCb);
try {
  const mode=assertLocalRuntime(process.env);
  if(!mode.stagingOnly)throw Error("Provisioning only allowed in isolated staging");
  const email=String(process.env.FDOS_STAGE_BOOTSTRAP_EMAIL??"").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>250)
    throw Error("Set FDOS_STAGE_BOOTSTRAP_EMAIL to your dedicated reviewer email");
  if(process.stdin.isTTY)throw Error("Pipe a secret password via stdin; never put it in shell arguments");
  const blocks=[];let total=0;
  for await (const block of process.stdin) {
    total+=block.length;
    if(total>520)throw Error("Input too long");
    blocks.push(block);
  }
  const password=Buffer.concat(blocks).toString("utf8").replace(/\r?\n$/,"");
  if(password.length<18||password.length>256)
    throw Error("Reviewer password must be 18–256 characters");
  const salt=randomBytes(16).toString("hex");
  const hash=(await scrypt(password,Buffer.from(salt,"hex"),64)).toString("hex");
  await database.begin(async tx=>{
    const users=await tx`SELECT count(*)::integer AS count FROM fdos_local.users`;
    if(users[0].count!==0)
      throw Error("Staging already has user records; refusing re-provisioning");
    const created=await tx`INSERT INTO fdos_local.users(email,full_name,password_hash)
      VALUES(${email},'Staging QA Reviewer',${"scrypt:"+salt+":"+hash})
      RETURNING id`;
    await tx`INSERT INTO public.profiles(id,email,full_name)
      VALUES(${created[0].id}::uuid,${email},'Staging QA Reviewer')`;
  });
  process.stdout.write("One synthetic-data staging reviewer created; public signup remains disabled.\n");
}catch(err){
  process.stderr.write("Staging reviewer provisioning failed: "+(err instanceof Error?err.message:"Unknown error")+"\n");
  process.exitCode=1;
}finally{
  await database.end({timeout:5});
}
