import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

export interface UserSettings {
  theme: 'light' | 'dark';
  language: 'en' | 'ta';
  bubble_color: 'blue' | 'green' | 'purple';
  sound_enabled: boolean;
}

const defaultSettings: UserSettings = {
  theme: 'light',
  language: 'en',
  bubble_color: 'blue',
  sound_enabled: true,
};

interface SettingsContextType {
  settings: UserSettings;
  isLoading: boolean;
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { setTheme } = useTheme();

  // Load settings from Supabase
  useEffect(() => {
    if (!user) {
      setSettings(defaultSettings);
      setIsLoading(false);
      return;
    }

    const loadSettings = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading settings:', error);
        setIsLoading(false);
        return;
      }

      if (data) {
        const loaded: UserSettings = {
          theme: data.theme as UserSettings['theme'],
          language: data.language as UserSettings['language'],
          bubble_color: data.bubble_color as UserSettings['bubble_color'],
          sound_enabled: data.sound_enabled,
        };
        setSettings(loaded);
        setTheme(loaded.theme);
        applyBubbleColor(loaded.bubble_color);
      } else {
        // Create default settings row
        await supabase.from('user_settings').insert({
          user_id: user.id,
          ...defaultSettings,
        });
      }
      setIsLoading(false);
    };

    loadSettings();
  }, [user]);

  const applyBubbleColor = (color: string) => {
    const root = document.documentElement;
    const colors: Record<string, { h: string; s: string; l: string }> = {
      blue: { h: '221', s: '83%', l: '53%' },
      green: { h: '142', s: '71%', l: '45%' },
      purple: { h: '262', s: '83%', l: '58%' },
    };
    const c = colors[color] || colors.blue;
    root.style.setProperty('--bubble-h', c.h);
    root.style.setProperty('--bubble-s', c.s);
    root.style.setProperty('--bubble-l', c.l);
  };

  const updateSetting = useCallback(async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    if (!user) return;

    setSettings(prev => ({ ...prev, [key]: value }));

    if (key === 'theme') {
      setTheme(value as 'light' | 'dark');
    }
    if (key === 'bubble_color') {
      applyBubbleColor(value as string);
    }

    const { error } = await supabase
      .from('user_settings')
      .update({ [key]: value })
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating setting:', error);
    }
  }, [user, setTheme]);

  return (
    <SettingsContext.Provider value={{ settings, isLoading, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
