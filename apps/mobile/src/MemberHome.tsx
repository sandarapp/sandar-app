import React from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {OnboardingState} from '../../../packages/contracts/src/onboarding';
export function MemberHome({state,onLogout}:{state:OnboardingState;onLogout:()=>void}){
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
  <Text style={s.brand}>Sandar</Text><Text style={s.kicker}>MEMBER HOME</Text>
  <View style={s.welcome}><Text accessibilityRole="header" style={s.title}>Welcome, {state.privacy?.displayName}.</Text><Text style={s.body}>A little space for a kinder day.</Text></View>
  <View style={s.card}><Text style={s.heading}>You’re all set</Text><Text style={s.body}>Your onboarding is complete and your preferences are saved.</Text><Text style={s.body}>There are no community recommendations to show yet. Take your time — you belong here.</Text></View>
  <View style={s.card}><Text style={s.heading}>Your privacy comes first</Text><Text style={s.body}>Profile: {state.privacy?.profileVisibility==='HIDDEN'?'hidden':'visible to members'}</Text><Text style={s.body}>Directory: {state.privacy?.directoryVisibility==='HIDDEN'?'hidden':'display name only'}</Text><Text style={s.body}>Location: {state.location?.city ? `${state.location.city}, ${state.location.country}`:'not shared'}</Text></View>
  <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={onLogout} style={s.button}><Text style={s.buttonText}>Sign out</Text></Pressable>
  <Text style={s.footer}>Real people. Brighter days.</Text>
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#fffaf5'},page:{padding:24,paddingBottom:42,maxWidth:560,width:'100%',alignSelf:'center'},brand:{fontFamily:'serif',fontSize:36,color:'#512b26',marginBottom:24},kicker:{fontSize:11,letterSpacing:1.4,color:'#9f4938',marginBottom:14},welcome:{backgroundColor:'#f9dfd1',padding:24,borderRadius:20,marginBottom:22},title:{fontFamily:'serif',fontSize:30,lineHeight:36,color:'#512b26',marginBottom:8},body:{fontSize:15,lineHeight:23,color:'#6b534b',marginVertical:5},card:{padding:20,backgroundColor:'#f8efe7',borderRadius:16,marginBottom:18},heading:{fontSize:18,fontWeight:'600',color:'#512b26',marginBottom:8},button:{borderWidth:1,borderColor:'#b65440',borderRadius:12,minHeight:50,padding:14,alignItems:'center'},buttonText:{color:'#9f4938',fontWeight:'600'},footer:{fontFamily:'serif',color:'#6b534b',fontSize:14,textAlign:'center',marginTop:28}});
