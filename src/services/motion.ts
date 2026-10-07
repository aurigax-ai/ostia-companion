import { AccessibilityInfo, LayoutAnimation } from 'react-native';
import * as Haptics from 'expo-haptics';
import { HapticEvent, hapticFor, listAnimation, pillFadeMs } from '../model/motion';
import { getPrefs } from './prefsStore';

let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled().then((value) => (reduceMotion = value));
AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => (reduceMotion = value));

export function animateNextLayout(): void {
  const config = listAnimation(reduceMotion);
  if (config) LayoutAnimation.configureNext(config);
}

export function slideMs(): number {
  return reduceMotion ? 0 : 200;
}

export function pillFade(): number {
  return pillFadeMs(reduceMotion);
}

export function haptic(event: HapticEvent): void {
  const kind = hapticFor(event, getPrefs());
  if (kind === 'selection') void Haptics.selectionAsync();
  else if (kind === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (kind === 'warning') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}
