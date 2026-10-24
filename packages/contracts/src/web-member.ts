// Member endpoints the browser may reach through its cookie. Each entry is a
// method and a path pattern below /v1; anything else is a 404. Posting and
// commenting are deliberately absent until moderation is staffed.
const id = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const memberRoutes: [string, RegExp][] = [
  ['GET', /^users\/me$/],
  ['GET', /^users\/me\/onboarding$/],
  ['GET', /^locations\/countries$/],
  ['GET', /^locations\/cities$/],
  ['POST', /^users\/me\/onboarding\/(analytics|complete)$/],
  ['PATCH', /^users\/me\/onboarding\/(progress|age|boundaries)$/],
  ['PATCH', /^users\/me\/(location|interests|participation|community-format|preferences|privacy)$/],
  ['GET', /^home$/],
  ['POST', /^home\/(visits|context|analytics)$/],
  ['POST', /^discovery\/(search|analytics)$/],
  ['GET', /^spaces$/],
  ['POST', /^spaces\/analytics$/],
  ['GET', new RegExp(`^spaces/${id}(/posts)?$`)],
  ['POST', new RegExp(`^spaces/${id}/(join|leave)$`)],
  ['GET', new RegExp(`^space-posts/${id}(/comments)?$`)],
  ['POST', new RegExp(`^space-posts/${id}/reactions$`)],
  ['DELETE', new RegExp(`^space-posts/${id}/reactions/(SUPPORT|RELATE|ENCOURAGEMENT)$`)],
  ['POST', new RegExp(`^space-(posts|comments)/${id}/(report|block-author)$`)],
  ['GET', /^community-applications\/me$/]
];
export function memberRouteAllowed(method: string, path: string) {
  return memberRoutes.some(([m, pattern]) => m === method && pattern.test(path));
}
