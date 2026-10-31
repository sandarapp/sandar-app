import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {Pool} from 'pg';
const password='development password 123';
const db=new Pool({connectionString:process.env.E2E_DATABASE_URL});
test.afterAll(async()=>{await db.end();});
test.beforeEach(async()=>{await db.query('TRUNCATE rate_limits');});
async function mail(to:string,template:string) {
  let link:string|undefined;
  await expect.poll(async()=>{
    for(const file of await readdir('.local/e2e-mail').catch(()=>[])) {
      if(!file.endsWith('.json'))continue;
      const message=JSON.parse(await readFile(`.local/e2e-mail/${file}`,'utf8'));
      if(message.to===to&&message.template===template)link=message.link;
    }
    return Boolean(link);
  }).toBe(true);
  return link!;
}
async function register(page:Page,to:string,community=false) {
  await page.goto('/register');
  if(community)await page.getByRole('radio',{name:/Komunitas/}).check();
  await page.getByLabel('Alamat email').fill(to);
  await page.getByLabel('Kata sandi baru',{exact:true}).fill(password);
  await page.getByLabel('Konfirmasi kata sandi',{exact:true}).fill(password);
  await page.getByRole('checkbox',{name:/Ketentuan Penggunaan/}).check();
  await page.getByRole('checkbox',{name:/Pemberitahuan Privasi/}).check();
  await page.getByRole('button',{name:'Buat akun',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Periksa email Anda.'})).toBeVisible();
}
async function login(page:Page,to:string,pw=password) {
  await page.goto('/login');await page.getByLabel('Alamat email').fill(to);await page.getByLabel('Kata sandi',{exact:true}).fill(pw);
  await page.getByRole('button',{name:'Masuk',exact:true}).click();await expect(page.getByText(to,{exact:true})).toBeVisible();
}
test('registration → real development email → verify → login → reset → logout',async({page,context})=>{
  const to=`member-${randomUUID()}@example.invalid`;
  await register(page,to);
  const verification=await mail(to,'VERIFY_EMAIL');
  await page.goto(verification);
  await expect(page).toHaveURL('/verify-email');
  const token=new URL(verification).hash.slice(7);
  expect((await db.query('SELECT used_at FROM action_tokens WHERE user_id=(SELECT id FROM users WHERE email=$1)',[to])).rows[0].used_at).toBeNull();
  await page.getByRole('button',{name:'Verifikasi email',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Kamu sudah bergabung. Selamat datang di Sandar.'})).toBeVisible();
  await login(page,to);
  const cookies=await context.cookies();const auth=cookies.find(c=>c.name==='sandar_session');
  expect(auth?.httpOnly).toBe(true);expect(auth?.sameSite).toBe('Strict');
  expect(await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)}))).toEqual({local:[],session:[]});
  expect(await page.evaluate(()=>document.cookie)).not.toContain('sandar_session');
  expect(await page.content()).not.toContain(token);
  await page.goto('/forgot-password');await page.getByLabel('Alamat email').fill(to);
  await page.getByRole('button',{name:'Kirim tautan pemulihan'}).click();
  await expect(page.getByRole('status')).toContainText('Jika alamat ini memenuhi syarat');
  const reset=await mail(to,'RESET_PASSWORD');await page.goto(reset);await expect(page).toHaveURL('/reset-password');
  await page.getByLabel('Kata sandi baru',{exact:true}).fill('replacement password 456');
  await page.getByLabel('Konfirmasi kata sandi',{exact:true}).fill('replacement password 456');
  await page.getByRole('button',{name:'Simpan kata sandi'}).click();
  await expect(page.getByRole('heading',{name:'Kata sandi diperbarui.'})).toBeVisible();
  await page.goto('/account');await expect(page.getByRole('alert')).toContainText('Sesi berakhir');
  await login(page,to,'replacement password 456');await page.getByRole('button',{name:'Keluar',exact:true}).click();
  await expect(page).toHaveURL('/login');await page.goto('/account');await expect(page.getByRole('alert')).toContainText('Sesi berakhir');
});
test('community email verification never becomes approval or onboarding',async({page})=>{
  const to=`community-${randomUUID()}@example.invalid`;await register(page,to,true);
  await page.goto(await mail(to,'VERIFY_EMAIL'));await page.getByRole('button',{name:'Verifikasi email',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Kamu sudah bergabung. Selamat datang di Sandar.'})).toBeVisible();await login(page,to);
  await expect(page.getByText('Onboarding belum dilakukan',{exact:true})).toBeVisible();
  await expect(page.getByText(/Verifikasi email tidak berarti komunitas Anda telah disetujui/)).toBeVisible();
});
test('invalid and expired verification links offer recovery without automatic consumption',async({page})=>{
  await page.goto('/verify-email#token=invalid');await expect(page.getByRole('alert')).toContainText('Tautan tidak valid');
  await expect(page.getByRole('button',{name:'Verifikasi email',exact:true})).toBeDisabled();
  const to=`expired-${randomUUID()}@example.invalid`;await register(page,to);
  const link=await mail(to,'VERIFY_EMAIL');await db.query("UPDATE action_tokens SET expires_at=now()-interval '1 second' WHERE user_id=(SELECT id FROM users WHERE email=$1)",[to]);
  await page.goto(link);await page.getByRole('button',{name:'Verifikasi email',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('kedaluwarsa');
  await page.getByRole('button',{name:'Minta tautan verifikasi baru'}).click();
  await expect(page).toHaveURL('/check-email');
});
test('registration validates locally and confirms unsaved navigation',async({page})=>{
  await page.goto('/register');await expect(page.getByRole('button',{name:'Buat akun',exact:true})).toBeDisabled();
  await page.getByLabel('Alamat email').fill('invalid');await page.getByLabel('Kata sandi baru',{exact:true}).fill('a long password');
  await page.getByLabel('Konfirmasi kata sandi',{exact:true}).fill('different');await expect(page.getByText('Kata sandi belum sama.')).toBeVisible();
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'← Kembali ke masuk'}).click();
  await expect(page).toHaveURL('/register');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'← Kembali ke masuk'}).click();await expect(page).toHaveURL('/login');
});
test('renders offline, network failure, rate limit and server-error states',async({page,context})=>{
  await page.goto('/forgot-password');await page.getByLabel('Alamat email').fill('missing@example.invalid');
  await context.setOffline(true);await expect(page.getByText('Anda sedang offline. Sambungkan internet untuk melanjutkan.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Kirim tautan pemulihan'})).toBeDisabled();await context.setOffline(false);
  await page.route('**/api/v1/auth/password/forgot',route=>route.abort());await page.getByRole('button',{name:'Kirim tautan pemulihan'}).click();
  await expect(page.getByRole('alert')).toContainText('Tidak dapat terhubung');await page.unroute('**/api/v1/auth/password/forgot');
  await page.route('**/api/v1/auth/password/forgot',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({data:null,error:{code:'SERVER_ERROR',message:'private error'}})}));
  await page.getByRole('button',{name:'Kirim tautan pemulihan'}).click();await expect(page.getByRole('alert')).toContainText('Layanan sedang bermasalah');await page.unroute('**/api/v1/auth/password/forgot');
  await page.route('**/api/v1/auth/password/forgot',route=>route.fulfill({status:429,headers:{'retry-after':'15'},contentType:'application/json',body:JSON.stringify({data:null,error:{code:'RATE_LIMITED',message:'Terlalu banyak permintaan.'}})}));
  await page.getByRole('button',{name:'Kirim tautan pemulihan'}).click();await expect(page.getByRole('alert')).toContainText('Terlalu banyak permintaan');await expect(page.getByRole('button',{name:/Coba lagi dalam/})).toBeDisabled();
});
test('web BFF rejects cross-origin writes and raw-token login proxy',async({request})=>{
  const cross=await request.post('/api/v1/web/auth/login',{headers:{origin:'https://evil.example','x-sandar-client':'web'},data:{email:'member@example.invalid',password}});expect(cross.status()).toBe(403);
  const raw=await request.post('/api/v1/auth/login',{headers:{origin:'http://localhost:3100','x-sandar-client':'web'},data:{email:'member@example.invalid',password}});expect(raw.status()).toBe(404);
});
test('mobile-width authentication is readable without horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/login');
  await expect(page.getByRole('heading',{name:'Selamat datang kembali.'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'.local/auth-mobile-web.png',fullPage:true});
});
