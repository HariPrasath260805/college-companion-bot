import { Message } from '@/pages/Chat';
import { Button } from '@/components/ui/button';
import { Bot, User, Trash2, Database, Sparkles, X, ZoomIn } from 'lucide-react';
import { RefObject, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

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
  const [isImageOpen, setIsImageOpen] = useState(false);

  return (
    <>
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
            {/* Text content always shown first */}
            <p className="whitespace-pre-wrap text-left">{message.content}</p>
            
            {/* Image shown below text if present */}
            {message.image_url && (
              <div className="mt-3 relative group/image">
                <img 
                  src={message.image_url} 
                  alt={isUser ? "Uploaded image" : "Answer image"} 
                  className="max-w-xs sm:max-w-sm md:max-w-md rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setIsImageOpen(true)}
                />
                <div 
                  className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/image:opacity-100 transition-opacity rounded-lg cursor-pointer"
                  onClick={() => setIsImageOpen(true)}
                >
                  <ZoomIn className="w-8 h-8 text-white" />
                </div>
              </div>
            )}
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

      {/* Fullscreen Image Modal */}
      <Dialog open={isImageOpen} onOpenChange={setIsImageOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-50 text-white hover:bg-white/20"
            onClick={() => setIsImageOpen(false)}
          >
            <X className="w-6 h-6" />
          </Button>
          {message.image_url && (
            <img 
              src={message.image_url} 
              alt="Fullscreen view" 
              className="w-full h-full object-contain max-h-[90vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
