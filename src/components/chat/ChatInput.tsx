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

// Compress image to reduce size
const compressImage = (file: File, maxWidth: number = 1200, quality: number = 0.8): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      let { width, height } = img;
      
      // Calculate new dimensions maintaining aspect ratio
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to compress image'));
          },
          'image/jpeg',
          quality
        );
      } else {
        reject(new Error('Failed to get canvas context'));
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

// Sanitize filename to remove special characters
const sanitizeFileName = (name: string): string => {
  // Remove special characters, keep only alphanumeric, dash, underscore, dot
  return name
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50); // Limit length
};

export function ChatInput({ onSendMessage, isLoading }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Accept all image types
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file',
        variant: 'destructive',
      });
      return;
    }

    // Increased limit to 10MB since we'll compress
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please select an image under 10MB',
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
    
    try {
      // Compress image before upload
      let uploadData: Blob | File = imageFile;
      
      // Compress if larger than 500KB
      if (imageFile.size > 500 * 1024) {
        try {
          uploadData = await compressImage(imageFile, 1200, 0.8);
        } catch (compressError) {
          console.warn('Compression failed, using original:', compressError);
          uploadData = imageFile;
        }
      }

      // Create safe filename
      const ext = imageFile.name.split('.').pop() || 'jpg';
      const safeFileName = `${Date.now()}_${sanitizeFileName(imageFile.name.replace(`.${ext}`, ''))}.jpg`;
      const filePath = `${user.id}/${safeFileName}`;

      const { data, error } = await supabase.storage
        .from('chat-images')
        .upload(filePath, uploadData, {
          contentType: 'image/jpeg',
          upsert: true
        });

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
    } catch (err) {
      console.error('Upload error:', err);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload image. Please try again.',
        variant: 'destructive',
      });
      return undefined;
    } finally {
      setIsUploading(false);
    }
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
    <div className="border-t border-border p-3 md:p-4 bg-background/80 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        {/* ChatGPT-style input container */}
        <div className="relative flex items-end gap-1.5 md:gap-2 bg-muted/50 rounded-2xl border border-border p-2 md:p-3 shadow-sm">
          {/* Image Upload Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif,.webp,.avif,.bmp,.gif,.tiff"
            className="hidden"
            onChange={handleImageSelect}
          />
          <button
            type="button"
            className="shrink-0 p-1.5 md:p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
          >
            <Image className="w-4 h-4 md:w-5 md:h-5" />
          </button>

          {/* Input area with image preview */}
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            {/* Image Preview - ChatGPT style */}
            {imagePreview && (
              <div className="flex items-start">
                <div className="relative">
                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl overflow-hidden border border-border bg-background shadow-sm">
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-foreground/80 text-background flex items-center justify-center hover:bg-foreground transition-colors shadow-sm"
                    onClick={removeImage}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Text Input */}
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message College AI..."
              className="min-h-[24px] md:min-h-[28px] max-h-[120px] md:max-h-[200px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm md:text-base placeholder:text-muted-foreground/60"
              disabled={isLoading || isUploading}
              rows={1}
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            className="shrink-0 p-1.5 md:p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || isUploading || (!message.trim() && !imageFile)}
          >
            {isLoading || isUploading ? (
              <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
            ) : (
              <Send className="w-4 h-4 md:w-5 md:h-5" />
            )}
          </button>
        </div>

        <p className="text-[10px] md:text-xs text-muted-foreground/70 text-center mt-2">
          College AI can make mistakes. Verify important information.
        </p>
      </form>
    </div>
  );
}
