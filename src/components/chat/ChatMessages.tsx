import { Message } from '@/pages/Chat';
import { Button } from '@/components/ui/button';
import { Bot, User, Trash2, Database, Sparkles } from 'lucide-react';
import { RefObject } from 'react';

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  onDeleteMessage: (id: string) => void;
  messagesEndRef: RefObject<HTMLDivElement>;
}

export function ChatMessages({ 
  messages, 
  isLoading, 
  onDeleteMessage,
  messagesEndRef 
}: ChatMessagesProps) {
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl gradient-bg flex items-center justify-center mx-auto mb-6">
            <Bot className="w-8 h-8 text-primary-foreground" />
          </div>
          <h2 className="font-display text-2xl font-semibold mb-2">
            How can I help you today?
          </h2>
          <p className="text-muted-foreground">
            Ask me anything about the college - admissions, courses, schedules, fees, and more. 
            You can also upload images for analysis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <MessageBubble 
          key={message.id} 
          message={message} 
          onDelete={() => onDeleteMessage(message.id)}
        />
      ))}
      
      {isLoading && (
        <div className="flex gap-4 max-w-3xl mx-auto">
          <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1 bg-muted rounded-2xl rounded-tl-sm p-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-typing" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-primary rounded-full animate-typing" style={{ animationDelay: '200ms' }} />
              <div className="w-2 h-2 bg-primary rounded-full animate-typing" style={{ animationDelay: '400ms' }} />
            </div>
          </div>
        </div>
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
}

function MessageBubble({ message, onDelete }: { message: Message; onDelete: () => void }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-4 max-w-3xl mx-auto group ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`
        w-8 h-8 rounded-lg flex items-center justify-center shrink-0
        ${isUser ? 'bg-secondary' : 'gradient-bg'}
      `}>
        {isUser ? (
          <User className="w-5 h-5 text-secondary-foreground" />
        ) : (
          <Bot className="w-5 h-5 text-primary-foreground" />
        )}
      </div>
      
      <div className={`flex-1 space-y-2 ${isUser ? 'text-right' : ''}`}>
        <div className={`
          inline-block p-4 rounded-2xl max-w-full
          ${isUser 
            ? 'bg-primary text-primary-foreground rounded-tr-sm' 
            : 'bg-muted rounded-tl-sm'}
        `}>
          {message.image_url && (
            <img 
              src={message.image_url} 
              alt="Uploaded image" 
              className="max-w-xs rounded-lg mb-2"
            />
          )}
          <p className="whitespace-pre-wrap text-left">{message.content}</p>
        </div>
        
        <div className={`
          flex items-center gap-2 text-xs text-muted-foreground
          opacity-0 group-hover:opacity-100 transition-opacity
          ${isUser ? 'justify-end' : 'justify-start'}
        `}>
          {!isUser && message.source && (
            <span className="flex items-center gap-1">
              {message.source === 'database' ? (
                <><Database className="w-3 h-3" /> From database</>
              ) : (
                <><Sparkles className="w-3 h-3" /> AI response</>
              )}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onDelete}
          >
            <Trash2 className="w-3 h-3 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}
