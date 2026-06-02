/*
 * ANGİM — Mimari Tasarım Üretici · Backend Worker
 * TKGM proxy + kullanıcı girişi (auth) + tasarım arşivi (Cloudflare KV)
 * --------------------------------------------------------------
 * KURULUM (bir kez):
 *  1) Cloudflare → Storage & Databases → KV → "Create namespace" → ad: ANGIM_KV
 *  2) Bu Worker → Settings → Variables and Bindings → KV Namespace Bindings → Add:
 *       Variable name: ANGIM   |   KV namespace: ANGIM_KV
 *  3) Bu kodu Worker'a yapıştır → Deploy.
 *  Varsayılan admin: kullanıcı "angim" / şifre "angim" (ilk istekte otomatik oluşur).
 *  Güvenlik için kuruluştan sonra SALT'ı değiştirip admin şifresini güncelleyebilirsiniz.
 * --------------------------------------------------------------
 */
const SALT = 'angim-2026-§alt-x7';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,authorization',
};
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
async function sha(s){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
function newToken(){ const a=new Uint8Array(24); crypto.getRandomValues(a); return [...a].map(x=>x.toString(16).padStart(2,'0')).join(''); }

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const api = url.searchParams.get('api');

    if (api) {
      const KV = env.ANGIM;
      if (!KV) return json({ error: 'KV bağlı değil — Worker ayarlarında ANGIM bindingini ekleyin.' }, 500);
      // varsayılan admin'i hazırla
      if (!(await KV.get('user:angim'))) {
        await KV.put('user:angim', JSON.stringify({ u:'angim', role:'admin', h: await sha('angim'+SALT), createdAt: Date.now() }));
      }
      const body = request.method === 'POST' ? await request.json().catch(()=>({})) : {};
      const token = (request.headers.get('authorization')||'').replace('Bearer ','').trim() || url.searchParams.get('t') || body.t || '';
      const sess = async () => { if(!token) return null; const s=await KV.get('session:'+token); if(!s) return null; const o=JSON.parse(s); return (o.exp>Date.now())?o:null; };

      if (api === 'login') {
        const u=(body.u||'').trim().toLowerCase(), p=body.p||'';
        const rec=await KV.get('user:'+u);
        const ok = rec && JSON.parse(rec).h === await sha(p+SALT);
        await KV.put('login:'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
          JSON.stringify({ u, ok:!!ok, ip:request.headers.get('cf-connecting-ip')||'', ua:(request.headers.get('user-agent')||'').slice(0,80), ts:Date.now() }),
          { expirationTtl: 60*60*24*90 });
        if (!ok) return json({ error:'Hatalı kullanıcı adı veya şifre' }, 401);
        const t=newToken(), role=JSON.parse(rec).role||'user';
        await KV.put('session:'+t, JSON.stringify({ u, role, exp: Date.now()+7*864e5 }), { expirationTtl: 7*86400 });
        return json({ token:t, user:u, role });
      }
      if (api === 'me') { const s=await sess(); return s ? json({ user:s.u, role:s.role }) : json({ error:'oturum yok' }, 401); }
      if (api === 'logout') { if(token) await KV.delete('session:'+token); return json({ ok:true }); }

      if (api === 'adduser') { const s=await sess(); if(!s||s.role!=='admin') return json({ error:'yetki yok' }, 403);
        const u=(body.u||'').trim().toLowerCase(), p=body.p||'', role=body.role==='admin'?'admin':'user';
        if(!u||!p) return json({ error:'kullanıcı adı ve şifre gerekli' }, 400);
        if(await KV.get('user:'+u)) return json({ error:'bu kullanıcı zaten var' }, 409);
        await KV.put('user:'+u, JSON.stringify({ u, role, h: await sha(p+SALT), createdAt: Date.now() }));
        return json({ ok:true });
      }
      if (api === 'deluser') { const s=await sess(); if(!s||s.role!=='admin') return json({ error:'yetki yok' }, 403);
        const u=(body.u||'').trim().toLowerCase(); if(u==='angim') return json({ error:'ana admin silinemez' }, 400);
        await KV.delete('user:'+u); return json({ ok:true });
      }
      if (api === 'users') { const s=await sess(); if(!s||s.role!=='admin') return json({ error:'yetki yok' }, 403);
        const l=await KV.list({ prefix:'user:' }), users=[];
        for (const k of l.keys) { const o=JSON.parse(await KV.get(k.name)); users.push({ u:o.u, role:o.role, createdAt:o.createdAt }); }
        return json({ users });
      }
      if (api === 'logins') { const s=await sess(); if(!s||s.role!=='admin') return json({ error:'yetki yok' }, 403);
        const l=await KV.list({ prefix:'login:' }), items=[];
        for (const k of l.keys) items.push(JSON.parse(await KV.get(k.name)));
        items.sort((a,b)=>b.ts-a.ts); return json({ logins: items.slice(0,150) });
      }

      if (api === 'archive' && request.method === 'POST') { const s=await sess(); if(!s) return json({ error:'oturum yok' }, 401);
        const id='a'+Date.now()+Math.random().toString(36).slice(2,6);
        await KV.put('arch:'+id, JSON.stringify({ id, u:s.u, name:(body.name||'Tasarım').slice(0,90), loc:(body.loc||'').slice(0,140), savedAt:Date.now(), state:body.state||{} }));
        return json({ ok:true, id });
      }
      if (api === 'archive') { const s=await sess(); if(!s) return json({ error:'oturum yok' }, 401);
        const id=url.searchParams.get('id');
        if (id) { const r=await KV.get('arch:'+id); if(!r) return json({ error:'bulunamadı' }, 404);
          const o=JSON.parse(r); if(s.role!=='admin'&&o.u!==s.u) return json({ error:'yetki yok' }, 403); return json({ item:o }); }
        const l=await KV.list({ prefix:'arch:' }), items=[];
        for (const k of l.keys) { const o=JSON.parse(await KV.get(k.name)); if(s.role==='admin'||o.u===s.u) items.push({ id:o.id, u:o.u, name:o.name, loc:o.loc, savedAt:o.savedAt }); }
        items.sort((a,b)=>b.savedAt-a.savedAt); return json({ items, role:s.role });
      }
      if (api === 'delarchive') { const s=await sess(); if(!s) return json({ error:'oturum yok' }, 401);
        const id=url.searchParams.get('id')||body.id; const r=await KV.get('arch:'+id); if(!r) return json({ ok:true });
        const o=JSON.parse(r); if(s.role!=='admin'&&o.u!==s.u) return json({ error:'yetki yok' }, 403);
        await KV.delete('arch:'+id); return json({ ok:true });
      }
      return json({ error:'bilinmeyen api' }, 404);
    }

    // --- TKGM proxy (mevcut davranış) ---
    const target = url.searchParams.get('url');
    if (!target) return new Response('Kullanim: ?url=<adres> veya ?api=...', { status: 400, headers: CORS });
    let host; try { host = new URL(target).hostname; } catch { return new Response('gecersiz url', { status: 400, headers: CORS }); }
    if (!/\.tkgm\.gov\.tr$/.test(host)) return new Response('yalniz tkgm.gov.tr', { status: 403, headers: CORS });
    try {
      const up = await fetch(target, { headers: {
        'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1',
        'Accept':'application/json, text/plain, */*', 'Accept-Language':'tr-TR,tr;q=0.9',
        'Referer':'https://parselsorgu.tkgm.gov.tr/', 'Origin':'https://parselsorgu.tkgm.gov.tr' } });
      const b = await up.arrayBuffer();
      return new Response(b, { status: up.status, headers: { ...CORS, 'Content-Type': up.headers.get('Content-Type') || 'application/json; charset=utf-8' } });
    } catch (e) { return new Response('proxy hatasi: ' + e, { status: 502, headers: CORS }); }
  }
};
