import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LucideIcon } from 'lucide-react-native';

export const colors = {
  bg: '#08090c',
  surface: '#111218',
  surfaceRaised: '#171922',
  border: '#252836',
  borderStrong: '#34384a',
  accent: '#a78bfa',
  accentSoft: '#262038',
  text: '#eef0f5',
  muted: '#9ba1b0',
  subtle: '#62687a',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#fb7185',
  info: '#67e8f9',
};

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function Screen({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <SafeAreaView className={cn('flex-1 bg-pine-bg', className)}>
      {children}
    </SafeAreaView>
  );
}

export function Button({
  label,
  onPress,
  icon: Icon,
  variant = 'primary',
  disabled,
  loading,
  className,
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const stylesByVariant = {
    primary: 'bg-pine-accent border-pine-accent',
    secondary: 'bg-pine-card border-pine-border',
    danger: 'bg-red-950/30 border-red-800/60',
    ghost: 'bg-transparent border-transparent',
  };

  const textByVariant = {
    primary: 'text-white',
    secondary: 'text-pine-text',
    danger: 'text-red-200',
    ghost: 'text-pine-muted',
  };

  const iconColor =
    variant === 'primary'
      ? '#ffffff'
      : variant === 'danger'
        ? colors.danger
        : colors.accent;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      className={cn(
        'min-h-11 rounded-lg border px-4 flex-row items-center justify-center',
        stylesByVariant[variant],
        (disabled || loading) && 'opacity-60',
        className
      )}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? '#ffffff' : colors.accent} />
      ) : (
        <>
          {Icon ? <Icon size={16} color={iconColor} /> : null}
          <Text
            className={cn(
              'text-sm font-semibold',
              Icon && 'ml-2',
              textByVariant[variant]
            )}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  label,
  onPress,
  icon: Icon,
  danger,
  disabled,
  className,
}: {
  label: string;
  onPress: () => void;
  icon: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'h-11 w-11 rounded-lg border items-center justify-center',
        danger ? 'bg-red-950/30 border-red-800/60' : 'bg-pine-card border-pine-border',
        disabled && 'opacity-50',
        className
      )}
    >
      <Icon size={18} color={danger ? colors.danger : colors.muted} />
    </Pressable>
  );
}

export function Pill({
  label,
  tone = 'neutral',
  className,
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}) {
  const containerToneClass = {
    neutral: 'bg-pine-card border-pine-border',
    accent: 'bg-pine-accentDark/30 border-pine-accent/40',
    success: 'bg-emerald-950/40 border-emerald-700/50',
    warning: 'bg-amber-950/40 border-amber-700/50',
    danger: 'bg-red-950/40 border-red-800/60',
    info: 'bg-cyan-950/35 border-cyan-800/50',
  };

  const textToneClass = {
    neutral: 'text-pine-muted',
    accent: 'text-pine-accent',
    success: 'text-emerald-300',
    warning: 'text-amber-300',
    danger: 'text-red-300',
    info: 'text-cyan-200',
  };

  return (
    <View className={cn('rounded-full border px-2.5 py-1', containerToneClass[tone], className)}>
      <Text className={cn('text-[11px] font-bold capitalize', textToneClass[tone])}>
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View className="flex-1 justify-center items-center px-8 py-10">
      <View className="h-14 w-14 rounded-2xl bg-pine-card border border-pine-border items-center justify-center mb-4">
        <Icon size={26} color={colors.muted} />
      </View>
      <Text className="text-pine-text text-base font-bold text-center">{title}</Text>
      <Text className="text-pine-muted text-sm leading-5 text-center mt-2 max-w-[300]">
        {body}
      </Text>
      {action ? <View className="mt-5">{action}</View> : null}
    </View>
  );
}
