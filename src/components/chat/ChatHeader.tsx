import { Conversation } from '@/pages/Chat';
import { MessageSquare } from 'lucide-react';

interface ChatHeaderProps {
  conversation: Conversation | null;
  onToggleSidebar: () => void;
}

export function ChatHeader({ conversation }: ChatHeaderProps) {
  return (
    <header className="h-14 border-b border-border flex items-center justify-center px-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MessageSquare className="w-4 h-4" />
        <span className="font-medium">
          {conversation ? conversation.title : 'New Chat'}
        </span>
      </div>
    </header>
  );
}
