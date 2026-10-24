import {DiscoveryScreen,emptyDiscovery} from '../discovery/DiscoveryScreen';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,BackHandler,Image,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {randomUUID} from 'expo-crypto';
import {ClientError,type NativeAuthClient} from '../../../../packages/auth-client/src/client';
import {guidelines,type Space,type SpacePost,type SpaceComment} from '../../../../packages/contracts/src/spaces';
import type {OnboardingState} from '../../../../packages/contracts/src/onboarding';
import {copy} from './copy';
import {MemberHomeScreen} from '../home/MemberHomeScreen';
import type {HomeTarget} from '../home/model';
type Screen='home'|'discover'|'space'|'guidelines'|'feed'|'compose'|'detail'|'report'|'events'|'notifications'|'profile';
type Props={client:NativeAuthClient;state:OnboardingState;onLogout:()=>void;onSessionExpired?:()=>void;initialDestination?:{spaceId:string;postId?:string};onDestinationHandled?:()=>void};
const labels={SUPPORT:'Support',RELATE:'I relate',ENCOURAGEMENT:'Encouragement'};
export function SpacesApp({client,state,onLogout,onSessionExpired,initialDestination,onDestinationHandled}:Props){
 const [discoveryFilters,setDiscoveryFilters]=useState(emptyDiscovery);const discoveryReturn=useRef(false);
 const [openingLink,setOpeningLink]=useState(Boolean(initialDestination));const linkHandled=useRef(false);
 const [screen,setScreen]=useState<Screen>('home'),[spaces,setSpaces]=useState<Space[]>([]),[space,setSpace]=useState<Space|null>(null);
 const [posts,setPosts]=useState<SpacePost[]>([]),[selected,setSelected]=useState<SpacePost|null>(null),[comments,setComments]=useState<SpaceComment[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[search,setSearch]=useState('');
 const [accepted,setAccepted]=useState(false),[body,setBody]=useState(''),[anonymous,setAnonymous]=useState(false),[comment,setComment]=useState('');
 const [reportTarget,setReportTarget]=useState<{kind:'posts'|'comments';id:string}|null>(null),[reason,setReason]=useState('HARMFUL_CONTENT');
 const postKey=useRef(randomUUID()),commentKey=useRef(randomUUID()),gate=useRef(false),alive=useRef(true),generation=useRef(0);
 const location=useRef({screen,spaceId:space?.id,postId:selected?.id});location.current={screen,spaceId:space?.id,postId:selected?.id};
 const request=<T,>(path:string,data?:unknown)=>client.memberRequest<T>(path,data===undefined?{}:{method:'POST',body:data});
 const track=(event:string,spaceId?:string)=>{void request('/spaces/analytics',{event,...(spaceId?{spaceId}:{})}).catch(()=>{});};
 const capture=(e:unknown)=>{setError(e instanceof ClientError?e.code:'SERVER_ERROR');};
 const load=useCallback(async()=>{
  const mark=++generation.current,current=location.current;setLoading(true);setError('');
  try{
   // Revalidation always comes from the server; old protected content is hidden while loading/error.
   if(current.screen==='home'||current.screen==='discover'){setLoading(false);return;}
   const list=await client.memberRequest<Space[]>('/spaces');if(!alive.current||mark!==generation.current)return;setSpaces(list);
   if(current.spaceId&&!['home','discover','events','notifications','profile'].includes(current.screen)){
    const fresh=await client.memberRequest<Space>('/spaces/'+current.spaceId);if(mark!==generation.current)return;setSpace(fresh);
    if(['feed','detail','compose'].includes(current.screen)&&fresh.permissions.read){
     const feed=await client.memberRequest<SpacePost[]>('/spaces/'+fresh.id+'/posts');if(mark!==generation.current)return;setPosts(feed);
     if(current.screen==='detail'&&current.postId){
      const p=await client.memberRequest<SpacePost>('/space-posts/'+current.postId);
      const replies=await client.memberRequest<SpaceComment[]>('/space-posts/'+current.postId+'/comments');
      if(mark!==generation.current)return;setSelected(p);setComments(replies);
     }
    }
   }
  }catch(e){if(alive.current&&mark===generation.current)capture(e);}finally{if(alive.current&&mark===generation.current)setLoading(false);}
 },[client]);
 useEffect(()=>{alive.current=true;void load();const sub=AppState.addEventListener('change',s=>{if(s==='active'&&!gate.current)void load();});return()=>{alive.current=false;generation.current++;sub.remove();};},[load]);
 useEffect(()=>{void load();},[screen,space?.id,selected?.id,load]);
 useEffect(()=>{if(screen!=='discover'&&space){const e=({space:'official_space_profile_viewed',guidelines:'official_space_guidelines_viewed',feed:'space_feed_viewed',compose:'post_create_started',report:'content_report_started'} as Partial<Record<Screen,string>>)[screen];if(e)track(e,space.id);}},[screen,space?.id]);
 const go=(next:Screen)=>{generation.current++;setError('');setNotice('');setScreen(next);};
 const back=()=>{
  if(busy)return;
  const next:Screen=screen==='space'&&discoveryReturn.current?'discover':screen==='compose'||screen==='detail'?'feed':screen==='guidelines'||screen==='feed'?'space':screen==='report'?'detail':'home';
  if((screen==='compose'&&body)||(screen==='detail'&&comment))Alert.alert('Keep your draft?','Your draft will stay here while you browse this space.',[{text:'Keep editing',style:'cancel'},{text:'Go back',onPress:()=>go(next)}]);else go(next);
 };
 const backRef=useRef(back);backRef.current=back;
 useEffect(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(location.current.screen==='home')return false;backRef.current();return true;});return()=>sub.remove();},[]);
 const action=async(work:()=>Promise<void>)=>{
  if(gate.current)return;gate.current=true;setBusy(true);setError('');setNotice('');
  try{await work();}catch(e){capture(e);}finally{gate.current=false;if(alive.current)setBusy(false);}
 };
 const openSpace=(s:Space)=>{
  if(space?.id!==s.id){setBody('');setComment('');postKey.current=randomUUID();commentKey.current=randomUUID();}
  setSpace(s);setAccepted(false);track('official_space_card_viewed',s.id);go('space');
 };
 const fromHome=async(target:HomeTarget)=>{
  if('tab' in target){if(target.search!==undefined){setSearch(target.search);setDiscoveryFilters({...emptyDiscovery(),q:target.search});}go(target.tab);if(target.notice)setNotice(target.notice);return;}
  // Revalidate at click time. A stale Home card never grants resource access.
  const fresh=await client.memberRequest<Space>('/spaces/'+target.spaceId);
  if(fresh.status!=='ACTIVE'||['BANNED','RESTRICTED'].includes(fresh.membership)||
   (target.mode!=='space'&&!fresh.permissions.read)||(target.mode==='compose'&&!fresh.permissions.post))throw new ClientError('RESTRICTED_DESTINATION','This destination is no longer available.',403);
  const post=target.postId?await client.memberRequest<SpacePost>('/space-posts/'+target.postId):null;
  if(space?.id!==fresh.id){setBody('');setComment('');postKey.current=randomUUID();commentKey.current=randomUUID();}
  setSpace(fresh);setSelected(post);setAccepted(false);go(target.mode);
 };
 useEffect(()=>{
  if(!loading&&!error&&space?.permissions.read&&['feed','detail'].includes(screen))void request('/home/context',{spaceId:space.id,...(screen==='detail'&&selected?{postId:selected.id}:{})}).catch(()=>{});
 },[loading,error,screen,space?.id,space?.permissions.read,selected?.id]);
 useEffect(()=>{
  if(!initialDestination||linkHandled.current)return;linkHandled.current=true;
  void fromHome({spaceId:initialDestination.spaceId,mode:initialDestination.postId?'detail':'space',...(initialDestination.postId?{postId:initialDestination.postId}:{})})
   .catch(e=>{setScreen('discover');capture(e);}).finally(()=>{setOpeningLink(false);onDestinationHandled?.();});
 },[initialDestination]);
 const button=(text:string,onPress:()=>void,disabled=false,secondary=false)=><Pressable accessibilityRole="button" accessibilityLabel={text} accessibilityState={{disabled:disabled||busy||loading}} disabled={disabled||busy||loading} onPress={onPress} style={[s.button,secondary&&s.secondary,(disabled||busy||loading)&&s.disabled]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{text}</Text></Pressable>;
 const icon=(name:React.ComponentProps<typeof Ionicons>['name'],size=22,color='#b64e31')=><Ionicons name={name} size={size} color={color}/>;
 const title=(text:string)=><Text accessibilityRole="header" style={s.title}>{text}</Text>;
 const note=(text:string)=><Text style={s.body}>{text}</Text>;
 const badge=<View style={s.badge}>{icon('shield-checkmark-outline',14)}<Text style={s.badgeText}>Official Sandar Space</Text></View>;
 const restricted=space&&(space.status==='RESTRICTED'||['RESTRICTED','BANNED'].includes(space.membership));
 const tabs=space&&<View style={s.tabs}>{(['Feed','About','Guidelines'] as const).map((label,i)=><Pressable key={label} accessibilityRole="tab" accessibilityState={{selected:screen===(['feed','space','guidelines'] as Screen[])[i]}} onPress={()=>go((['feed','space','guidelines'] as Screen[])[i])} style={s.tab}><Text style={s.tabText}>{label}</Text></Pressable>)}</View>;
 const contentCard=(p:SpacePost,detail=false)=><View key={p.id} style={s.card}>
  <View style={s.row}>{icon(p.identityMode==='ANNOUNCEMENT'?'people-outline':p.identityMode==='ANONYMOUS'?'person-circle-outline':'person-outline')}<View style={s.flex}><Text style={s.strong}>{p.authorName}</Text><Text style={s.small}>{p.identityMode==='ANNOUNCEMENT'?'Announcement':new Date(p.createdAt).toLocaleDateString('en')}</Text></View></View>
  <Text style={s.post}>{p.body}</Text>
  <View style={s.wrap}>{p.reactions.map(r=><Pressable key={r.type} accessibilityRole="button" accessibilityLabel={labels[r.type]} accessibilityState={{selected:r.selected,disabled:busy}} disabled={busy} onPress={()=>void action(async()=>{const updated=r.selected?await client.memberRequest<SpacePost>('/space-posts/'+p.id+'/reactions/'+r.type,{method:'DELETE'}):await request<SpacePost>('/space-posts/'+p.id+'/reactions',{type:r.type});setPosts(all=>all.map(x=>x.id===p.id?updated:x));if(selected?.id===p.id)setSelected(updated);})} style={[s.chip,r.selected&&s.activeChip]}><Text style={s.chipText}>{labels[r.type]}{r.selected?' · Added':''}</Text></Pressable>)}</View>
  {!detail&&button('Read conversation',()=>{setSelected(p);setComment('');commentKey.current=randomUUID();go('detail');},false,true)}
  {detail&&<View style={s.wrap}>{button('Report',()=>{setReportTarget({kind:'posts',id:p.id});go('report');},false,true)}{p.canBlock&&button('Block member',()=>confirmBlock('posts',p.id),false,true)}</View>}
 </View>;
 const confirmBlock=(kind:'posts'|'comments',id:string)=>Alert.alert('Block this member?','Their posts and comments will be hidden. They will not be notified.',[{text:'Cancel',style:'cancel'},{text:'Block',style:'destructive',onPress:()=>void action(async()=>{await request('/space-'+kind+'/'+id+'/block-author',{});setSelected(null);setComments([]);go('feed');await load();})}]);
 const submitPost=()=>void action(async()=>{
  if(!space)return;const result=await request<{status:string}>('/spaces/'+space.id+'/posts',{requestId:postKey.current,identityMode:anonymous?'ANONYMOUS':'PROFILE',body});
  setBody('');postKey.current=randomUUID();go('feed');await load();setNotice(result.status==='PENDING_REVIEW'?'Your post is awaiting review.':'Your experience has been shared.');
 });
 if(openingLink)return <SafeAreaView style={s.safe}><ActivityIndicator accessibilityLabel="Opening your destination" color="#b64e31"/></SafeAreaView>;
 if(screen==='discover')return <DiscoveryScreen client={client} filters={discoveryFilters} onFilters={setDiscoveryFilters} onNavigate={async target=>{discoveryReturn.current='spaceId' in target;await fromHome(target);}} onExpired={onSessionExpired??onLogout}/>;
 if(screen==='home')return <MemberHomeScreen client={client} onNavigate={fromHome} onLogout={onSessionExpired??onLogout}/>;
 return <SafeAreaView style={s.safe}>
  <View style={s.header}>{String(screen)!=='home'?<Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={s.back}>{icon('arrow-back')}</Pressable>:icon('sunny-outline',26)}<Text style={s.brand}>Sandar</Text><Text style={s.small}>18+</Text></View>
  <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
   {loading?<View style={s.state}><ActivityIndicator color="#b64e31"/>{note('Loading your space…')}</View>:error?<View style={s.state}>{icon(error==='SESSION_INVALID'?'lock-closed-outline':'cloud-offline-outline',40)}{title(error==='SESSION_INVALID'?'Your session has expired':'Something went wrong')}{note(copy.errors[error]??'We could not complete that request. Please try again.')}{error==='SESSION_INVALID'?button('Sign in again',onSessionExpired??onLogout):button('Try again',()=>void load())}{button('Back to spaces',()=>go('home'),false,true)}</View>:<>
    {notice&&<Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
    {['home','discover'].includes(screen)&&<>
     <Text accessibilityRole="header" style={s.homeTitle}>{String(screen)==='home'?'Here for you today.':'Find a support space'}</Text>
     {String(screen)==='home'&&note(`Welcome, ${state.privacy?.displayName??'Member'}.`)}
     <View style={s.search}>{icon('search-outline',18)}<TextInput accessibilityLabel="Search spaces" value={search} onChangeText={setSearch} placeholder="Search spaces or topics" placeholderTextColor="#806b60" style={s.searchInput}/></View>
     {String(screen)==='home'&&<View style={s.participation}><Text style={s.strong}>How would you like to participate today?</Text><View style={s.wrap}>{['Read quietly',"Share what’s on my mind",'Find a support space'].map(label=><Pressable key={label} accessibilityRole="button" onPress={()=>{go('discover');setNotice(label==='Read quietly'?'You can join a space and simply read. Sharing is always optional.':label.startsWith('Share')?'Choose a space before sharing your experience.':'Browse spaces at your own pace.');}} style={s.chip}><Text style={s.chipText}>{label}</Text></Pressable>)}</View></View>}
     <Text style={s.heading}>Official Sandar Spaces</Text>
     {spaces.filter(x=>(x.name+' '+x.topic).toLowerCase().includes(search.toLowerCase())).map(x=><Pressable key={x.id} accessibilityRole="button" accessibilityLabel={x.name} onPress={()=>openSpace(x)} style={s.spaceCard}><Image source={require('../../assets/official-space.png')} accessibilityIgnoresInvertColors style={s.thumbnail}/><View style={s.flex}><Text style={s.strong}>{x.name}</Text>{note(x.purpose)}{badge}<Text style={s.small}>{x.topic} · {x.membership==='JOINED'?'Joined':'Online'}</Text></View>{icon('chevron-forward',18)}</Pressable>)}
     {!spaces.filter(x=>(x.name+' '+x.topic).toLowerCase().includes(search.toLowerCase())).length&&note('No spaces found. Try another topic or return later.')}
     {spaces.some(x=>x.developmentSample)&&note(copy.sample)}
    </>}
    {space&&!['home','discover','profile','events','notifications'].includes(screen)&&(restricted?<View style={s.state}>{icon('lock-closed-outline',42)}{title('This space is temporarily unavailable')}{note('Please check back later, or find another support space.')}{button('Explore other spaces',()=>go('discover'))}</View>:<>
     {screen==='space'&&<Image source={require('../../assets/official-space.png')} style={s.hero} accessibilityLabel="Illustration of adults listening together"/>}
     {screen!=='compose'&&screen!=='report'&&<>{badge}{title(space.name)}{tabs}</>}
     {screen==='space'&&<>
      {note(space.purpose)}<Text style={s.heading}>Who this is for</Text>{note(space.audience)}
      <Text style={s.heading}>What you can do here</Text>{['Read quietly','React supportively','Join conversations','Share an experience','Join events when available'].map(x=><View key={x} style={s.row}>{icon('checkmark-circle-outline',19)}{note(x)}</View>)}
      <View style={s.peach}><Text style={s.strong}>Trust & safety</Text>{note('Operator: '+space.operator)}{note(copy.boundary)}{note('Guidelines and reporting tools are available. Reports enter the review queue.')}{space.developmentSample&&note(copy.sample)}</View>
      {note('Membership: '+space.membership.replace('_',' ').toLowerCase())}
      {space.membership==='JOINED'&&button('Leave space',()=>Alert.alert('Leave this space?','You will lose access to its conversations until you rejoin.',[{text:'Stay',style:'cancel'},{text:'Leave',onPress:()=>void action(async()=>{setSpace(await request<Space>('/spaces/'+space.id+'/leave',{}));setPosts([]);go('space');})}]),false,true)}
     </>}
     {screen==='guidelines'&&<>{title('Community Guidelines')}{note('Help keep this space safe, kind, and supportive for everyone.')}{guidelines.map((g,i)=><View key={g} style={s.guideline}>{icon((['heart-outline','medkit-outline','lock-closed-outline','chatbubble-outline','flag-outline'] as const)[i])}{note(g)}</View>)}{note('Version: '+space.guidelinesVersion)}
      {space.membership!=='JOINED'?<><Pressable accessibilityRole="checkbox" accessibilityLabel="I agree to the guidelines" accessibilityState={{checked:accepted}} onPress={()=>setAccepted(v=>!v)} style={s.row}>{icon(accepted?'checkbox':'square-outline')}{note('I have read and agree to follow these guidelines.')}</Pressable>{button('Join Space',()=>void action(async()=>{setSpace(await request<Space>('/spaces/'+space.id+'/join',{accepted,guidelinesVersion:space.guidelinesVersion}));go('feed');await load();}),!accepted||!space.permissions.join)}</>:button('Return to space',()=>go('feed'))}
     </>}
     {['feed','compose','detail'].includes(screen)&&!space.permissions.read?<>{note('Join this space to read and participate.')}{button('View guidelines',()=>go('guidelines'))}</>:<>
      {screen==='feed'&&<>{!space.permissions.post&&note('Posting is temporarily unavailable.')}{space.permissions.post&&button('Share an experience',()=>go('compose'))}{posts.length?posts.map(p=>contentCard(p)):<View style={s.state}>{icon('leaf-outline',38)}{title('A little room to begin')}{note(copy.empty)}</View>}{button('Refresh conversations',()=>void load(),false,true)}</>}
      {screen==='compose'&&<>{title('Share an experience')}{note('This space is for sharing, supporting, and learning from each other.')}<Text style={s.heading}>Post as</Text><View style={s.wrap}>{button('My name',()=>setAnonymous(false),false,anonymous)}{button('Anonymous',()=>setAnonymous(true),!space.permissions.anonymous||!state.privacy?.allowAnonymousPosting,!anonymous)}</View>{note(anonymous?'Your identity is hidden from ordinary member responses. This does not mean absolute anonymity.':`Shown as ${state.privacy?.displayName}.`)}<TextInput accessibilityLabel="Post text" multiline maxLength={1000} value={body} onChangeText={setBody} placeholder="Share your thoughts, experiences, or questions." style={s.textarea}/><Text style={s.counter}>{body.length}/1000</Text><View style={s.peach}>{note(copy.boundary)}</View>{button('Publish post',submitPost,!body.trim()||!space.permissions.post)}{button('Back to space',back,false,true)}</>}
      {screen==='detail'&&selected&&<>{contentCard(selected,true)}<Text style={s.heading}>Conversation</Text>{comments.map(c=><View key={c.id} style={s.card}><Text style={s.strong}>{c.authorName}</Text>{note(c.body)}<View style={s.wrap}>{button('Report comment',()=>{setReportTarget({kind:'comments',id:c.id});go('report');},false,true)}{c.canBlock&&button('Block commenter',()=>confirmBlock('comments',c.id),false,true)}</View></View>)}{!comments.length&&note('No replies yet. Reading quietly is welcome too.')}{space.permissions.comment?<>{note(`Replies are shown as ${state.privacy?.displayName}.`)}<TextInput accessibilityLabel="Comment text" multiline maxLength={1000} value={comment} onChangeText={setComment} placeholder="Write a supportive reply" style={s.textarea}/>{button('Send reply',()=>void action(async()=>{const r=await request<{status:string}>('/space-posts/'+selected.id+'/comments',{body:comment,requestId:commentKey.current});setComment('');commentKey.current=randomUUID();await load();setNotice(r.status==='PENDING_REVIEW'?'Your reply is awaiting review.':'Reply sent.');}),!comment.trim())}</>:note('Commenting is temporarily unavailable.')}</>}
     </>}
     {screen==='report'&&reportTarget&&<>{title('Report content')}{note('Your identity is not shown to the reported member. Select the main concern.')}{(['HARMFUL_CONTENT','HARASSMENT','PRIVACY','MISINFORMATION','OTHER'] as const).map(r=><Pressable key={r} accessibilityRole="radio" accessibilityLabel={r.replaceAll('_',' ')} accessibilityState={{checked:reason===r}} onPress={()=>setReason(r)} style={s.guideline}>{icon(reason===r?'radio-button-on':'radio-button-off')}{note(r.toLowerCase().replaceAll('_',' '))}</Pressable>)}{button('Submit report',()=>void action(async()=>{await request('/space-'+reportTarget.kind+'/'+reportTarget.id+'/report',{reason});go('detail');setNotice('Report received in the review queue. Thank you for helping keep this space safe.');}))}</>}
    </>)}
    {screen==='events'&&<>{title('Events')}{note('There are no events available in this prototype yet.')}</>}
    {screen==='notifications'&&<>{title('Notifications')}{note('Notification delivery is not available for Spaces yet.')}</>}
    {screen==='profile'&&<>{title(state.privacy?.displayName??'Your profile')}{note('Your onboarding preferences are saved.')}{note('Profile visibility: '+state.privacy?.profileVisibility.toLowerCase())}{button('Sign out',onLogout,false,true)}</>}
   </>}
   {busy&&<ActivityIndicator accessibilityLabel="Saving" color="#b64e31"/>}
  </ScrollView>
  {screen==='space'&&space&&!restricted&&!loading&&!error&&<View style={s.sticky}>{space.permissions.read?button('Open space',()=>go('feed')):button('View guidelines to join',()=>{setAccepted(false);go('guidelines');},!space.permissions.join)}</View>}
  <View style={s.bottom}>{([['home','Home','home-outline'],['discover','Discover','search-outline'],['events','Events','calendar-outline'],['notifications','Notifications','notifications-outline'],['profile','Profile','person-outline']] as const).map(([route,label,name])=><Pressable key={route} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{selected:screen===route}} disabled={busy} onPress={()=>{if((screen==='compose'&&body)||(screen==='detail'&&comment)){Alert.alert('Keep your draft?','Your draft stays in this space. Open another tab?',[{text:'Keep editing',style:'cancel'},{text:'Continue',onPress:()=>go(route)}]);}else go(route);}} style={s.bottomItem}>{icon(name,20,screen===route?'#b64e31':'#746c64')}<Text style={[s.navText,screen===route&&s.navActive]}>{label}</Text></Pressable>)}</View>
 </SafeAreaView>;
}
const s=StyleSheet.create({homeTitle:{fontFamily:'serif',fontSize:23,lineHeight:29,color:'#39291f',marginTop:8,marginBottom:4},participation:{backgroundColor:'#fcebdc',borderRadius:14,padding:12,marginVertical:8,gap:10},sticky:{paddingHorizontal:20,paddingBottom:10,backgroundColor:'#fffaf2'},thumbnail:{width:76,height:105,borderRadius:10},hero:{width:'100%',height:185,borderRadius:16,marginTop:14},safe:{flex:1,backgroundColor:'#fffaf2'},header:{height:58,paddingHorizontal:20,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1,borderColor:'#eddfcf'},brand:{fontFamily:'serif',fontSize:29,color:'#a64529',flex:1},back:{padding:10},page:{padding:20,paddingBottom:36,maxWidth:560,width:'100%',alignSelf:'center'},title:{fontFamily:'serif',fontSize:27,lineHeight:34,color:'#39291f',marginVertical:16},heading:{fontSize:17,fontWeight:'600',color:'#39291f',marginTop:20,marginBottom:12},body:{fontSize:14,lineHeight:22,color:'#625046',marginVertical:6,flexShrink:1},small:{fontSize:11,lineHeight:17,color:'#756359',marginTop:5},strong:{fontSize:15,fontWeight:'600',color:'#39291f'},row:{flexDirection:'row',alignItems:'center',gap:12,marginVertical:6},flex:{flex:1},wrap:{flexDirection:'row',flexWrap:'wrap',gap:8},card:{backgroundColor:'#fffdf8',borderWidth:1,borderColor:'#eadfce',borderRadius:15,padding:16,marginVertical:8},spaceCard:{backgroundColor:'#fffdf8',borderBottomWidth:1,borderColor:'#eadfce',padding:16,borderRadius:14,marginVertical:6,flexDirection:'row',alignItems:'center',gap:12},peach:{backgroundColor:'#fcebdc',borderRadius:14,padding:16,marginVertical:14},badge:{backgroundColor:'#ffe3cb',borderRadius:20,paddingHorizontal:10,paddingVertical:5,flexDirection:'row',alignSelf:'flex-start',alignItems:'center',gap:5,marginTop:8},badgeText:{fontSize:10,color:'#6f3523',fontWeight:'600'},button:{backgroundColor:'#bd5535',paddingHorizontal:18,paddingVertical:14,minHeight:48,borderRadius:24,alignItems:'center',justifyContent:'center',marginTop:12},buttonText:{fontSize:14,fontWeight:'600',color:'#fff'},secondary:{backgroundColor:'transparent',borderWidth:1,borderColor:'#bd5535'},secondaryText:{color:'#a2462c'},disabled:{opacity:.45},chip:{borderRadius:16,backgroundColor:'#f1eade',paddingHorizontal:12,paddingVertical:10,minHeight:40,justifyContent:'center'},activeChip:{backgroundColor:'#ffddc9'},chipText:{fontSize:12,color:'#633d2e'},tabs:{flexDirection:'row',borderBottomWidth:1,borderColor:'#e8d9c8'},tab:{flex:1,padding:14,alignItems:'center'},tabText:{fontSize:13,color:'#633d2e'},guideline:{flexDirection:'row',alignItems:'center',gap:14,padding:12,marginVertical:7,borderRadius:12,backgroundColor:'#f8eee2'},search:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#f2ece3',borderRadius:25,paddingHorizontal:14,marginVertical:12},searchInput:{minHeight:48,flex:1,fontSize:14,color:'#39291f'},textarea:{minHeight:150,borderWidth:1,borderColor:'#dfcdbb',borderRadius:12,padding:14,fontSize:15,lineHeight:23,color:'#39291f',textAlignVertical:'top',backgroundColor:'#fffdf8',marginTop:16},counter:{fontSize:12,color:'#756359',textAlign:'right',marginTop:6},post:{fontSize:15,lineHeight:24,color:'#39291f',marginVertical:16},state:{padding:22,marginTop:28,alignItems:'center'},notice:{padding:14,backgroundColor:'#e7eedf',borderRadius:12,color:'#375739',lineHeight:21},bottom:{flexDirection:'row',backgroundColor:'#fffdf8',borderTopWidth:1,borderColor:'#eadfce',paddingTop:10,paddingBottom:8},bottomItem:{flex:1,alignItems:'center',gap:5,minHeight:48},navText:{fontSize:9,color:'#625046'},navActive:{color:'#a2462c',fontWeight:'700'}});
