import { useState } from 'react';
import { Conversation } from '@/pages/Chat';
import { MessageSquare, Settings } from 'lucide-react';
import { SettingsPanel } from '@/components/chat/SettingsPanel';

interface ChatHeaderProps {
  conversation: Conversation | null;
  onToggleSidebar: () => void;
  onClearHistory: () => void;
}

export function ChatHeader({ conversation, onClearHistory }: ChatHeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <header className="h-14 border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="w-4 h-4" />
          <span className="font-medium">
            {conversation ? conversation.title : 'New Chat'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open('https://maps.app.goo.gl/37fhA8UGasVnyNEP6', '_blank', 'noopener,noreferrer')}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none"
            title="College Location"
          >
            📍 <span className="hidden sm:inline">Location</span>
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onClearHistory={onClearHistory}
      />
    </>
  );
}
