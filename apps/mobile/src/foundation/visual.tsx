import React, {createContext, useContext, useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, type PressableProps} from 'react-native';

const MotionContext = createContext(true);
export function MotionPreference({children}: React.PropsWithChildren) {
  // Start conservatively while the native preference is being read.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);
  return <MotionContext.Provider value={reduced}>{children}</MotionContext.Provider>;
}
export function Tactile({children, style, primary = false, ...props}: PressableProps & {primary?: boolean}) {
  const reduced = useContext(MotionContext);
  const scale = useRef(new Animated.Value(1)).current;
  const [focused, setFocused] = useState(false);
  const move = (value: number) => {
    scale.stopAnimation();
    Animated.timing(scale, {toValue: reduced ? 1 : value, duration: reduced ? 0 : 140, easing: Easing.out(Easing.quad), useNativeDriver: true}).start();
  };
  useEffect(() => { if (reduced) { scale.stopAnimation(); scale.setValue(1); } }, [reduced, scale]);
  return <Animated.View style={{transform: [{scale}]}}><Pressable {...props}
    onPressIn={event => { move(.98); props.onPressIn?.(event); }}
    onPressOut={event => { move(1); props.onPressOut?.(event); }}
    onFocus={event => { setFocused(true); props.onFocus?.(event); }}
    onBlur={event => { setFocused(false); props.onBlur?.(event); }}
    style={state => [typeof style === 'function' ? style(state) : style, state.pressed && !props.disabled && (primary ? styles.primaryPressed : styles.pressed), focused && styles.focus]}>{children}</Pressable></Animated.View>;
}
export function Reveal({children, delay = 0, success = false}: React.PropsWithChildren<{delay?: number; success?: boolean}>) {
  const reduced = useContext(MotionContext);
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) { progress.stopAnimation(); progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, {toValue: 1, duration: 240, delay, easing: Easing.out(Easing.quad), useNativeDriver: true});
    animation.start();
    return () => animation.stop();
  }, [reduced, progress, delay]);
  return <Animated.View style={{opacity: progress, transform: [{scale: progress.interpolate({inputRange: [0, 1], outputRange: [success ? .85 : 1, 1]})}]}}>{children}</Animated.View>;
}
const styles = StyleSheet.create({pressed: {backgroundColor: '#fce8d8'}, primaryPressed: {backgroundColor: '#984126'}, focus: {outlineColor: '#a4472a', outlineWidth: 2, outlineOffset: 3}});
