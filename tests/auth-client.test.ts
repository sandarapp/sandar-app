import { describe,expect,it,vi } from 'vitest';
import { NativeAuthClient,WebAuthClient,Transport,ClientError,type TokenStore } from '../packages/auth-client/src/client.js';
import { parseAuthLink,parseExpoAuthLink,safeReturnPath } from '../packages/auth-client/src/links.js';
const token = 'a'.repeat(43), nextToken = 'b'.repeat(43), access = 'c'.repeat(43);
const user = {id:'sample',email:'sample@example.invalid',accountType:'MEMBER',status:'ONBOARDING_INCOMPLETE',emailVerifiedAt:'2026-09-21'};
const response = (data: unknown,status=200,code='SERVER_ERROR',headers={}) => new Response(JSON.stringify(status>=400?{data:null,error:{code,message:'safe message',field:null}}:{data,error:null}),{status,headers});
function store(initial: string|null=null) {
  let value = initial;
  const api: TokenStore = {get:vi.fn(async()=>value),set:vi.fn(async v=>{value=v;}),remove:vi.fn(async()=>{value=null;})};
  return {api,value:()=>value};
}
describe('deep links',()=>{
  it('accepts exact web/native action links using fragments',()=>{
    expect(parseAuthLink(`https://sandar.example/verify-email#token=${token}`,'https://sandar.example')).toEqual({screen:'verify-email',token});
    expect(parseAuthLink(`sandar://reset-password#token=${token}`,'https://sandar.example')).toEqual({screen:'reset-password',token});
  });
  it.each([
    `https://evil.example/verify-email#token=${token}`,
    `https://sandar.example/verify-email?token=${token}`,
    `sandar://reset-password/extra#token=${token}`,
    `sandar://reset-password#token=${token}&token=${token}`,
    `sandar://reset-password#token=${token}&next=https://evil.example`,
    `sandar://admin#token=${token}`,
    'javascript:alert(1)', 'sandar://verify-email#token=short'
  ])('rejects untrusted/malformed link %s',url=>expect(parseAuthLink(url,'https://sandar.example')).toBeNull());
  it('never creates an external return redirect',()=>{
    expect(safeReturnPath('https://evil.example')).toBe('/account');
    expect(safeReturnPath('//evil.example')).toBe('/account');
    expect(safeReturnPath('/account')).toBe('/account');
  });
});
describe('central transport',()=>{
  it('reports offline without starting a request',async()=>{
    const fetcher=vi.fn();const client=new Transport('https://api.example',{fetcher,online:()=>false});
    await expect(client.request('/policies')).rejects.toMatchObject({code:'OFFLINE'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('times out without automatic retries',async()=>{
    const fetcher=vi.fn((_url: RequestInfo|URL,options?: RequestInit)=>new Promise<Response>((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(new Error('aborted')))));
    await expect(new Transport('https://api.example',{fetcher,timeoutMs:5}).request('/policies')).rejects.toMatchObject({code:'TIMEOUT'});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('maps retry guidance and sanitizes 5xx',async()=>{
    const limited=new Transport('',{fetcher:vi.fn(async()=>response(null,429,'RATE_LIMITED',{'retry-after':'42'}))});
    await expect(limited.request('/policies')).rejects.toMatchObject({code:'RATE_LIMITED',retryAfter:42});
    const failed=new Transport('',{fetcher:vi.fn(async()=>new Response(JSON.stringify({error:{code:'INTERNAL_ERROR',message:'secret stack'}}),{status:500}))});
    await expect(failed.request('/policies')).rejects.toMatchObject({message:'Layanan sedang bermasalah. Coba lagi nanti.'});
  });
  it('uses a cookie BFF without exposing bearer tokens to web storage',async()=>{
    const fetcher=vi.fn<typeof fetch>(async()=>response(user));const web=new WebAuthClient(new Transport('/api/v1',{web:true,fetcher}));
    await web.login('sample@example.invalid','example password');
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/web/auth/login');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({credentials:'same-origin',cache:'no-store'});
  });
});
describe('native credential lifecycle',()=>{
  it('restores through the server and shares one refresh across concurrent callers',async()=>{
    const secure=store(JSON.stringify({refreshToken:token}));
    const fetcher=vi.fn(async(url: RequestInfo|URL)=>String(url).endsWith('/auth/refresh')?response({accessToken:access,refreshToken:nextToken,expiresIn:900}):response(user));
    const client=new NativeAuthClient(new Transport('',{fetcher}),secure.api);
    const results=await Promise.all([client.session(),client.session(),client.session()]);
    expect(results).toHaveLength(3);expect(fetcher.mock.calls.filter(c=>String(c[0]).endsWith('/auth/refresh'))).toHaveLength(1);
    expect(JSON.parse(secure.value()!)).toEqual({refreshToken:nextToken});expect(secure.value()).not.toContain(access);
  });
  it('never replays a refresh after ambiguous network failure',async()=>{
    const secure=store(JSON.stringify({refreshToken:token}));const fetcher=vi.fn(async()=>{throw new Error('network');});
    const client=new NativeAuthClient(new Transport('',{fetcher}),secure.api);
    await expect(client.session()).rejects.toMatchObject({code:'NETWORK_ERROR'});
    expect(secure.value()).toBeNull();
    await expect(client.session()).rejects.toMatchObject({code:'SESSION_INVALID'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not treat saved role/user data as authorization',async()=>{
    const secure=store(JSON.stringify({role:'SUPER_ADMIN',user}));const fetcher=vi.fn();
    await expect(new NativeAuthClient(new Transport('',{fetcher}),secure.api).session()).rejects.toMatchObject({status:401});expect(fetcher).not.toHaveBeenCalled();
  });
  it('clears refresh credentials and retries pending offline logout before login',async()=>{
    const secure=store();let offline=false;
    const fetcher=vi.fn(async(url: RequestInfo|URL)=>{
      if(offline)throw new Error('offline');
      return String(url).endsWith('/auth/login')?response({accessToken:access,refreshToken:token,expiresIn:900,user}):response(user);
    });
    const client=new NativeAuthClient(new Transport('',{fetcher}),secure.api);
    await client.login(user.email,'example password');offline=true;
    await expect(client.logout()).rejects.toMatchObject({code:'LOGOUT_PENDING'});
    expect(JSON.parse(secure.value()!)).toEqual({logoutAccessToken:access});
    offline=false;await client.logout();expect(secure.value()).toBeNull();
  });
  it('revokes a new session if secure storage cannot save it',async()=>{
    const secure=store();secure.api.set=vi.fn(async()=>{throw new Error('keychain locked');});
    const fetcher=vi.fn(async(url: RequestInfo|URL)=>String(url).endsWith('/auth/login')?response({accessToken:access,refreshToken:token,user}):response({}));
    const client=new NativeAuthClient(new Transport('',{fetcher}),secure.api);
    await expect(client.login(user.email,'example password')).rejects.toBeInstanceOf(ClientError);
    expect(fetcher.mock.calls.some(c=>String(c[0]).endsWith('/auth/logout'))).toBe(true);
  });
});

describe('Expo Go development auth links',()=>{
  const base='exp://127.0.0.1:8081/--/';
  it.each(['verify-email','reset-password'])('accepts the current app %s fragment',screen=>{
    expect(parseExpoAuthLink(`${base}${screen}#token=${token}`,base)).toEqual({screen,token});
  });
  it.each([
    `exp://evil.example:8081/--/verify-email#token=${token}`,
    `exp://127.0.0.1:8082/--/verify-email#token=${token}`,
    `https://127.0.0.1:8081/--/verify-email#token=${token}`,
    `exp://user@127.0.0.1:8081/--/verify-email#token=${token}`,
    `${base}verify-email?token=${token}`,
    `${base}verify-email#token=${token}&token=${token}`,
    `${base}verify-email#token=short`,
    `${base}verify-email`,
    `${base}verify-email/extra#token=${token}`,
    `${base}admin#token=${token}`,
    `exp://127.0.0.1:8081/verify-email#token=${token}`
  ])('rejects unexpected development URL %s',raw=>expect(parseExpoAuthLink(raw,base)).toBeNull());
  it('does not enable Expo links for a standalone app base',()=>{
    expect(parseExpoAuthLink(`${base}verify-email#token=${token}`,'sandar:///')).toBeNull();
  });
});
