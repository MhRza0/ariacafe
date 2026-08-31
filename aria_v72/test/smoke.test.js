const test=require('node:test');
const assert=require('node:assert');
const {execFile}=require('node:child_process');
const http=require('node:http');
const path=require('node:path');
const fs=require('node:fs');
function req(pathname,opts={}){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:31337,path:pathname,...opts},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>resolve({status:res.statusCode,body:b,headers:res.headers}))});r.on('error',reject);if(opts.body)r.write(opts.body);r.end()})}
let child; const ROOT=path.join(__dirname,'..');
const dbPath=path.join(ROOT,'data','db.json'); const dbBackup=dbPath+'.test-backup'; const sqliteTestPath=path.join(ROOT,'data','aria-test.sqlite'); const TEST_ADMIN_PASSWORD='test-admin-password-v64';
test.before(async()=>{require('fs').copyFileSync(dbPath,dbBackup);for(const suffix of ['', '-wal','-shm'])try{fs.unlinkSync(sqliteTestPath+suffix)}catch{}; child=execFile(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'31337',HOST:'127.0.0.1',ADMIN_USER:'admin',ADMIN_PASSWORD:TEST_ADMIN_PASSWORD,ARIA_DB_PATH:sqliteTestPath,TRUST_PROXY:'1',COOKIE_SECURE:'0',ORDER_RATE_LIMIT_MAX:'1000',TRACK_RATE_LIMIT_MAX:'1000',COUPON_RATE_LIMIT_MAX:'1000',OVERDUE_ORDER_AFTER_MS:'80',OVERDUE_CHECK_INTERVAL_MS:'40',OVERDUE_REPEAT_MS:'180'}}); await new Promise(r=>setTimeout(r,500));const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];const settings=JSON.stringify({scheduleEnabled:false});await req('/api/admin/settings',{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(settings),'Cookie':cookie},body:settings});});
test.after(()=>{child.kill(); try{require('fs').copyFileSync(dbBackup,dbPath);require('fs').unlinkSync(dbBackup)}catch{};for(const suffix of ['', '-wal','-shm'])try{fs.unlinkSync(sqliteTestPath+suffix)}catch{}});
test('health endpoint',async()=>{const r=await req('/api/health');assert.equal(r.status,200);assert.match(r.body,/"ok":true/)});
test('store contains the five seed products',async()=>{const r=await req('/api/store');const j=JSON.parse(r.body);const names=j.products.map(x=>x.name);assert.ok(j.products.length>=5);assert.deepEqual(names.slice(0,5),['شیرموز','آب هویج','آیس پک','شیک نوتلا','بستنی سنتی'])});
test('admin login works with development credentials',async()=>{const body=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const r=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},body});assert.equal(r.status,200);assert.match(r.headers['set-cookie'][0],/admin_session=/)})
test('seed products have test prices',async()=>{const r=await req('/api/store');const j=JSON.parse(r.body);assert.deepEqual(j.products.slice(0,5).map(x=>x.price),[110000,170000,180000,420000,120000])})
test('admin can add a menu item',async()=>{const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];const body=JSON.stringify({name:'محصول تستی '+Date.now(),categoryId:'cat-shake',price:150000,description:'محصول تست',tags:['تست'],available:true,popular:false,new:true});const r=await req('/api/admin/products',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'Cookie':cookie},body});assert.equal(r.status,201);const j=JSON.parse(r.body);assert.match(j.product.name,/^محصول تستی \d+$/);assert.equal(j.product.price,150000)})
test('admin can fully edit a menu item and accept non-1000 price steps',async()=>{const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];const create=JSON.stringify({name:'ویرایش تست '+Date.now(),categoryId:'cat-shake',price:150001,description:'قدیمی',tags:['قدیمی'],available:true,popular:false,new:false});const cr=await req('/api/admin/products',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(create),'Cookie':cookie},body:create});assert.equal(cr.status,201);const pid=JSON.parse(cr.body).product.id;const edit=JSON.stringify({name:'ویرایش نهایی '+Date.now(),categoryId:'cat-icecream',price:105001,description:'توضیح جدید',tags:['ویژه','تست'],available:false,popular:true,new:true});const er=await req('/api/admin/products/'+pid,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(edit),'Cookie':cookie},body:edit});assert.equal(er.status,200);const product=JSON.parse(er.body).product;assert.equal(product.price,105001);assert.equal(product.categoryId,'cat-icecream');assert.equal(product.available,false);assert.equal(product.popular,true);assert.equal(product.new,true);assert.deepEqual(product.tags,['ویژه','تست'])})

test('admin can delete a menu item safely',async()=>{const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];const body=JSON.stringify({name:'حذف تست '+Date.now(),categoryId:'cat-shake',price:99001,description:'محصول حذف تست',tags:[],available:true,popular:false,new:false});const cr=await req('/api/admin/products',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'Cookie':cookie},body});assert.equal(cr.status,201);const pid=JSON.parse(cr.body).product.id;const dr=await req('/api/admin/products/'+pid,{method:'DELETE',headers:{'Cookie':cookie}});assert.equal(dr.status,200);const sr=await req('/api/store');const products=JSON.parse(sr.body).products;assert.ok(!products.some(p=>p.id===pid));});
test('customer app removes deleted product ids from persistent cart',async()=>{const fs=require('node:fs');const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');assert.match(app,/product\.deleted/);assert.match(app,/new Set\(store\.products\.map\(p=>p\.id\)\)/);});
test('order creation returns ARIA order number',async()=>{const body=JSON.stringify({customer:{name:'Test',phone:'09123456789'},fulfillment:{type:'pickup'},items:[{productId:'prd-banana-milk',quantity:1}]});const r=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},body});assert.equal(r.status,201);const j=JSON.parse(r.body);assert.match(j.order.number,/^ARIA-\d{6}$/);assert.equal(j.order.customer.phone,'09123456789')})

test('natural juice options calculate volume and ice cream pricing server-side',async()=>{const r=await req('/api/store');const j=JSON.parse(r.body);const p=j.products.find(x=>x.name==='آب هویج');assert.ok(p&&p.options.some(g=>g.id==='opt-volume'));assert.ok(p.addOns.some(a=>a.id==='addon-icecream'));const body=JSON.stringify({customer:{name:'Test',phone:'09123456789'},fulfillment:{type:'pickup'},items:[{productId:p.id,quantity:1,options:[{groupId:'opt-volume',valueId:'vol-300'}],addOns:['addon-icecream']} ]});const rr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},body});assert.equal(rr.status,201);const o=JSON.parse(rr.body).order;assert.equal(o.total,210000);assert.equal(o.items[0].unitPrice,210000)});

test('addon volume restrictions are enforced server-side',async()=>{const r=await req('/api/store');const j=JSON.parse(r.body);const p=j.products.find(x=>x.name==='آب هویج');const bad=JSON.stringify({customer:{name:'Restriction Test',phone:'09123334455'},fulfillment:{type:'pickup'},items:[{productId:p.id,quantity:1,options:[{groupId:'opt-volume',valueId:'vol-500'}],addOns:['addon-icecream']}]});const br=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bad)},body:bad});assert.equal(br.status,400);assert.match(br.body,/با این حجم قابل سفارش نیست/);const good=JSON.stringify({customer:{name:'Restriction Test',phone:'09123334456'},fulfillment:{type:'pickup'},items:[{productId:p.id,quantity:1,options:[{groupId:'opt-volume',valueId:'vol-300'}],addOns:['addon-icecream']}]});const gr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(good)},body:good});assert.equal(gr.status,201);const o=JSON.parse(gr.body).order;assert.equal(o.items[0].addOns[0].name,'افزودن بستنی')});

test('admin shows full order details and option names',async()=>{const fs=require('node:fs');const admin=fs.readFileSync(path.join(__dirname,'..','public','admin.js'),'utf8');assert.match(admin,/مشاهده جزئیات سفارش/);assert.match(admin,/x\.groupName/);assert.match(admin,/x\.valueName/)});
test('customer menu has responsive pagination and product option opening',async()=>{const fs=require('node:fs');const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');assert.match(app,/customerPage/);assert.match(app,/window\.innerWidth<=560\?8:12/);assert.match(app,/data-product-view/);});

test('pickup orders do not require or persist an address',async()=>{const body=JSON.stringify({customer:{name:'Pickup Test',phone:'09123456789'},fulfillment:{type:'pickup',address:'آدرس اشتباهی که نباید ذخیره شود'},items:[{productId:'prd-banana-milk',quantity:1}]});const r=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},body});assert.equal(r.status,201);const o=JSON.parse(r.body).order;assert.equal(o.fulfillment.type,'pickup');assert.equal(o.fulfillment.address,'')});
test('admin event stream is protected and public stream is separate',async()=>{
  const openStream=(pathname,headers={})=>new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:31337,path:pathname,headers},res=>{resolve({status:res.statusCode,headers:res.headers});setTimeout(()=>res.destroy(),20)});r.on('error',e=>{if(e.code!=='ECONNRESET')reject(e)});r.end()});
  const pub=await openStream('/api/events');assert.equal(pub.status,200);assert.match(pub.headers['content-type'],/text\/event-stream/);
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const denied=await req('/api/admin/events');assert.equal(denied.status,401);
  const r=await openStream('/api/admin/events',{Cookie:cookie});assert.equal(r.status,200);assert.match(r.headers['content-type'],/text\/event-stream/);
});
test('admin live client uses protected admin event stream',async()=>{const fs=require('node:fs');const admin=fs.readFileSync(path.join(__dirname,'..','public','admin.js'),'utf8');assert.match(admin,/new EventSource\('\/api\/admin\/events'\)/)});



test('admin order workflow sends delivery directly from preparing',async()=>{const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];const create=JSON.stringify({customer:{name:'Delivery Test',phone:'09123456789'},fulfillment:{type:'delivery',lat:37.106,lng:58.50955,address:'Quchan test'},items:[{productId:'prd-banana-milk',quantity:1}]});const cr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(create)},body:create});assert.equal(cr.status,201);const oid=JSON.parse(cr.body).order.id;for(const status of ['confirmed','preparing','out_for_delivery','completed']){const b=JSON.stringify({status});const rr=await req('/api/admin/orders/'+oid,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b),'Cookie':cookie},body:b});assert.equal(rr.status,200)}const bad=JSON.stringify({status:'ready'});const rr=await req('/api/admin/orders/'+oid,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bad),'Cookie':cookie},body:bad});assert.equal(rr.status,400)})
test('admin order workflow enforces POS transitions and pickup completion',async()=>{const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];const create=JSON.stringify({customer:{name:'POS Test',phone:'09123456789'},fulfillment:{type:'pickup'},items:[{productId:'prd-banana-milk',quantity:1}]});const cr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(create)},body:create});assert.equal(cr.status,201);const oid=JSON.parse(cr.body).order.id;const bad=JSON.stringify({status:'completed'});const direct=await req('/api/admin/orders/'+oid,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bad),'Cookie':cookie},body:bad});assert.equal(direct.status,409);for(const status of ['confirmed','preparing','completed']){const b=JSON.stringify({status});const rr=await req('/api/admin/orders/'+oid,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b),'Cookie':cookie},body:b});assert.equal(rr.status,200);assert.equal(JSON.parse(rr.body).order.status,status)}})

test('analytics counts only completed orders as revenue and returns top products',async()=>{const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login),},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];const ar=await req('/api/admin/analytics?range=30',{headers:{'Cookie':cookie}});assert.equal(ar.status,200);const a=JSON.parse(ar.body);assert.ok('metrics' in a);assert.ok('daily' in a);assert.ok(Array.isArray(a.topProducts));assert.ok(Number.isFinite(a.metrics.revenue));assert.ok(Number.isFinite(a.metrics.averageOrder));});

test('admin order filters support status and search',async()=>{const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];const r=await req('/api/admin/orders?status=completed&q=ARIA-',{headers:{'Cookie':cookie}});assert.equal(r.status,200);const j=JSON.parse(r.body);assert.ok(Array.isArray(j.orders));assert.ok(j.orders.every(o=>o.status==='completed'));});

test('admin dashboard client includes POS filters and analytics',async()=>{const fs=require('node:fs');const admin=fs.readFileSync(path.join(__dirname,'..','public','admin.js'),'utf8');assert.match(admin,/orderStatusFilter/);assert.match(admin,/orderNextStatus/);assert.match(admin,/api\('\/api\/admin\/analytics\?range=30'/);assert.match(admin,/پرفروش‌ترین محصولات/);});

test('customer menu removes all and admin order filters keep all last',async()=>{const fs=require('fs');const path=require('path');const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');const admin=fs.readFileSync(path.join(__dirname,'..','public','admin.js'),'utf8');const a=app.indexOf('function renderCats()');const b=app.indexOf('\nfunction renderProducts',a);const block=app.slice(a,b);assert.ok(!app.includes('const featuredNames=['));assert.ok(!block.includes('data-cat=\"all\"'));assert.ok(admin.includes("['all','همه',orders.length]"));});

test('ready status is removed from order workflow',async()=>{const server=require('fs').readFileSync(require('path').join(__dirname,'..','server.js'),'utf8');assert.ok(!server.includes("status==='ready'"));assert.ok(server.includes("preparing:['out_for_delivery','completed','cancelled']"));assert.ok(!server.includes("'ready','out_for_delivery'"));});

test('delivery fee uses the nearest configured zone and pickup stays free',async()=>{
  const delivery=JSON.stringify({customer:{name:'Fee Test',phone:'09123456789'},fulfillment:{type:'delivery',lat:37.106,lng:58.50955,address:'آدرس تست'},items:[{productId:'prd-banana-milk',quantity:1}]});
  const dr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(delivery)},body:delivery});
  assert.equal(dr.status,201); assert.equal(JSON.parse(dr.body).order.shipping,30000);
  const pickup=JSON.stringify({customer:{name:'Fee Test',phone:'09123456789'},fulfillment:{type:'pickup'},items:[{productId:'prd-banana-milk',quantity:1}]});
  const pr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(pickup)},body:pickup});
  assert.equal(pr.status,201); assert.equal(JSON.parse(pr.body).order.shipping,0);
});

test('coupon can be created, applied server-side, and counted once',async()=>{
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD}); const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login}); const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const cb=JSON.stringify({code:'TEST20',type:'percent',amount:20,minOrder:100000,maxDiscount:50000,usageLimit:5,firstOrder:false,active:true});
  const cr=await req('/api/admin/coupons',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(cb),'Cookie':cookie},body:cb}); assert.equal(cr.status,201);
  const v=JSON.stringify({code:'TEST20',subtotal:200000,items:[{productId:'prd-banana-milk',total:200000}],phone:'09120000001'}); const vr=await req('/api/coupons/validate',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(v)},body:v}); assert.equal(vr.status,200); assert.equal(JSON.parse(vr.body).discount,40000);
  const ob=JSON.stringify({customer:{name:'Coupon Test',phone:'09120000001'},fulfillment:{type:'pickup'},couponCode:'test20',items:[{productId:'prd-banana-milk',quantity:1}]}); const or=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(ob)},body:ob}); assert.equal(or.status,201); const order=JSON.parse(or.body).order; assert.equal(order.discount,22000); assert.equal(order.coupon.code,'TEST20');
  const lr2=await req('/api/admin/coupons',{headers:{'Cookie':cookie}}); const before=JSON.parse(lr2.body).coupons.find(x=>x.code==='TEST20'); assert.equal(before.usedCount,0); const sr=await req('/api/admin/orders/'+order.id,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(JSON.stringify({status:'completed'})),'Cookie':cookie},body:JSON.stringify({status:'completed'})}); assert.equal(sr.status,409); const s1=await req('/api/admin/orders/'+order.id,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(JSON.stringify({status:'confirmed'})),'Cookie':cookie},body:JSON.stringify({status:'confirmed'})}); assert.equal(s1.status,200); const s2=await req('/api/admin/orders/'+order.id,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(JSON.stringify({status:'preparing'})),'Cookie':cookie},body:JSON.stringify({status:'preparing'})}); assert.equal(s2.status,200); const s3=await req('/api/admin/orders/'+order.id,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(JSON.stringify({status:'completed'})),'Cookie':cookie},body:JSON.stringify({status:'completed'})}); assert.equal(s3.status,200); const lr3=await req('/api/admin/coupons',{headers:{'Cookie':cookie}}); const coupon=JSON.parse(lr3.body).coupons.find(x=>x.code==='TEST20'); assert.equal(coupon.usedCount,1);
});

test('first-order coupon is tied to completed orders and capped',async()=>{
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD}); const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login}); const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const cb=JSON.stringify({code:'WELCOME15',type:'percent',amount:15,minOrder:100000,maxDiscount:70000,usageLimit:0,firstOrder:true,active:true});
  const cr=await req('/api/admin/coupons',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(cb),'Cookie':cookie},body:cb}); assert.equal(cr.status,201);
  const orderBody=JSON.stringify({customer:{name:'First Order',phone:'09129999999'},fulfillment:{type:'pickup'},couponCode:'WELCOME15',items:[{productId:'prd-banana-milk',quantity:1}]}); const or=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(orderBody)},body:orderBody}); assert.equal(or.status,201);
  const order=JSON.parse(or.body).order; assert.equal(order.coupon.code,'WELCOME15'); assert.equal(order.discount,16500);
  const s1=await req('/api/admin/orders/'+order.id,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(JSON.stringify({status:'confirmed'})),'Cookie':cookie},body:JSON.stringify({status:'confirmed'})}); assert.equal(s1.status,200); const s2=await req('/api/admin/orders/'+order.id,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(JSON.stringify({status:'preparing'})),'Cookie':cookie},body:JSON.stringify({status:'preparing'})}); assert.equal(s2.status,200); const s3=await req('/api/admin/orders/'+order.id,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(JSON.stringify({status:'completed'})),'Cookie':cookie},body:JSON.stringify({status:'completed'})}); assert.equal(s3.status,200);
  const again=await req('/api/coupons/validate',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(JSON.stringify({code:'WELCOME15',subtotal:200000,items:[{productId:'prd-banana-milk',categoryId:'cat-milkshake',quantity:1,total:200000}],phone:'09129999999'}))},body:JSON.stringify({code:'WELCOME15',subtotal:200000,items:[{productId:'prd-banana-milk',categoryId:'cat-milkshake',quantity:1,total:200000}],phone:'09129999999'})}); assert.equal(again.status,400);
});
test('customer app has functional product modal, cart close, checkout, and coupon helpers',async()=>{const fs=require('node:fs');const app=fs.readFileSync(require('node:path').join(__dirname,'..','public','app.js'),'utf8');assert.match(app,/function openProductModal\(id\)/);assert.match(app,/function closeCart\(\)/);assert.match(app,/function openCheckout\(\)/);assert.match(app,/function escapeHtml\(value\)/);assert.match(app,/couponCode/);assert.match(app,/couponCode:appliedCoupon\?\.code/);});
test('admin coupon UI exposes toman units and editable date/target fields',async()=>{const fs=require('node:fs');const admin=fs.readFileSync(require('node:path').join(__dirname,'..','public','admin.js'),'utf8');assert.match(admin,/حداقل مبلغ سفارش/);assert.match(admin,/حداکثر مبلغ تخفیف/);assert.match(admin,/تومان/);assert.match(admin,/cpStarts/);assert.match(admin,/cpExpires/);assert.match(admin,/cpProducts/);assert.match(admin,/cpCategories/);});
test('coupon server rejects percent values above 100 and invalid date ranges',async()=>{const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];const bad=JSON.stringify({code:'BADPCT',type:'percent',amount:101});const br=await req('/api/admin/coupons',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bad),'Cookie':cookie},body:bad});assert.equal(br.status,400);const dates=JSON.stringify({code:'BADDATE',type:'fixed',amount:10000,startsAt:'2026-08-20T10:00:00Z',expiresAt:'2026-08-19T10:00:00Z'});const dr=await req('/api/admin/coupons',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(dates),'Cookie':cookie},body:dates});assert.equal(dr.status,400);});

test('admin order details show coupon code, discount, and shipping', () => {
  const src = fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');
  assert.match(src, /کد تخفیف/);
  assert.match(src, /o\.coupon\?\.code/);
  assert.match(src, /o\.discount/);
  assert.match(src, /o\.shipping/);
});

test('checkout updates zone delivery fee and final total after map selection', () => {
  const src = fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  assert.match(src, /deliveryFeeNotice/);
  assert.match(src, /\/api\/delivery\/quote/);
  assert.match(src, /window\.__checkoutShippingFee/);
  assert.match(src, /پس از انتخاب موقعیت/);
  assert.match(src, /checkout-grand-total/);
  assert.match(src, /window\.__checkoutType=type\.value/);
});

test('first-order coupon metadata is preserved on created orders', async () => {
  const fs = require('node:fs');
  const serverJs = fs.readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverJs, /coupon=\{id:c\.id,code:c\.code,discount,firstOrder:Boolean\(c\.firstOrder\)\}/);
});

test('v41 notification endpoints and first-order marker are wired', async () => {
  const fs = require('node:fs');
  const adminJs = fs.readFileSync(require('node:path').join(__dirname, '..', 'public', 'admin.js'), 'utf8');
  const serverJs = fs.readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(adminJs, /\/api\/admin\/notifications/);
  assert.match(adminJs, /first-order-mark/);
  assert.match(adminJs, /new EventSource\('\/api\/admin\/events'\)/);
  assert.match(adminJs, /setTimeout\(connectLive,3000\)/);
  assert.match(serverJs, /u\.pathname==='\/api\/admin\/notifications'/);
  assert.match(serverJs, /u\.pathname==='\/api\/admin\/notifications\/read'/);
});


test('new orders receive an overdue reminder after the confirmation timeout',async()=>{
  const body=JSON.stringify({customer:{name:'Reminder Test',phone:'09123334455'},fulfillment:{type:'pickup'},items:[{productId:'prd-banana-milk',quantity:1}]});
  const r=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},body}); assert.equal(r.status,201);
  const order=JSON.parse(r.body).order;
  await new Promise(r=>setTimeout(r,220));
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD}); const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login}); const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const nr=await req('/api/admin/notifications',{headers:{'Cookie':cookie}}); assert.equal(nr.status,200); const ns=JSON.parse(nr.body).notifications;
  assert.ok(ns.some(n=>n.type==='overdue_order'&&n.order?.id===order.id));
});

test('admin reminder UI has louder overdue alert and protected live event',()=>{
  const src=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');
  assert.match(src,/playOverdueOrderAlert/); assert.match(src,/requireInteraction:true/); assert.match(src,/order\.overdue/); assert.match(src,/بیش از یک دقیقه/);
});


test('admin logout invalidates the session and clears the HttpOnly cookie',async()=>{
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});
  const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});
  assert.equal(lr.status,200);
  const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const before=await req('/api/admin/session',{headers:{Cookie:cookie}});
  assert.equal(before.status,200);
  const lo=await req('/api/admin/logout',{method:'POST',headers:{Cookie:cookie}});
  assert.equal(lo.status,200);
  assert.match(lo.headers['set-cookie'][0],/admin_session=; HttpOnly/);
  assert.match(lo.headers['set-cookie'][0],/Max-Age=0/);
  const after=await req('/api/admin/session',{headers:{Cookie:cookie}});
  assert.equal(after.status,401);
});

test('admin logout uses the server endpoint instead of document.cookie',()=>{
  const src=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');
  assert.match(src,/\/api\/admin\/logout/);
  assert.doesNotMatch(src,/document\.cookie='admin_session=/);
});


test('customer menu boot defines ordering state and wires checkout before init',async()=>{
  const fs=require('node:fs');
  const app=fs.readFileSync(require('node:path').join(__dirname,'..','public','app.js'),'utf8');
  assert.match(app,/function updateOrderingState\(\)/);
  assert.match(app,/updateOrderingState\(\);(?:renderHeroGallery\(\);)?renderCats\(\);renderProducts\(\);renderCart\(\)/);
  assert.match(app,/\$\('#checkout'\)\.onclick=/);
  assert.match(app,/const ariaStorage=/);assert.match(app,/JSON\.parse\(ariaStorage\.get\('aria_cart'\)/);
});

test('v52 keeps the premium menu clean and leaves product photos admin-controlled',()=>{
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'public','styles.css'),'utf8');
  const html=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');
  const uploadDir=path.join(ROOT,'public','uploads');
  assert.doesNotMatch(app,/featuredDecos|categoryDecos|productEdgeDecor|product-edge-art|featured-edge-deco/);
  assert.doesNotMatch(css,/product-edge-art|featured-edge-deco/);
  assert.match(app,/function productVisual\(p\)\{if\(!p\.image\)return ''/);
  assert.ok(!fs.existsSync(path.join(uploadDir,'menu-art')));
  assert.equal(fs.readdirSync(uploadDir).filter(x=>/^deco-.*\.png$/i.test(x)).length,0);
  assert.match(css,/clean premium menu; product photos remain admin-controlled/);
  assert.match(html,/Created by DevHesam0/);
  assert.doesNotMatch(html,/Created by <strong>DevHesam0<\/strong>/);
});

test('customer delivery fee is quoted privately by the server',()=>{
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  assert.doesNotMatch(app,/store\.settings\?\.deliveryZones/);
  assert.match(app,/\/api\/delivery\/quote/);
  assert.match(app,/window\.__checkoutShippingFee/);
});


test('v53 best sellers are fully controlled by the product popular flag',()=>{
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  const admin=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');
  assert.doesNotMatch(app,/featuredNames/);
  assert.match(app,/Boolean\(p\.popular\)/);
  assert.match(app,/store\.products\.filter\(p=>p\.popular===true\)/);
  assert.match(app,/پرفروش آریا/);
  assert.doesNotMatch(app,/ARIA PICK/);
  assert.match(admin,/togglePopular/);
  assert.match(admin,/پرفروش‌های آریا/);
  assert.match(admin,/name="popular"> پرفروش آریا/);
});

test('admin notification read action sends order ids and header status is wired',()=>{
  const admin=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');
  assert.match(admin,/notificationItems\.map\(x=>\(x\.order\|\|x\)\.id\)\.filter\(Boolean\)/);
  assert.match(admin,/storeStatusTop/);
  assert.match(admin,/store-open/);
  assert.match(admin,/store-closed/);
});


test('v58 uses one customer-visible delivery ETA for pickup and delivery',async()=>{
  const pickupBody=JSON.stringify({customer:{name:'Timing Pickup',phone:'09121112221'},fulfillment:{type:'pickup'},items:[{productId:'prd-banana-milk',quantity:1}]});
  const pr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(pickupBody)},body:pickupBody});
  assert.equal(pr.status,201); const pickup=JSON.parse(pr.body).order;
  assert.ok(pickup.createdAt); assert.ok(pickup.estimatedAt); assert.equal(pickup.estimateMinutes,25);
  assert.equal(Math.round((Date.parse(pickup.estimatedAt)-Date.parse(pickup.createdAt))/60000),25);
  const deliveryBody=JSON.stringify({customer:{name:'Timing Delivery',phone:'09121112222'},fulfillment:{type:'delivery',lat:37.106,lng:58.50955,address:'قوچان، آدرس تست'},items:[{productId:'prd-banana-milk',quantity:1}]});
  const dr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(deliveryBody)},body:deliveryBody});
  assert.equal(dr.status,201); const delivery=JSON.parse(dr.body).order;
  assert.equal(delivery.estimateMinutes,25);
  assert.equal(Math.round((Date.parse(delivery.estimatedAt)-Date.parse(delivery.createdAt))/60000),25);
  assert.equal(delivery.estimatedReadyAt,delivery.estimatedAt);
});

test('v58 customer tracking and admin show only the final delivery ETA',()=>{
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  const admin=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');
  assert.match(app,/زمان ثبت سفارش/);
  assert.match(app,/زمان تقریبی تحویل سفارش/);
  assert.doesNotMatch(app,/زمان تقریبی آماده‌شدن/);
  assert.match(app,/order\.estimatedAt/);
  assert.match(admin,/زمان ثبت سفارش/);
  assert.match(admin,/زمان تقریبی تحویل/);
  assert.doesNotMatch(admin,/آماده‌شدن تقریبی/);
  assert.match(admin,/o\.estimatedAt/);
});

test('v54 product image picker comfortably accepts 5MB source images',()=>{
  const admin=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');
  const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');
  assert.match(admin,/file\.size>10\*1024\*1024/);
  assert.match(admin,/حداکثر ۱۰ مگابایت/);
  assert.match(server,/PRODUCT_IMAGE_MAX_BYTES = 10 \* 1024 \* 1024/);
  assert.match(server,/file\.data\.length>PRODUCT_IMAGE_MAX_BYTES/);
});


test('v55 store settings are editable from admin and exposed to the customer app',async()=>{
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});
  const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});
  const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const before=JSON.parse((await req('/api/admin/settings',{headers:{Cookie:cookie}})).body).settings;
  const body=JSON.stringify({businessName:'آریا تست',phone:'09121110000',address:'قوچان، تست',workingHours:'۱۰ تا ۲۳',instagramUrl:'https://www.instagram.com/aria.test',menuNotice:'پیام تست',preparationMinutes:25,deliveryTravelMinutes:12,minimumOrder:50000,deliveryFee:40000,freeDeliveryOver:500000,pickupEnabled:true,deliveryEnabled:true});
  const sr=await req('/api/admin/settings',{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),Cookie:cookie},body});
  assert.equal(sr.status,200);const updated=JSON.parse(sr.body).settings;assert.equal(updated.businessName,'آریا تست');assert.equal(updated.minimumOrder,50000);assert.equal(updated.deliveryTravelMinutes,12);
  const pub=JSON.parse((await req('/api/store')).body).settings;assert.equal(pub.menuNotice,'پیام تست');assert.equal(pub.deliveryFee,undefined);assert.equal(pub.deliveryZones,undefined);
  const restore=JSON.stringify({businessName:before.businessName,phone:before.phone,address:before.address,workingHours:before.workingHours,instagramUrl:before.instagramUrl||'',menuNotice:before.menuNotice||'',preparationMinutes:before.preparationMinutes,deliveryTravelMinutes:before.deliveryTravelMinutes,minimumOrder:before.minimumOrder||0,deliveryFee:before.deliveryFee,freeDeliveryOver:before.freeDeliveryOver||0,pickupEnabled:before.pickupEnabled!==false,deliveryEnabled:before.deliveryEnabled!==false});
  const rr=await req('/api/admin/settings',{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(restore),Cookie:cookie},body:restore});assert.equal(rr.status,200);
});

test('v55 operator can set how many minutes remain until an order is ready',async()=>{
  const orderBody=JSON.stringify({customer:{name:'ETA Operator',phone:'09124445566'},fulfillment:{type:'pickup'},items:[{productId:'prd-banana-milk',quantity:1}]});
  const cr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(orderBody)},body:orderBody});assert.equal(cr.status,201);const order=JSON.parse(cr.body).order;assert.equal(order.readyInMinutes,25);
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const timing=JSON.stringify({readyInMinutes:35});const started=Date.now();const tr=await req('/api/admin/orders/'+order.id+'/timing',{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(timing),Cookie:cookie},body:timing});assert.equal(tr.status,200);const changed=JSON.parse(tr.body).order;assert.equal(changed.readyInMinutes,35);const delta=(Date.parse(changed.estimatedReadyAt)-started)/60000;assert.ok(delta>=34.9&&delta<=35.2);assert.equal(changed.estimatedAt,changed.estimatedReadyAt);
  const tracked=JSON.parse((await req('/api/orders/track?number='+encodeURIComponent(order.number)+'&phone=09124445566')).body).order;assert.equal(tracked.readyInMinutes,35);assert.equal(tracked.estimatedReadyAt,changed.estimatedReadyAt);
});

test('v58 settings UI and customer live updates are wired for one delivery ETA',()=>{
  const admin=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');const html=fs.readFileSync(path.join(ROOT,'public','admin.html'),'utf8');const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  assert.match(html,/data-tab="settings">تنظیمات فروشگاه/);assert.match(admin,/saveOrderReadyTime/);assert.match(admin,/چند دقیقه دیگر تحویل می‌شود/);assert.match(admin,/زمان تحویل پیش‌فرض/);assert.match(admin,/preparationMinutes/);assert.doesNotMatch(admin,/name="deliveryTravelMinutes"/);assert.match(admin,/minimumOrder/);assert.match(app,/settings\.updated/);assert.match(app,/estimatedAt/);assert.match(app,/pickupEnabled/);assert.match(app,/deliveryEnabled/);
});


test('v68 timing stays locked and repeated overdue reminders reuse one stored notification', async()=>{
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});
  const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});
  const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const body=JSON.stringify({customer:{name:'Lock Test',phone:'09129998877'},fulfillment:{type:'pickup'},items:[{productId:'prd-banana-milk',quantity:1}]});
  const cr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},body});
  assert.equal(cr.status,201); const order=JSON.parse(cr.body).order;
  const set1=JSON.stringify({readyInMinutes:30});
  const r1=await req(`/api/admin/orders/${order.id}/timing`,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(set1),'Cookie':cookie},body:set1});
  assert.equal(r1.status,200); const locked=JSON.parse(r1.body).order;
  assert.equal(locked.readyTimeLocked,true);
  const set2=JSON.stringify({readyInMinutes:35});
  const r2=await req(`/api/admin/orders/${order.id}/timing`,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(set2),'Cookie':cookie},body:set2});
  assert.equal(r2.status,409);

  const overdueBody=JSON.stringify({customer:{name:'Repeat Reminder',phone:'09127776655'},fulfillment:{type:'pickup'},items:[{productId:'prd-banana-milk',quantity:1}]});
  const or=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(overdueBody)},body:overdueBody});
  assert.equal(or.status,201); const overdueOrder=JSON.parse(or.body).order;
  await new Promise(r=>setTimeout(r,620));
  const nr=await req('/api/admin/notifications',{headers:{'Cookie':cookie}});
  assert.equal(nr.status,200); const ns=JSON.parse(nr.body).notifications.filter(n=>n.type==='overdue_order'&&n.order?.id===overdueOrder.id);
  assert.equal(ns.length,1);
});

test('v56 refreshed homepage branding and locked timing UI are present',()=>{
  const html=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'public','styles.css'),'utf8');
  const adminCss=fs.readFileSync(path.join(ROOT,'public','admin.css'),'utf8');
  const admin=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');
  assert.match(html,/میوه واقعی، طعم واقعی/);
  assert.match(html,/value-card/);
  assert.match(admin,/readyTimeLocked/);
  assert.match(admin,/هر یک دقیقه/);
  assert.match(css,/hero-emblem/);
  assert.match(adminCss,/order-ready-control\.locked/);
});

test('v57 about text is editable in store settings and exposed to customers',async()=>{
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});
  const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});
  const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const sr=await req('/api/admin/settings',{headers:{Cookie:cookie}}); assert.equal(sr.status,200); const current=JSON.parse(sr.body).settings;
  const updatedAbout='متن تست درباره آریا برای بررسی پنل موبایل و سایت مشتری.';
  const payload=JSON.stringify({businessName:current.businessName,phone:current.phone,address:current.address,workingHours:current.workingHours,instagramUrl:current.instagramUrl,menuNotice:current.menuNotice,aboutText:updatedAbout,preparationMinutes:current.preparationMinutes,deliveryTravelMinutes:current.deliveryTravelMinutes,minimumOrder:current.minimumOrder,deliveryFee:current.deliveryFee,freeDeliveryOver:current.freeDeliveryOver,pickupEnabled:current.pickupEnabled,deliveryEnabled:current.deliveryEnabled});
  const pr=await req('/api/admin/settings',{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),'Cookie':cookie},body:payload}); assert.equal(pr.status,200); assert.equal(JSON.parse(pr.body).settings.aboutText,updatedAbout);
  const store=await req('/api/store'); assert.equal(JSON.parse(store.body).settings.aboutText,updatedAbout);
});

test('v57 premium about section and settings editor are wired',()=>{
  const html=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  const admin=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'public','styles.css'),'utf8');
  assert.match(html,/id="aboutText"/); assert.match(html,/از ۱۳۸۵/); assert.match(html,/کیفیت، بهداشت و طعمی که ماندگار می‌شود/);
  assert.match(app,/const about=\$\('#aboutText'\)/); assert.match(admin,/textarea name="aboutText"/); assert.match(admin,/aboutText:String\(f\.get\('aboutText'\)/);
  assert.match(css,/\.about-premium/); assert.match(css,/\.about-values/);
});

test('v57 mobile audit adds hardened breakpoints for admin and customer layouts',()=>{
  const css=fs.readFileSync(path.join(ROOT,'public','styles.css'),'utf8');
  const adminCss=fs.readFileSync(path.join(ROOT,'public','admin.css'),'utf8');
  const adminHtml=fs.readFileSync(path.join(ROOT,'public','admin.html'),'utf8');
  assert.match(css,/\.footer-main\{grid-template-columns:1fr/); assert.match(css,/\.value-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/); assert.match(css,/\.customer-list-meta,\.customer-pagination\{grid-column:1\/-1/);
  assert.match(adminCss,/main>section\{padding:20px 12px 90px;min-width:0;max-width:100%\}/); assert.match(adminCss,/\.product-admin-controls\{display:grid;grid-template-columns:1fr 1fr/); assert.match(adminCss,/\.category-manager-row\{align-items:stretch;flex-direction:column\}/); assert.match(adminCss,/\.admin-modal\{inset:12px;transform:none/); assert.match(adminCss,/\.settings-about-label textarea/);
  assert.match(adminHtml,/admin\.css\?v=72\.0/); assert.match(adminHtml,/admin\.js\?v=72\.0/);
});


test('v58 mobile dashboard cannot expand the page width',()=>{
  const adminCss=fs.readFileSync(path.join(ROOT,'public','admin.css'),'utf8');
  assert.match(adminCss,/#stats\{min-width:0;width:100%;max-width:100%\}/);
  assert.match(adminCss,/main\{overflow-x:clip\}/);
  assert.match(adminCss,/\.analytics-grid>\*/);
  assert.match(adminCss,/\.table-wrap\{display:block;width:100%;overflow-x:auto/);
  assert.match(adminCss,/\.cards,\.analytics-cards\{grid-template-columns:minmax\(0,1fr\)!important\}/);
});


test('v59 mobile dashboard CSS is parsed and cannot widen the document',()=>{
  const css=fs.readFileSync(path.join(ROOT,'public','admin.css'),'utf8');
  assert.doesNotMatch(css,/\\n@media/);
  assert.match(css,/#stats \.analytics-grid\{display:grid!important;grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css,/#stats \.table-wrap\{display:block;width:100%;max-width:100%;min-width:0;overflow-x:auto!important/);
  assert.match(css,/html,body\{overflow-x:clip\}/);
});

test('v59 customer hero uses heritage design and admin product images when available',()=>{
  const html=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'public','styles.css'),'utf8');
  assert.match(html,/hero-heritage/);
  assert.match(html,/id="heroGallery"/);
  assert.match(html,/از ۱۳۸۵/);
  assert.doesNotMatch(html,/class="orb orb-a"/);
  assert.doesNotMatch(html,/hero-mark/);
  assert.match(app,/function renderHeroGallery\(\)/);
  assert.match(app,/store\.products\.filter\(p=>p\.available!==false&&p\.image\)/);
  assert.match(css,/Aria Heritage hero/);
});


test('v60 site photography is configurable from admin settings',async()=>{
  const store=JSON.parse((await req('/api/store')).body);
  assert.ok(store.settings.sitePhotos);
  for(const slot of ['heroMain','heroSecond','heroThird','aboutVenue']) assert.equal(typeof store.settings.sitePhotos[slot],'string');
  const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');
  const admin=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');
  assert.match(server,/SITE_PHOTO_SLOTS/);
  assert.match(server,/site-photos/);
  assert.match(admin,/renderSitePhotoSettings/);
  assert.match(admin,/openSitePhotoCropper/);
  assert.match(admin,/removeSitePhoto/);
  assert.match(admin,/تصاویر سایت/);
});

test('v60 customer hero and about section use store-controlled photography',()=>{
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'public','styles.css'),'utf8');
  assert.match(app,/store\.settings\?\.sitePhotos/);
  assert.match(app,/configured\.heroMain/);
  assert.match(app,/configured\.heroSecond/);
  assert.match(app,/configured\.heroThird/);
  assert.match(app,/sitePhotos\?\.aboutVenue/);
  assert.match(html,/id="aboutVenueImage"/);
  assert.match(css,/\.about-venue/);
  for(const name of ['site-heroMain-default.webp','site-heroSecond-default.webp','site-heroThird-default.webp','site-aboutVenue-default.webp']){
    const f=path.join(ROOT,'public','uploads',name);assert.ok(fs.existsSync(f));assert.ok(fs.statSync(f).size>10000);
  }
});

test('v61 store settings support multiple contact numbers with legacy first-phone compatibility',async()=>{
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const before=JSON.parse((await req('/api/admin/settings',{headers:{Cookie:cookie}})).body).settings;
  const phones=['09121111111','05142222222','09123333333'];
  const body=JSON.stringify({phones});const r=await req('/api/admin/settings',{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'Cookie':cookie},body});assert.equal(r.status,200);const settings=JSON.parse(r.body).settings;assert.deepEqual(settings.phones,phones);assert.equal(settings.phone,phones[0]);
  const store=JSON.parse((await req('/api/store')).body);assert.deepEqual(store.settings.phones,phones);
  const restore=JSON.stringify({phones:Array.isArray(before.phones)?before.phones:(before.phone?[before.phone]:[])});await req('/api/admin/settings',{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(restore),'Cookie':cookie},body:restore});
});

test('v63 site photos use the same real crop editor workflow as menu photos',()=>{
  const admin=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');
  const adminCss=fs.readFileSync(path.join(ROOT,'public','admin.css'),'utf8');
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'public','styles.css'),'utf8');
  assert.match(admin,/openSitePhotoCropper/);
  assert.match(admin,/setupSitePhotoCropper/);
  assert.match(admin,/siteCropZoom/);
  assert.match(admin,/siteZoomOut/);
  assert.match(admin,/siteZoomIn/);
  assert.match(admin,/siteCropReset/);
  assert.match(admin,/OUT_W=1600,OUT_H=1200/);
  assert.match(admin,/تأیید برش و جایگزینی/);
  assert.match(adminCss,/site-crop-toolbar/);
  assert.match(adminCss,/site-photo-preview\{aspect-ratio:4\/3!important/);
  assert.match(app,/hero-gallery-side/);
  assert.match(css,/hero-gallery-side/);
  assert.match(css,/about-venue[^}]*aspect-ratio:4\/3!important/);
  assert.match(admin,/getAll\('phones'\)/);assert.match(app,/footerPhones/);
});


test('v64 health reports SQLite with integrity ok',async()=>{
  const r=await req('/api/health'); assert.equal(r.status,200); const j=JSON.parse(r.body);
  assert.equal(j.storage.engine,'sqlite'); assert.equal(j.storage.integrity,'ok'); assert.match(j.storage.journalMode,/wal/i);
  assert.ok(fs.existsSync(sqliteTestPath));
});

test('v64 order numbers stay unique and SQLite enforces a unique index',async()=>{
  const numbers=new Set();
  for(let i=0;i<30;i++){
    const phone='0912'+String(7000000+i).padStart(7,'0');
    const body=JSON.stringify({customer:{name:'Unique '+i,phone},fulfillment:{type:'pickup'},items:[{productId:'prd-banana-milk',quantity:1}]});
    const r=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'X-Forwarded-For':'198.51.100.11'},body});
    assert.equal(r.status,201); const n=JSON.parse(r.body).order.number; assert.match(n,/^ARIA-\d{6}$/); assert.ok(!numbers.has(n)); numbers.add(n);
  }
  const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(sqliteTestPath,{readOnly:true});
  try{const rows=db.prepare('SELECT number, COUNT(*) n FROM orders GROUP BY number HAVING n>1').all();assert.equal(rows.length,0);}finally{db.close()}
});

test('v64 coupon usage limit is reserved by pending orders',async()=>{
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const code='RESERVE'+Date.now();const create=JSON.stringify({code,type:'fixed',amount:1000,usageLimit:1,active:true});
  const cr=await req('/api/admin/coupons',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(create),'Cookie':cookie},body:create});assert.equal(cr.status,201);
  const one=JSON.stringify({customer:{name:'Reserve One',phone:'09123330001'},fulfillment:{type:'pickup'},couponCode:code,items:[{productId:'prd-banana-milk',quantity:1}]});
  const r1=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(one),'X-Forwarded-For':'198.51.100.21'},body:one});assert.equal(r1.status,201);
  const two=JSON.stringify({customer:{name:'Reserve Two',phone:'09123330002'},fulfillment:{type:'pickup'},couponCode:code,items:[{productId:'prd-banana-milk',quantity:1}]});
  const r2=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(two),'X-Forwarded-For':'198.51.100.22'},body:two});assert.equal(r2.status,400);assert.match(r2.body,/ظرفیت استفاده/);
});

test('v64 first-order coupon cannot be reserved twice by the same phone',async()=>{
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const code='FIRSTRES'+Date.now();const create=JSON.stringify({code,type:'percent',amount:10,usageLimit:20,firstOrder:true,active:true});
  const cr=await req('/api/admin/coupons',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(create),'Cookie':cookie},body:create});assert.equal(cr.status,201);
  const phone='09124445566';const body=JSON.stringify({customer:{name:'First Reserve',phone},fulfillment:{type:'pickup'},couponCode:code,items:[{productId:'prd-banana-milk',quantity:1}]});
  const r1=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'X-Forwarded-For':'198.51.100.31'},body});assert.equal(r1.status,201);
  const r2=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'X-Forwarded-For':'198.51.100.32'},body});assert.equal(r2.status,400);assert.match(r2.body,/فقط برای اولین سفارش/);
});

test('v64 admin login blocks repeated failed attempts',async()=>{
  const headers={'Content-Type':'application/json','X-Forwarded-For':'203.0.113.99'};
  for(let i=0;i<5;i++){const body=JSON.stringify({username:'admin',password:'wrong-password-'+i});headers['Content-Length']=Buffer.byteLength(body);const r=await req('/api/admin/login',{method:'POST',headers,body});assert.equal(r.status,401);}
  const body=JSON.stringify({username:'admin',password:'still-wrong'});headers['Content-Length']=Buffer.byteLength(body);const blocked=await req('/api/admin/login',{method:'POST',headers,body});assert.equal(blocked.status,429);assert.ok(Number(blocked.headers['retry-after'])>0);
});

test('v64 has no built-in admin password and ships backup tooling',()=>{
  const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
  assert.doesNotMatch(server,/admin123/);assert.match(server,/ADMIN_PASSWORD\.length < 12/);assert.equal(pkg.scripts.backup,'node scripts/backup.js');assert.ok(fs.existsSync(path.join(ROOT,'scripts','backup.js')));assert.ok(fs.existsSync(path.join(ROOT,'.env.example')));
});


test('v65 delivery orders require a map pin inside the configured radius',async()=>{
  const noPin=JSON.stringify({customer:{name:'Map Test',phone:'09124445551'},fulfillment:{type:'delivery',address:'قوچان، تست'},items:[{productId:'prd-banana-milk',quantity:1}]});
  const a=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(noPin)},body:noPin});assert.equal(a.status,400);assert.match(a.body,/نقشه/);
  const far=JSON.stringify({customer:{name:'Map Test',phone:'09124445552'},fulfillment:{type:'delivery',address:'خارج محدوده',lat:37.30,lng:58.80},items:[{productId:'prd-banana-milk',quantity:1}]});
  const b=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(far)},body:far});assert.equal(b.status,400);assert.match(b.body,/محدوده ارسال آریا نیست/);
  const good=JSON.stringify({customer:{name:'Map Test',phone:'09124445553'},fulfillment:{type:'delivery',address:'قوچان، داخل محدوده',lat:37.106,lng:58.50955},items:[{productId:'prd-banana-milk',quantity:1}]});
  const c=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(good)},body:good});assert.equal(c.status,201);const order=JSON.parse(c.body).order;assert.ok(order.fulfillment.location);assert.equal(order.fulfillment.location.distanceKm,undefined);assert.equal(order.fulfillment.location.zoneMaxKm,undefined);assert.equal(order.deliveryZone,undefined);
});

test('v65 schedule, map settings, recent-order UX and SEO are wired',()=>{
  const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');const admin=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');const html=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');
  assert.match(server,/scheduleStart='08:00'/);assert.match(server,/scheduleEnd='24:00'/);assert.match(server,/deliveryRadiusKm/);assert.match(server,/haversineKm/);
  assert.match(app,/checkoutMap/);assert.match(app,/aria_last_order/);assert.match(app,/trackLastOrder/);assert.match(app,/updateSeoMeta/);
  assert.match(admin,/settingsDeliveryMap/);assert.match(admin,/deliveryZonesList/);assert.match(html,/CafeOrCoffeeShop/);assert.match(html,/aria-map/);assert.doesNotMatch(html,/unpkg\.com/);
});

test('v65 automatic hours close ordering and manual reopen overrides for today',async()=>{
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const settings=JSON.stringify({scheduleEnabled:true,scheduleStart:'00:00',scheduleEnd:'00:01'});const sr=await req('/api/admin/settings',{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(settings),'Cookie':cookie},body:settings});assert.equal(sr.status,200);
  const order=JSON.stringify({customer:{name:'Hours Test',phone:'09125556661'},fulfillment:{type:'pickup'},items:[{productId:'prd-banana-milk',quantity:1}]});const closed=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(order)},body:order});assert.equal(closed.status,409);
  const rr=await req('/api/admin/day/reopen',{method:'POST',headers:{Cookie:cookie}});assert.equal(rr.status,200);assert.equal(JSON.parse(rr.body).ordering.open,true);
  const opened=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(order)},body:order});assert.equal(opened.status,201);
  const restore=JSON.stringify({scheduleEnabled:true,scheduleStart:'08:00',scheduleEnd:'24:00'});await req('/api/admin/settings',{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(restore),'Cookie':cookie},body:restore});
});


test('v66 delivery zones calculate different courier fees server-side',async()=>{
  const login=JSON.stringify({username:'admin',password:TEST_ADMIN_PASSWORD});const lr=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(login)},body:login});const cookie=lr.headers['set-cookie'][0].split(';')[0];
  const settings=JSON.stringify({deliveryCenterLat:37.106,deliveryCenterLng:58.50955,deliveryZones:[{maxKm:3,fee:30000},{maxKm:6,fee:35000}],deliveryEnabled:true,scheduleEnabled:false});
  const sr=await req('/api/admin/settings',{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(settings),'Cookie':cookie},body:settings});assert.equal(sr.status,200);
  const near=JSON.stringify({customer:{name:'Zone Near',phone:'09121112231'},fulfillment:{type:'delivery',address:'نزدیک',lat:37.115,lng:58.50955},items:[{productId:'prd-banana-milk',quantity:1}]});
  const nr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(near)},body:near});assert.equal(nr.status,201);assert.equal(JSON.parse(nr.body).order.shipping,30000);
  const far=JSON.stringify({customer:{name:'Zone Far',phone:'09121112232'},fulfillment:{type:'delivery',address:'دورتر',lat:37.145,lng:58.50955},items:[{productId:'prd-banana-milk',quantity:1}]});
  const fr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(far)},body:far});assert.equal(fr.status,201);assert.equal(JSON.parse(fr.body).order.shipping,35000);
});

test('v66 customer location UX guards insecure LAN and inaccurate far-away positions',()=>{
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  assert.match(app,/window\.isSecureContext/);assert.match(app,/HTTP شبکه محلی/);assert.match(app,/watchPosition/);assert.match(app,/maximumAge:0/);assert.match(app,/distance>50/);assert.match(app,/api\('\/api\/delivery\/quote'/);
});

test('v66 admin can edit multiple distance delivery zones and Instagram is Aria official page',()=>{
  const admin=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');const html=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');
  assert.match(admin,/addDeliveryZone/);assert.match(admin,/deliveryZonesList/);assert.match(admin,/data-zone-km/);assert.match(server,/normalizeDeliveryZones/);assert.match(server,/deliveryQuoteByDistance/);assert.match(server,/arya_coffe_shop/);assert.match(html,/arya_coffe_shop/);
});


test('v67 customer sees only final courier fee, not delivery tariff boundaries',async()=>{
  const storeRes=await req('/api/store');assert.equal(storeRes.status,200);const store=JSON.parse(storeRes.body);
  assert.equal(store.settings.deliveryZones,undefined);assert.equal(store.settings.deliveryRadiusKm,undefined);assert.equal(store.settings.deliveryFee,undefined);
  const quoteBody=JSON.stringify({lat:37.115,lng:58.50955});
  const qr=await req('/api/delivery/quote',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(quoteBody)},body:quoteBody});
  assert.equal(qr.status,200);const q=JSON.parse(qr.body);assert.equal(q.inside,true);assert.ok(Number.isFinite(q.fee));assert.equal(q.maxKm,undefined);assert.equal(q.distanceKm,undefined);
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  assert.doesNotMatch(app,/تعرفه پیک بر اساس فاصله محاسبه می‌شود/);assert.doesNotMatch(app,/تا \${z\.maxKm/);assert.doesNotMatch(app,/zoneCircles/);
  assert.match(app,/هزینه پیک: <b>/);
});

test('v67 official Instagram handle is arya_coffe_shop everywhere by default',()=>{
  const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');const html=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');
  assert.match(server,/arya_coffe_shop/);assert.match(html,/arya_coffe_shop/);assert.doesNotMatch(html,/arya_coffee_shop/);
});


test('v68 public order responses never expose delivery tariff boundaries',async()=>{
  const body=JSON.stringify({customer:{name:'Privacy Zone',phone:'09123337771'},fulfillment:{type:'delivery',address:'قوچان، تست',lat:37.115,lng:58.50955},items:[{productId:'prd-banana-milk',quantity:1}]});
  const cr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},body});
  assert.equal(cr.status,201);const created=JSON.parse(cr.body).order;
  assert.equal(created.deliveryZone,undefined);assert.equal(created.fulfillment.location.zoneMaxKm,undefined);assert.equal(created.fulfillment.location.zoneFee,undefined);assert.equal(created.fulfillment.location.distanceKm,undefined);
  const tr=await req('/api/orders/track?number='+encodeURIComponent(created.number)+'&phone='+encodeURIComponent(created.customer.phone));assert.equal(tr.status,200);const tracked=JSON.parse(tr.body).order;
  assert.equal(tracked.deliveryZone,undefined);assert.equal(tracked.fulfillment.location.zoneMaxKm,undefined);assert.equal(tracked.fulfillment.location.zoneFee,undefined);assert.equal(tracked.fulfillment.location.distanceKm,undefined);
  const farBody=JSON.stringify({customer:{name:'Privacy Far',phone:'09123337772'},fulfillment:{type:'delivery',address:'خارج محدوده',lat:37.30,lng:58.80},items:[{productId:'prd-banana-milk',quantity:1}]});
  const fr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(farBody)},body:farBody});assert.equal(fr.status,400);assert.match(fr.body,/در محدوده ارسال آریا نیست/);assert.doesNotMatch(fr.body,/کیلومتر/);
});

test('v68 accepts Persian and Arabic mobile digits on create and tracking',async()=>{
  const body=JSON.stringify({customer:{name:'آیفون تست',phone:'۰۹۱۲۳۴۵۶۷۸۹'},fulfillment:{type:'pickup'},items:[{productId:'prd-banana-milk',quantity:1}]});
  const cr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},body});assert.equal(cr.status,201);const order=JSON.parse(cr.body).order;assert.equal(order.customer.phone,'09123456789');
  const persianNumber=order.number.replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)]);const tr=await req('/api/orders/track?number='+encodeURIComponent(persianNumber)+'&phone='+encodeURIComponent('٠٩١٢٣٤٥٦٧٨٩'));assert.equal(tr.status,200);assert.equal(JSON.parse(tr.body).order.number,order.number);
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');const html=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');assert.match(app,/normalizeIranPhone/);assert.match(app,/bindPhoneField/);assert.match(app,/\[۰-۹\]/);assert.match(app,/\[٠-٩\]/);assert.match(html,/<input name="phone" inputmode="tel"[^>]*maxlength="16"[^>]*dir="ltr"/);assert.match(app,/<input name="phone" inputmode="tel"[^>]*maxlength="16"[^>]*dir="ltr"/);
});

test('v68 order input limits reject malformed oversized customer data',async()=>{
  const badName=JSON.stringify({customer:{name:'x'.repeat(81),phone:'09125557777'},fulfillment:{type:'pickup'},items:[{productId:'prd-banana-milk',quantity:1}]});const nr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(badName)},body:badName});assert.equal(nr.status,400);
  const badQty=JSON.stringify({customer:{name:'Quantity Test',phone:'09125557778'},fulfillment:{type:'pickup'},items:[{productId:'prd-banana-milk',quantity:21}]});const qr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(badQty)},body:badQty});assert.equal(qr.status,400);assert.match(qr.body,/۱ تا ۲۰/);
  const badNotes=JSON.stringify({customer:{name:'Notes Test',phone:'09125557779'},fulfillment:{type:'pickup',notes:'x'.repeat(501)},items:[{productId:'prd-banana-milk',quantity:1}]});const rr=await req('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(badNotes)},body:badNotes});assert.equal(rr.status,400);assert.match(rr.body,/۵۰۰/);
});

test('v68 maps are local runtime assets and no external Leaflet CDN remains',()=>{
  const html=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');const adminHtml=fs.readFileSync(path.join(ROOT,'public','admin.html'),'utf8');
  assert.match(html,/\/vendor\/aria-map\/aria-map\.js/);assert.match(html,/\/vendor\/aria-map\/aria-map\.css/);assert.match(adminHtml,/\/vendor\/aria-map\/aria-map\.js/);assert.doesNotMatch(html,/unpkg\.com|cdn\.jsdelivr\.net/);assert.doesNotMatch(adminHtml,/unpkg\.com|cdn\.jsdelivr\.net/);assert.ok(fs.existsSync(path.join(ROOT,'public','vendor','aria-map','aria-map.js')));assert.ok(fs.existsSync(path.join(ROOT,'public','vendor','aria-map','aria-map.css')));
});

test('v68 SEO serves canonical, robots, sitemap and correct SVG mime',async()=>{
  const home=await req('/');assert.equal(home.status,200);assert.match(home.body,/rel="canonical" href="http:\/\/127\.0\.0\.1:31337\/"/);assert.match(home.body,/property="og:url" content="http:\/\/127\.0\.0\.1:31337\/"/);assert.match(home.body,/property="og:image" content="http:\/\/127\.0\.0\.1:31337\/uploads\//);
  const robots=await req('/robots.txt');assert.equal(robots.status,200);assert.match(robots.body,/Sitemap: http:\/\/127\.0\.0\.1:31337\/sitemap\.xml/);assert.match(robots.body,/Disallow: \/admin/);
  const sm=await req('/sitemap.xml');assert.equal(sm.status,200);assert.match(sm.headers['content-type'],/application\/xml/);assert.match(sm.body,/<loc>http:\/\/127\.0\.0\.1:31337\/<\/loc>/);
  const fav=await req('/favicon.svg');assert.equal(fav.status,200);assert.match(fav.headers['content-type'],/image\/svg\+xml/);
  const adminHtml=fs.readFileSync(path.join(ROOT,'public','admin.html'),'utf8');assert.match(adminHtml,/noindex,nofollow/);
});

test('v68 production metadata requires Node 22.13+ and supports final base URL config',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));const env=fs.readFileSync(path.join(ROOT,'.env.example'),'utf8');const prod=fs.readFileSync(path.join(ROOT,'PRODUCTION.md'),'utf8');const bat=fs.readFileSync(path.join(ROOT,'start-lan.bat'),'utf8');
  assert.equal(pkg.engines.node,'>=22.13.0');assert.equal(pkg.version,'0.72.0');assert.match(env,/PUBLIC_BASE_URL=/);assert.match(prod,/22\.13\+/);assert.match(bat,/NODE_MINOR% LSS 13/);assert.doesNotMatch(bat,/experimental-sqlite/);
});

test('v68 checkout includes privacy note and no sample phone is hardcoded in customer HTML',async()=>{
  const html=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');assert.doesNotMatch(html,/09120000000/);assert.match(app,/اطلاعات تماس، آدرس و موقعیت انتخابی فقط برای ثبت و تحویل همین سفارش استفاده می‌شود/);
  const st=JSON.parse((await req('/api/store')).body).settings;assert.ok(!(st.phones||[]).includes('09120000000'));
});


test('v69 iPhone customer page is self-contained and bootstrapped',async()=>{
  const home=await req('/');assert.equal(home.status,200);
  assert.match(home.headers['cache-control'],/no-store/);
  assert.match(home.body,/id="ariaInlineStyles"/);
  assert.match(home.body,/id="ariaBootstrap" type="application\/json">\{/);
  assert.match(home.body,/window\.__ARIA_APP_READY/);
  assert.match(home.body,/width="21" height="21" viewBox="0 0 24 24"/);
  assert.match(home.body,/site-heroMain-default\.webp/);
  assert.doesNotMatch(home.body,/\{\{INLINE_(?:MAP_CSS|SITE_CSS|MAP_JS|APP_JS)\}\}/);
  assert.doesNotMatch(home.body,/\{\{BOOTSTRAP_STORE\}\}/);
});

test('v69 customer boot has retry fallback instead of leaving a blank menu',()=>{
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');
  assert.match(app,/loadInitialStore/);assert.match(app,/for\(let i=0;i<3;i\+\+\)/);assert.match(app,/setMenuLoadState/);
  assert.match(html,/id="menuLoadState"/);assert.match(html,/تلاش دوباره/);
});


test('v69.1 iPhone Safari survives blocked localStorage and non-critical SSE failure',()=>{
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  assert.match(app,/const ariaStorage=/);
  assert.match(app,/get\(key\)\{try\{return window\.localStorage/);
  assert.match(app,/set\(key,value\)\{try\{if\(window\.localStorage\)/);
  assert.doesNotMatch(app,/function saveCart\(\)\{localStorage\.setItem/);
  assert.match(app,/if\(typeof window\.EventSource!==['"]function['"]\)return/);
  assert.match(app,/try\{es=new EventSource\('\/api\/events'\)\}catch\{return\}/);
});


test('v69.2 inline injection preserves double-dollar selector and restores Vazirmatn loading',async()=>{
  const home=await req('/');assert.equal(home.status,200);
  assert.match(home.body,/const \$=s=>document\.querySelector\(s\); const \$\$=s=>/);
  assert.doesNotMatch(home.body,/const \$=s=>document\.querySelector\(s\); const \$=s=>/);
  assert.match(home.body,/fonts\.googleapis\.com\/css2\?family=Vazirmatn/);
  const css=fs.readFileSync(path.join(ROOT,'public','styles.css'),'utf8');assert.doesNotMatch(css,/^@import/m);
  const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');assert.match(server,/const literal=\(input,token,value\)=>input\.replace\(token,\(\)=>String\(value\)\)/);
});


test('v70 final QA hardens iPhone form typography and dynamic mobile viewport',()=>{
  const css=fs.readFileSync(path.join(ROOT,'public','styles.css'),'utf8');
  const adminCss=fs.readFileSync(path.join(ROOT,'public','admin.css'),'utf8');
  const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
  assert.equal(pkg.version,'0.72.0');
  assert.match(css,/button,input,textarea,select\{font:inherit\}/);
  assert.match(css,/-webkit-text-size-adjust:100%/);
  assert.match(css,/max-height:90dvh/);
  assert.match(css,/@media\(max-width:760px\)\{input,textarea,select\{font-size:16px\}\}/);
  assert.match(css,/scrollbar-width:none/);
  assert.match(adminCss,/button,input,textarea,select\{font:inherit\}/);
  assert.match(adminCss,/font-size:16px/);
});


test('v72 maps support wheel, pinch and double-click zoom on customer and admin',()=>{
  const map=fs.readFileSync(path.join(ROOT,'public','vendor','aria-map','aria-map.js'),'utf8');
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  const admin=fs.readFileSync(path.join(ROOT,'public','admin.js'),'utf8');
  assert.match(map,/pointerId/);assert.match(map,/pinch/);assert.match(map,/wheel/);assert.match(map,/dblclick/);
  assert.match(app,/scrollWheelZoom:true,touchZoom:true,doubleClickZoom:true/);
  assert.match(admin,/scrollWheelZoom:true,touchZoom:true,doubleClickZoom:true/);
});

test('v72 admin font import is valid and admin assets are cache-busted',()=>{
  const css=fs.readFileSync(path.join(ROOT,'public','admin.css'),'utf8');
  const html=fs.readFileSync(path.join(ROOT,'public','admin.html'),'utf8');
  assert.match(css,/Vazirmatn:wght@400;600;700;800&display=swap/);
  assert.doesNotMatch(css,/wght@400;html/);
  assert.match(html,/admin\.css\?v=72\.0/);assert.match(html,/aria-map\.js\?v=72\.0/);
});


test('v72 map gesture implementation actually changes zoom for wheel and pinch',()=>{
  const vm=require('node:vm');
  class FakeEl{
    constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.dataset={};this.listeners={};this.attributes={};this.classList={add:()=>{}};this.parent=null;this.textContent='';this.innerHTML='';}
    append(...xs){for(const x of xs){x.parent=this;this.children.push(x)}}
    appendChild(x){this.append(x);return x}
    addEventListener(t,fn){(this.listeners[t]||(this.listeners[t]=[])).push(fn)}
    setAttribute(k,v){this.attributes[k]=String(v)}
    getBoundingClientRect(){return {left:0,top:0,width:400,height:300}}
    setPointerCapture(){}
    querySelector(sel){const m=sel.match(/^\[data-key="(.+)"\]$/);if(m)return this.children.find(x=>x.dataset?.key===m[1])||null;return null}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
    emit(t,e={}){e.target=e.target||{closest:()=>null};e.preventDefault=e.preventDefault||(()=>{});for(const fn of this.listeners[t]||[])fn(e)}
  }
  const document={createElement:t=>new FakeEl(t),createElementNS:(ns,t)=>new FakeEl(t)};
  const context={window:{},document,console,Math,Set,Map};vm.createContext(context);
  const src=fs.readFileSync(path.join(ROOT,'public','vendor','aria-map','aria-map.js'),'utf8');vm.runInContext(src,context);
  const el=new FakeEl('map'),map=context.window.L.map(el,{scrollWheelZoom:true,touchZoom:true,doubleClickZoom:true}).setView([37.106,58.50955],13);
  el.emit('wheel',{deltaY:-120,clientX:200,clientY:150,target:{closest:()=>null},preventDefault(){}});assert.equal(map.zoom,14);
  const pe=(t,id,x,y)=>el.emit(t,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,target:{closest:()=>null},preventDefault(){}});
  pe('pointerdown',1,150,150);pe('pointerdown',2,250,150);pe('pointermove',2,330,150);assert.equal(map.zoom,15);pe('pointerup',2,330,150);pe('pointerup',1,150,150);
  el.emit('dblclick',{clientX:200,clientY:150,target:{closest:()=>null},preventDefault(){}});assert.equal(map.zoom,16);
});

test('v72 static file boundary check blocks encoded traversal',async()=>{
  const r=await req('/%2e%2e%2fpackage.json');assert.equal(r.status,403);
  const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');assert.match(server,/file !== PUBLIC && !file\.startsWith\(PUBLIC \+ path\.sep\)/);
});
