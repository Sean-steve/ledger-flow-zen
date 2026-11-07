import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { database } from "./database.mjs";

const scrypt = promisify(scryptCallback);
const COOKIE = "fdos_local_session";
const WEEK = 7 * 24 * 60 * 60;
function digest(token) { return createHash("sha256").update(token).digest("hex"); }
function parseSession(req) {
  const raw=(req.headers.cookie ?? "").split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));
  const token=raw?.slice(COOKIE.length+1)??"";
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
function cookie(token, age) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/local; Max-Age=${age}; Priority=High`;
}
async function passwordHash(password) {
  const salt=randomBytes(16).toString("hex");
  const key=await scrypt(password,Buffer.from(salt,"hex"),64);
  return `scrypt:${salt}:${key.toString("hex")}`;
}
async function checkPassword(password, stored) {
  const [method,salt,expected]=String(stored).split(":");
  if (method!=="scrypt" || !/^[a-f0-9]{32}$/.test(salt??"") || !/^[a-f0-9]{128}$/.test(expected??""))
    return false;
  const actual=await scrypt(password,Buffer.from(salt,"hex"),64);
  return timingSafeEqual(actual,Buffer.from(expected,"hex"));
}
function publicUser(user) {
  return { id:user.id,email:user.email,user_metadata:{full_name:user.full_name??""} };
}
async function sessionFor(user, res) {
  const token=randomBytes(32).toString("hex");
  await database.begin(async tx=>{
    await tx`DELETE FROM fdos_local.sessions WHERE expires_at<now()`;
    await tx`INSERT INTO fdos_local.sessions(token_hash,user_id,expires_at)
      VALUES(${digest(token)},${user.id},now()+interval '7 days')`;
  });
  res.setHeader("Set-Cookie", cookie(token,WEEK));
  return publicUser(user);
}
export async function currentUser(req) {
  const token=parseSession(req);
  if (!token) return null;
  const rows=await database`SELECT u.id,u.email,u.full_name
    FROM fdos_local.sessions s JOIN fdos_local.users u ON u.id=s.user_id
    WHERE s.token_hash=${digest(token)} AND s.expires_at>now() LIMIT 1`;
  return rows[0]?publicUser(rows[0]):null;
}
export async function revokeAllSessions(userId,res){
  if(!/^[0-9a-f-]{36}$/i.test(String(userId??"")))throw new Error("Authentication is required");
  const removed=await database`DELETE FROM fdos_local.sessions
    WHERE user_id=${userId}::uuid RETURNING token_hash`;
  res.setHeader("Set-Cookie",cookie("",0));
  return {revokedCount:removed.length};
}
const attempts=new Map();
function throttle(key) {
  const now=Date.now(), past=attempts.get(key)??[];
  const recent=past.filter(x=>now-x<15*60*1000);
  if (recent.length>=10) {
    const e=new Error("Too many sign-in attempts; retry later");
    e.httpStatus=429;throw e;
  }
  // Avoid unbounded memory growth from many different guessed email addresses.
  if(attempts.size>2048)attempts.delete(attempts.keys().next().value);
  recent.push(now);
  attempts.set(key,recent);
}
export async function handleAuth(req, res, action, body) {
  if (action==="user") return { user:await currentUser(req) };
  if (action==="signout") {
    const token=parseSession(req);
    if (token) await database`DELETE FROM fdos_local.sessions WHERE token_hash=${digest(token)}`;
    res.setHeader("Set-Cookie",cookie("",0));
    return { user:null };
  }
  const email=String(body?.email??"").trim().toLowerCase();
  const password=body?.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>250 ||
      typeof password!=="string" || password.length<10 || password.length>256) {
    throw new Error("Valid email and password (10–256 characters) required");
  }
  throttle(req.socket.remoteAddress+":"+email);
  if(action==="signup") {
    if (process.env.FDOS_LOCAL_ALLOW_SIGNUP==="NO") throw new Error("Local registration is disabled");
    const fullName=String(body?.fullName??"").trim().slice(0,120);
    const hash=await passwordHash(password);
    let users;
    try {
      users=await database`INSERT INTO fdos_local.users(email,full_name,password_hash)
        VALUES(${email},${fullName},${hash}) RETURNING id,email,full_name`;
    } catch(error) {
      if (error.code==="23505") throw new Error("This email is already registered");
      throw error;
    }
    await database`INSERT INTO public.profiles(id,email,full_name)
      VALUES(${users[0].id},${email},${fullName})`;
    return {user:await sessionFor(users[0],res)};
  }
  if(action==="signin") {
    const users=await database`SELECT id,email,full_name,password_hash
      FROM fdos_local.users WHERE email=${email} LIMIT 1`;
    if(!users.length || !(await checkPassword(password,users[0].password_hash))) {
      throw new Error("Incorrect email or password");
    }
    attempts.delete(req.socket.remoteAddress+":"+email);
    return {user:await sessionFor(users[0],res)};
  }
  throw new Error("Unknown authentication operation");
}
