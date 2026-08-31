const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { createStorage } = require('./storage');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const LEGACY_DATA = path.join(ROOT, 'data', 'db.json');
const SQLITE_PATH = path.resolve(process.env.ARIA_DB_PATH || path.join(ROOT, 'data', 'aria.sqlite'));
const PUBLIC = path.join(ROOT, 'public');
const UPLOADS = path.join(PUBLIC, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const ADMIN_USER = String(process.env.ADMIN_USER || 'admin').trim() || 'admin';
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
if (ADMIN_PASSWORD.length < 12) {
  console.error('ADMIN_PASSWORD is required and must be at least 12 characters. See .env.example.');
  process.exit(1);
}
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/,'');
const OVERDUE_ORDER_AFTER_MS = Number(process.env.OVERDUE_ORDER_AFTER_MS || 60000);
const OVERDUE_CHECK_INTERVAL_MS = Number(process.env.OVERDUE_CHECK_INTERVAL_MS || 10000);
const OVERDUE_REPEAT_MS = Number(process.env.OVERDUE_REPEAT_MS || 60000);
const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const PRODUCT_IMAGE_MULTIPART_MAX_BYTES = PRODUCT_IMAGE_MAX_BYTES + 1024 * 1024;
const SITE_PHOTO_SLOTS = new Set(['heroMain','heroSecond','heroThird','aboutVenue']);
const DEFAULT_DELIVERY_TRAVEL_MINUTES = Number(process.env.DEFAULT_DELIVERY_TRAVEL_MINUTES || 15);
const sessions = new Map();
const adminSubscribers = new Set();
const publicSubscribers = new Set();
const storage = createStorage({ dbPath: SQLITE_PATH, legacyJsonPath: LEGACY_DATA });
const loaded = storage.loadState();
let db = loaded.state;
if (loaded.imported) console.log(`Legacy JSON data imported into SQLite: ${SQLITE_PATH}`);
if(!Array.isArray(db.coupons)) db.coupons=[];
if(!Array.isArray(db.notifications)) db.notifications=[];
if(!db.settings || typeof db.settings!=='object') db.settings={};
if(!Number.isFinite(Number(db.settings.preparationMinutes)) || Number(db.settings.preparationMinutes)<0) db.settings.preparationMinutes=25;
if(!Number.isFinite(Number(db.settings.deliveryTravelMinutes)) || Number(db.settings.deliveryTravelMinutes)<0) db.settings.deliveryTravelMinutes=DEFAULT_DELIVERY_TRAVEL_MINUTES;
if(!Number.isFinite(Number(db.settings.deliveryFee)) || Number(db.settings.deliveryFee)<0) db.settings.deliveryFee=35000;
if(!Number.isFinite(Number(db.settings.freeDeliveryOver)) || Number(db.settings.freeDeliveryOver)<0) db.settings.freeDeliveryOver=0;
if(!Number.isFinite(Number(db.settings.minimumOrder)) || Number(db.settings.minimumOrder)<0) db.settings.minimumOrder=0;
if(typeof db.settings.pickupEnabled!=='boolean') db.settings.pickupEnabled=true;
if(typeof db.settings.deliveryEnabled!=='boolean') db.settings.deliveryEnabled=true;
if(typeof db.settings.businessName!=='string'||!db.settings.businessName.trim()) db.settings.businessName='کافی شاپ آریا';
if(typeof db.settings.phone!=='string') db.settings.phone='';
if(!Array.isArray(db.settings.phones)) db.settings.phones=db.settings.phone?[db.settings.phone]:[];
const PLACEHOLDER_PHONES=new Set(['09120000000']);
db.settings.phones=[...new Set(db.settings.phones.map(x=>String(x||'').trim()).filter(x=>x&&!PLACEHOLDER_PHONES.has(x)))].slice(0,5);
if(PLACEHOLDER_PHONES.has(String(db.settings.phone||'').trim())) db.settings.phone='';
if(!db.settings.phone && db.settings.phones.length) db.settings.phone=db.settings.phones[0];
if(db.settings.phone && !db.settings.phones.includes(db.settings.phone)) db.settings.phones.unshift(db.settings.phone);
if(typeof db.settings.address!=='string') db.settings.address='';
if(typeof db.settings.instagramUrl!=='string' || !db.settings.instagramUrl.trim() || /^https?:\/\/(www\.)?instagram\.com\/?$/i.test(db.settings.instagramUrl.trim()) || /arya_coffee_shop/i.test(db.settings.instagramUrl)) db.settings.instagramUrl='https://www.instagram.com/arya_coffe_shop/';
if(typeof db.settings.workingHours!=='string'||!db.settings.workingHours.trim()) db.settings.workingHours='هر روز ۸:۰۰ تا ۲۴:۰۰';
if(typeof db.settings.scheduleEnabled!=='boolean') db.settings.scheduleEnabled=true;
if(typeof db.settings.scheduleStart!=='string') db.settings.scheduleStart='08:00';
if(typeof db.settings.scheduleEnd!=='string') db.settings.scheduleEnd='24:00';
if(typeof db.settings.forceOpenForDayKey!=='string') db.settings.forceOpenForDayKey='';
if(!Number.isFinite(Number(db.settings.deliveryCenterLat))) db.settings.deliveryCenterLat=37.106;
if(!Number.isFinite(Number(db.settings.deliveryCenterLng))) db.settings.deliveryCenterLng=58.50955;
if(!Number.isFinite(Number(db.settings.deliveryRadiusKm))||Number(db.settings.deliveryRadiusKm)<=0) db.settings.deliveryRadiusKm=6;
if(!Array.isArray(db.settings.deliveryZones)||!db.settings.deliveryZones.length) db.settings.deliveryZones=[{maxKm:3,fee:30000},{maxKm:6,fee:35000}];
if(typeof db.settings.deliveryLocationAddress!=='string'||!db.settings.deliveryLocationAddress.trim()) db.settings.deliveryLocationAddress='قوچان، خیابان امام خمینی، نبش خیابان سنایی، کافی شاپ آریا';
if(typeof db.settings.menuNotice!=='string') db.settings.menuNotice='';
if(!db.settings.sitePhotos || typeof db.settings.sitePhotos!=='object' || Array.isArray(db.settings.sitePhotos)) db.settings.sitePhotos={};
for(const slot of SITE_PHOTO_SLOTS){if(typeof db.settings.sitePhotos[slot]!=='string')db.settings.sitePhotos[slot]='';}
if(typeof db.settings.aboutText!=='string') db.settings.aboutText=`آریا؛ از سال ۱۳۸۵ در قوچان، همراه لحظه‌های شیرین شماست.

ما در آریا با هدف ارائه‌ی تجربه‌ای باکیفیت، دلنشین و مطمئن شکل گرفتیم. طی این سال‌ها تلاش کرده‌ایم با پایبندی به بهداشت، کیفیت و انتخاب مواد اولیه مناسب، محیطی شایسته برای خانواده‌ها و دوستداران طعم‌های اصیل فراهم کنیم.

از آبمیوه‌های تازه و بستنی‌های خوش‌طعم گرفته تا انواع نوشیدنی‌های گرم و قهوه، هر محصول در آریا با دقت و وسواس آماده می‌شود؛ چون برای ما کیفیت فقط یک شعار نیست، بلکه دستور کار ماست.

ما به همراهی شما در این سال‌ها افتخار می‌کنیم و همچنان تلاش می‌کنیم آریا جایی باشد که خانواده‌ها با خیال راحت برای یک تجربه خوش‌طعم و خاطره‌انگیز به آن برگردند.

آریا؛ کیفیت، بهداشت و طعمی که ماندگار می‌شود.`;

storage.saveState(db);

const TEHRAN_TZ = 'Asia/Tehran';
function tehranDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone: TEHRAN_TZ, year:'numeric', month:'2-digit', day:'2-digit'}).format(date);
}
function tehranDateKeyOffset(offsetDays) {
  const nowKey = tehranDateKey();
  const [y,m,d] = nowKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m-1, d + offsetDays, 12, 0, 0));
  return tehranDateKey(date);
}
function deliveryTravelMinutes() { return Math.max(0,Number(db.settings.deliveryTravelMinutes)||0); }
function orderEstimateMinutes() {
  return Math.max(5,Math.round(Number(db.settings.preparationMinutes)||25));
}
function estimateOrderAt(createdAt) {
  const base=new Date(createdAt);
  const deliveryMinutes=orderEstimateMinutes();
  const estimatedAt=new Date(base.getTime()+deliveryMinutes*60*1000).toISOString();
  // estimatedReadyAt remains for backwards compatibility, but it now equals the single customer-facing delivery time.
  return {readyInMinutes:deliveryMinutes,estimatedReadyAt:estimatedAt,estimateMinutes:deliveryMinutes,estimatedAt};
}
function applyReadyInMinutes(order,minutes,{lock=false}={}) {
  const deliveryInMinutes=Math.max(5,Math.min(180,Math.round(Number(minutes)||0)));
  const now=new Date();
  const estimatedAt=new Date(now.getTime()+deliveryInMinutes*60*1000);
  order.readyInMinutes=deliveryInMinutes;
  order.estimatedReadyAt=estimatedAt.toISOString();
  order.estimatedAt=estimatedAt.toISOString();
  order.estimateMinutes=Math.max(0,Math.round((estimatedAt.getTime()-Date.parse(order.createdAt||now.toISOString()))/60000));
  order.timingUpdatedAt=now.toISOString();
  if(lock){ order.readyTimeLocked=true; order.timingLockedAt=order.timingUpdatedAt; }
  return order;
}
function ensureStoredOrderTiming() {
  let changed=false;
  for(const order of (db.orders||[])){
    if(!order.createdAt) continue;
    if(!order.estimatedAt){const timing=estimateOrderAt(order.createdAt);Object.assign(order,timing);changed=true;continue;}
    // v58 uses one final delivery ETA for both pickup and courier orders.
    if(order.estimatedReadyAt!==order.estimatedAt){order.estimatedReadyAt=order.estimatedAt;changed=true;}
    const totalMinutes=Math.max(0,Math.round((Date.parse(order.estimatedAt)-Date.parse(order.createdAt))/60000));
    if(Number(order.readyInMinutes)!==totalMinutes){order.readyInMinutes=totalMinutes;changed=true;}
    if(Number(order.estimateMinutes)!==totalMinutes){order.estimateMinutes=totalMinutes;changed=true;}
    if(typeof order.readyTimeLocked!=='boolean'){order.readyTimeLocked=false;changed=true;}
    if(order.readyTimeLocked && !order.timingLockedAt && order.timingUpdatedAt){order.timingLockedAt=order.timingUpdatedAt;changed=true;}
  }
  if(changed)saveDb();
}
ensureStoredOrderTiming();
compactOverdueNotifications();
function fulfillmentAvailable(type){return type==='pickup'?db.settings.pickupEnabled!==false:type==='delivery'?db.settings.deliveryEnabled!==false:false;}
function parseClockMinutes(v){const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);if(!m)return null;const h=Number(m[1]),min=Number(m[2]);if(h===24&&min===0)return 1440;if(h<0||h>23||min<0||min>59)return null;return h*60+min;}
function tehranClockMinutes(date=new Date()){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:TEHRAN_TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);const h=Number(parts.find(x=>x.type==='hour')?.value||0),m=Number(parts.find(x=>x.type==='minute')?.value||0);return h*60+m;}
function scheduleOpenNow(){if(db.settings.scheduleEnabled===false)return true;const start=parseClockMinutes(db.settings.scheduleStart)??480,end=parseClockMinutes(db.settings.scheduleEnd)??1440,now=tehranClockMinutes();return start<=end?(now>=start&&now<end):(now>=start||now<end);}
function haversineKm(lat1,lng1,lat2,lng2){const R=6371,toRad=x=>x*Math.PI/180,dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(a));}
function deliveryDistanceKm(lat,lng){return haversineKm(Number(db.settings.deliveryCenterLat),Number(db.settings.deliveryCenterLng),Number(lat),Number(lng));}
function normalizeDeliveryZones(raw){const list=Array.isArray(raw)?raw:[];const zones=list.slice(0,10).map(z=>({maxKm:Number(z?.maxKm),fee:Number(z?.fee)})).filter(z=>Number.isFinite(z.maxKm)&&z.maxKm>=0.2&&z.maxKm<=50&&Number.isInteger(z.fee)&&z.fee>=0&&z.fee<=100000000).sort((a,b)=>a.maxKm-b.maxKm);const out=[];for(const z of zones){if(out.length&&Math.abs(out[out.length-1].maxKm-z.maxKm)<1e-9)out[out.length-1]=z;else out.push(z)}return out}
function activeDeliveryZones(){const zones=normalizeDeliveryZones(db.settings.deliveryZones);if(zones.length)return zones;return [{maxKm:Math.max(.2,Number(db.settings.deliveryRadiusKm)||6),fee:Math.max(0,Number(db.settings.deliveryFee)||0)}]}
function deliveryQuoteByDistance(distance){const d=Number(distance),zones=activeDeliveryZones(),zone=zones.find(z=>d<=z.maxKm+1e-9);return zone?{inside:true,distanceKm:d,maxKm:zone.maxKm,fee:zone.fee,zoneIndex:zones.indexOf(zone)}:{inside:false,distanceKm:d,maxKm:zones[zones.length-1]?.maxKm||0,fee:null,zoneIndex:-1}}
function publicStoreSettings(){const out={...db.settings};delete out.deliveryZones;delete out.deliveryRadiusKm;delete out.deliveryFee;return {...out,ordering:orderState()};}
function normalizeDigits(value){return String(value??'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));}
function normalizeIranPhone(value){let v=normalizeDigits(value).trim().replace(/[\s().-]+/g,'');if(v.startsWith('+98'))v='0'+v.slice(3);else if(v.startsWith('0098'))v='0'+v.slice(4);else if(v.startsWith('98')&&v.length===12)v='0'+v.slice(2);return v;}
function normalizeOrderNumber(value){return normalizeDigits(value).trim().toUpperCase();}
function publicOrderView(order){const copy=JSON.parse(JSON.stringify(order));if(copy.deliveryZone)delete copy.deliveryZone;if(copy.fulfillment?.location)copy.fulfillment.location={lat:copy.fulfillment.location.lat,lng:copy.fulfillment.location.lng};return copy;}
function compactOverdueNotifications(){const seen=new Set();const before=(db.notifications||[]).length;db.notifications=(db.notifications||[]).filter(n=>{if(n.type!=='overdue_order')return true;const key=String(n.orderId||'');if(!key||seen.has(key))return false;seen.add(key);return true});if(db.notifications.length!==before)saveDb();}
function ordersOpen(){return orderState().open;}
function orderState(){const today=tehranDateKey();const manualClosed=db.settings.closedForDayKey===today;const manualOpen=db.settings.forceOpenForDayKey===today;const methodsClosed=!fulfillmentAvailable('pickup')&&!fulfillmentAvailable('delivery');const scheduled=scheduleOpenNow();let closedReason=null,closedReasonCode=null;if(manualClosed){closedReason=db.settings.closedReason||'سفارش‌گیری موقتاً بسته است.';closedReasonCode=db.settings.closedReasonCode||'other';}else if(methodsClosed){closedReason='در حال حاضر روش دریافت فعالی برای سفارش وجود ندارد.';closedReasonCode='no_fulfillment';}else if(!manualOpen&&!scheduled){closedReason=`سفارش‌گیری هر روز از ${db.settings.scheduleStart||'08:00'} تا ${db.settings.scheduleEnd||'24:00'} فعال است.`;closedReasonCode='outside_hours';}const closed=Boolean(closedReason);return {open:!closed,closed,today,closedForDayKey:db.settings.closedForDayKey||null,closedReason,closedReasonCode,scheduledOpen:scheduled,manualOpen,workingWindow:{start:db.settings.scheduleStart||'08:00',end:db.settings.scheduleEnd||'24:00'}};}
function orderUpdatePayload(o){return {number:o.number,status:o.status,statusUpdatedAt:o.statusUpdatedAt||null,completedAt:o.completedAt||null,estimatedReadyAt:o.estimatedReadyAt||null,estimatedAt:o.estimatedAt||null,readyInMinutes:Number(o.readyInMinutes)||0,timingUpdatedAt:o.timingUpdatedAt||null,readyTimeLocked:Boolean(o.readyTimeLocked),timingLockedAt:o.timingLockedAt||null};}

function saveDb() { storage.saveState(db); }
function id(prefix) { return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`; }
function createOrderNumber() {
  const existing=new Set((db.orders||[]).map(o=>String(o.number||'')));
  for(let i=0;i<200;i++){
    const candidate=`ARIA-${crypto.randomInt(100000,1000000)}`;
    if(!existing.has(candidate)) return candidate;
  }
  throw new Error('ساخت شماره سفارش یکتا ممکن نشد؛ دوباره تلاش کنید.');
}
const rateMaps={login:new Map(),order:new Map(),track:new Map(),coupon:new Map(),quote:new Map()};
const rateConfig={
  login:{limit:Math.max(1,Number(process.env.LOGIN_FAILURE_MAX||5)),windowMs:Math.max(1000,Number(process.env.LOGIN_FAILURE_WINDOW_MS||900000))},
  order:{limit:Math.max(1,Number(process.env.ORDER_RATE_LIMIT_MAX||20)),windowMs:Math.max(1000,Number(process.env.ORDER_RATE_LIMIT_WINDOW_MS||300000))},
  track:{limit:Math.max(1,Number(process.env.TRACK_RATE_LIMIT_MAX||60)),windowMs:Math.max(1000,Number(process.env.TRACK_RATE_LIMIT_WINDOW_MS||300000))},
  coupon:{limit:Math.max(1,Number(process.env.COUPON_RATE_LIMIT_MAX||60)),windowMs:Math.max(1000,Number(process.env.COUPON_RATE_LIMIT_WINDOW_MS||300000))},
  quote:{limit:Math.max(1,Number(process.env.DELIVERY_QUOTE_RATE_LIMIT_MAX||120)),windowMs:Math.max(1000,Number(process.env.DELIVERY_QUOTE_RATE_LIMIT_WINDOW_MS||300000))}
};
function clientIp(req){
  if(TRUST_PROXY){const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();if(forwarded)return forwarded;}
  return String(req.socket?.remoteAddress||'unknown');
}
function rateStatus(kind,key,{consume=true}={}){
  const cfg=rateConfig[kind],map=rateMaps[kind],now=Date.now();
  let row=map.get(key); if(!row||row.resetAt<=now)row={count:0,resetAt:now+cfg.windowMs};
  const allowed=row.count<cfg.limit;
  if(allowed&&consume)row.count++;
  map.set(key,row);
  return {allowed,remaining:Math.max(0,cfg.limit-row.count),retryAfter:Math.max(1,Math.ceil((row.resetAt-now)/1000))};
}
function clearRate(kind,key){rateMaps[kind].delete(key);}
function rateLimitResponse(res,state){return json(res,429,{error:'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.'},{'Retry-After':String(state.retryAfter)});}
function json(res, status, body, extra={}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...extra });
  res.end(payload);
}
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(x => {
    const i=x.indexOf('='); return [x.slice(0,i).trim(), decodeURIComponent(x.slice(i+1))];
  }));
}
function isAdmin(req) { const token=parseCookies(req).admin_session; const expires=sessions.get(token); if(!token || !expires) return false; if(expires <= Date.now()){ sessions.delete(token); return false; } return true; }
function body(req) { return new Promise((resolve,reject)=>{ let raw=''; let size=0; req.on('data',c=>{size+=c.length;if(size>1e6){req.destroy();reject(new Error('Payload too large'));} else raw+=c}); req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(e)}}); req.on('error',reject); }); }
function broadcast(event, data, audience='all') {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const targets = audience==='admin' ? adminSubscribers : audience==='public' ? publicSubscribers : new Set([...adminSubscribers,...publicSubscribers]);
  for (const res of targets) { try { res.write(msg); } catch { adminSubscribers.delete(res); publicSubscribers.delete(res); } }
}
function checkOverdueOrders() {
  const now=Date.now(); let changed=false;
  for (const order of (db.orders||[])) {
    if (order.status!=='new') continue;
    const age=now-Date.parse(order.createdAt||'');
    if (!Number.isFinite(age) || age<OVERDUE_ORDER_AFTER_MS) continue;
    const lastAt=Date.parse(order.lastOverdueAlertAt||'');
    if (Number.isFinite(lastAt) && now-lastAt<OVERDUE_REPEAT_MS) continue;
    const createdAt=new Date().toISOString();
    let notification=(db.notifications||[]).find(n=>n.type==='overdue_order'&&n.orderId===order.id);
    if(notification){notification.createdAt=createdAt;notification.read=false;}else{notification={id:id('not'),type:'overdue_order',orderId:order.id,createdAt,read:false};db.notifications.unshift(notification);}
    order.lastOverdueAlertAt=createdAt;
    changed=true;
    broadcast('order.overdue',{id:notification.id,type:'overdue_order',createdAt,order},'admin');
  }
  if(changed) saveDb();
}
function publicProduct(p) { return { ...p, price: p.price == null ? null : Number(p.price), addOns: Array.isArray(p.addOns)?p.addOns.filter(a=>a.active!==false).map(a=>({...a,priceDelta:Number(a.priceDelta)||0})):[] }; }
function activeProducts() { return db.products.filter(p=>p.available).map(publicProduct); }
function normalizeOptions(raw){if(!Array.isArray(raw))return [];return raw.slice(0,12).map((g,gi)=>{const gid=String(g.id||`opt-${gi+1}`).trim()||`opt-${gi+1}`;const values=Array.isArray(g.values)?g.values.slice(0,30).map((v,vi)=>({id:String(v.id||`${gid}-value-${vi+1}`).trim()||`${gid}-value-${vi+1}`,name:String(v.name||'').trim().slice(0,80),priceDelta:Number.isInteger(Number(v.priceDelta))&&Number(v.priceDelta)>=0?Number(v.priceDelta):0,active:v.active!==false})).filter(v=>v.name):[];return{id:gid,name:String(g.name||'').trim().slice(0,80),type:g.type==='multi'?'multi':'single',required:Boolean(g.required),values}}).filter(g=>g.name&&g.values.length)}
function normalizeAddOns(raw){if(!Array.isArray(raw))return [];const seen=new Set();return raw.slice(0,30).map((a,i)=>{const aid=String(a.id||`addon-${i+1}`).trim()||`addon-${i+1}`;const allowedVolumeIds=Array.isArray(a.allowedVolumeIds)?[...new Set(a.allowedVolumeIds.map(String).filter(Boolean))].slice(0,20):[];return{id:aid,name:String(a.name||'').trim().slice(0,80),priceDelta:Number.isInteger(Number(a.priceDelta))&&Number(a.priceDelta)>=0?Number(a.priceDelta):0,active:a.active!==false,allowedVolumeIds}}).filter(a=>a.name&&!seen.has(a.id)&&(seen.add(a.id),true))}
function resolveSelectedOptions(product,raw){const selections=Array.isArray(raw)?raw:[],chosen=[];let extra=0;for(const g of(product.options||[])){const picks=selections.filter(x=>String(x.groupId||x.optionId||'')===g.id);if(g.required&&!picks.length)throw new Error(`لطفاً گزینه «${g.name}» را انتخاب کنید.`);for(const pick of(g.type==='multi'?picks:picks.slice(0,1))){const v=g.values.find(v=>v.id===String(pick.valueId||pick.id||'')&&v.active!==false);if(!v)throw new Error(`یکی از گزینه‌های «${g.name}» معتبر نیست.`);extra+=Number(v.priceDelta||0);chosen.push({groupId:g.id,groupName:g.name,valueId:v.id,valueName:v.name,priceDelta:Number(v.priceDelta||0)})}}return{chosen,extra}}
function resolveAddOns(product,raw,selectedOptions=[]){const ids=[...new Set(Array.isArray(raw)?raw.map(x=>String(x.id||x.addOnId||x)).filter(Boolean):[])];const chosen=[];let extra=0;for(const id of ids){const a=(product.addOns||[]).find(x=>x.id===id&&x.active!==false);if(!a)throw new Error('یکی از افزودنی‌های انتخاب‌شده معتبر نیست.');const allowed=Array.isArray(a.allowedVolumeIds)?a.allowedVolumeIds.filter(Boolean):[];if(allowed.length){const volumeGroup=(product.options||[]).find(g=>g.id==='opt-volume'||String(g.name||'').trim()==='حجم');const selectedVolume=(selectedOptions||[]).find(x=>x.groupId===volumeGroup?.id);if(!selectedVolume||!allowed.includes(String(selectedVolume.valueId)))throw new Error(`افزودنی «${a.name}» با این حجم قابل سفارش نیست.`);}extra+=Number(a.priceDelta||0);chosen.push({id:a.id,name:a.name,priceDelta:Number(a.priceDelta||0),allowedVolumeIds:allowed})}return{chosen,extra}}
function resolveCustomJuice(raw){const cfg=db.settings.customJuice||{};if(!cfg.enabled)throw new Error('آبمیوه خودت بساز در حال حاضر فعال نیست.');const fruitIds=[...new Set(Array.isArray(raw?.fruitIds)?raw.fruitIds.map(String):[])];if(!fruitIds.length)throw new Error('حداقل یک میوه انتخاب کن.');if(fruitIds.length>Number(cfg.maxFruits||3))throw new Error(`حداکثر ${cfg.maxFruits} میوه می‌توانی انتخاب کنی.`);const fruits=fruitIds.map(fid=>{const f=(cfg.fruits||[]).find(x=>x.id===fid&&x.active!==false);if(!f)throw new Error('یکی از میوه‌های انتخاب‌شده معتبر نیست.');return f});const vol=(cfg.volumes||[]).find(v=>v.id===String(raw.volumeId||'')&&v.active!==false);if(!vol)throw new Error('حجم آبمیوه را انتخاب کن.');const addOnIds=[...new Set(Array.isArray(raw.addOnIds)?raw.addOnIds.map(String):[])];const adds=addOnIds.map(aid=>{const a=(cfg.addOns||[]).find(x=>x.id===aid&&x.active!==false);if(!a)throw new Error('یکی از افزودنی‌های آبمیوه معتبر نیست.');return a});const extra=fruits.reduce((s,x)=>s+Number(x.priceDelta||0),0)+Number(vol.priceDelta||0)+adds.reduce((s,x)=>s+Number(x.priceDelta||0),0);return{fruitIds,fruits,volume:vol,addOns:adds,extra}}

function mime(file) { return {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'}[path.extname(file).toLowerCase()] || 'application/octet-stream'; }
function parseMultipart(req) {
  return new Promise((resolve,reject)=>{
    const type=req.headers['content-type']||'';
    const match=type.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if(!match) return reject(new Error('فرمت آپلود نامعتبر است.'));
    const boundary=Buffer.from('--'+(match[1]||match[2]));
    const chunks=[]; let size=0;
    req.on('data',c=>{ size+=c.length; if(size>PRODUCT_IMAGE_MULTIPART_MAX_BYTES){reject(new Error('حجم تصویر باید حداکثر ۱۰ مگابایت باشد.')); req.destroy(); return;} chunks.push(c); });
    req.on('end',()=>{
      try {
        const buf=Buffer.concat(chunks); const start=buf.indexOf(boundary); const end=buf.lastIndexOf(boundary);
        if(start<0||end<0) throw new Error('فایل پیدا نشد.');
        const part=buf.slice(start+boundary.length+2,end-2); const sep=part.indexOf(Buffer.from('\r\n\r\n'));
        if(sep<0) throw new Error('اطلاعات فایل ناقص است.');
        const headers=part.slice(0,sep).toString('utf8'); const data=part.slice(sep+4);
        const contentType=(headers.match(/Content-Type:\s*([^\r\n]+)/i)||[])[1]||'';
        resolve({contentType:contentType.trim(),data});
      } catch(e){reject(e)}
    });
    req.on('error',reject);
  });
}
function requestBaseUrl(req){if(PUBLIC_BASE_URL){try{return new URL(PUBLIC_BASE_URL).origin}catch{}}const proto=TRUST_PROXY?String(req.headers['x-forwarded-proto']||'').split(',')[0].trim():(req.socket?.encrypted?'https':'http');const host=String(req.headers.host||'').trim();try{return new URL(`${proto||'http'}://${host}`).origin}catch{return 'http://localhost:'+PORT}}
function safeInlineJson(value){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')}
function customerIndexPayload(template,req){const base=requestBaseUrl(req);const read=rel=>fs.readFileSync(path.join(PUBLIC,rel),'utf8');const literal=(input,token,value)=>input.replace(token,()=>String(value));let out=template.replaceAll('{{BASE_URL}}',()=>base);out=literal(out,'{{INLINE_MAP_CSS}}',read('vendor/aria-map/aria-map.css'));out=literal(out,'{{INLINE_SITE_CSS}}',read('styles.css'));out=literal(out,'{{BOOTSTRAP_STORE}}',safeInlineJson({settings:publicStoreSettings(),customJuice:db.settings.customJuice||null,categories:db.categories.filter(c=>c.active).sort((a,b)=>a.sort-b.sort),products:db.products.map(publicProduct)}));out=literal(out,'{{INLINE_MAP_JS}}',read('vendor/aria-map/aria-map.js'));out=literal(out,'{{INLINE_APP_JS}}',read('app.js'));return out}
function staticFile(req,res) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  let p = decodeURIComponent(u.pathname);
  if (p === '/') p='/index.html';
  if (p === '/admin') p='/admin.html';
  const file=path.normalize(path.join(PUBLIC,p));
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) return json(res,403,{error:'Forbidden'});
  fs.readFile(file,(err,data)=>{
    if(err)return json(res,404,{error:'Not found'});
    let payload=data;
    if(p==='/index.html'){try{payload=Buffer.from(customerIndexPayload(data.toString('utf8'),req),'utf8')}catch(e){console.error('Customer page bootstrap failed:',e);return json(res,500,{error:'Page bootstrap failed'})}}
    const ext=path.extname(file).toLowerCase();
    const cache=p==='/index.html'?'no-store, max-age=0':(['.js','.css','.html'].includes(ext)?'no-cache, max-age=0, must-revalidate':'public, max-age=3600');
    res.writeHead(200,{'Content-Type':mime(file),'Cache-Control':cache,'Content-Length':String(payload.length),'X-Content-Type-Options':'nosniff'});
    res.end(payload);
  });
}
function validateOrder(input) {
  if (!input || !Array.isArray(input.items) || input.items.length===0) throw new Error('سبد خرید خالی است.');
  if(input.items.length>50) throw new Error('تعداد ردیف‌های سفارش بیش از حد مجاز است.');
  for(const item of input.items){const qty=Number(item?.quantity);if(!item||typeof item!=='object'||!String(item.productId||'').trim()||String(item.productId||'').length>120)throw new Error('یکی از آیتم‌های سفارش نامعتبر است.');if(!Number.isInteger(qty)||qty<1||qty>20)throw new Error('تعداد هر محصول باید بین ۱ تا ۲۰ باشد.');}
  const name=String(input.customer?.name||'').trim();const phone=normalizeIranPhone(input.customer?.phone);
  if(!name || name.length>80 || !/^09\d{9}$/.test(phone)) throw new Error('نام و شماره موبایل معتبر لازم است.');
  input.customer.name=name;input.customer.phone=phone;
  if (!input.fulfillment || !['delivery','pickup'].includes(input.fulfillment.type)) throw new Error('نوع دریافت سفارش نامعتبر است.');
  if (!fulfillmentAvailable(input.fulfillment.type)) throw new Error(input.fulfillment.type==='delivery'?'ارسال در حال حاضر غیرفعال است.':'تحویل حضوری در حال حاضر غیرفعال است.');
  const notes=String(input.fulfillment.notes||'').trim();if(notes.length>500)throw new Error('توضیحات سفارش حداکثر ۵۰۰ کاراکتر است.');input.fulfillment.notes=notes;
  if (input.fulfillment.type==='delivery') {
    const address=String(input.fulfillment.address||'').trim();if(!address) throw new Error('آدرس برای ارسال الزامی است.');if(address.length>300)throw new Error('آدرس حداکثر ۳۰۰ کاراکتر است.');input.fulfillment.address=address;
    const lat=Number(input.fulfillment.lat),lng=Number(input.fulfillment.lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) throw new Error('لطفاً موقعیت تحویل را روی نقشه مشخص کنید.');
    const distance=deliveryDistanceKm(lat,lng),quote=deliveryQuoteByDistance(distance);
    if(!quote.inside) throw new Error('این موقعیت در محدوده ارسال آریا نیست.');
  }
}

function normalizeCouponCode(v){return String(v||'').trim().toUpperCase().replace(/\s+/g,'');}
function findCoupon(code){const c=normalizeCouponCode(code);return db.coupons.find(x=>normalizeCouponCode(x.code)===c);}
function couponReservedCount(c){return (db.orders||[]).filter(o=>o.coupon?.id===c?.id && !['completed','cancelled'].includes(o.status)).length;}
function couponEligible(c, subtotal, items, phone){
  if(!c || c.active===false) return [false,'کد تخفیف معتبر نیست.'];
  const now=Date.now();
  if(c.startsAt && now < new Date(c.startsAt).getTime()) return [false,'این کد هنوز فعال نشده است.'];
  if(c.expiresAt && now > new Date(c.expiresAt).getTime()) return [false,'اعتبار این کد به پایان رسیده است.'];
  const used=Number(c.usedCount||0),reserved=couponReservedCount(c),limit=Number(c.usageLimit||0);
  if(limit>0 && used+reserved>=limit) return [false,'ظرفیت استفاده از این کد تکمیل شده است.'];
  if(Number(c.minOrder||0)>subtotal) return [false,`حداقل مبلغ سفارش برای این کد ${Number(c.minOrder).toLocaleString('fa-IR')} تومان است.`];
  if(c.firstOrder && phone){
    const priorCompleted=db.orders.some(o=>o.customer?.phone===phone && o.status==='completed');
    const pendingFirstOrder=db.orders.some(o=>o.customer?.phone===phone && !['completed','cancelled'].includes(o.status) && o.coupon?.firstOrder===true);
    if(priorCompleted||pendingFirstOrder)return [false,'این کد فقط برای اولین سفارش قابل استفاده است.'];
  }
  const applicable=items.filter(i=>!c.productIds?.length && !c.categoryIds?.length || (c.productIds||[]).includes(i.productId) || (c.categoryIds||[]).includes(i.categoryId));
  if(c.productIds?.length && !applicable.length)return [false,'این کد برای محصولات انتخاب‌شده قابل استفاده نیست.'];
  if(c.categoryIds?.length && !applicable.length)return [false,'این کد برای این دسته‌بندی قابل استفاده نیست.'];
  return [true,''];
}
function calculateDiscount(c, subtotal, items){
  let eligibleSubtotal=subtotal;
  if(c.productIds?.length || c.categoryIds?.length) eligibleSubtotal=items.filter(i=>(c.productIds||[]).includes(i.productId)||(c.categoryIds||[]).includes(i.categoryId)).reduce((sum,i)=>sum+Number(i.total||0),0);
  let d=c.type==='fixed'?Number(c.amount||0):Math.floor(eligibleSubtotal*Number(c.amount||0)/100);
  if(Number(c.maxDiscount||0)>0)d=Math.min(d,Number(c.maxDiscount));
  return Math.max(0,Math.min(d,eligibleSubtotal));
}
function calculateOrder(input) {
  let subtotal=0; const items=[];
  for(const item of input.items){
    const custom=item.productId==='custom-juice-builder';
    if(custom){
      const qty=Math.max(1,Math.min(99,Number(item.quantity)||1));
      const cj=resolveCustomJuice(item.customJuice||{});
      const base=Number((db.settings.customJuice||{}).basePrice||0);
      if(base<=0) throw new Error('قیمت پایه آبمیوه خودت بساز تنظیم نشده است.');
      const unit=base+cj.extra; const total=unit*qty; subtotal+=total;
      items.push({id:id('oi'),productId:'custom-juice-builder',categoryId:null,name:'آبمیوه خودت بساز',quantity:qty,unitPrice:unit,total,options:[{groupName:'میوه‌ها',valueName:cj.fruits.map(x=>x.name).join(' + '),priceDelta:cj.fruits.reduce((s,x)=>s+Number(x.priceDelta||0),0)},{groupName:'حجم',valueName:cj.volume.name,priceDelta:Number(cj.volume.priceDelta||0)},...cj.addOns.map(a=>({groupName:'افزودنی',valueName:a.name,priceDelta:Number(a.priceDelta||0)}))],customJuice:{fruitIds:cj.fruitIds,fruits:cj.fruits.map(x=>x.name),volume:cj.volume.name,addOns:cj.addOns.map(x=>x.name)}});
      continue;
    }
    const p=db.products.find(x=>x.id===item.productId);
    if(!p) throw new Error('یکی از محصولات دیگر وجود ندارد.');
    if(!p.available) throw new Error(`محصول «${p.name}» ناموجود شده است.`);
    if(p.price==null || !Number.isFinite(Number(p.price)) || Number(p.price)<=0) throw new Error(`قیمت «${p.name}» هنوز ثبت نشده است.`);
    const qty=Math.max(1,Math.min(99,Number(item.quantity)||1));
    const resolved=resolveSelectedOptions(p,item.options);
    const addons=resolveAddOns(p,item.addOns,resolved.chosen);
    const unit=Number(p.price)+resolved.extra+addons.extra; const total=unit*qty; subtotal+=total;
    items.push({id:id('oi'),productId:p.id,categoryId:p.categoryId,name:p.name,quantity:qty,unitPrice:unit,total,options:resolved.chosen,addOns:addons.chosen});
  }
  let discount=0; let coupon=null;
  const code=normalizeCouponCode(input.couponCode);
  if(code){ const c=findCoupon(code); const [ok,msg]=couponEligible(c,subtotal,items,normalizeIranPhone(input.customer?.phone)); if(!ok) throw new Error(msg); discount=calculateDiscount(c,subtotal,items); coupon={id:c.id,code:c.code,discount,firstOrder:Boolean(c.firstOrder)}; }
  const minimumOrder=Math.max(0,Number(db.settings.minimumOrder)||0);
  if(minimumOrder>0 && subtotal<minimumOrder) throw new Error(`حداقل مبلغ سفارش ${minimumOrder.toLocaleString('fa-IR')} تومان است.`);
  const freeDeliveryOver=Math.max(0,Number(db.settings.freeDeliveryOver)||0);
  let shipping=0,deliveryZone=null;
  if(input.fulfillment.type==='delivery'){
    const distance=deliveryDistanceKm(Number(input.fulfillment.lat),Number(input.fulfillment.lng));
    const quote=deliveryQuoteByDistance(distance);
    if(!quote.inside) throw new Error('موقعیت تحویل خارج از محدوده ارسال است.');
    deliveryZone={maxKm:quote.maxKm,fee:quote.fee,distanceKm:Number(distance.toFixed(2))};
    shipping=(freeDeliveryOver>0 && subtotal>=freeDeliveryOver)?0:quote.fee;
  }
  return {items,subtotal,discount,shipping,total:Math.max(0,subtotal-discount)+shipping,coupon,deliveryZone};
}

const server=http.createServer(async(req,res)=>{
  try {
    const u=new URL(req.url,`http://${req.headers.host}`);
    if(u.pathname==='/api/health') return json(res,200,{ok:true,time:new Date().toISOString(),storage:storage.health()});
    if(req.method==='GET' && u.pathname==='/robots.txt'){const base=requestBaseUrl(req);res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600'});return res.end(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin/\nSitemap: ${base}/sitemap.xml\n`);}
    if(req.method==='GET' && u.pathname==='/sitemap.xml'){const base=requestBaseUrl(req);res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=3600'});return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url></urlset>`);}
    if(u.pathname==='/api/events') {
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive'});
      res.write(`event: ready\ndata: ${JSON.stringify({ok:true})}\n\n`); publicSubscribers.add(res); req.on('close',()=>publicSubscribers.delete(res)); return;
    }
    if(u.pathname==='/api/admin/events') {
      if(!isAdmin(req)) return json(res,401,{error:'Unauthorized'});
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive'});
      res.write(`event: ready\ndata: ${JSON.stringify({ok:true})}\n\n`); adminSubscribers.add(res); req.on('close',()=>adminSubscribers.delete(res)); return;
    }
    if(u.pathname.startsWith('/api/')) {
      if(req.method==='GET' && u.pathname==='/api/store') return json(res,200,{settings:publicStoreSettings(),customJuice:db.settings.customJuice||null,categories:db.categories.filter(c=>c.active).sort((a,b)=>a.sort-b.sort),products:db.products.map(publicProduct)});
      if(req.method==='POST' && u.pathname==='/api/admin/login') {
        const key=clientIp(req); const gate=rateStatus('login',key,{consume:false}); if(!gate.allowed)return rateLimitResponse(res,gate);
        const b=await body(req);
        const digest=v=>crypto.createHash('sha256').update(String(v)).digest();
        const userOk=crypto.timingSafeEqual(digest(b.username||''),digest(ADMIN_USER));
        const passOk=crypto.timingSafeEqual(digest(b.password||''),digest(ADMIN_PASSWORD));
        if(!userOk || !passOk){const failed=rateStatus('login',key);return json(res,401,{error:'نام کاربری یا رمز عبور اشتباه است.'},{'X-RateLimit-Remaining':String(failed.remaining)});}
        clearRate('login',key);
        const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,Date.now()+8*60*60*1000); const secure=COOKIE_SECURE?'; Secure':''; return json(res,200,{ok:true},{'Set-Cookie':`admin_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`});
      }
      if(req.method==='POST' && u.pathname==='/api/admin/logout') {
        const token=parseCookies(req).admin_session;
        if(token) sessions.delete(token);
        return json(res,200,{ok:true},{'Set-Cookie':`admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${COOKIE_SECURE?'; Secure':''}`});
      }
      if(req.method==='POST' && u.pathname==='/api/delivery/quote') {
        const gate=rateStatus('quote',clientIp(req)); if(!gate.allowed)return rateLimitResponse(res,gate);
        if(db.settings.deliveryEnabled===false)return json(res,409,{error:'ارسال با پیک در حال حاضر غیرفعال است.'});
        const b=await body(req); const lat=Number(b.lat),lng=Number(b.lng);
        if(!Number.isFinite(lat)||lat<-90||lat>90||!Number.isFinite(lng)||lng<-180||lng>180)return json(res,400,{error:'موقعیت انتخاب‌شده معتبر نیست.'});
        const quote=deliveryQuoteByDistance(deliveryDistanceKm(lat,lng));
        if(!quote.inside)return json(res,200,{inside:false,fee:null});
        return json(res,200,{inside:true,fee:Number(quote.fee)||0});
      }
      if(req.method==='POST' && u.pathname==='/api/coupons/validate') {
        const gate=rateStatus('coupon',clientIp(req)); if(!gate.allowed)return rateLimitResponse(res,gate);
        const b=await body(req); const code=normalizeCouponCode(b.code); if(!code)return json(res,400,{error:'کد تخفیف را وارد کنید.'});
        const c=findCoupon(code); const subtotal=Math.max(0,Number(b.subtotal)||0); const items=Array.isArray(b.items)?b.items:[]; const [ok,msg]=couponEligible(c,subtotal,items,normalizeIranPhone(b.phone)); if(!ok)return json(res,400,{error:msg});
        const discount=calculateDiscount(c,subtotal,items); return json(res,200,{ok:true,code:c.code,discount});
      }
      if(req.method==='POST' && u.pathname==='/api/orders') {
        const gate=rateStatus('order',clientIp(req)); if(!gate.allowed)return rateLimitResponse(res,gate);
        if(!ordersOpen()){const state=orderState();return json(res,409,{error:state.closedReason||'ثبت سفارش در حال حاضر بسته است.',storeClosed:true,ordering:state});}
        const b=await body(req); validateOrder(b); const calc=calculateOrder(b); const createdAt=new Date().toISOString(); const timing=estimateOrderAt(createdAt); const order={id:id('ord'),number:createOrderNumber(),createdAt,...timing,readyTimeLocked:false,timingLockedAt:null,customer:{name:b.customer.name,phone:b.customer.phone},fulfillment:{type:b.fulfillment.type,address:b.fulfillment.type==='delivery'?b.fulfillment.address:'',notes:b.fulfillment.notes,location:b.fulfillment.type==='delivery'?{lat:Number(b.fulfillment.lat),lng:Number(b.fulfillment.lng),distanceKm:Number(deliveryDistanceKm(Number(b.fulfillment.lat),Number(b.fulfillment.lng)).toFixed(2)),zoneMaxKm:calc.deliveryZone?.maxKm||null,zoneFee:calc.deliveryZone?.fee??null}:null},...calc,payment:{status:'not_configured',method:'online'},status:'new'};
        db.orders.unshift(order); db.notifications.unshift({id:id('not'),type:'new_order',orderId:order.id,createdAt:order.createdAt,read:false}); saveDb(); broadcast('order.created',order,'admin'); return json(res,201,{order:publicOrderView(order)});
      }
      if(req.method==='GET' && u.pathname==='/api/orders/track') {
        const gate=rateStatus('track',clientIp(req)); if(!gate.allowed)return rateLimitResponse(res,gate);
        const number=normalizeOrderNumber(u.searchParams.get('number')); const phone=normalizeIranPhone(u.searchParams.get('phone')); const order=db.orders.find(o=>normalizeOrderNumber(o.number)===number&&normalizeIranPhone(o.customer.phone)===phone); if(!order)return json(res,404,{error:'سفارشی با این مشخصات پیدا نشد.'}); return json(res,200,{order:publicOrderView(order)});
      }
      if(req.method==='GET' && u.pathname==='/api/admin/session') return isAdmin(req)?json(res,200,{ok:true}):json(res,401,{error:'Unauthorized'});
      if(u.pathname.startsWith('/api/admin/')) {
        if(!isAdmin(req)) return json(res,401,{error:'Unauthorized'});
        if(req.method==='GET' && u.pathname==='/api/admin/notifications') {
        const pending=(db.notifications||[]).filter(n=>!n.read&&(n.type==='new_order'||n.type==='overdue_order')).slice(0,30).map(n=>({...n,order:db.orders.find(o=>o.id===n.orderId)||null})).filter(n=>n.order);
        return json(res,200,{notifications:pending});
      }
      if(req.method==='POST' && u.pathname==='/api/admin/notifications/read') {
        const b=await body(req); const ids=new Set(Array.isArray(b.ids)?b.ids.map(String):[]);
        for(const n of (db.notifications||[])){if(ids.has(String(n.orderId))&&(n.type==='new_order'||n.type==='overdue_order'))n.read=true;}
        saveDb(); return json(res,200,{ok:true});
      }
      if(req.method==='GET' && u.pathname==='/api/admin/orders') {
          const date=u.searchParams.get('date');
          const status=u.searchParams.get('status');
          const q=String(u.searchParams.get('q')||'').trim().toLocaleLowerCase();
          let orders=date ? db.orders.filter(o=>tehranDateKey(new Date(o.createdAt))===date) : db.orders.slice();
          if(status && status!=='all') orders=orders.filter(o=>o.status===status);
          if(q) orders=orders.filter(o=>[o.number,o.customer?.name,o.customer?.phone].some(v=>String(v||'').toLocaleLowerCase().includes(q)));
          return json(res,200,{orders, date:date||null, status:status||'all'});
        }
        if(req.method==='GET' && u.pathname==='/api/admin/analytics') {
          const range=Math.min(90,Math.max(1,Number(u.searchParams.get('range')||30)));
          const today=tehranDateKey();
          const start=tehranDateKeyOffset(-(range-1));
          const inRange=db.orders.filter(o=>{const k=tehranDateKey(new Date(o.createdAt));return k>=start&&k<=today;});
          const completed=inRange.filter(o=>o.status==='completed');
          const cancelled=inRange.filter(o=>o.status==='cancelled');
          const revenue=completed.reduce((s,o)=>s+Number(o.total||0),0);
          const avg=completed.length?Math.round(revenue/completed.length):0;
          const daily=Array.from({length:range},(_,i)=>{const key=tehranDateKeyOffset(-(range-1-i));const rows=inRange.filter(o=>tehranDateKey(new Date(o.createdAt))===key);const done=rows.filter(o=>o.status==='completed');return {key,count:rows.length,completed:done.length,revenue:done.reduce((s,o)=>s+Number(o.total||0),0)};});
          const productMap=new Map(), categoryMap=new Map();
          for(const o of completed){for(const item of (o.items||[])){const k=item.productId||item.name;const cur=productMap.get(k)||{name:item.name,quantity:0,revenue:0};cur.quantity+=Number(item.quantity||0);cur.revenue+=Number(item.total||0);productMap.set(k,cur);const productRef=db.products.find(p=>p.id===item.productId);const ck=item.categoryId||productRef?.categoryId||'unknown';const catRef=db.categories.find(c=>c.id===ck);const cc=categoryMap.get(ck)||{categoryId:ck,name:item.categoryName||catRef?.name||'بدون دسته',quantity:0,revenue:0};cc.quantity+=Number(item.quantity||0);cc.revenue+=Number(item.total||0);categoryMap.set(ck,cc);}}
          const fulfillment={pickup:inRange.filter(o=>o.fulfillment?.type==='pickup').length,delivery:inRange.filter(o=>o.fulfillment?.type==='delivery').length};
          const statusCounts=Object.fromEntries(['new','confirmed','preparing','out_for_delivery','completed','cancelled'].map(st=>[st,inRange.filter(o=>o.status===st).length]));
          return json(res,200,{range,start,today,metrics:{orders:inRange.length,completed:completed.length,cancelled:cancelled.length,revenue,averageOrder:avg,completionRate:inRange.length?Math.round(completed.length/inRange.length*100):0,fulfillment},statusCounts,daily,topProducts:[...productMap.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,10),topCategories:[...categoryMap.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,10)});
        }
        if(req.method==='GET' && u.pathname==='/api/admin/day/status') return json(res,200,{ordering:orderState()});
        if(req.method==='POST' && u.pathname==='/api/admin/day/close') {
          const b=await body(req);
          const allowedReasons={end_of_hours:'پایان ساعت کاری',official_holiday:'تعطیل رسمی',no_courier:'نبود پیک',capacity:'تکمیل ظرفیت سفارش‌ها',technical:'مشکل فنی یا تعمیرات',temporary:'تعطیلی موقت',other:'سایر'};
          const code=String(b.reasonCode||'other');
          if(!allowedReasons[code]) return json(res,400,{error:'دلیل بسته شدن نامعتبر است.'});
          const custom=String(b.customReason||'').trim();
          const reason=code==='other' ? (custom||allowedReasons.other) : (custom ? `${allowedReasons[code]} — ${custom}` : allowedReasons[code]);
          if(reason.length>160) return json(res,400,{error:'دلیل بسته شدن بیش از حد طولانی است.'});
          const today=tehranDateKey();
          db.settings.closedForDayKey=today; db.settings.forceOpenForDayKey=''; db.settings.open=false; db.settings.closedReasonCode=code; db.settings.closedReason=reason; saveDb();
          broadcast('store.updated',orderState(),'all');
          return json(res,200,{ok:true,ordering:orderState()});
        }
        if(req.method==='POST' && u.pathname==='/api/admin/day/reopen') {
          db.settings.closedForDayKey=null; db.settings.forceOpenForDayKey=tehranDateKey(); db.settings.open=true; db.settings.closedReasonCode=null; db.settings.closedReason=null; saveDb();
          broadcast('store.updated',orderState(),'all');
          return json(res,200,{ok:true,ordering:orderState()});
        }
        if(req.method==='GET' && u.pathname==='/api/admin/settings') return json(res,200,{settings:{...db.settings,ordering:orderState()}});
        if(req.method==='PATCH' && u.pathname==='/api/admin/settings') {
          const b=await body(req); const nextSettings={...db.settings};
          const textFields={businessName:100,address:220,workingHours:160,menuNotice:220,aboutText:3000,deliveryLocationAddress:220};
          for(const [key,max] of Object.entries(textFields)) if(key in b) nextSettings[key]=String(b[key]||'').trim().slice(0,max);
          if(Array.isArray(b.phones)){
            const phones=[...new Set(b.phones.map(x=>normalizeDigits(x).trim().slice(0,30)).filter(x=>x&&!PLACEHOLDER_PHONES.has(x)))].slice(0,5);
            nextSettings.phones=phones; nextSettings.phone=phones[0]||'';
          }else if('phone' in b){
            const phone=normalizeDigits(b.phone).trim().slice(0,30); nextSettings.phone=PLACEHOLDER_PHONES.has(phone)?'':phone; nextSettings.phones=nextSettings.phone?[nextSettings.phone]:[];
          }
          if(!nextSettings.businessName) return json(res,400,{error:'نام مجموعه نمی‌تواند خالی باشد.'});
          if('instagramUrl' in b){const url=String(b.instagramUrl||'').trim().slice(0,300);if(url&&!/^https?:\/\//i.test(url))return json(res,400,{error:'لینک اینستاگرام باید با http:// یا https:// شروع شود.'});nextSettings.instagramUrl=url;}
          const numericFields={deliveryFee:[0,100000000],freeDeliveryOver:[0,1000000000],minimumOrder:[0,1000000000],preparationMinutes:[5,180],deliveryTravelMinutes:[0,180]};
          for(const [key,[min,max]] of Object.entries(numericFields)) if(key in b){const n=Number(b[key]);if(!Number.isInteger(n)||n<min||n>max)return json(res,400,{error:`مقدار «${key}» معتبر نیست.`});nextSettings[key]=n;}
          for(const [key,min,max] of [['deliveryCenterLat',-90,90],['deliveryCenterLng',-180,180],['deliveryRadiusKm',0.2,50]]) if(key in b){const n=Number(b[key]);if(!Number.isFinite(n)||n<min||n>max)return json(res,400,{error:`مقدار «${key}» معتبر نیست.`});nextSettings[key]=n;}
          if('deliveryZones' in b){const zones=normalizeDeliveryZones(b.deliveryZones);if(!zones.length)return json(res,400,{error:'حداقل یک محدوده ارسال معتبر لازم است.'});if(zones.length!==(Array.isArray(b.deliveryZones)?b.deliveryZones.length:0))return json(res,400,{error:'محدوده‌های ارسال نامعتبر یا تکراری هستند.'});nextSettings.deliveryZones=zones;nextSettings.deliveryRadiusKm=zones[zones.length-1].maxKm;nextSettings.deliveryFee=zones[0].fee;}
          if('scheduleEnabled' in b)nextSettings.scheduleEnabled=Boolean(b.scheduleEnabled);
          for(const key of ['scheduleStart','scheduleEnd']) if(key in b){const v=String(b[key]||'').trim();if(parseClockMinutes(v)===null)return json(res,400,{error:'ساعت کاری معتبر نیست.'});nextSettings[key]=v;}
          nextSettings.workingHours=`هر روز ${nextSettings.scheduleStart||'08:00'} تا ${nextSettings.scheduleEnd||'24:00'}`;
          for(const key of ['pickupEnabled','deliveryEnabled']) if(key in b) nextSettings[key]=Boolean(b[key]);
          db.settings=nextSettings; saveDb(); const publicSettings=publicStoreSettings(); broadcast('settings.updated',publicSettings,'all'); broadcast('store.updated',orderState(),'all'); return json(res,200,{settings:{...db.settings,ordering:orderState()}});
        }
        if(req.method==='GET' && u.pathname==='/api/admin/custom-juice') return json(res,200,{customJuice:db.settings.customJuice||{}});
        if(req.method==='PATCH' && u.pathname==='/api/admin/custom-juice'){ const b=await body(req); const c=db.settings.customJuice||{}; if('enabled' in b)c.enabled=Boolean(b.enabled); if('title' in b)c.title=String(b.title||'').trim().slice(0,100); if('description' in b)c.description=String(b.description||'').trim().slice(0,300); if('basePrice' in b){const n=Number(b.basePrice);if(!Number.isInteger(n)||n<=0)return json(res,400,{error:'قیمت پایه معتبر نیست.'});c.basePrice=n;} if('maxFruits' in b){const n=Number(b.maxFruits);if(!Number.isInteger(n)||n<1||n>10)return json(res,400,{error:'حداکثر میوه باید بین ۱ تا ۱۰ باشد.'});c.maxFruits=n;} if('volumes' in b)c.volumes=(Array.isArray(b.volumes)?b.volumes:[]).slice(0,10).map((v,i)=>({id:String(v.id||`vol-${i+1}`),name:String(v.name||'').trim(),priceDelta:Math.max(0,Number(v.priceDelta)||0),active:v.active!==false})).filter(v=>v.name); if('fruits' in b)c.fruits=(Array.isArray(b.fruits)?b.fruits:[]).slice(0,50).map((v,i)=>({id:String(v.id||`fruit-${i+1}`),name:String(v.name||'').trim(),priceDelta:Math.max(0,Number(v.priceDelta)||0),active:v.active!==false})).filter(v=>v.name); if('addOns' in b)c.addOns=normalizeAddOns(b.addOns); db.settings.customJuice=c; saveDb(); broadcast('custom-juice.updated',c); return json(res,200,{customJuice:c}); }
        if(req.method==='GET' && u.pathname==='/api/admin/coupons') return json(res,200,{coupons:db.coupons||[]});
        if(req.method==='POST' && u.pathname==='/api/admin/coupons') { const b=await body(req); const code=normalizeCouponCode(b.code); if(!/^[A-Z0-9_-]{3,40}$/.test(code))return json(res,400,{error:'کد باید ۳ تا ۴۰ کاراکتر انگلیسی، عدد، خط تیره یا زیرخط باشد.'}); if(findCoupon(code))return json(res,409,{error:'این کد قبلاً وجود دارد.'}); const type=b.type==='fixed'?'fixed':'percent'; const amount=Number(b.amount); if(!Number.isInteger(amount)||amount<=0|| (type==='percent'&&amount>100))return json(res,400,{error:type==='percent'?'درصد تخفیف باید بین ۱ تا ۱۰۰ باشد.':'مبلغ تخفیف معتبر نیست.'}); const startsAt=b.startsAt?new Date(b.startsAt).toISOString():null; const expiresAt=b.expiresAt?new Date(b.expiresAt).toISOString():null; if(b.startsAt&&Number.isNaN(new Date(b.startsAt).getTime()))return json(res,400,{error:'تاریخ شروع نامعتبر است.'}); if(b.expiresAt&&Number.isNaN(new Date(b.expiresAt).getTime()))return json(res,400,{error:'تاریخ پایان نامعتبر است.'}); if(startsAt&&expiresAt&&new Date(startsAt)>new Date(expiresAt))return json(res,400,{error:'تاریخ شروع نمی‌تواند بعد از پایان اعتبار باشد.'}); const c={id:id('cpn'),code,type,amount,minOrder:Math.max(0,Number(b.minOrder)||0),maxDiscount:Math.max(0,Number(b.maxDiscount)||0),startsAt,expiresAt,usageLimit:Math.max(0,Number(b.usageLimit)||0),usedCount:0,firstOrder:Boolean(b.firstOrder),productIds:Array.isArray(b.productIds)?b.productIds.map(String):[],categoryIds:Array.isArray(b.categoryIds)?b.categoryIds.map(String):[],active:b.active!==false}; db.coupons.unshift(c); saveDb(); return json(res,201,{coupon:c}); }
        if(u.pathname.startsWith('/api/admin/coupons/')) { const cid=u.pathname.split('/').pop(); const idx=db.coupons.findIndex(c=>c.id===cid); if(idx<0)return json(res,404,{error:'کد پیدا نشد.'}); if(req.method==='DELETE'){db.coupons.splice(idx,1);saveDb();return json(res,200,{ok:true});} if(req.method==='PATCH'){const b=await body(req);const c=db.coupons[idx];if('code' in b){const code=normalizeCouponCode(b.code);if(!/^[A-Z0-9_-]{3,40}$/.test(code))return json(res,400,{error:'کد نامعتبر است.'});const other=db.coupons.find(x=>x.id!==cid&&normalizeCouponCode(x.code)===code);if(other)return json(res,409,{error:'این کد قبلاً وجود دارد.'});c.code=code;} if('type'in b)c.type=b.type==='fixed'?'fixed':'percent'; if('amount'in b){const amount=Number(b.amount);if(!Number.isInteger(amount)||amount<=0||(c.type==='percent'&&amount>100))return json(res,400,{error:c.type==='percent'?'درصد تخفیف باید بین ۱ تا ۱۰۰ باشد.':'مبلغ تخفیف معتبر نیست.'});c.amount=amount;} for(const k of ['minOrder','maxDiscount','usageLimit'])if(k in b)c[k]=Math.max(0,Number(b[k])||0); for(const k of ['startsAt','expiresAt'])if(k in b){if(b[k]){const d=new Date(b[k]);if(Number.isNaN(d.getTime()))return json(res,400,{error:'تاریخ نامعتبر است.'});c[k]=d.toISOString();}else c[k]=null;} if(c.startsAt&&c.expiresAt&&new Date(c.startsAt)>new Date(c.expiresAt))return json(res,400,{error:'تاریخ شروع نمی‌تواند بعد از پایان اعتبار باشد.'}); for(const k of ['firstOrder','active'])if(k in b)c[k]=Boolean(b[k]); if('productIds'in b)c.productIds=Array.isArray(b.productIds)?b.productIds.map(String):[];if('categoryIds'in b)c.categoryIds=Array.isArray(b.categoryIds)?b.categoryIds.map(String):[];saveDb();return json(res,200,{coupon:c});} }
        if(req.method==='GET' && u.pathname==='/api/admin/products') return json(res,200,{products:db.products,categories:db.categories});
        if(req.method==='POST' && u.pathname==='/api/admin/categories') {
          const b=await body(req); const name=String(b.name||'').trim();
          if(!name) return json(res,400,{error:'نام دسته‌بندی الزامی است.'});
          if(name.length>60) return json(res,400,{error:'نام دسته‌بندی بیش از حد طولانی است.'});
          if(db.categories.some(c=>c.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())) return json(res,409,{error:'این دسته‌بندی قبلاً وجود دارد.'});
          const maxSort=db.categories.reduce((m,c)=>Math.max(m,Number(c.sort)||0),0);
          const category={id:id('cat'),name,sort:maxSort+1,active:true}; db.categories.push(category); saveDb(); broadcast('categories.updated',category,'all'); return json(res,201,{category});
        }
        if(req.method==='PATCH' && /^\/api\/admin\/categories\/[^/]+$/.test(u.pathname)) {
          const cid=u.pathname.split('/').pop(); const b=await body(req); const c=db.categories.find(x=>x.id===cid); if(!c)return json(res,404,{error:'دسته‌بندی پیدا نشد.'});
          if('name' in b){const name=String(b.name||'').trim(); if(!name)return json(res,400,{error:'نام دسته‌بندی الزامی است.'}); if(name.length>60)return json(res,400,{error:'نام دسته‌بندی بیش از حد طولانی است.'}); if(db.categories.some(x=>x.id!==cid&&x.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase()))return json(res,409,{error:'این دسته‌بندی قبلاً وجود دارد.'}); c.name=name;}
          if('active' in b)c.active=Boolean(b.active);
          if('sort' in b){const n=Number(b.sort); if(!Number.isInteger(n)||n<0)return json(res,400,{error:'ترتیب نامعتبر است.'}); c.sort=n;}
          saveDb(); broadcast('categories.updated',c,'all'); return json(res,200,{category:c});
        }
        if(req.method==='DELETE' && /^\/api\/admin\/categories\/[^/]+$/.test(u.pathname)) {
          const cid=u.pathname.split('/').pop(); const idx=db.categories.findIndex(x=>x.id===cid); if(idx<0)return json(res,404,{error:'دسته‌بندی پیدا نشد.'});
          const count=db.products.filter(p=>p.categoryId===cid).length; if(count>0)return json(res,409,{error:`این دسته‌بندی ${count} محصول دارد. ابتدا محصولاتش را به دسته دیگری منتقل کنید یا دسته را غیرفعال کنید.`});
          const removed=db.categories.splice(idx,1)[0]; saveDb(); broadcast('categories.updated',{id:cid,deleted:true},'all'); return json(res,200,{ok:true,category:removed});
        }
        if(req.method==='POST' && u.pathname==='/api/admin/products') {
          const b=await body(req);
          const name=String(b.name||'').trim();
          const categoryId=String(b.categoryId||'').trim();
          const description=String(b.description||'').trim();
          const price=Number(b.price);
          const category=db.categories.find(c=>c.id===categoryId && c.active);
          if(!name) return json(res,400,{error:'نام محصول الزامی است.'});
          if(name.length>100) return json(res,400,{error:'نام محصول بیش از حد طولانی است.'});
          if(!category) return json(res,400,{error:'دسته‌بندی معتبر انتخاب کنید.'});
          if(!Number.isFinite(price) || price<=0) return json(res,400,{error:'قیمت باید عدد مثبت باشد.'});
          if(db.products.some(p=>p.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())) return json(res,409,{error:'محصولی با این نام قبلاً وجود دارد.'});
          const product={
            id:id('prd'), categoryId, name, description, price:Math.round(price),
            available:b.available!==false, popular:Boolean(b.popular), new:Boolean(b.new),
            tags:Array.isArray(b.tags)?b.tags.map(x=>String(x).trim()).filter(Boolean).slice(0,20):[],
            options:normalizeOptions(b.options), addOns:normalizeAddOns(b.addOns), image:null
          };
          db.products.push(product); saveDb(); broadcast('product.updated',product,'all');
          return json(res,201,{product});
        }
        if(req.method==='POST' && /^\/api\/admin\/site-photos\/[^/]+$/.test(u.pathname)) {
          const slot=u.pathname.split('/').pop(); if(!SITE_PHOTO_SLOTS.has(slot))return json(res,400,{error:'جایگاه تصویر نامعتبر است.'});
          const file=await parseMultipart(req); const allowed={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
          if(!allowed[file.contentType]) return json(res,400,{error:'فقط JPG، PNG یا WebP مجاز است.'});
          if(!file.data.length) return json(res,400,{error:'تصویر خالی است.'});
          if(file.data.length>PRODUCT_IMAGE_MAX_BYTES) return json(res,413,{error:'حجم تصویر باید حداکثر ۱۰ مگابایت باشد.'});
          const filename=`site-${slot}-${Date.now()}.${allowed[file.contentType]}`;
          fs.writeFileSync(path.join(UPLOADS,filename),file.data);
          const current=db.settings.sitePhotos?.[slot]||'';
          if(current){const old=path.basename(current);if(old.startsWith(`site-${slot}-`)){try{fs.unlinkSync(path.join(UPLOADS,old))}catch{}}}
          db.settings.sitePhotos={...(db.settings.sitePhotos||{}),[slot]:`/uploads/${filename}`};
          saveDb(); const publicSettings=publicStoreSettings(); broadcast('settings.updated',publicSettings,'all'); return json(res,200,{slot,image:db.settings.sitePhotos[slot],settings:{...db.settings,ordering:orderState()}});
        }
        if(req.method==='DELETE' && /^\/api\/admin\/site-photos\/[^/]+$/.test(u.pathname)) {
          const slot=u.pathname.split('/').pop(); if(!SITE_PHOTO_SLOTS.has(slot))return json(res,400,{error:'جایگاه تصویر نامعتبر است.'});
          const current=db.settings.sitePhotos?.[slot]||'';
          if(current){const old=path.basename(current);if(old.startsWith(`site-${slot}-`)){try{fs.unlinkSync(path.join(UPLOADS,old))}catch{}}}
          db.settings.sitePhotos={...(db.settings.sitePhotos||{}),[slot]:''};
          saveDb(); const publicSettings=publicStoreSettings(); broadcast('settings.updated',publicSettings,'all'); return json(res,200,{slot,image:null,settings:{...db.settings,ordering:orderState()}});
        }
        if(req.method==='POST' && /^\/api\/admin\/products\/[^/]+\/image$/.test(u.pathname)) {
          const pid=u.pathname.split('/')[4]; const p=db.products.find(x=>x.id===pid); if(!p)return json(res,404,{error:'محصول پیدا نشد.'});
          const file=await parseMultipart(req); const allowed={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
          if(!allowed[file.contentType]) return json(res,400,{error:'فقط JPG، PNG یا WebP مجاز است.'});
          if(!file.data.length) return json(res,400,{error:'تصویر خالی است.'});
          if(file.data.length>PRODUCT_IMAGE_MAX_BYTES) return json(res,413,{error:'حجم تصویر باید حداکثر ۱۰ مگابایت باشد.'});
          const filename=`${pid}-${Date.now()}.${allowed[file.contentType]}`;
          fs.writeFileSync(path.join(UPLOADS,filename),file.data);
          if(p.image) { const old=path.basename(p.image); if(old.startsWith(pid+'-')) { try { fs.unlinkSync(path.join(UPLOADS,old)); } catch {} } }
          p.image=`/uploads/${filename}`; saveDb(); broadcast('product.updated',p,'all'); return json(res,200,{product:p});
        }
        if(req.method==='DELETE' && /^\/api\/admin\/products\/[^/]+\/image$/.test(u.pathname)) {
          const pid=u.pathname.split('/')[4]; const p=db.products.find(x=>x.id===pid); if(!p)return json(res,404,{error:'محصول پیدا نشد.'});
          if(p.image) { const old=path.basename(p.image); if(old.startsWith(pid+'-')) { try { fs.unlinkSync(path.join(UPLOADS,old)); } catch {} } }
          p.image=null; saveDb(); broadcast('product.updated',p,'all'); return json(res,200,{product:p});
        }
        if(req.method==='DELETE' && /^\/api\/admin\/products\/[^/]+$/.test(u.pathname)) {
          const pid=u.pathname.split('/').pop();
          const idx=db.products.findIndex(x=>x.id===pid);
          if(idx<0) return json(res,404,{error:'محصول پیدا نشد.'});
          const p=db.products[idx];
          if(p.image) { const old=path.basename(p.image); if(old.startsWith(pid+'-')) { try { fs.unlinkSync(path.join(UPLOADS,old)); } catch {} } }
          db.products.splice(idx,1);
          saveDb(); broadcast('product.deleted',{id:pid},'all');
          return json(res,200,{ok:true,id:pid});
        }
        if(req.method==='PATCH' && u.pathname.startsWith('/api/admin/products/')) {
          const pid=u.pathname.split('/').pop(); const b=await body(req); const p=db.products.find(x=>x.id===pid); if(!p)return json(res,404,{error:'محصول پیدا نشد.'});
          if('name' in b){const name=String(b.name||'').trim(); if(!name)return json(res,400,{error:'نام محصول الزامی است.'}); if(name.length>100)return json(res,400,{error:'نام محصول بیش از حد طولانی است.'}); if(db.products.some(x=>x.id!==pid&&x.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase()))return json(res,409,{error:'محصولی با این نام قبلاً وجود دارد.'}); p.name=name;}
          if('categoryId' in b){const categoryId=String(b.categoryId||'').trim(); if(!db.categories.some(c=>c.id===categoryId&&c.active))return json(res,400,{error:'دسته‌بندی معتبر انتخاب کنید.'}); p.categoryId=categoryId;}
          if('description' in b)p.description=String(b.description||'').trim().slice(0,300);
          if('tags' in b)p.tags=Array.isArray(b.tags)?b.tags.map(x=>String(x).trim()).filter(Boolean).slice(0,20):[];
          if('options' in b)p.options=normalizeOptions(b.options); if('addOns' in b)p.addOns=normalizeAddOns(b.addOns);
          if('available' in b)p.available=Boolean(b.available);
          if('popular' in b)p.popular=Boolean(b.popular);
          if('new' in b)p.new=Boolean(b.new);
          if('price' in b){const raw=String(b.price).replace(/,/g,'').trim(); const n=Number(raw); if(!Number.isInteger(n)||!Number.isFinite(n)||n<=0)return json(res,400,{error:'قیمت باید یک عدد صحیح مثبت باشد.'}); p.price=n;}
          saveDb(); broadcast('product.updated',p,'all'); return json(res,200,{product:p});
        }
        if(req.method==='PATCH' && /^\/api\/admin\/orders\/[^/]+\/timing$/.test(u.pathname)) {
          const oid=u.pathname.split('/')[4]; const b=await body(req); const o=db.orders.find(x=>x.id===oid); if(!o)return json(res,404,{error:'سفارش پیدا نشد.'});
          if(['completed','cancelled'].includes(o.status)) return json(res,409,{error:'زمان سفارش تکمیل‌شده یا لغوشده قابل تغییر نیست.'});
          const minutes=Number(b.readyInMinutes); if(!Number.isInteger(minutes)||minutes<5||minutes>180)return json(res,400,{error:'زمان تحویل باید بین ۵ تا ۱۸۰ دقیقه باشد.'});
          if(o.readyTimeLocked) return json(res,409,{error:'زمان این سفارش قبلاً ثبت و نهایی شده است.'});
          applyReadyInMinutes(o,minutes,{lock:true}); saveDb(); broadcast('order.updated',orderUpdatePayload(o),'all'); return json(res,200,{order:o});
        }
        if(req.method==='PATCH' && u.pathname.startsWith('/api/admin/orders/')) {
          const oid=u.pathname.split('/').pop(); const b=await body(req); const allowed=['new','confirmed','preparing','out_for_delivery','completed','cancelled']; if(!allowed.includes(b.status))return json(res,400,{error:'وضعیت نامعتبر است.'}); const o=db.orders.find(x=>x.id===oid); if(!o)return json(res,404,{error:'سفارش پیدا نشد.'});
          const nextMap={new:['confirmed','cancelled'],confirmed:['preparing','cancelled'],preparing:['out_for_delivery','completed','cancelled'],out_for_delivery:['completed','cancelled'],completed:[],cancelled:[]};
          let next=b.status;
          if(o.fulfillment?.type==='pickup' && o.status==='preparing' && b.status==='out_for_delivery') return json(res,400,{error:'سفارش تحویل حضوری نباید وارد وضعیت ارسال شود؛ مستقیماً آن را تکمیل کنید.'});
          if(!(nextMap[o.status]||[]).includes(next)) return json(res,409,{error:`تغییر وضعیت از «${o.status}» به «${next}» مجاز نیست.`});
          const wasCompleted=o.status==='completed'; const wasNew=o.status==='new'; o.status=next; o.statusUpdatedAt=new Date().toISOString(); if(next==='completed'&&!o.completedAt)o.completedAt=o.statusUpdatedAt; if(next==='cancelled'&&!o.cancelledAt)o.cancelledAt=o.statusUpdatedAt; if(next!=='new'){for(const n of (db.notifications||[])){if(n.orderId===o.id&&(n.type==='new_order'||n.type==='overdue_order'))n.read=true;}} if(next==='completed' && !wasCompleted && o.coupon?.id){const c=db.coupons.find(x=>x.id===o.coupon.id);if(c)c.usedCount=Number(c.usedCount||0)+1;} saveDb(); broadcast('order.updated',orderUpdatePayload(o),'all'); return json(res,200,{order:o});
        }
      }
      return json(res,404,{error:'API route not found'});
    }
    staticFile(req,res);
  } catch(e) { console.error(e); json(res,400,{error:e.message||'خطای سرور'}); }
});
const overdueTimer=setInterval(checkOverdueOrders,OVERDUE_CHECK_INTERVAL_MS);
if(overdueTimer.unref) overdueTimer.unref();
checkOverdueOrders();
server.listen(PORT, HOST, () => {
  console.log(`Quchan Juice House running on port ${PORT}`);
  console.log(`SQLite database: ${SQLITE_PATH}`);
  console.log('LAN access: http://<YOUR-PC-IP>:' + PORT);
});
function shutdown(){try{server.close(()=>{storage.close();process.exit(0)})}catch{storage.close();process.exit(0)}setTimeout(()=>{storage.close();process.exit(1)},5000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
