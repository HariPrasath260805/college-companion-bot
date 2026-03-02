import { useState } from 'react';
import { X, Sun, Moon, Volume2, VolumeX, Trash2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onClearHistory: () => void;
}

const bubbleColors = [
  { id: 'blue', label: 'Blue', class: 'bg-[hsl(221,83%,53%)]' },
  { id: 'green', label: 'Green', class: 'bg-[hsl(142,71%,45%)]' },
  { id: 'purple', label: 'Purple', class: 'bg-[hsl(262,83%,58%)]' },
] as const;

export function SettingsPanel({ isOpen, onClose, onClearHistory }: SettingsPanelProps) {
  const { settings, updateSetting } = useSettings();
  const { user } = useAuth();
  const { toast } = useToast();

  const handleClearHistory = async () => {
    if (!user) return;

    // Delete all conversations (cascade deletes messages via foreign key or we delete manually)
    const { data: convos } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', user.id);

    if (convos && convos.length > 0) {
      // Delete messages first
      for (const convo of convos) {
        await supabase.from('messages').delete().eq('conversation_id', convo.id);
      }
      // Then delete conversations
      await supabase.from('conversations').delete().eq('user_id', user.id);
    }

    onClearHistory();
    toast({ title: 'Chat history cleared' });
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50 transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <aside
        className={`
          fixed top-0 right-0 z-50 h-full w-80 max-w-[90vw]
          bg-card border-l border-border shadow-lg
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
          flex flex-col
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-display text-lg font-semibold">Settings</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* Theme Toggle */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Appearance</h3>
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border/50">
              <div className="flex items-center gap-3">
                {settings.theme === 'dark' ? (
                  <Moon className="w-5 h-5 text-primary" />
                ) : (
                  <Sun className="w-5 h-5 text-primary" />
                )}
                <span className="text-sm font-medium">
                  {settings.theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                </span>
              </div>
              <Switch
                checked={settings.theme === 'dark'}
                onCheckedChange={(checked) => updateSetting('theme', checked ? 'dark' : 'light')}
              />
            </div>
          </section>

          {/* Language */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Language</h3>
            <Select
              value={settings.language}
              onValueChange={(val) => updateSetting('language', val as 'en' | 'ta')}
            >
              <SelectTrigger className="w-full rounded-xl bg-muted/50 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ta">தமிழ் (Tamil)</SelectItem>
              </SelectContent>
            </Select>
          </section>

          {/* Chat Bubble Color */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Chat Bubble Color</h3>
            <div className="flex gap-3">
              {bubbleColors.map((color) => (
                <button
                  key={color.id}
                  onClick={() => updateSetting('bubble_color', color.id)}
                  className={`
                    w-10 h-10 rounded-full ${color.class} transition-all duration-200
                    ${settings.bubble_color === color.id
                      ? 'ring-2 ring-offset-2 ring-offset-card ring-primary scale-110'
                      : 'hover:scale-105 opacity-70 hover:opacity-100'}
                  `}
                  title={color.label}
                />
              ))}
            </div>
          </section>

          {/* Sound Toggle */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Notifications</h3>
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border/50">
              <div className="flex items-center gap-3">
                {settings.sound_enabled ? (
                  <Volume2 className="w-5 h-5 text-primary" />
                ) : (
                  <VolumeX className="w-5 h-5 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">Message Sound</span>
              </div>
              <Switch
                checked={settings.sound_enabled}
                onCheckedChange={(checked) => updateSetting('sound_enabled', checked)}
              />
            </div>
          </section>

          {/* Clear Chat History */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Data</h3>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 rounded-xl"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear Chat History
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all chat history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all your conversations and messages. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearHistory}
                    className="bg-destructive text-destructive-foreground"
                  >
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>

          {/* Account Info */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Account</h3>
            <div className="p-3 rounded-xl bg-muted/50 border border-border/50 space-y-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground truncate">{user?.email || 'Not logged in'}</span>
              </div>
              <p className="text-xs text-muted-foreground/60">Version 1.0.0</p>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
