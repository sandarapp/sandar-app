import React from 'react';
import { act,create,type ReactTestRenderer } from 'react-test-renderer';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { useAuthFlow } from '../packages/auth-client/src/use-auth-flow.js';
import { ClientError,type AuthClient,type PublicUser } from '../packages/auth-client/src/client.js';
import type { AuthScreen } from '../packages/auth-client/src/links.js';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let rendered: ReactTestRenderer|undefined;
afterEach(async()=>{await act(async()=>rendered?.unmount());rendered=undefined;});
const user: PublicUser={id:'sample',email:'member@example.invalid',accountType:'MEMBER',status:'ONBOARDING_INCOMPLETE',emailVerifiedAt:'2026-09-21'};
function client(): AuthClient {return {
  policies:vi.fn(async()=>[{type:'TERMS' as const,version:'dev',locale:'id-ID',contentUrl:'/legal/terms'},{type:'PRIVACY_NOTICE' as const,version:'dev',locale:'id-ID',contentUrl:'/legal/privacy'}]),
  register:vi.fn(async()=>({})),login:vi.fn(async()=>user),session:vi.fn(async()=>user),logout:vi.fn(async()=>{}),
  verify:vi.fn(async()=>({})),forgot:vi.fn(async()=>({})),resend:vi.fn(async()=>({})),reset:vi.fn(async()=>({}))
};}
async function mount(api: AuthClient,screen: AuthScreen,confirm=vi.fn(async()=>true)) {
  let flow: ReturnType<typeof useAuthFlow>;
  function Harness(){flow=useAuthFlow(api,screen,confirm);return <div>{flow.screen}</div>;}
  await act(async()=>{rendered=create(<Harness/>);});
  return {get:()=>flow!,confirm};
}
describe('shared web/native authentication UI state',()=>{
  it('disables registration until matching passwords and two explicit consents',async()=>{
    const api=client(),state=await mount(api,'register');
    expect(state.get().canSubmit).toBe(false);
    await act(async()=>{state.get().setEmail(user.email);state.get().setPassword('example password 123');state.get().setConfirmation('different');state.get().setTerms(true);});
    expect(state.get().canSubmit).toBe(false);
    await act(async()=>{state.get().setConfirmation('example password 123');state.get().setPrivacy(true);});
    expect(state.get().canSubmit).toBe(true);
    await act(async()=>{await state.get().submit();});
    expect(api.register).toHaveBeenCalledWith('member',expect.objectContaining({consents:expect.arrayContaining([expect.objectContaining({type:'TERMS',accepted:true}),expect.objectContaining({type:'PRIVACY_NOTICE',accepted:true})])}));
    expect(state.get().screen).toBe('check-email');expect(state.get().password).toBe('');
  });
  it('does not consume a verification link until explicit submit',async()=>{
    const api=client(),state=await mount(api,'login');
    await act(async()=>{state.get().receiveLink('verify-email','a'.repeat(43));});
    expect(api.verify).not.toHaveBeenCalled();
    await act(async()=>{await state.get().submit();});
    expect(api.verify).toHaveBeenCalledTimes(1);expect(state.get().token).toBeNull();expect(state.get().notice).toContain('terverifikasi');
  });
  it('shows invalid-token recovery and refuses to submit missing tokens',async()=>{
    const api=client(),state=await mount(api,'login');
    await act(async()=>{state.get().receiveLink('reset-password',null);});
    expect(state.get().error?.code).toBe('TOKEN_INVALID_OR_EXPIRED');expect(state.get().canSubmit).toBe(false);expect(api.reset).not.toHaveBeenCalled();
  });
  it('blocks duplicate login submission and clears passwords on success',async()=>{
    const api=client();let finish!: (value: PublicUser)=>void;api.login=vi.fn(()=>new Promise<PublicUser>(resolve=>{finish=resolve;}));
    const state=await mount(api,'login');
    await act(async()=>{state.get().setEmail(user.email);state.get().setPassword('example password');});
    let first!:Promise<void>;
    await act(async()=>{first=state.get().submit();void state.get().submit();});
    expect(api.login).toHaveBeenCalledTimes(1);expect(state.get().busy).toBe(true);
    await act(async()=>{finish(user);await first;});
    expect(state.get().password).toBe('');expect(state.get().screen).toBe('account');
  });
  it('preserves unsaved input when discard is declined',async()=>{
    const api=client(),state=await mount(api,'register',vi.fn(async()=>false));
    await act(async()=>{state.get().setPassword('unsaved');});
    await act(async()=>{expect(await state.get().navigate('login')).toBe(false);});
    expect(state.get().password).toBe('unsaved');expect(state.get().screen).toBe('register');
  });
  it('renders expiry and clears previously authenticated data after server denial',async()=>{
    const api=client(),state=await mount(api,'account');
    expect(state.get().user?.id).toBe('sample');
    api.session=vi.fn(async()=>{throw new ClientError('SESSION_INVALID','Silakan masuk kembali.',401);});
    await act(async()=>{await state.get().refreshSession();});
    expect(state.get().user).toBeNull();expect(state.get().error?.status).toBe(401);
  });
  it.each(['OFFLINE','TIMEOUT','SERVER_ERROR'])('keeps form input and exposes %s for retry',async code=>{
    const api=client();api.forgot=vi.fn(async()=>{throw new ClientError(code,'Try again');});
    const state=await mount(api,'forgot-password');await act(async()=>{state.get().setEmail(user.email);});
    await act(async()=>{await state.get().submit();});expect(state.get().error?.code).toBe(code);expect(state.get().email).toBe(user.email);expect(state.get().busy).toBe(false);
  });
  it('blocks resubmission during the server-provided rate-limit cooldown',async()=>{
    const api=client();api.forgot=vi.fn(async()=>{throw new ClientError('RATE_LIMITED','Wait',429,15);});
    const state=await mount(api,'forgot-password');await act(async()=>{state.get().setEmail(user.email);});
    await act(async()=>{await state.get().submit();});expect(state.get().cooldown).toBe(15);expect(state.get().canSubmit).toBe(false);
    await act(async()=>{await state.get().submit();});expect(api.forgot).toHaveBeenCalledTimes(1);
  });
});
