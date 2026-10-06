import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { cn } from './ui';

interface KeyBarProps {
  onKeyPress: (seq: string) => void;
}

interface ShortcutKey {
  label: string;
  sequence: string;
  isPrimary?: boolean;
}

const keys: ShortcutKey[] = [
  { label: 'ESC', sequence: '\x1b', isPrimary: true },
  { label: 'TAB', sequence: '\t', isPrimary: true },
  { label: 'Ctrl+C', sequence: '\x03', isPrimary: true },
  { label: 'Ctrl+D', sequence: '\x04' },
  { label: 'Ctrl+Z', sequence: '\x1a' },
  { label: 'Up', sequence: '\x1b[A' },
  { label: 'Down', sequence: '\x1b[B' },
  { label: 'Left', sequence: '\x1b[D' },
  { label: 'Right', sequence: '\x1b[C' },
  { label: 'Home', sequence: '\x1b[H' },
  { label: 'End', sequence: '\x1b[F' },
  { label: 'PgUp', sequence: '\x1b[5~' },
  { label: 'PgDn', sequence: '\x1b[6~' },
  { label: 'Ctrl+\\', sequence: '\x1c' },
];

export function KeyBar({ onKeyPress }: KeyBarProps) {
  return (
    <View className="h-14 bg-ostia-card border-t border-ostia-border">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 8 }}
      >
        {keys.map((key) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Send ${key.label}`}
            key={key.label}
            className={cn(
              'h-9 min-w-12 rounded-lg justify-center items-center mx-1 px-3 border',
              key.isPrimary
                ? 'bg-ostia-accentDark/30 border-ostia-accent/45'
                : 'bg-ostia-bg border-ostia-border'
            )}
            onPress={() => onKeyPress(key.sequence)}
          >
            <Text
              className={cn(
                'text-xs font-semibold font-mono',
                key.isPrimary ? 'text-ostia-accent' : 'text-ostia-muted'
              )}
              numberOfLines={1}
            >
              {key.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
