// ANGiM backend: TKGM proxy + auth + arsiv (Cloudflare KV binding: ANGIM)
// Guvenlik: PBKDF2 sifre hash + brute-force kilidi + IP rate-limit + guvenlik basliklari.
const SALT='angim-2026-salt-x7k9';          // yalnizca eski (legacy) hash dogrulamasi icin
const PBKDF2_ITER=120000;
const H={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'content-type,authorization',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer'
};
const J=(o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:{...H,'Content-Type':'application/json; charset=utf-8'}});
const hex=(buf)=>[...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('');
const randHex=(n)=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return hex(a);};
const tok=()=>randHex(24);
async function sha(s){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));}
function timingEq(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0;}
async function pbkdf2(pass,saltHex,iter){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),{name:'PBKDF2'},false,['deriveBits']);
  const salt=Uint8Array.from(saltHex.match(/../g).map(b=>parseInt(b,16)));
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},key,256);
  return hex(bits);
}
async function hashPass(pass){const salt=randHex(16);return `pbkdf2$${PBKDF2_ITER}$${salt}$${await pbkdf2(pass,salt,PBKDF2_ITER)}`;}
async function verifyPass(pass,stored){
  if(!stored) return {ok:false,legacy:false};
  if(stored.startsWith('pbkdf2$')){const p=stored.split('$');const calc=await pbkdf2(pass,p[2],parseInt(p[1]));return {ok:timingEq(calc,p[3]),legacy:false};}
  return {ok:timingEq(await sha(pass+SALT),stored),legacy:true};   // eski SHA-256 kayitlari
}
export default {
  async fetch(req,env,ctx){
    if(req.method==='OPTIONS') return new Response(null,{headers:H});
    const url=new URL(req.url), api=url.searchParams.get('api');
    if(api){
      const KV=env.ANGIM;
      if(!KV) return J({error:'KV bagli degil - Worker ayarlarinda ANGIM bindingini ekleyin.'},500);
      const ip=req.headers.get('cf-connecting-ip')||'0';
      // --- IP rate-limit (dakikada ~200 istek) ---
      const rlKey='rl:'+ip+':'+Math.floor(Date.now()/60000);
      const rl=parseInt(await KV.get(rlKey)||'0');
      if(rl>200) return J({error:'Hiz siniri asildi, biraz sonra tekrar deneyin.'},429);
      if(ctx&&ctx.waitUntil) ctx.waitUntil(KV.put(rlKey,String(rl+1),{expirationTtl:120})); else await KV.put(rlKey,String(rl+1),{expirationTtl:120});
      // ana admin tohumla (PBKDF2)
      if(!(await KV.get('user:angim'))) await KV.put('user:angim',JSON.stringify({u:'angim',role:'admin',h:await hashPass('angim'),createdAt:Date.now()}));
      const body=req.method==='POST'?await req.json().catch(()=>({})):{};
      const token=(req.headers.get('authorization')||'').replace('Bearer ','').trim()||url.searchParams.get('t')||body.t||'';
      const sess=async()=>{if(!token)return null;const s=await KV.get('session:'+token);if(!s)return null;const o=JSON.parse(s);return o.exp>Date.now()?o:null;};
      if(api==='login'){
        const u=(body.u||'').trim().toLowerCase(), p=(body.p||'').slice(0,200);
        // --- brute-force kilidi (kullanici+IP, 15 dk pencere) ---
        const lkKey='lock:'+u+':'+ip, fails=parseInt(await KV.get(lkKey)||'0');
        if(fails>=8) return J({error:'Cok fazla hatali deneme. ~15 dk sonra tekrar deneyin.'},429);
        const rec=await KV.get('user:'+u);
        let ok=false;
        if(rec){const o=JSON.parse(rec);const v=await verifyPass(p,o.h);ok=v.ok;
          if(ok&&v.legacy){o.h=await hashPass(p);await KV.put('user:'+u,JSON.stringify(o));}}   // transparan PBKDF2 yukseltme
        if(ctx&&ctx.waitUntil) ctx.waitUntil(KV.put('login:'+Date.now()+'-'+randHex(3),JSON.stringify({u,ok,ip,ts:Date.now()}),{expirationTtl:7776000}));
        if(!ok){await KV.put(lkKey,String(fails+1),{expirationTtl:900});return J({error:'Hatali kullanici adi veya sifre'},401);}
        await KV.delete(lkKey);
        const t=tok(),role=JSON.parse(rec).role||'user';
        await KV.put('session:'+t,JSON.stringify({u,role,exp:Date.now()+604800000}),{expirationTtl:604800});
        return J({token:t,user:u,role});
      }
      if(api==='me'){const s=await sess();return s?J({user:s.u,role:s.role}):J({error:'oturum yok'},401);}
      if(api==='logout'){if(token)await KV.delete('session:'+token);return J({ok:true});}
      if(api==='adduser'){const s=await sess();if(!s||s.role!=='admin')return J({error:'yetki yok'},403);
        const u=(body.u||'').trim().toLowerCase(),p=(body.p||'').slice(0,200),role=body.role==='admin'?'admin':'user';
        if(!/^[a-z0-9._-]{2,40}$/.test(u)) return J({error:'gecersiz kullanici adi (2-40, a-z 0-9 . _ -)'},400);
        if(p.length<4) return J({error:'sifre en az 4 karakter olmali'},400);
        if(await KV.get('user:'+u)) return J({error:'bu kullanici zaten var'},409);
        await KV.put('user:'+u,JSON.stringify({u,role,h:await hashPass(p),createdAt:Date.now()}));return J({ok:true});}
      if(api==='deluser'){const s=await sess();if(!s||s.role!=='admin')return J({error:'yetki yok'},403);
        const u=(body.u||'').trim().toLowerCase();if(u==='angim')return J({error:'ana admin silinemez'},400);
        await KV.delete('user:'+u);return J({ok:true});}
      if(api==='changepass'){const s=await sess();if(!s)return J({error:'oturum yok'},401);
        const np=(body.np||'').slice(0,200);if(np.length<4)return J({error:'sifre en az 4 karakter'},400);
        let tgt=s.u;
        if(body.u&&s.role==='admin'){tgt=(body.u||'').trim().toLowerCase();}
        else{const rec0=await KV.get('user:'+s.u);const v=rec0?await verifyPass((body.op||''),JSON.parse(rec0).h):{ok:false};if(!v.ok)return J({error:'mevcut sifre hatali'},403);}
        const rec=await KV.get('user:'+tgt);if(!rec)return J({error:'kullanici yok'},404);
        const o=JSON.parse(rec);o.h=await hashPass(np);await KV.put('user:'+tgt,JSON.stringify(o));return J({ok:true});}
      if(api==='setrole'){const s=await sess();if(!s||s.role!=='admin')return J({error:'yetki yok'},403);
        const u=(body.u||'').trim().toLowerCase(),role=body.role==='admin'?'admin':'user';
        if(u==='angim')return J({error:'ana admin rolu degistirilemez'},400);
        const rec=await KV.get('user:'+u);if(!rec)return J({error:'kullanici yok'},404);
        const o=JSON.parse(rec);o.role=role;await KV.put('user:'+u,JSON.stringify(o));return J({ok:true});}
      if(api==='users'){const s=await sess();if(!s||s.role!=='admin')return J({error:'yetki yok'},403);
        const l=await KV.list({prefix:'user:'}),users=[];
        for(const k of l.keys){const o=JSON.parse(await KV.get(k.name));users.push({u:o.u,role:o.role,createdAt:o.createdAt});}
        return J({users});}
      if(api==='logins'){const s=await sess();if(!s||s.role!=='admin')return J({error:'yetki yok'},403);
        const l=await KV.list({prefix:'login:'}),items=[];
        for(const k of l.keys) items.push(JSON.parse(await KV.get(k.name)));
        items.sort((a,b)=>b.ts-a.ts);return J({logins:items.slice(0,150)});}
      if(api==='archive'&&req.method==='POST'){const s=await sess();if(!s)return J({error:'oturum yok'},401);
        const id='a'+Date.now()+Math.random().toString(36).slice(2,6);
        await KV.put('arch:'+id,JSON.stringify({id,u:s.u,name:(body.name||'Tasarim').slice(0,90),loc:(body.loc||'').slice(0,140),thumb:(body.thumb||'').slice(0,60000),savedAt:Date.now(),state:body.state||{}}));
        return J({ok:true,id});}
      if(api==='archive'){const s=await sess();if(!s)return J({error:'oturum yok'},401);
        const id=url.searchParams.get('id');
        if(id){const r=await KV.get('arch:'+id);if(!r)return J({error:'bulunamadi'},404);const o=JSON.parse(r);if(s.role!=='admin'&&o.u!==s.u)return J({error:'yetki yok'},403);return J({item:o});}
        const l=await KV.list({prefix:'arch:'}),items=[];
        for(const k of l.keys){const o=JSON.parse(await KV.get(k.name));if(s.role==='admin'||o.u===s.u)items.push({id:o.id,u:o.u,name:o.name,loc:o.loc,thumb:o.thumb||'',savedAt:o.savedAt});}
        items.sort((a,b)=>b.savedAt-a.savedAt);return J({items,role:s.role});}
      if(api==='delarchive'){const s=await sess();if(!s)return J({error:'oturum yok'},401);
        const id=url.searchParams.get('id')||body.id,r=await KV.get('arch:'+id);if(!r)return J({ok:true});
        const o=JSON.parse(r);if(s.role!=='admin'&&o.u!==s.u)return J({error:'yetki yok'},403);
        await KV.delete('arch:'+id);return J({ok:true});}
      return J({error:'bilinmeyen api'},404);
    }
    const target=url.searchParams.get('url');
    if(!target) return new Response('Kullanim: ?url=<adres> veya ?api=...',{status:400,headers:H});
    let host; try{host=new URL(target).hostname;}catch{return new Response('gecersiz url',{status:400,headers:H});}
    if(!/\.tkgm\.gov\.tr$/.test(host)) return new Response('yalniz tkgm.gov.tr',{status:403,headers:H});
    try{
      const up=await fetch(target,{headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15','Accept':'application/json, text/plain, */*','Accept-Language':'tr-TR,tr;q=0.9','Referer':'https://parselsorgu.tkgm.gov.tr/','Origin':'https://parselsorgu.tkgm.gov.tr'}});
      const b=await up.arrayBuffer();
      return new Response(b,{status:up.status,headers:{...H,'Content-Type':up.headers.get('Content-Type')||'application/json; charset=utf-8'}});
    }catch(e){return new Response('proxy hatasi: '+e,{status:502,headers:H});}
  }
};
