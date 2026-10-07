import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Bot, ChevronRight, LucideIcon, SquareTerminal, TriangleAlert } from 'lucide-react-native';
import { Pane, Status } from '../model/workspaces';
import { haptic, pillFade, prefersReducedMotion } from '../services/motion';
import { colors, radius, space, type } from '../theme';

export const ROW_INSET = space.lg;
export const TILE_INSET = space.lg + 36 + space.md;

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
      style={({ pressed }) => [
        styles.row,
        subtitle ? styles.rowTall : null,
        pressed && Platform.OS === 'ios' && styles.rowPressed,
      ]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.rowText}>
        <Text style={[type.body, disabled && styles.dim]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[mono ? type.mono : type.caption, styles.subtitle, disabled && styles.dim]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {onPress ? <ChevronRight size={16} color={colors.dim} strokeWidth={2.25} style={styles.chevron} /> : null}
    </Pressable>
  );
}

export function Group({ children, inset = ROW_INSET, style }: { children: React.ReactNode; inset?: number; style?: ViewStyle }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, style]}>
      {items.map((child, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <View style={[styles.line, { marginLeft: inset }]} /> : null}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

export function GroupItem({ first, last, children }: { first: boolean; last: boolean; children: React.ReactNode }) {
  return <View style={[styles.groupItem, first && styles.groupFirst, last && styles.groupLast]}>{children}</View>;
}

export function Divider({ inset = ROW_INSET }: { inset?: number }) {
  return (
    <View style={styles.groupItem}>
      <View style={[styles.line, { marginLeft: inset }]} />
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
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
      <Text style={[type.label, styles.sectionTitle, tone === 'attn' && { color: colors.attn }]} numberOfLines={1}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}

export function Badge({ text, tone = 'attn' }: { text: string; tone?: 'attn' | 'brand' }) {
  return (
    <View style={[styles.badge, { backgroundColor: tone === 'attn' ? colors.attnSoft : colors.brandSoft }]}>
      <Text style={[type.captionStrong, { color: tone === 'attn' ? colors.attn : colors.brand }]}>{text}</Text>
    </View>
  );
}

const TILE_TONES = {
  neutral: { bg: colors.surfaceHigh, fg: colors.fg },
  brand: { bg: colors.brandSoft, fg: colors.brand },
  attn: { bg: colors.attnSoft, fg: colors.attn },
  ghost: { bg: 'transparent', fg: colors.dim },
};

export function IconTile({
  icon: Icon,
  tone = 'neutral',
  size = 'md',
}: {
  icon: LucideIcon;
  tone?: keyof typeof TILE_TONES;
  size?: 'md' | 'lg';
}) {
  const palette = TILE_TONES[tone];
  return (
    <View
      style={[
        styles.tile,
        size === 'lg' && styles.tileLarge,
        { backgroundColor: palette.bg },
        tone === 'ghost' && styles.tileGhost,
      ]}
    >
      <Icon size={size === 'lg' ? 28 : 18} color={palette.fg} strokeWidth={size === 'lg' ? 1.75 : 2} />
    </View>
  );
}

export function terminalIcon(pane: Pane): LucideIcon {
  return pane.agent && pane.agent !== 'other' ? Bot : SquareTerminal;
}

const PILL_TONES = {
  attn: { fg: colors.attn, dot: colors.attn },
  brand: { fg: colors.brand, dot: colors.brand },
  muted: { fg: colors.muted, dot: colors.dim },
};

export function StatusPill({ status }: { status: Status }) {
  const tone = PILL_TONES[status.tone];
  const opacity = useRef(new Animated.Value(1)).current;
  const shown = useRef(status.text);
  useEffect(() => {
    if (shown.current === status.text) return;
    shown.current = status.text;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: pillFade(), useNativeDriver: true }).start();
  }, [status.text, opacity]);
  return (
    <Animated.View style={[styles.pill, status.tone === 'attn' && styles.pillAttn, { opacity }]}>
      <View style={[styles.pillDot, { backgroundColor: tone.dot }]} />
      <Text style={[type.captionStrong, { color: tone.fg }]}>{status.text}</Text>
    </Animated.View>
  );
}

const BUTTON_PALETTE = {
  filled: { bg: colors.brand, fg: colors.onBrand },
  tonal: { bg: colors.surfaceHigh, fg: colors.fg },
  text: { bg: 'transparent', fg: colors.brand },
  danger: { bg: colors.attnSoft, fg: colors.attn },
};

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
  variant?: keyof typeof BUTTON_PALETTE;
  compact?: boolean;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const palette = BUTTON_PALETTE[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={loading ? { busy: true, disabled: true } : disabled ? { disabled: true } : undefined}
      disabled={disabled || loading}
      onPress={() => (tap(), onPress())}
      android_ripple={{ color: colors.ripple, foreground: true }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        variant === 'text' && styles.buttonText,
        { backgroundColor: palette.bg, opacity: disabled ? 0.4 : pressed && Platform.OS === 'ios' ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {Icon ? <Icon size={compact ? 16 : 18} color={palette.fg} strokeWidth={2.25} /> : null}
          <Text style={[compact ? type.label : type.headline, { color: palette.fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const ICON_BUTTON = {
  plain: { bg: 'transparent', fg: colors.fg, size: 44 },
  tonal: { bg: colors.surfaceHigh, fg: colors.fg, size: 36 },
  filled: { bg: colors.brand, fg: colors.onBrand, size: 40 },
};

export function IconButton({
  icon: Icon,
  label,
  onPress,
  color,
  variant = 'plain',
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  color?: string;
  variant?: keyof typeof ICON_BUTTON;
  disabled?: boolean;
}) {
  const look = ICON_BUTTON[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={disabled ? { disabled } : undefined}
      disabled={disabled}
      onPress={() => (tap(), onPress())}
      android_ripple={{ color: colors.ripple, borderless: variant === 'plain', radius: look.size / 2, foreground: true }}
      hitSlop={(48 - look.size) / 2}
      style={({ pressed }) => [
        styles.iconButton,
        { width: look.size, height: look.size, backgroundColor: look.bg },
        pressed && Platform.OS === 'ios' && { opacity: 0.7 },
      ]}
    >
      <Icon size={variant === 'plain' ? 22 : 18} color={color ?? look.fg} strokeWidth={2.25} />
    </Pressable>
  );
}

export function HeaderTitle({ title, subtitle, mono }: { title: string; subtitle?: React.ReactNode; mono?: boolean }) {
  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={type.headline} numberOfLines={1}>
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
      <TriangleAlert size={16} color={colors.brand} strokeWidth={2.25} style={styles.warningIcon} />
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyMuted, { color: colors.brand }]}>{text}</Text>
        {actions ? <View style={styles.warningActions}>{actions}</View> : null}
      </View>
    </View>
  );
}

export function Empty({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <View style={styles.empty}>
      {icon ? <View style={styles.emptyIcon}><IconTile icon={icon} size="lg" /></View> : null}
      <Text style={[type.headline, styles.center]}>{title}</Text>
      <Text style={[type.bodyMuted, styles.center, { marginTop: space.xs }]}>{body}</Text>
      {action ? <View style={{ marginTop: space.xl }}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.brand} />
      {label ? <Text style={[type.bodyMuted, { marginTop: space.md }]}>{label}</Text> : null}
    </View>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);
  return (
    <Animated.View style={{ opacity }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <View style={styles.section}>
        <View style={[styles.bar, { width: 96 }]} />
      </View>
      <Group>
        {Array.from({ length: rows }, (_, index) => (
          <View key={index} style={[styles.row, styles.rowTall]}>
            <View style={styles.rowText}>
              <View style={[styles.bar, { width: `${60 - index * 8}%` }]} />
              <View style={[styles.bar, styles.barSmall, { width: `${40 + index * 6}%` }]} />
            </View>
            <View style={[styles.bar, { width: 56 }]} />
          </View>
        ))}
      </Group>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowTall: { minHeight: 64 },
  rowPressed: { backgroundColor: colors.surfacePressed },
  leading: { marginRight: space.md },
  rowText: { flex: 1, justifyContent: 'center' },
  subtitle: { marginTop: 2 },
  dim: { color: colors.dim },
  trailing: { marginLeft: space.md, alignItems: 'flex-end' },
  chevron: { marginLeft: space.sm, marginRight: -space.xs },
  group: {
    marginHorizontal: space.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  groupItem: { marginHorizontal: space.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  groupFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  groupLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  line: { height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong },
  card: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.lg + space.xs,
    paddingTop: space.xl,
    paddingBottom: space.sm,
  },
  sectionTitle: { flexShrink: 1, color: colors.muted },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLarge: { width: 64, height: 64, borderRadius: radius.xl },
  tileGhost: { borderWidth: 1, borderColor: colors.lineStrong, borderStyle: 'dashed' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24 },
  pillAttn: { backgroundColor: colors.attnSoft, borderRadius: radius.full, paddingHorizontal: space.sm },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  button: {
    minHeight: 48,
    borderRadius: radius.full,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    overflow: 'hidden',
  },
  buttonCompact: { minHeight: 36, paddingHorizontal: space.lg, gap: 6 },
  buttonText: { paddingHorizontal: space.md },
  iconButton: { borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  warning: { flexDirection: 'row', paddingHorizontal: space.lg + space.xs, paddingTop: space.md },
  warningIcon: { marginTop: 2, marginRight: space.sm },
  warningActions: { flexDirection: 'row', flexWrap: 'wrap', marginLeft: -space.md, marginTop: space.xs },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  emptyIcon: { marginBottom: space.lg },
  center: { textAlign: 'center' },
  bar: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceHigh },
  barSmall: { height: 8, marginTop: space.sm },
});
