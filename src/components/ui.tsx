import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LucideIcon } from 'lucide-react-native';
import { colors, type } from '../theme';

export function tap() {
  void Haptics.selectionAsync();
}

export function ListRow({
  title,
  subtitle,
  overline,
  leading,
  trailing,
  onPress,
  mono,
}: {
  title: string;
  subtitle?: string;
  overline?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  mono?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress ? () => (tap(), onPress()) : undefined}
      android_ripple={onPress ? { color: colors.ripple } : undefined}
      style={({ pressed }) => [styles.row, pressed && Platform.OS === 'ios' && styles.rowPressed]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.rowText}>
        {overline ? (
          <Text style={type.caption} numberOfLines={1}>
            {overline}
          </Text>
        ) : null}
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={mono ? type.mono : type.bodyMuted} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Pressable>
  );
}

export function SectionHeader({ title, tone = 'muted' }: { title: string; tone?: 'muted' | 'attn' }) {
  return (
    <Text style={[styles.section, { color: tone === 'attn' ? colors.attnFg : colors.muted }]}>{title}</Text>
  );
}

export function Divider({ inset = 72 }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

export function Avatar({
  icon: Icon,
  letter,
  tone = 'neutral',
}: {
  icon?: LucideIcon;
  letter?: string;
  tone?: 'neutral' | 'brand' | 'attn';
}) {
  const background = tone === 'brand' ? colors.brandSoft : tone === 'attn' ? colors.attnSoft : colors.surfaceHigh;
  const foreground = tone === 'brand' ? colors.brand : tone === 'attn' ? colors.attnFg : colors.fg;
  return (
    <View style={[styles.avatar, { backgroundColor: background }]}>
      {Icon ? (
        <Icon size={20} color={foreground} />
      ) : (
        <Text style={[styles.avatarLetter, { color: foreground }]}>{letter?.slice(0, 1).toUpperCase()}</Text>
      )}
    </View>
  );
}

export function Button({
  label,
  onPress,
  icon: Icon,
  variant = 'filled',
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: 'filled' | 'tonal' | 'text' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const palette = {
    filled: { bg: colors.brand, fg: colors.onBrand },
    tonal: { bg: colors.surfaceHigh, fg: colors.fg },
    text: { bg: 'transparent', fg: colors.brand },
    danger: { bg: colors.attnSoft, fg: colors.attnFg },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => (tap(), onPress())}
      android_ripple={{ color: colors.ripple, foreground: true }}
      style={[styles.button, { backgroundColor: palette.bg, opacity: disabled ? 0.4 : 1 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {Icon ? <Icon size={18} color={palette.fg} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.buttonLabel, { color: palette.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function HeaderIcon({ icon: Icon, label, onPress, color = colors.fg }: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => (tap(), onPress())}
      android_ripple={{ color: colors.ripple, borderless: true, radius: 22 }}
      hitSlop={8}
      style={styles.headerIcon}
    >
      <Icon size={22} color={color} />
    </Pressable>
  );
}

export function Notice({
  text,
  tone = 'warn',
  actions,
}: {
  text: string;
  tone?: 'warn' | 'attn';
  actions?: React.ReactNode;
}) {
  return (
    <View style={styles.notice}>
      <Text style={[type.bodyMuted, { color: tone === 'attn' ? colors.attnFg : colors.warn }]}>{text}</Text>
      {actions ? <View style={styles.noticeActions}>{actions}</View> : null}
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={[type.title, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: 8 }]}>{body}</Text>
      {action ? <View style={{ marginTop: 24 }}>{action}</View> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.empty}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowPressed: { backgroundColor: colors.ripple },
  leading: { marginRight: 16 },
  rowText: { flex: 1, justifyContent: 'center' },
  rowTitle: { fontSize: 16, lineHeight: 22, fontWeight: '500', color: colors.fg },
  trailing: { marginLeft: 12, alignItems: 'flex-end' },
  section: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 17, fontWeight: '600' },
  button: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  notice: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  noticeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
