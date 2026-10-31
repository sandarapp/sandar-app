export interface SafetyResult {classification:'SAFE'|'NORMAL_DISTRESS'|'SENSITIVE'|'HARMFUL_DETAIL'|'HIGH_CONCERN'|'PROHIBITED';requiredAction:'ALLOW'|'ALLOW_WITH_WARNING'|'REQUIRE_EDIT'|'BLOCK'|'ESCALATE';reasons:string[];requiresHumanReview:boolean;}
export interface SafetyClassifier {classify(text:string):Promise<SafetyResult>;}
/** Development adapter: no automated clinical assessment or keyword blocking. Not production screening. */
export class DevelopmentSafetyClassifier implements SafetyClassifier {
 async classify():Promise<SafetyResult>{return {classification:'SAFE',requiredAction:'ALLOW',reasons:['DEVELOPMENT_UNSCREENED'],requiresHumanReview:false};}
}
/**
 * Launch adapter: no automated judgement at all. Every post or comment is held
 * for a human moderator before anyone sees it. Posting is closed at launch, so
 * this is the backstop if a space is opened before a reviewed classifier exists.
 */
export class HumanReviewSafetyClassifier implements SafetyClassifier {
 async classify():Promise<SafetyResult>{return {classification:'SENSITIVE',requiredAction:'ESCALATE',reasons:['HUMAN_REVIEW_REQUIRED'],requiresHumanReview:true};}
}
/**
 * Self-harm phrase filter. Text that mentions wanting to die, suicide or
 * self-harm (Indonesian, common slang, English) is not published: the member
 * is shown crisis resources instead. Everything else is published at once and
 * stays reportable. A phrase list, not a clinical assessment.
 */
const selfHarmPhrases = [
 // Indonesian and slang
 'bunuh diri','bundir','bunuhdiri','ingin mati','pengen mati','pengin mati','pingin mati','mau mati aja','pengen mati aja','mending mati','lebih baik mati','lebih baik aku mati',
 'pengen mengakhiri hidup','ingin mengakhiri hidup','mengakhiri hidup','akhiri hidup','akhiri hidupku','nggak mau hidup lagi','gak mau hidup lagi','ga mau hidup lagi','tidak mau hidup lagi','tidak ingin hidup lagi',
 'menyakiti diri','melukai diri','nyakitin diri','sakitin diri','menyayat tangan','sayat tangan','silet tangan','barcode tangan','gantung diri','minum racun',
 // English
 'suicide','suicidal','kill myself','killing myself','end my life','ending my life','want to die','wanna die','better off dead','self harm','selfharm','self-harm','hurt myself','hurting myself','cut myself','cutting myself','take my own life','no reason to live'
];
// Lower case, no accents, letters repeated three or more times collapsed, common digit swaps undone.
export function normaliseForSafety(text:string){
 return text.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase()
  .replace(/[0134578@$]/g,c=>({'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','8':'b','@':'a','$':'s'} as Record<string,string>)[c]!)
  .replace(/([a-z])\1{2,}/g,'$1').replace(/[^a-z\s-]/g,' ').replace(/\s+/g,' ').trim();
}
export class SelfHarmPhraseClassifier implements SafetyClassifier {
 async classify(text:string):Promise<SafetyResult>{
  const plain=` ${normaliseForSafety(text)} `;
  // Whole words only, so "lagu yang menyayat hati" or "mati lampu" pass.
  if(selfHarmPhrases.some(phrase=>plain.includes(` ${phrase} `)))return {classification:'HIGH_CONCERN',requiredAction:'BLOCK',reasons:['SELF_HARM_LANGUAGE'],requiresHumanReview:false};
  return {classification:'SAFE',requiredAction:'ALLOW',reasons:['PHRASE_FILTER_PASSED'],requiresHumanReview:false};
 }
}
