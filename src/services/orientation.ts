import * as ScreenOrientation from 'expo-screen-orientation';

export const lockLandscape = () => ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);

export const lockPortrait = () => ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
