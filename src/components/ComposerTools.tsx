import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, Image as Gallery, Mic, Square, X } from 'lucide-react-native';
import { NO_IMAGES } from '../model/attachment';
import { colors, radius, space, type } from '../theme';
import { IconButton } from './ui';

export function ComposerTools({
  listening,
  onMic,
  onPick,
  images,
  imageUri,
  onRemoveImage,
  disabled,
}: {
  listening: boolean;
  onMic: () => void;
  onPick: (source: 'gallery' | 'camera') => void;
  images: boolean;
  imageUri: string | null;
  onRemoveImage: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <IconButton icon={listening ? Square : Mic} label={listening ? 'Stop dictating' : 'Dictate'} onPress={onMic} color={listening ? colors.brand : colors.muted} disabled={disabled} />
      {images ? (
        <>
          <IconButton icon={Gallery} label="Attach from gallery" onPress={() => onPick('gallery')} color={colors.muted} disabled={disabled} />
          <IconButton icon={Camera} label="Take a photo" onPress={() => onPick('camera')} color={colors.muted} disabled={disabled} />
        </>
      ) : (
        <Text style={[type.caption, styles.noImages]}>{NO_IMAGES}</Text>
      )}
      {imageUri ? (
        <View style={styles.thumb}>
          <Image source={{ uri: imageUri }} style={styles.image} accessibilityLabel="Attached image" />
          <Pressable accessibilityRole="button" accessibilityLabel="Remove image" onPress={onRemoveImage} hitSlop={8} style={styles.remove}>
            <X size={16} color={colors.fg} strokeWidth={3} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.sm },
  noImages: { flex: 1, marginLeft: space.sm },
  thumb: { marginLeft: space.sm, width: 44, height: 44 },
  image: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.bgSunken },
  remove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
});
