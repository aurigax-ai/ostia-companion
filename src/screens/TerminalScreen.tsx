import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { AnimatePresence, MotiView } from 'moti';
import {
  Check,
  ChevronLeft,
  Lock,
  Shield,
  ShieldAlert,
  Unlock,
  MessageSquare,
  Keyboard,
  Paperclip,
  Mic,
  ArrowUp,
  Terminal,
} from 'lucide-react-native';
import { TerminalView, TerminalViewHandle } from '../components/TerminalView';
import { PineRpc } from '../services/rpc';
import { Button, EmptyState, Pill, Screen, cn, colors } from '../components/ui';

interface TerminalScreenProps {
  paneId: string;
  paneTitle: string;
  onBack: () => void;
}

export function TerminalScreen({ paneId, paneTitle, onBack }: TerminalScreenProps) {
  const terminalRef = useRef<TerminalViewHandle>(null);
  const [role, setRole] = useState<'observer' | 'owner'>('observer');
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elevationVisible, setElevationVisible] = useState(false);
  const [requestedCap, setRequestedCap] = useState<string | null>(null);
  
  // Chat-terminal input state
  const [cmdInput, setCmdInput] = useState('');

  useEffect(() => {
    const unsubscribePty = PineRpc.addPtyListener((base64Data) => {
      terminalRef.current?.write(base64Data);
    });

    const unsubscribeEvents = PineRpc.addEventListener((type) => {
      if (type === 'caps.changed') {
        checkCapabilities();
      }
    });

    attemptAttach('owner');

    return () => {
      unsubscribePty();
      unsubscribeEvents();
      PineRpc.detachPty(paneId).catch((err) => console.warn('Detaching PTY error:', err));
    };
  }, [paneId]);

  const attemptAttach = async (targetRole: 'observer' | 'owner') => {
    setConnecting(true);
    setError(null);
    try {
      await PineRpc.attachPty(paneId, targetRole, 0);
      setRole(targetRole);
      setConnecting(false);
    } catch (err: any) {
      if (err.code === -32003) {
        setRequestedCap(err.data?.cap || 'input');
        if (targetRole === 'owner') {
          await attemptAttach('observer');
          setElevationVisible(true);
        }
      } else {
        setError(err.message || 'Failed to attach to terminal');
        setConnecting(false);
      }
    }
  };

  const checkCapabilities = async () => {
    try {
      const result = await PineRpc.call('device.caps');
      const caps: string[] = result.caps || [];

      if (caps.includes('input') && role === 'observer') {
        setElevationVisible(false);
        attemptAttach('owner');
      }
    } catch (err) {
      console.warn('Failed to query device caps:', err);
    }
  };

  const handleRoleToggle = () => {
    if (role === 'owner') {
      attemptAttach('observer');
    } else {
      attemptAttach('owner');
    }
  };

  const handleTerminalInput = (data: string) => {
    if (role === 'owner') {
      PineRpc.sendKeystroke(data);
    } else {
      setRequestedCap('input');
      setElevationVisible(true);
    }
  };

  const handleSendCommand = () => {
    if (!cmdInput) return;
    // Transmit command + return sequence to PTY stream
    handleTerminalInput(cmdInput + '\r');
    setCmdInput('');
  };

  const handleTerminalResize = (cols: number, rows: number) => {
    PineRpc.sendResize(paneId, cols, rows);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-pine-bg"
    >
      <Screen>
        {/* CMUX Premium Navigation Header */}
        <View className="flex-row items-center justify-between px-3 py-2 bg-pine-bg border-b border-pine-border">
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            className="min-h-11 flex-row items-center px-1.5"
          >
            <ChevronLeft size={22} color="#a78bfa" />
            <View className="bg-pine-accentDark/30 border border-pine-accent/40 w-5 h-5 rounded-full justify-center items-center ml-1">
              <Text className="text-pine-accent text-[10px] font-extrabold">3</Text>
            </View>
          </Pressable>

          {/* Rounded title pill */}
          <View className="bg-[#111218] border border-pine-border px-4 py-1.5 rounded-full flex-row items-center max-w-[180]">
            <Text className="text-pine-text text-xs font-bold font-mono" numberOfLines={1}>
              {paneTitle}
            </Text>
          </View>

          {/* Right Status Actions */}
          <View className="flex-row items-center">
            <TouchableOpacity className="p-2 mr-1 relative">
              <MessageSquare size={18} color="#7f8497" />
              <View className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={handleRoleToggle}
              disabled={connecting}
              className="p-2"
            >
              <View className={`border rounded-lg p-1.5 justify-center items-center ${
                role === 'owner' ? 'bg-[#073b2d]/60 border-emerald-500/50' : 'bg-[#161821] border-[#1f212a]'
              }`}>
                {role === 'owner' ? (
                  <Unlock size={13} color="#10b981" />
                ) : (
                  <Lock size={13} color="#7f8497" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Terminal Area */}
        <View className="flex-1 bg-pine-bg relative">
          {connecting ? (
            <View className="absolute inset-0 justify-center items-center bg-pine-bg z-10">
              <ActivityIndicator size="large" color={colors.accent} />
              <Text className="text-pine-muted text-sm mt-3">Attaching terminal stream</Text>
            </View>
          ) : null}

          {error ? (
            <View className="absolute inset-0 bg-pine-bg z-10">
              <EmptyState
                icon={ShieldAlert}
                title="Terminal unavailable"
                body={error}
                action={<Button label="Retry Connect" onPress={() => attemptAttach('owner')} />}
              />
            </View>
          ) : null}

          <TerminalView
            ref={terminalRef}
            onReady={() => console.log('Terminal layout rendered')}
            onInput={handleTerminalInput}
            onResize={handleTerminalResize}
          />
        </View>

        {/* Micro Stats Bar */}
        <View className="flex-row items-center justify-between px-4 py-2 border-t border-pine-border bg-pine-bg">
          <View className="flex-row items-center">
            <Text className="text-[#a78bfa] text-[10px] font-mono font-bold mr-1.5">$0.00</Text>
            <Text className="text-pine-muted text-[10px] font-mono">|</Text>
            <Text className="text-pine-muted text-[10px] font-mono ml-1.5">38% ctx</Text>
          </View>
          <View className="flex-row items-center">
            <Text className="text-emerald-500 text-[9px] font-mono font-bold uppercase tracking-wider">
              »» {role === 'owner' ? 'interactive mode' : 'observer mode'}
            </Text>
            <Text className="text-pine-muted text-[10px] font-mono mx-1.5">·</Text>
            <Text className="text-pine-muted text-[9px] font-mono font-bold uppercase tracking-wider">
              -- zsh
            </Text>
          </View>
        </View>

        {/* Horizontal Capsule KeyBar */}
        {role === 'owner' && (
          <View className="flex-row items-center px-3 py-1 bg-pine-bg">
            <View className="flex-row flex-1 bg-[#111218] border border-pine-border rounded-full py-1 px-3 items-center justify-between">
              <TouchableOpacity className="p-1">
                <Keyboard size={14} color="#7f8497" />
              </TouchableOpacity>
              <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 mx-2" />
              
              <TouchableOpacity onPress={() => handleTerminalInput('\x03')} className="bg-pine-bg border border-pine-border/60 px-3 py-0.5 rounded-full">
                <Text className="text-pine-text text-[10px] font-mono font-bold">Ctrl+C</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleTerminalInput('\t')} className="bg-pine-bg border border-pine-border/60 px-3 py-0.5 rounded-full">
                <Text className="text-pine-text text-[10px] font-mono font-bold">Tab</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleTerminalInput('\x1b')} className="bg-pine-bg border border-pine-border/60 px-3 py-0.5 rounded-full">
                <Text className="text-pine-text text-[10px] font-mono font-bold">Esc</Text>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => handleTerminalInput('^')} className="p-1">
                <Text className="text-pine-muted text-[10px] font-mono font-bold">^</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleTerminalInput('⌥')} className="p-1">
                <Text className="text-pine-muted text-[10px] font-mono font-bold">⌥</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleTerminalInput('⌘')} className="p-1">
                <Text className="text-pine-muted text-[10px] font-mono font-bold">⌘</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleTerminalInput('⇧')} className="p-1">
                <Text className="text-pine-muted text-[10px] font-mono font-bold">⇧</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Message-Style Command Input Bar */}
        {role === 'owner' ? (
          <View className="flex-row items-center px-3 pb-6 pt-2 bg-pine-bg border-t border-pine-border">
            <TouchableOpacity className="p-2 mr-1">
              <Paperclip size={18} color="#7f8497" />
            </TouchableOpacity>
            
            <TouchableOpacity className="p-2 mr-2">
              <Mic size={18} color="#7f8497" />
            </TouchableOpacity>
            
            <View className="flex-1 flex-row items-center bg-[#111218] border border-pine-border rounded-full px-4 h-10">
              <TextInput
                className="flex-1 text-pine-text text-sm h-full"
                placeholder="Message"
                placeholderTextColor="#4e5165"
                value={cmdInput}
                onChangeText={setCmdInput}
                onSubmitEditing={handleSendCommand}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={handleSendCommand}
                className="w-7 h-7 rounded-full bg-pine-accent justify-center items-center ml-2"
              >
                <ArrowUp size={14} color="#08090c" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleRoleToggle}
            className="flex-row items-center px-4 pb-6 pt-2 bg-pine-bg border-t border-pine-border opacity-80"
          >
            <View className="flex-1 flex-row items-center bg-[#111218] border border-pine-border rounded-full px-4 h-10 justify-center">
              <Lock size={12} color="#ef4444" className="mr-2" />
              <Text className="text-pine-muted text-xs font-semibold">
                Observer Mode. Tap to request input access.
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Elevation Dialog */}
        <AnimatePresence>
          {elevationVisible ? (
            <View className="absolute inset-0 z-50">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss permission request"
                className="absolute inset-0 bg-black/65"
                onPress={() => setElevationVisible(false)}
              />

              <MotiView
                from={{ translateY: 320, opacity: 0 }}
                animate={{ translateY: 0, opacity: 1 }}
                exit={{ translateY: 320, opacity: 0 }}
                transition={{ type: 'spring', damping: 20 }}
                className="absolute bottom-0 left-0 right-0 px-5 pt-4 pb-6 rounded-t-2xl bg-pine-card border-t border-pine-border"
              >
                <View className="w-12 h-1.5 rounded-full bg-pine-border self-center mb-5" />

                <View className="flex-row items-start">
                  <View className="h-12 w-12 rounded-xl bg-amber-950/30 border border-amber-800/50 items-center justify-center mr-3">
                    <Shield size={24} color={colors.warning} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-pine-text text-lg font-bold">Input permission needed</Text>
                    <Text className="text-pine-muted text-sm leading-5 mt-1">
                      This pane is in observer mode. Approve the {requestedCap || 'input'} capability on Pine desktop to type here.
                    </Text>
                  </View>
                </View>

                <View className="bg-pine-bg border border-pine-border rounded-lg p-3 mt-5 flex-row items-center">
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text className="text-pine-text text-xs leading-4 flex-1 ml-3">
                    Waiting for the remote elevation prompt to be approved.
                  </Text>
                  <Pill label="Pending" tone="warning" />
                </View>

                <Button
                  label="Close"
                  icon={Check}
                  variant="secondary"
                  onPress={() => setElevationVisible(false)}
                  className="mt-5"
                />
              </MotiView>
            </View>
          ) : null}
        </AnimatePresence>
      </Screen>
    </KeyboardAvoidingView>
  );
}
