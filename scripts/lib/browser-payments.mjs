import { randomBytes,randomUUID,createHmac } from 'node:crypto';
import { createServer } from 'node:http';

// Explicitly controlled remote transport for the isolated P12 recipe. This never contacts Stripe.
export async function createBrowserPayments(env){
  if(env.APP_ENV!=='test')throw new Error('Controlled payment transport requires the isolated test environment.');
  const secret=`sk_test_browser_${randomBytes(24).toString('hex')}`,webhook=`whsec_${randomBytes(32).toString('hex')}`,account=`acct_${randomBytes(12).toString('hex')}`;
  const sessions=new Map(),keys=new Map(),events=new Map(),sockets=new Set();let requests=0,creates=0,stopped=false;
  const sessionView=s=>({id:s.id,object:'checkout.session',livemode:false,mode:'payment',created:s.created,status:s.state==='OPEN'?'open':s.state==='EXPIRED'?'expired':'complete',payment_status:['PAID','REFUNDED'].includes(s.state)?'paid':'unpaid',url:s.state==='OPEN'?s.url:null,expires_at:s.expires,amount_total:s.amount,currency:s.currency,metadata:{operation_id:s.operation,order_id:s.order},client_reference_id:s.order,payment_intent:s.state==='OPEN'||s.state==='EXPIRED'?null:{id:s.intent,object:'payment_intent',livemode:false,status:s.state==='PROCESSING'?'processing':s.state==='FAILED'?'requires_payment_method':'succeeded',amount:s.amount,amount_received:['PAID','REFUNDED'].includes(s.state)?s.amount:0,currency:s.currency,metadata:{order_id:s.order,operation_id:s.operation},latest_charge:['PAID','REFUNDED'].includes(s.state)?{id:s.charge,object:'charge',livemode:false,amount:s.amount,amount_refunded:s.state==='REFUNDED'?s.amount:0,currency:s.currency,paid:true,refunded:s.state==='REFUNDED',created:s.created,payment_intent:s.intent}:null}});
  const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Request-Id':`req_${randomBytes(8).toString('hex')}`});res.end(JSON.stringify(value));};
  const server=createServer(async(req,res)=>{
    try{
      requests++;
      if(req.headers.authorization!==`Bearer ${secret}`||req.headers['stripe-account']!==undefined||req.headers['stripe-version']!=='2026-10-28.endive')return send(res,401,{error:{type:'authentication_error',message:'Controlled test transport refused this request.'}});
      const url=new URL(req.url,'http://127.0.0.1');
      if(req.method==='GET'&&url.pathname==='/v1/account')return send(res,200,{id:account,object:'account'});
      if(req.method==='POST'&&url.pathname==='/v1/checkout/sessions'){
        creates++;
        let raw='';for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>32768)return send(res,413,{error:{type:'invalid_request_error',message:'Test body limit.'}});}
        const p=new URLSearchParams(raw),key=req.headers['idempotency-key'];
        if(typeof key!=='string'||!/^cc-checkout-[a-f0-9-]{36}$/.test(key)||p.get('mode')!=='payment'||p.get('ui_mode')!=='hosted_page'||p.get('line_items[0][quantity]')!=='1')return send(res,400,{error:{type:'invalid_request_error',message:'Controlled test parameters invalid.'}});
        const canonical=JSON.stringify([...p.entries()].sort(([a],[b])=>a.localeCompare(b))),previous=keys.get(key);
        if(previous){if(previous.canonical!==canonical)return send(res,409,{error:{type:'idempotency_error',message:'Controlled test parameters changed.'}});return send(res,200,sessionView(sessions.get(previous.id)));}
        const operation=p.get('metadata[operation_id]'),order=p.get('metadata[order_id]'),amount=Number(p.get('line_items[0][price_data][unit_amount]')),expires=Number(p.get('expires_at')),reference=p.get('line_items[0][price_data][product_data][metadata][offer_revision_id]');
        if(![operation,order,reference].every(v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v))||p.get('client_reference_id')!==order||!Number.isSafeInteger(amount)||amount<1||!Number.isSafeInteger(expires))return send(res,400,{error:{type:'invalid_request_error',message:'Controlled test references invalid.'}});
        const marker=randomBytes(14).toString('hex'),s={id:`cs_test_browser${marker}`,intent:`pi_browser${marker}`,charge:`ch_browser${marker}`,operation,order,amount,expires,reference,currency:p.get('line_items[0][price_data][currency]'),title:p.get('line_items[0][price_data][product_data][name]'),created:Math.floor(Date.now()/1000),state:'OPEN',url:`https://checkout.stripe.com/c/pay/cs_test_browser${marker}`};
        sessions.set(s.id,s);keys.set(key,{id:s.id,canonical});return send(res,200,sessionView(s));
      }
      if(req.method==='GET'&&url.pathname==='/v1/checkout/sessions'){
        const floor=Number(url.searchParams.get('created[gte]')??0);return send(res,200,{object:'list',data:[...sessions.values()].filter(s=>s.created>=floor).map(sessionView),has_more:false,url:'/v1/checkout/sessions'});
      }
      const match=/^\/v1\/checkout\/sessions\/(cs_[A-Za-z0-9_]+)(\/line_items)?$/.exec(url.pathname);
      const s=match?sessions.get(match[1]):null;if(req.method!=='GET'||!s)return send(res,404,{error:{type:'invalid_request_error',message:'Controlled test resource unavailable.'}});
      if(!match[2])return send(res,200,sessionView(s));
      return send(res,200,{object:'list',data:[{id:`li_${s.id.slice(3)}`,object:'item',quantity:1,amount_subtotal:s.amount,amount_total:s.amount,amount_discount:0,amount_tax:0,currency:s.currency,price:{id:`price_${s.id.slice(3)}`,object:'price',active:true,type:'one_time',unit_amount:s.amount,currency:s.currency,product:{id:`prod_${s.id.slice(3)}`,object:'product',active:true,name:s.title,metadata:{offer_revision_id:s.reference}}}}],has_more:false,url:`/v1/checkout/sessions/${s.id}/line_items`});
    }catch{if(!res.headersSent)send(res,500,{error:{type:'api_error',message:'Controlled test transport failure.'}});else res.end();}
  });
  server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port:0},resolve);});
  const address=server.address();if(!address||typeof address==='string')throw new Error('Test transport port not assigned.');
  Object.assign(env,{STRIPE_ENABLED:'true',STRIPE_MODE:'TEST',STRIPE_SECRET_KEY:secret,STRIPE_WEBHOOK_SECRET:webhook,STRIPE_ACCOUNT_ID:account,STRIPE_API_BASE:`http://127.0.0.1:${address.port}`,STRIPE_CONNECT_TIMEOUT:'1s',STRIPE_READ_TIMEOUT:'2s',PAYMENT_INBOX_ENABLED:'false',COMMERCE_ENABLED:'true',COMMERCE_ALLOWED_CURRENCIES:'EUR'});
  return {
    async advance(orderId,state,type,replayId){
      if(!/^[a-f0-9-]{36}$/.test(orderId)||!['OPEN','PROCESSING','PAID','FAILED','EXPIRED','REFUNDED'].includes(state)||!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(type))throw new Error('Controlled payment transition refused.');
      const s=[...sessions.values()].find(v=>v.order===orderId);if(!s)throw new Error('No owned test Checkout exists.');s.state=state;
      let event;if(replayId){event=events.get(replayId);if(!event||event.data.object.id!==s.id||event.type!==type)throw new Error('Test event replay was not found.');}else{event={id:`evt_browser${randomBytes(14).toString('hex')}`,object:'event',api_version:'2026-10-28.endive',created:Math.floor(Date.now()/1000),livemode:false,type,account,data:{object:{id:s.id,object:'checkout.session'}}};events.set(event.id,event);}
      const body=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000),signature=createHmac('sha256',webhook).update(`${timestamp}.${body}`).digest('hex');
      const result=await fetch(`${env.APP_PUBLIC_ORIGIN}/api/v1/webhooks/stripe`,{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body,redirect:'error',signal:AbortSignal.timeout(10000)});
      return {eventId:event.id,status:result.status,received:result.ok&&(await result.json()).received===true};
    },
    observation(){return {kind:'controlled-stripe-network',externalStripe:false,requests,createCalls:creates,sessions:sessions.size,stopped};},
    async stop(){if(stopped)return;for(const s of sockets)s.destroy();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));stopped=true;}
  };
}
