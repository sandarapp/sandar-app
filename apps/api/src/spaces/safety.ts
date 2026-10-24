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
