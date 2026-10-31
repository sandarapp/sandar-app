// Member endpoints the browser may reach through its cookie. Each entry is a
// method and a path pattern below /v1; anything else is a 404. Members can post
// and comment where a space allows it; the phrase filter screens both.
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
  ['POST', new RegExp(`^spaces/${id}/posts$`)],
  ['POST', new RegExp(`^space-posts/${id}/comments$`)],
  ['GET', new RegExp(`^space-posts/${id}(/comments)?$`)],
  ['POST', new RegExp(`^space-posts/${id}/reactions$`)],
  ['DELETE', new RegExp(`^space-posts/${id}/reactions/(SUPPORT|RELATE|ENCOURAGEMENT)$`)],
  ['POST', new RegExp(`^space-(posts|comments)/${id}/(report|block-author)$`)],
  ['GET', /^mood(\/export)?$/],
  ['POST', /^mood$/],
  ['PATCH', /^mood\/settings$/],
  ['DELETE', /^mood$/],
  ['POST', /^feedback$/],
  ['GET', /^interest\/events$/],
  ['POST', /^interest\/events$/],
  ['GET', /^notifications$/],
  ['POST', /^notifications\/seen$/],
  ['GET', /^spaces\/mine$/],
  ['GET', /^me\/profile$/],
  ['PATCH', /^me\/profile$/],
  ['GET', /^member-spaces\/mine$/],
  ['POST', /^member-spaces$/],
  ['PATCH', new RegExp(`^member-spaces/${id}$`)],
  ['GET', /^community-applications\/me$/],
  ['PATCH', /^settings\/(privacy|preferences|location)$/],
  ['POST', /^settings\/(password|sessions\/revoke-others)$/],
  ['GET', /^settings\/blocks$/],
  ['POST', /^settings\/blocks\/[0-9a-f]{32}\/unblock$/],
  ['GET', /^moderation\/(me|queue)$/],
  ['POST', new RegExp(`^moderation/posts/${id}/decision$`)],
  ['POST', new RegExp(`^moderation/reports/${id}/dismiss$`)],
  ['POST', new RegExp(`^moderation/spaces/${id}/decision$`)]
];
export function memberRouteAllowed(method: string, path: string) {
  return memberRoutes.some(([m, pattern]) => m === method && pattern.test(path));
}
