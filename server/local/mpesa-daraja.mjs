// Daraja sandbox adapter: OAuth, STK Push and STK Query only.
// No live endpoint or production credentials are accepted by this module.
import { timingSafeEqual } from "node:crypto";

export function paymentConfig(env=process.env) {
  const selected=String(env.FDOS_MPESA_MODE??"preview").toLowerCase();
  if(!["preview","sandbox"].includes(selected))
    throw new Error("M-Pesa production is disabled; select preview or sandbox");
  const mode=selected.toUpperCase();
  const approved=env.FDOS_MPESA_SANDBOX_APPROVED==="YES";
  const credentials=Boolean(env.FDOS_MPESA_SHORTCODE&&env.FDOS_MPESA_CONSUMER_KEY&&
    env.FDOS_MPESA_CONSUMER_SECRET&&env.FDOS_MPESA_PASSKEY&&
    env.FDOS_MPESA_PUBLIC_BASE&&env.FDOS_MPESA_CALLBACK_TOKEN);
  return {
    mode,productionEnabled:false,
    sandboxReady:mode==="SANDBOX"&&approved&&credentials,
    configured:credentials,
    notice:mode==="PREVIEW"
      ?"Local test mode: no real M-Pesa payment is requested. All confirmations are simulated."
      :!approved?"Sandbox disabled: enable only after creating your Daraja sandbox app."
      :!credentials?"Sandbox credentials and a public HTTPS callback URL are missing."
      :"Daraja sandbox configured. Sandbox money and receipt numbers are test-only.",
  };
}
export function kenyaPhone(raw) {
  let p=String(raw??"").replace(/[\s()\-]/g,"");
  if(/^0[17]\d{8}$/.test(p))p="254"+p.slice(1);
  else if(/^\+254[17]\d{8}$/.test(p))p=p.slice(1);
  if(!/^254[17]\d{8}$/.test(p))throw new Error("Use a Kenyan mobile number such as 0712345678");
  return p;
}
export function safeShortcode(raw) {
  const text=String(raw??"").trim();
  if(!/^\d{5,9}$/.test(text))throw new Error("Invalid M-Pesa Paybill or Till shortcode");
  return text;
}
export function callbackTokenMatches(token,env=process.env) {
  const expected=env.FDOS_MPESA_CALLBACK_TOKEN??"";
  if(typeof token!=="string"||expected.length<32||token.length!==expected.length)return false;
  return timingSafeEqual(Buffer.from(token),Buffer.from(expected));
}
export function publicCallbackBase(env=process.env) {
  let url;
  try{url=new URL(String(env.FDOS_MPESA_PUBLIC_BASE??""));}
  catch{throw new Error("M-Pesa callback base must be public HTTPS");}
  const h=url.hostname.toLowerCase();
  if(url.protocol!=="https:"||!h||h==="localhost"||h.endsWith(".localhost")||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.)/.test(h)||
    h==="[::1]"||url.username||url.password||url.search||url.hash||url.pathname!=="/")
    throw new Error("M-Pesa callback base must be public HTTPS");
  return url.origin;
}
export function stkCallbackUrl(env=process.env) {
  const token=String(env.FDOS_MPESA_CALLBACK_TOKEN??"");
  if(!/^[a-zA-Z0-9_-]{32,128}$/.test(token))
    throw new Error("Invalid M-Pesa callback token");
  return publicCallbackBase(env)+"/api/provider/mpesa/stk/"+token;
}
function creds(env) {
  const key=String(env.FDOS_MPESA_CONSUMER_KEY??"");
  const secret=String(env.FDOS_MPESA_CONSUMER_SECRET??"");
  const passkey=String(env.FDOS_MPESA_PASSKEY??"");
  if(!key||!secret||!passkey)throw new Error("Daraja sandbox credentials missing");
  return {key,secret,passkey};
}
function timeoutSignal() {return AbortSignal.timeout(12000);}
async function token(env=process.env,transport=fetch) {
  const {key,secret}=creds(env);
  const resp=await transport(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    {headers:{Authorization:"Basic "+Buffer.from(key+":"+secret).toString("base64")},
      signal:timeoutSignal(),redirect:"error"},
  );
  if(!resp.ok)throw new Error("Daraja sandbox OAuth rejected");
  const json=await resp.json();
  if(typeof json.access_token!=="string"||!json.access_token)throw new Error("Missing Daraja OAuth token");
  return json.access_token;
}
function timestamp() {
  const d=new Date();
  return String(d.getUTCFullYear())+
   String(d.getUTCMonth()+1).padStart(2,"0")+
   String(d.getUTCDate()).padStart(2,"0")+
   String(d.getUTCHours()).padStart(2,"0")+
   String(d.getUTCMinutes()).padStart(2,"0")+
   String(d.getUTCSeconds()).padStart(2,"0");
}
function password(shortcode,passkey,ts) {
 return Buffer.from(shortcode+passkey+ts).toString("base64");
}
export async function requestStkPush({
 shortcode,phone,amount,invoiceNumber,shortcodeType,
},env=process.env,transport=fetch){
 if(!paymentConfig(env).sandboxReady)throw new Error("Daraja sandbox not activated");
 const sc=safeShortcode(shortcode);
 if(sc!==String(env.FDOS_MPESA_SHORTCODE))throw new Error("M-Pesa shortcode mismatch");
 const msisdn=kenyaPhone(phone);
 if(!Number.isSafeInteger(amount)||amount<1||amount>250000)
   throw new Error("STK amount must be an integer between KES 1 and KES 250,000");
 const stamp=timestamp();
 const cred=creds(env);
 let resp;
 try {
  const authorization=await token(env,transport);
  const body={
    BusinessShortCode:sc,Password:password(sc,cred.passkey,stamp),
    Timestamp:stamp,TransactionType:shortcodeType==="TILL"
      ?"CustomerBuyGoodsOnline":"CustomerPayBillOnline",
    Amount:amount,PartyA:msisdn,PartyB:sc,PhoneNumber:msisdn,
    CallBackURL:stkCallbackUrl(env),
    AccountReference:String(invoiceNumber??"INVOICE").slice(0,12),
    TransactionDesc:"Invoice payment",
  };
  resp=await transport("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",{
    method:"POST",signal:timeoutSignal(),redirect:"error",
    headers:{Authorization:"Bearer "+authorization,"Content-Type":"application/json"},
    body:JSON.stringify(body),
  });
  if(!resp.ok) return {status:resp.status>=400&&resp.status<500?"FAILED":"UNKNOWN",
    errorCode:resp.status>=400&&resp.status<500?"STK_REJECTED":"STK_UNCERTAIN"};
  const j=await resp.json();
  if(String(j.ResponseCode)!=="0")return {status:"FAILED",errorCode:"STK_NOT_ACCEPTED"};
  if(typeof j.CheckoutRequestID!=="string"||typeof j.MerchantRequestID!=="string"||
     !j.CheckoutRequestID||!j.MerchantRequestID)
    return {status:"UNKNOWN",errorCode:"STK_MISSING_PROVIDER_IDS"};
  return {status:"PENDING",checkoutRequestId:j.CheckoutRequestID,
   merchantRequestId:j.MerchantRequestID};
 }catch {
  // A timed out request may have reached Safaricom: never blindly re-initiate.
  return {status:"UNKNOWN",errorCode:"STK_TRANSPORT_UNCERTAIN"};
 }
}
export async function queryStkStatus({shortcode,checkoutRequestId},env=process.env,transport=fetch){
 if(!paymentConfig(env).sandboxReady)throw new Error("Daraja sandbox not activated");
 const sc=safeShortcode(shortcode);
 if(sc!==env.FDOS_MPESA_SHORTCODE)throw new Error("M-Pesa shortcode mismatch");
 if(typeof checkoutRequestId!=="string"||checkoutRequestId.length<6)
  throw new Error("Invalid checkout reference");
 const stamp=timestamp(), cred=creds(env);
 try{
  const authorization=await token(env,transport);
  const response=await transport("https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query",{
    method:"POST",signal:timeoutSignal(),redirect:"error",
    headers:{Authorization:"Bearer "+authorization,"Content-Type":"application/json"},
    body:JSON.stringify({BusinessShortCode:sc,
      Password:password(sc,cred.passkey,stamp),
      Timestamp:stamp,CheckoutRequestID:checkoutRequestId}),
  });
  if(!response.ok)return {status:"UNKNOWN",errorCode:"STK_QUERY_UNAVAILABLE"};
  const body=await response.json();
  if(body.CheckoutRequestID&&body.CheckoutRequestID!==checkoutRequestId)
    return {status:"UNKNOWN",errorCode:"STK_QUERY_ID_MISMATCH"};
  // This query checks outcome, not receipt identity, amount or payer.
  if(String(body.ResultCode)==="0")return {status:"SUCCESS"};
  if(body.ResultCode!==undefined&&String(body.ResultCode)!=="0")
    return {status:"FAILED"};
  return {status:"UNKNOWN",errorCode:"STK_QUERY_PENDING"};
 }catch{return {status:"UNKNOWN",errorCode:"STK_QUERY_UNCERTAIN"};}
}
export function parseStkCallback(payload) {
 const cb=payload?.Body?.stkCallback;
 if(!cb||typeof cb!=="object"||typeof cb.CheckoutRequestID!=="string"||
     typeof cb.MerchantRequestID!=="string"||
     (!Number.isInteger(cb.ResultCode)&&typeof cb.ResultCode!=="string"))
   throw new Error("Invalid STK callback");
 if(cb.CheckoutRequestID.length<6||cb.CheckoutRequestID.length>150)
   throw new Error("Invalid checkout ID");
 const resultCode=String(cb.ResultCode);
 if(resultCode!=="0") return {
   checkoutRequestId:cb.CheckoutRequestID,merchantRequestId:cb.MerchantRequestID,
   status:"FAILED",resultCode,
 };
 const items=cb.CallbackMetadata?.Item;
 if(!Array.isArray(items))throw new Error("Missing STK confirmation metadata");
 const meta=Object.fromEntries(items.filter(x=>x&&typeof x.Name==="string")
   .map(x=>[x.Name,x.Value]));
 const amount=Number(meta.Amount);
 const receipt=String(meta.MpesaReceiptNumber??"").toUpperCase();
 const phone=kenyaPhone(meta.PhoneNumber);
 if(!Number.isFinite(amount)||!Number.isSafeInteger(amount)||amount<=0||
    !/^[A-Z0-9]{8,20}$/.test(receipt))
   throw new Error("Invalid confirmed STK payment details");
 return {checkoutRequestId:cb.CheckoutRequestID,
  merchantRequestId:cb.MerchantRequestID,status:"SUCCESS",
  resultCode,amount,receipt,phone};
}
export function parseC2bConfirmation(payload){
 const shortcode=safeShortcode(payload?.BusinessShortCode);
 const receipt=String(payload?.TransID??"").trim().toUpperCase();
 const amount=Number(payload?.TransAmount);
 if(!/^[A-Z0-9]{6,32}$/.test(receipt)||!Number.isFinite(amount)||
    amount<=0||Math.round(amount*100)!==amount*100)
   throw new Error("Invalid C2B confirmation fields");
 const phone=String(payload?.MSISDN??"");
 const masked=phone.length>=4?"***"+phone.slice(-4):null;
 return {shortcode,receipt,amount:amount.toFixed(2),
    billReference:String(payload?.BillRefNumber??"").slice(0,120).trim()||null,
    phoneMasked:masked};
}
