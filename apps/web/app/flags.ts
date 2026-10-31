// Community accounts (register as a community, verified communities in Home and
// Discover) are hidden for now. The code stays; set NEXT_PUBLIC_COMMUNITY_FLOW=on
// at build time to bring the flow back.
export const communityFlow = process.env.NEXT_PUBLIC_COMMUNITY_FLOW === 'on';
