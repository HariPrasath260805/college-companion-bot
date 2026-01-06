import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Send, Image, X, Loader2 } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (content: string, imageUrl?: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSendMessage, isLoading }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please select an image under 5MB',
        variant: 'destructive',
      });
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadImage = async (): Promise<string | undefined> => {
    if (!imageFile || !user) return undefined;

    setIsUploading(true);
    const fileName = `${user.id}/${Date.now()}-${imageFile.name}`;

    const { data, error } = await supabase.storage
      .from('chat-images')
      .upload(fileName, imageFile);

    setIsUploading(false);

    if (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload image. Please try again.',
        variant: 'destructive',
      });
      return undefined;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('chat-images')
      .getPublicUrl(data.path);

    return publicUrl;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if ((!message.trim() && !imageFile) || isLoading || isUploading) return;

    let imageUrl: string | undefined;
    if (imageFile) {
      imageUrl = await uploadImage();
    }

    onSendMessage(message.trim(), imageUrl);
    setMessage('');
    removeImage();
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-border p-4">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
        {/* Image Preview */}
        {imagePreview && (
          <div className="mb-3 relative inline-block">
            <img 
              src={imagePreview} 
              alt="Preview" 
              className="max-h-32 rounded-lg border border-border"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6"
              onClick={removeImage}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Image Upload Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
          >
            <Image className="w-5 h-5" />
          </Button>

          {/* Text Input */}
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
              className="min-h-[52px] max-h-32 resize-none pr-12"
              disabled={isLoading || isUploading}
            />
          </div>

          {/* Send Button */}
          <Button
            type="submit"
            size="icon"
            className="shrink-0 gradient-bg text-primary-foreground"
            disabled={isLoading || isUploading || (!message.trim() && !imageFile)}
          >
            {isLoading || isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          College AI can make mistakes. Verify important information.
        </p>
      </form>
    </div>
  );
}
