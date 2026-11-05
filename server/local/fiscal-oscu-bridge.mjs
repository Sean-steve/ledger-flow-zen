// FDOS-specific contract to an approved OSCU sidecar. This route is NOT a KRA API.
// The KRA OSCU library manages taxpayer/device activation, signing, and KRA wire calls.
// We never forge a control number, signature, QR, or claim production certification.
function bridgeError(message,status=null) {
  const e=new Error(message);
  if(status!==null)e.status=status;
  return e;
}
export function fiscalRuntime(env=process.env) {
  const selected=String(env.FDOS_ETIMS_MODE??"preview").trim().toLowerCase();
  if(!["preview","sandbox"].includes(selected))
    throw bridgeError("Only preview and approved sandbox modes are supported; production is disabled");
  const mode=selected.toUpperCase();
  const approved=env.FDOS_ETIMS_APPROVED_SANDBOX==="YES";
  const configured=Boolean(env.FDOS_ETIMS_BRIDGE_URL&&env.FDOS_ETIMS_BRIDGE_TOKEN);
  return {
    mode,
    solution:"OSCU",
    sandboxReady:mode==="SANDBOX"&&approved&&configured,
    productionEnabled:false,
    notice:mode==="PREVIEW"
      ?"Preview only: no KRA network call, signature, control code or fiscal tax invoice."
      :!approved?"Sandbox disabled: KRA OSCU test approval must be confirmed."
      :!configured?"Sandbox disabled: authorized OSCU sidecar credentials are missing."
      :"Authorized OSCU sandbox sidecar configured. Test acknowledgments are not production fiscal invoices.",
  };
}
export function validateKraPin(input,optional=false) {
  if(optional&&!input)return null;
  const pin=String(input??"").trim().toUpperCase();
  if(!/^[AP][0-9]{9}[A-Z]$/.test(pin))
    throw bridgeError("KRA PIN must be 11 characters: A/P, nine digits and a final letter");
  return pin;
}
function bridgeUrl(env) {
  const value=String(env.FDOS_ETIMS_BRIDGE_URL??"");
  let url;
  try{url=new URL(value);}catch{throw bridgeError("Invalid OSCU bridge URL");}
  const loopback=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if(!url.hostname||!["http:","https:"].includes(url.protocol)||
     (url.protocol==="http:"&&!loopback)||url.username||url.password||
     url.search||url.hash||url.pathname!=="/")
    throw bridgeError("OSCU bridge must use HTTPS or HTTP on localhost only");
  return url.origin;
}
export async function callOsCuSandbox(payload,requestKey,env=process.env,transport=fetch) {
  const config=fiscalRuntime(env);
  if(!config.sandboxReady)
    throw bridgeError("OSCU sandbox is not approved or configured",403);
  if(env.FDOS_ETIMS_KRA_CERTIFIED==="YES")
    throw bridgeError("Production certification flag does not enable fiscalisation");
  const url=bridgeUrl(env);
  const token=String(env.FDOS_ETIMS_BRIDGE_TOKEN);
  if(token.length<20)throw bridgeError("OSCU bridge secret is too short",403);
  const request={
    contract:"fdos-oscu-sandbox-v1",
    environment:"SANDBOX",
    solution:"OSCU",
    idempotencyKey:requestKey,
    fiscalSnapshot:payload,
  };
  let response;
  try{
    response=await transport(url+"/v1/fiscalize",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer "+token,
        "Idempotency-Key":requestKey,
      },
      body:JSON.stringify(request),
      signal:AbortSignal.timeout(12000),
      redirect:"error",
    });
  }catch{
    return {status:"UNKNOWN",errorCode:"TRANSPORT_UNCERTAIN"};
  }
  if(!response.ok){
    if(response.status>=400&&response.status<500)
      return {status:"REJECTED",errorCode:"BRIDGE_REJECTED"};
    return {status:"UNKNOWN",errorCode:"BRIDGE_UNCERTAIN"};
  }
  let receipt;
  try{receipt=await response.json();}catch{
    return {status:"UNKNOWN",errorCode:"INVALID_BRIDGE_RESPONSE"};
  }
  // The following schema is a CONTRACT FOR OUR SIDE-CAR, not a claim that KRA
  // itself uses these JSON fields. Never accept a production-like assertion.
  if(receipt?.environment!=="SANDBOX"||
     receipt?.contract!=="fdos-oscu-sandbox-v1"||
     receipt?.solution!=="OSCU")
    return {status:"UNKNOWN",errorCode:"UNVERIFIED_BRIDGE_PROVENANCE"};
  if(receipt.status==="REJECTED")
    return {status:"REJECTED",errorCode:"SANDBOX_REJECTED"};
  if(receipt.status!=="ACCEPTED")
    return {status:"UNKNOWN",errorCode:"UNRECOGNIZED_BRIDGE_STATE"};
  const id=receipt.scuId,number=receipt.receiptNumber,signature=receipt.signature;
  if(![id,number,signature].every(x=>typeof x==="string"&&x.length>=4&&x.length<512))
    return {status:"UNKNOWN",errorCode:"MISSING_SANDBOX_SCUSIGNATURE"};
  return {
    status:"SANDBOX_ACKNOWLEDGED",sandboxScuId:id,
    sandboxReceiptNumber:number,sandboxSignature:signature,
    sandboxInternalData:typeof receipt.internalData==="string"?receipt.internalData.slice(0,1024):null,
    bridgeRef:typeof receipt.bridgeReference==="string"?receipt.bridgeReference.slice(0,200):null,
  };
}
