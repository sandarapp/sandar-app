import {createHmac,randomBytes} from 'node:crypto';
// RFC 6238 codes for authenticator apps: 30 second steps, 6 digits, SHA-1.
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newSecret(){
 let bits='';for(const byte of randomBytes(20))bits+=byte.toString(2).padStart(8,'0');
 return bits.match(/.{5}/g)!.map(chunk=>ALPHABET[parseInt(chunk,2)]).join('');
}
function decode(secret:string){
 let bits='';for(const char of secret)bits+=ALPHABET.indexOf(char).toString(2).padStart(5,'0');
 return Buffer.from(bits.match(/.{8}/g)!.map(chunk=>parseInt(chunk,2)));
}
export function codeAt(secret:string,step:number){
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));
 const mac=createHmac('sha1',decode(secret)).update(counter).digest();
 const offset=mac[19]!&15;
 return String((mac.readUInt32BE(offset)&0x7fffffff)%1_000_000).padStart(6,'0');
}
export const currentStep=(now=Date.now())=>Math.floor(now/30000);
// The matching step, one either side allowed for clock drift, or null.
export function matchStep(secret:string,code:string,now=Date.now()){
 const step=currentStep(now);
 for(const candidate of [step-1,step,step+1])if(codeAt(secret,candidate)===code)return candidate;
 return null;
}
