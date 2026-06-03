// ANGiM backend: TKGM proxy + auth + arsiv (Cloudflare KV binding: ANGIM)
const SALT='angim-2026-salt-x7k9';
const H={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'content-type,authorization'};
const J=(o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:{...H,'Content-Type':'application/json; charset=utf-8'}});
async function sha(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
const tok=()=>{const a=new Uint8Array(24);crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,'0')).join('');};
export default {
  async fetch(req,env){
    if(req.method==='OPTIONS') return new Response(null,{headers:H});
    const url=new URL(req.url), api=url.searchParams.get('api');
    if(api){
      const KV=env.ANGIM;
      if(!KV) return J({error:'KV bagli degil - Worker ayarlarinda ANGIM bindingini ekleyin.'},500);
      if(!(await KV.get('user:angim'))) await KV.put('user:angim',JSON.stringify({u:'angim',role:'admin',h:await sha('angim'+SALT),createdAt:Date.now()}));
      const body=req.method==='POST'?await req.json().catch(()=>({})):{};
      const token=(req.headers.get('authorization')||'').replace('Bearer ','').trim()||url.searchParams.get('t')||body.t||'';
      const sess=async()=>{if(!token)return null;const s=await KV.get('session:'+token);if(!s)return null;const o=JSON.parse(s);return o.exp>Date.now()?o:null;};
      if(api==='login'){
        const u=(body.u||'').trim().toLowerCase(),p=body.p||'';
        const rec=await KV.get('user:'+u), ok=rec&&JSON.parse(rec).h===await sha(p+SALT);
        await KV.put('login:'+Date.now()+'-'+Math.random().toString(36).slice(2,7),JSON.stringify({u,ok:!!ok,ip:req.headers.get('cf-connecting-ip')||'',ts:Date.now()}),{expirationTtl:7776000});
        if(!ok) return J({error:'Hatali kullanici adi veya sifre'},401);
        const t=tok(),role=JSON.parse(rec).role||'user';
        await KV.put('session:'+t,JSON.stringify({u,role,exp:Date.now()+604800000}),{expirationTtl:604800});
        return J({token:t,user:u,role});
      }
      if(api==='me'){const s=await sess();return s?J({user:s.u,role:s.role}):J({error:'oturum yok'},401);}
      if(api==='logout'){if(token)await KV.delete('session:'+token);return J({ok:true});}
      if(api==='adduser'){const s=await sess();if(!s||s.role!=='admin')return J({error:'yetki yok'},403);
        const u=(body.u||'').trim().toLowerCase(),p=body.p||'',role=body.role==='admin'?'admin':'user';
        if(!u||!p) return J({error:'kullanici adi ve sifre gerekli'},400);
        if(await KV.get('user:'+u)) return J({error:'bu kullanici zaten var'},409);
        await KV.put('user:'+u,JSON.stringify({u,role,h:await sha(p+SALT),createdAt:Date.now()}));return J({ok:true});}
      if(api==='deluser'){const s=await sess();if(!s||s.role!=='admin')return J({error:'yetki yok'},403);
        const u=(body.u||'').trim().toLowerCase();if(u==='angim')return J({error:'ana admin silinemez'},400);
        await KV.delete('user:'+u);return J({ok:true});}
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
