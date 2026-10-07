import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Check, ChevronRight, CircleAlert, LoaderCircle, LucideIcon, TriangleAlert, X } from 'lucide-react-native';
import { Status } from '../model/workspaces';
import { haptic, pillFade } from '../services/motion';
import { colors, type } from '../theme';

export function tap() {
  haptic('tap');
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  mono,
  disabled,
}: {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={disabled ? { disabled } : undefined}
      onPress={onPress ? () => (tap(), onPress()) : undefined}
      android_ripple={onPress ? { color: colors.ripple } : undefined}
      style={({ pressed }) => [styles.row, pressed && Platform.OS === 'ios' && styles.rowPressed]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.rowText}>
        <Text style={[type.body, disabled && styles.dim]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[mono ? type.mono : type.bodyMuted, styles.subtitle, disabled && styles.dim]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {onPress ? <ChevronRight size={18} color={colors.dim} style={styles.chevron} /> : null}
    </Pressable>
  );
}

export function SectionHeader({
  title,
  tone = 'muted',
  trailing,
}: {
  title: string;
  tone?: 'muted' | 'attn';
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[type.overline, tone === 'attn' && { color: colors.attn }]}>{title}</Text>
      {trailing}
    </View>
  );
}

export function Divider({ inset = 16 }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

export function IconTile({ icon: Icon, tone = 'neutral' }: { icon: LucideIcon; tone?: 'neutral' | 'brand' | 'ghost' }) {
  return (
    <View style={[styles.tile, tone === 'ghost' && styles.tileGhost]}>
      <Icon size={20} color={tone === 'brand' ? colors.brand : tone === 'ghost' ? colors.dim : colors.fg} />
    </View>
  );
}

const PILL_TONES = {
  attn: { fg: colors.attn, bg: colors.attnSoft },
  brand: { fg: colors.brand, bg: colors.brandSoft },
  muted: { fg: colors.muted, bg: colors.surfaceHigh },
};

const PILL_ICONS: Record<Status['kind'], LucideIcon | null> = {
  waiting: CircleAlert,
  error: X,
  running: LoaderCircle,
  done: Check,
  idle: null,
};

export function StatusPill({ status }: { status: Status }) {
  const tone = PILL_TONES[status.tone];
  const Icon = PILL_ICONS[status.kind];
  const opacity = useRef(new Animated.Value(1)).current;
  const shown = useRef(status.text);
  useEffect(() => {
    if (shown.current === status.text) return;
    shown.current = status.text;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: pillFade(), useNativeDriver: true }).start();
  }, [status.text, opacity]);
  return (
    <Animated.View style={[styles.pill, { backgroundColor: tone.bg, opacity }]}>
      {Icon ? <Icon size={12} color={tone.fg} strokeWidth={3} /> : null}
      <Text style={[type.caption, styles.pillText, { color: tone.fg }]}>{status.text}</Text>
    </Animated.View>
  );
}

export function Button({
  label,
  onPress,
  icon: Icon,
  variant = 'filled',
  compact,
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: 'filled' | 'tonal' | 'text' | 'danger';
  compact?: boolean;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const palette = {
    filled: { bg: colors.brand, fg: colors.onBrand },
    tonal: { bg: colors.surfaceHigh, fg: colors.fg },
    text: { bg: 'transparent', fg: colors.brand },
    danger: { bg: colors.attnSoft, fg: colors.attn },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => (tap(), onPress())}
      android_ripple={{ color: colors.ripple, foreground: true }}
      style={[
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: palette.bg, opacity: disabled ? 0.4 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {Icon ? <Icon size={18} color={palette.fg} style={{ marginRight: 8 }} /> : null}
          <Text style={[compact ? type.label : styles.buttonLabel, { color: palette.fg }]}>{label}</Text>
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

export function HeaderTitle({ title, subtitle, mono }: { title: string; subtitle?: React.ReactNode; mono?: boolean }) {
  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        typeof subtitle === 'string' ? (
          <Text style={mono ? type.mono : type.caption} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : (
          subtitle
        )
      ) : null}
    </View>
  );
}

export function Warning({ text, actions }: { text: string; actions?: React.ReactNode }) {
  return (
    <View style={styles.warning} accessibilityRole="alert">
      <TriangleAlert size={18} color={colors.brand} style={styles.warningIcon} />
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyMuted, { color: colors.brand }]}>{text}</Text>
        {actions ? <View style={styles.warningActions}>{actions}</View> : null}
      </View>
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={[type.body, styles.emptyTitle]}>{title}</Text>
      <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: 8 }]}>{body}</Text>
      {action ? <View style={{ marginTop: 24 }}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.empty}>
      <ActivityIndicator size="large" color={colors.brand} />
      {label ? <Text style={[type.bodyMuted, { marginTop: 16 }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowPressed: { backgroundColor: colors.ripple },
  leading: { marginRight: 16 },
  rowText: { flex: 1, justifyContent: 'center' },
  subtitle: { marginTop: 2 },
  dim: { color: colors.dim },
  trailing: { marginLeft: 12, alignItems: 'flex-end' },
  chevron: { marginLeft: 8, marginRight: -4 },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  tileGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pillText: { fontWeight: '600' },
  button: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonCompact: { minHeight: 40, borderRadius: 20, paddingHorizontal: 16 },
  buttonLabel: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.fg },
  warning: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12 },
  warningIcon: { marginTop: 1, marginRight: 12 },
  warningActions: { flexDirection: 'row', flexWrap: 'wrap', marginLeft: -16, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontWeight: '600', textAlign: 'center' },
});
