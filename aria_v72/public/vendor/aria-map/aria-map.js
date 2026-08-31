(function(global){
  'use strict';
  const TILE=256,MAX_LAT=85.05112878;
  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
  function latLng(v){return Array.isArray(v)?{lat:Number(v[0]),lng:Number(v[1])}:{lat:Number(v.lat),lng:Number(v.lng)}}
  function project(ll,z){const p=latLng(ll),size=TILE*Math.pow(2,z),lat=clamp(p.lat,-MAX_LAT,MAX_LAT)*Math.PI/180;return{x:(p.lng+180)/360*size,y:(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*size}}
  function unproject(p,z){const size=TILE*Math.pow(2,z),lng=p.x/size*360-180,n=Math.PI-2*Math.PI*p.y/size,lat=180/Math.PI*Math.atan(.5*(Math.exp(n)-Math.exp(-n)));return{lat,lng}}
  class MapLite{
    constructor(target,opt={}){this.el=typeof target==='string'?document.getElementById(target):target;if(!this.el)throw new Error('Map target not found');this.opt=opt;this.zoom=13;this.center={lat:0,lng:0};this.handlers={};this.markers=[];this.circles=[];this.tileUrl='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';this.el.classList.add('aria-map');this.tiles=document.createElement('div');this.tiles.className='aria-map-tiles';this.svg=document.createElementNS('http://www.w3.org/2000/svg','svg');this.svg.setAttribute('class','aria-map-overlay');this.markerPane=document.createElement('div');this.markerPane.className='aria-map-markers';this.el.append(this.tiles,this.svg,this.markerPane);this._controls();this._bind();if(global.ResizeObserver){this.ro=new ResizeObserver(()=>this.render());this.ro.observe(this.el)}}
    _controls(){const c=document.createElement('div');c.className='aria-map-controls';const zin=document.createElement('button'),zout=document.createElement('button');zin.type=zout.type='button';zin.textContent='+';zout.textContent='−';zin.setAttribute('aria-label','بزرگ‌نمایی نقشه');zout.setAttribute('aria-label','کوچک‌نمایی نقشه');zin.onclick=e=>{e.stopPropagation();this.setView(this.center,this.zoom+1)};zout.onclick=e=>{e.stopPropagation();this.setView(this.center,this.zoom-1)};c.append(zin,zout);this.el.append(c);const a=document.createElement('div');a.className='aria-map-attribution';a.innerHTML='© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';this.el.append(a)}
    _bind(){
      let drag=null,moved=false,pinch=null,wheelAccum=0;
      const pointers=new Map();
      const pt=e=>{const r=this.el.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
      const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
      const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
      const blocked=e=>Boolean(e.target.closest('.aria-map-marker,.aria-map-controls,.aria-map-attribution'));
      const zoomAt=(x,y,step)=>{
        const next=clamp(this.zoom+step,2,19);if(next===this.zoom)return;
        const anchor=this._screenToLatLng(x,y),r=this.el.getBoundingClientRect(),ap=project(anchor,next);
        this.zoom=next;this.center=unproject({x:ap.x-(x-r.width/2),y:ap.y-(y-r.height/2)},next);this.render();
      };
      const startPinch=()=>{
        if(this.opt.touchZoom===false||pointers.size<2)return false;
        const a=[...pointers.values()][0],b=[...pointers.values()][1];
        pinch={distance:Math.max(1,dist(a,b)),mid:mid(a,b)};drag=null;moved=true;return true;
      };
      this.el.addEventListener('pointerdown',e=>{
        if(blocked(e))return;
        const p=pt(e);pointers.set(e.pointerId,p);this.el.setPointerCapture?.(e.pointerId);
        if(pointers.size>=2){startPinch();return}
        drag={id:e.pointerId,p,center:project(this.center,this.zoom)};moved=false;pinch=null;
      });
      this.el.addEventListener('pointermove',e=>{
        if(!pointers.has(e.pointerId))return;
        pointers.set(e.pointerId,pt(e));
        if(pointers.size>=2&&this.opt.touchZoom!==false){
          if(!pinch)startPinch();
          const a=[...pointers.values()][0],b=[...pointers.values()][1],d=Math.max(1,dist(a,b)),m=mid(a,b),ratio=d/(pinch?.distance||d);
          if(ratio>=1.16){zoomAt(m.x,m.y,1);pinch={distance:d,mid:m}}
          else if(ratio<=.86){zoomAt(m.x,m.y,-1);pinch={distance:d,mid:m}}
          else if(pinch)pinch.mid=m;
          moved=true;return;
        }
        if(!drag||drag.id!==e.pointerId)return;
        const p=pointers.get(e.pointerId),dx=p.x-drag.p.x,dy=p.y-drag.p.y;
        if(Math.abs(dx)+Math.abs(dy)>5)moved=true;
        this.center=unproject({x:drag.center.x-dx,y:drag.center.y-dy},this.zoom);this.render();
      });
      const finishPointer=e=>{
        if(!pointers.has(e.pointerId))return;
        const p=pointers.get(e.pointerId),wasPinching=Boolean(pinch)||pointers.size>1;
        if(drag&&drag.id===e.pointerId&&!moved&&!wasPinching){
          const cp=project(this.center,this.zoom),r=this.el.getBoundingClientRect(),ll=unproject({x:cp.x+(p.x-r.width/2),y:cp.y+(p.y-r.height/2)},this.zoom);
          this._emit('click',{latlng:ll,originalEvent:e});
        }
        pointers.delete(e.pointerId);
        if(pointers.size===1&&wasPinching){const [id,q]=[...pointers.entries()][0];drag={id,p:q,center:project(this.center,this.zoom)};moved=true;pinch=null}
        else if(!pointers.size){drag=null;pinch=null;moved=false}
      };
      this.el.addEventListener('pointerup',finishPointer);this.el.addEventListener('pointercancel',finishPointer);
      if(this.opt.scrollWheelZoom!==false)this.el.addEventListener('wheel',e=>{
        if(blocked(e))return;e.preventDefault();wheelAccum+=e.deltaY;
        if(Math.abs(wheelAccum)<40)return;const p=pt(e),step=wheelAccum<0?1:-1;wheelAccum=0;zoomAt(p.x,p.y,step);
      },{passive:false});
      if(this.opt.doubleClickZoom!==false)this.el.addEventListener('dblclick',e=>{if(blocked(e))return;e.preventDefault();const p=pt(e);zoomAt(p.x,p.y,1)});
    }
    on(type,fn){(this.handlers[type]||(this.handlers[type]=[])).push(fn);return this}
    off(type,fn){if(!type){this.handlers={};return this}if(!fn){this.handlers[type]=[];return this}this.handlers[type]=(this.handlers[type]||[]).filter(x=>x!==fn);return this}
    _emit(type,p){for(const fn of this.handlers[type]||[])try{fn(p)}catch(e){console.error(e)}}
    setView(ll,z){this.center=latLng(ll);if(Number.isFinite(Number(z)))this.zoom=clamp(Math.round(Number(z)),2,19);this.render();return this}
    invalidateSize(){this.render();return this}
    _worldToScreen(ll){const c=project(this.center,this.zoom),p=project(ll,this.zoom),r=this.el.getBoundingClientRect();return{x:r.width/2+(p.x-c.x),y:r.height/2+(p.y-c.y)}}
    _screenToLatLng(x,y){const c=project(this.center,this.zoom),r=this.el.getBoundingClientRect();return unproject({x:c.x+(x-r.width/2),y:c.y+(y-r.height/2)},this.zoom)}
    render(){const r=this.el.getBoundingClientRect();if(!r.width||!r.height)return;const c=project(this.center,this.zoom),n=Math.pow(2,this.zoom),minX=Math.floor((c.x-r.width/2)/TILE)-1,maxX=Math.floor((c.x+r.width/2)/TILE)+1,minY=Math.max(0,Math.floor((c.y-r.height/2)/TILE)-1),maxY=Math.min(n-1,Math.floor((c.y+r.height/2)/TILE)+1);const needed=new Set();for(let ty=minY;ty<=maxY;ty++){for(let tx=minX;tx<=maxX;tx++){const wrap=((tx%n)+n)%n,key=`${this.zoom}/${wrap}/${ty}`;needed.add(key);let img=this.tiles.querySelector(`[data-key="${key}"]`);if(!img){img=document.createElement('img');img.className='aria-map-tile';img.alt='';img.draggable=false;img.dataset.key=key;const s=['a','b','c'][(wrap+ty)%3];img.src=this.tileUrl.replace('{s}',s).replace('{z}',this.zoom).replace('{x}',wrap).replace('{y}',ty);this.tiles.append(img)}img.style.left=(r.width/2+(tx*TILE-c.x))+'px';img.style.top=(r.height/2+(ty*TILE-c.y))+'px'}}for(const img of [...this.tiles.children])if(!needed.has(img.dataset.key))img.remove();for(const m of this.markers)m._render();for(const c0 of this.circles)c0._render()}
    _addMarker(m){if(!this.markers.includes(m))this.markers.push(m);m.map=this;this.markerPane.append(m.el);m._bindDrag();m._render();return m}
    _addCircle(c){if(!this.circles.includes(c))this.circles.push(c);c.map=this;this.svg.append(c.el);c._render();return c}
  }
  class MarkerLite{
    constructor(ll,opt={}){this.ll=latLng(ll);this.opt=opt;this.handlers={};this.el=document.createElement('div');this.el.className='aria-map-marker';this.el.setAttribute('role','img');this.el.setAttribute('aria-label','نشانگر موقعیت');this._dragBound=false}
    addTo(map){return map._addMarker(this)}
    setLatLng(ll){this.ll=latLng(ll);this._render();return this}
    getLatLng(){return{...this.ll}}
    on(type,fn){(this.handlers[type]||(this.handlers[type]=[])).push(fn);return this}
    off(type,fn){if(!type){this.handlers={};return this}if(!fn){this.handlers[type]=[];return this}this.handlers[type]=(this.handlers[type]||[]).filter(x=>x!==fn);return this}
    bindPopup(text){this.el.title=String(text||'');return this}
    _emit(type,p){for(const fn of this.handlers[type]||[])try{fn(p)}catch(e){console.error(e)}}
    _bindDrag(){if(this._dragBound||!this.opt.draggable)return;this._dragBound=true;let active=false;this.el.addEventListener('pointerdown',e=>{e.stopPropagation();active=true;this.el.setPointerCapture?.(e.pointerId);this.el.setAttribute('aria-grabbed','true')});this.el.addEventListener('pointermove',e=>{if(!active||!this.map)return;const r=this.map.el.getBoundingClientRect();this.ll=this.map._screenToLatLng(e.clientX-r.left,e.clientY-r.top);this._render()});this.el.addEventListener('pointerup',e=>{if(!active)return;active=false;this.el.setAttribute('aria-grabbed','false');this._emit('dragend',{target:this,originalEvent:e})})}
    _render(){if(!this.map)return;const p=this.map._worldToScreen(this.ll);this.el.style.left=p.x+'px';this.el.style.top=p.y+'px'}
  }
  class CircleLite{
    constructor(ll,opt={}){this.ll=latLng(ll);this.opt=opt;this.map=null;this.el=document.createElementNS('http://www.w3.org/2000/svg','circle');this.el.setAttribute('fill',opt.fillColor||opt.color||'#657d32');this.el.setAttribute('fill-opacity',String(opt.fillOpacity??.06));this.el.setAttribute('stroke',opt.color||'#657d32');this.el.setAttribute('stroke-width',String(opt.weight||2));if(opt.dashArray)this.el.setAttribute('stroke-dasharray',String(opt.dashArray))}
    addTo(map){return map._addCircle(this)}
    remove(){if(this.map){this.map.circles=this.map.circles.filter(x=>x!==this)}this.el.remove();this.map=null;return this}
    _render(){if(!this.map)return;const p=this.map._worldToScreen(this.ll),latRad=this.ll.lat*Math.PI/180,mpp=156543.03392*Math.cos(latRad)/Math.pow(2,this.map.zoom),rp=Math.max(1,Number(this.opt.radius||0)/mpp);this.el.setAttribute('cx',String(p.x));this.el.setAttribute('cy',String(p.y));this.el.setAttribute('r',String(rp))}
  }
  class TileLayerLite{constructor(url,opt={}){this.url=url;this.opt=opt}addTo(map){map.tileUrl=this.url||map.tileUrl;map.render();return this}}
  global.L={map:(target,opt)=>new MapLite(target,opt),tileLayer:(url,opt)=>new TileLayerLite(url,opt),marker:(ll,opt)=>new MarkerLite(ll,opt),circle:(ll,opt)=>new CircleLite(ll,opt)};
})(window);
