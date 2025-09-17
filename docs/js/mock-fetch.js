// mock-fetch.js
// base path ของ project pages (เช่น /FoodfindGoo.github.io/)
function projectBase(){const p=location.pathname.split("/").filter(Boolean);return p.length?`/${p[0]}/`:"/";}
const _mockCache={};async function loadMock(name){const url=`${projectBase()}mock/${name}.json`;if(!_mockCache[url])_mockCache[url]=fetch(url).then(r=>r.json());return _mockCache[url];}
function jsonResponse(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json"}});}
const LS={uniques:"demo_site_uniques_set",total:"demo_site_total"};
function _getSet(k){return new Set(JSON.parse(localStorage.getItem(k)||"[]"))}function _setSet(k,s){localStorage.setItem(k,JSON.stringify([...s]))}
async function mockHandle(path,init={}){const url=new URL(path,location.origin);const p=url.pathname;const m=(init.method||"GET").toUpperCase();
  if(p.startsWith("/api/health")) return jsonResponse({ok:true,time:new Date().toISOString(),mock:true});
  if(p.startsWith("/api/menus")&&m==="GET"){return jsonResponse(await loadMock("menus")); }
  if(p.startsWith("/api/restaurants")&&m==="GET"){return jsonResponse(await loadMock("restaurants")); }
  if(p.startsWith("/api/search")&&m==="GET"){const q=(url.searchParams.get("q")||"").toLowerCase();const [menus,shops]=await Promise.all([loadMock("menus"),loadMock("restaurants")]);
    const fm=menus.filter(x=>(x.name||"").toLowerCase().includes(q)||(x.restaurantName||"").toLowerCase().includes(q));
    const fs=shops.filter(x=>(x.name||"").toLowerCase().includes(q));return jsonResponse({menus:fm,shops:fs});}
  if(p.startsWith("/api/analytics/visit")&&m==="POST"){const bodyText=init.body?await new Response(init.body).text():"{}";const {vid}=JSON.parse(bodyText||"{}");
    if(!vid) return jsonResponse({error:"missing vid"},400);const uniques=_getSet(LS.uniques);let increased=false;if(!uniques.has(vid)){uniques.add(vid);increased=true;_setSet(LS.uniques,uniques);}
    const total=Number(localStorage.getItem(LS.total)||"0")+1;localStorage.setItem(LS.total,String(total));return jsonResponse({ok:true,increased,counter:{key:"site",uniques:uniques.size,total}});}
  if(p.startsWith("/api/analytics/site")){const uniques=_getSet(LS.uniques).size;const total=Number(localStorage.getItem(LS.total)||"0");return jsonResponse({key:"site",uniques,total});}
  if(p.startsWith("/api/whoami")) return jsonResponse({uid:null,email:null});
  return jsonResponse({error:`MOCK: endpoint not implemented: ${p}`},501);
}
(function install(){const orig=window.fetch.bind(window);
  window.fetch=function(input,init){const url=typeof input==="string"?input:input.url;const isApi=/^\/?api\//.test(url.replace(/^\.\//,""));
    if(!window.API_BASE&&isApi){const abs=url.startsWith("/")?url:"/"+url;return mockHandle(abs,init);}
    if(window.API_BASE&&isApi){const abs=url.startsWith("/")?url:"/"+url;const prox=window.API_BASE.replace(/\/$/,"")+abs;return orig(prox,init);}
    return orig(input,init);
  };
  if(!window.API_BASE){const bar=document.createElement("div");bar.style.cssText="position:fixed;left:0;right:0;bottom:0;background:#111;color:#fff;padding:8px 12px;font:14px/1.2 system-ui;z-index:9999;opacity:.95";
    bar.textContent="Demo mode: ข้อมูลมาจากไฟล์ใน repo (ไม่มี backend)";window.addEventListener("DOMContentLoaded",()=>document.body.appendChild(bar));}
})();
