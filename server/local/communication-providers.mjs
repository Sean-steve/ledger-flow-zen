// Phase 3 provider adapters. Server-side only. Never called in preview mode.
// Provider acceptance means accepted for delivery, not delivered/read.
function requireText(v,label) {
  if(typeof v!=="string"||!v.trim())throw new Error(label+" is not configured");
  return v.trim();
}
function htmlEscape(text) {
  return String(text).replace(/[&<>"']/g,ch=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[ch]);
}
export function resolvePublicBase(env=process.env) {
  const value=requireText(env.FDOS_PUBLIC_APP_URL,"FDOS_PUBLIC_APP_URL");
  let url;
  try{url=new URL(value);}catch{throw new Error("Invalid public application URL");}
  if(url.protocol!=="https:"||!url.hostname||
     /(^localhost$|\.localhost$|^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^0\.|^\[::1\]$)/i.test(url.hostname)||
     url.username||url.password||url.search||url.hash||url.pathname!=="/") {
    throw new Error("Public document URL must be a public HTTPS origin without path or credentials");
  }
  return url.origin;
}
export function normalizePhone(number) {
  let phone=String(number??"").trim().replace(/[\s()\-]/g,"");
  if(/^07\d{8}$/.test(phone)||/^01\d{8}$/.test(phone))phone="254"+phone.slice(1);
  else if(/^254\d{9}$/.test(phone)){}
  else if(/^\+\d{8,15}$/.test(phone)) phone=phone.slice(1);
  else throw new Error("Client phone must be a valid E.164 number (for Kenya, +2547...)");
  if(!/^[1-9]\d{7,14}$/.test(phone))throw new Error("Invalid WhatsApp phone number");
  return phone;
}
export function providerAvailability(env=process.env) {
  const mode=env.FDOS_COMM_MODE==="live"?"live":"preview";
  return {
    mode,
    emailConfigured:Boolean(env.RESEND_API_KEY&&env.FDOS_EMAIL_FROM&&env.FDOS_PUBLIC_APP_URL),
    whatsappConfigured:Boolean(env.META_WA_TOKEN&&env.META_WA_PHONE_NUMBER_ID&&
      env.FDOS_WA_TEMPLATE_DOCUMENT&&env.FDOS_WA_TEMPLATE_RECEIPT&&env.FDOS_PUBLIC_APP_URL),
    notice:mode==="preview"
      ?"Preview mode: no email or WhatsApp messages leave this computer."
      :"Live mode: outbound messages require approved provider credentials and a public HTTPS document portal.",
  };
}
export async function sendToProvider({channel,recipient,subject,customerName,reference,shareUrl,kind,requestKey,businessName},env=process.env,transport=fetch) {
  if(env.FDOS_COMM_MODE!=="live")throw new Error("Live sending is disabled");
  const base=resolvePublicBase(env);
  if(!shareUrl.startsWith(base+"/share/"))throw new Error("Invalid public share URL");
  const signal=AbortSignal.timeout(12000);
  if(channel==="EMAIL") {
    const apiKey=requireText(env.RESEND_API_KEY,"RESEND_API_KEY");
    const from=requireText(env.FDOS_EMAIL_FROM,"FDOS_EMAIL_FROM");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))throw new Error("Client email is invalid");
    const html=`<div style="font-family:Arial,sans-serif;max-width:640px"><h2>${htmlEscape(businessName)}</h2><p>Hello ${htmlEscape(customerName)},</p><p>${htmlEscape(subject)} is ready.</p><p><a href="${htmlEscape(shareUrl)}">View your secure document</a></p><p>For security, this link expires in 14 days. Please contact the sender if you need a new copy.</p><p>Kind regards,<br>${htmlEscape(businessName)}</p></div>`;
    const response=await transport("https://api.resend.com/emails",{
      method:"POST",signal,
      headers:{
        Authorization:`Bearer ${apiKey}`,
        "Content-Type":"application/json",
        "Idempotency-Key":requestKey,
      },
      body:JSON.stringify({from,to:[recipient],subject,html,text:`Hello ${customerName},\n${subject}\nView: ${shareUrl}\nThe link expires in 14 days.\n${businessName}`}),
    });
    if(!response.ok){const error=new Error("Email provider rejected the request");error.status=response.status;throw error;}
    const body=await response.json();
    if(typeof body?.id!=="string")throw new Error("Email provider returned no acceptance ID");
    return {id:body.id};
  }
  if(channel==="WHATSAPP") {
    const token=requireText(env.META_WA_TOKEN,"META_WA_TOKEN");
    const phoneId=requireText(env.META_WA_PHONE_NUMBER_ID,"META_WA_PHONE_NUMBER_ID");
    if(!/^\d{5,25}$/.test(phoneId))throw new Error("Invalid WhatsApp phone number ID");
    const version=env.META_WA_GRAPH_VERSION??"v23.0";
    if(!/^v\d{1,2}\.\d{1,2}$/.test(version))throw new Error("Invalid Meta Graph version");
    const name=requireText(
      kind==="receipt"?env.FDOS_WA_TEMPLATE_RECEIPT:env.FDOS_WA_TEMPLATE_DOCUMENT,
      "WhatsApp template name"
    );
    if(!/^[a-z0-9_]{2,100}$/.test(name))throw new Error("Invalid WhatsApp template name");
    const language=env.FDOS_WA_LANGUAGE??"en_US";
    if(!/^[a-z]{2}_[A-Z]{2}$/.test(language))throw new Error("Invalid WhatsApp template language");
    const response=await transport(`https://graph.facebook.com/${version}/${phoneId}/messages`,{
      method:"POST",signal,
      headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        messaging_product:"whatsapp",to:normalizePhone(recipient),type:"template",
        template:{name,language:{code:language},components:[{
          type:"body",parameters:[
            {type:"text",text:String(customerName).slice(0,200)},
            {type:"text",text:String(reference).slice(0,120)},
            {type:"text",text:shareUrl},
          ],
        }]},
      }),
    });
    if(!response.ok){const error=new Error("WhatsApp provider rejected the request");error.status=response.status;throw error;}
    const body=await response.json();
    if(typeof body?.messages?.[0]?.id!=="string")throw new Error("WhatsApp provider returned no acceptance ID");
    return {id:body.messages[0].id};
  }
  throw new Error("Unsupported delivery channel");
}
