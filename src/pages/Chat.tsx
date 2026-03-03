import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useSettings } from '@/hooks/useSettings';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { OfflineBanner } from '@/components/OfflineBanner';

export interface MessageLink {
  title: string;
  url: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image_url?: string | null;
  video_url?: string | null;
  website_url?: string | null;
  source?: string | null;
  result_type?: string | null;
  document_data?: any;
  links?: MessageLink[] | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const Chat = () => {
  const isOnline = useOnlineStatus();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { settings } = useSettings();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      loadConversations();
      
      const conversationChannel = supabase
        .channel('conversations-changes')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'conversations',
          filter: `user_id=eq.${user.id}`
        }, (payload) => {
          if (payload.eventType === 'INSERT') {
            setConversations(prev => [payload.new as Conversation, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setConversations(prev => prev.map(c => c.id === payload.new.id ? payload.new as Conversation : c));
          } else if (payload.eventType === 'DELETE') {
            setConversations(prev => prev.filter(c => c.id !== payload.old.id));
          }
        })
        .subscribe();

      return () => { supabase.removeChannel(conversationChannel); };
    }
  }, [user]);

  useEffect(() => {
    if (currentConversation) {
      loadMessages(currentConversation.id);
      
      const messageChannel = supabase
        .channel(`messages-${currentConversation.id}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages',
          filter: `conversation_id=eq.${currentConversation.id}`
        }, (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, { ...newMsg, role: newMsg.role as 'user' | 'assistant' }];
          });
        })
        .on('postgres_changes', {
          event: 'DELETE', schema: 'public', table: 'messages',
          filter: `conversation_id=eq.${currentConversation.id}`
        }, (payload) => {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        })
        .subscribe();

      return () => { supabase.removeChannel(messageChannel); };
    } else {
      setMessages([]);
    }
  }, [currentConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });
    setConversations(data || []);
  };

  const loadMessages = async (conversationId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    setMessages(data?.map(m => ({ ...m, role: m.role as 'user' | 'assistant' })) || []);
  };

  const createNewConversation = async () => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title: 'New Chat' })
      .select()
      .single();

    if (error) {
      toast({ title: 'Error', description: 'Failed to create new conversation', variant: 'destructive' });
      return null;
    }
    setConversations(prev => [data, ...prev]);
    setCurrentConversation(data);
    setMessages([]);
    return data;
  };

  const handleNewChat = () => { setCurrentConversation(null); setMessages([]); };
  const handleSelectConversation = (conversation: Conversation) => { setCurrentConversation(conversation); };

  const handleDeleteConversation = async (conversationId: string) => {
    const { error } = await supabase.from('conversations').delete().eq('id', conversationId);
    if (error) { toast({ title: 'Error', description: 'Failed to delete conversation', variant: 'destructive' }); return; }
    setConversations(prev => prev.filter(c => c.id !== conversationId));
    if (currentConversation?.id === conversationId) { setCurrentConversation(null); setMessages([]); }
  };

  const handleDeleteMessage = async (messageId: string) => {
    const { error } = await supabase.from('messages').delete().eq('id', messageId);
    if (error) { toast({ title: 'Error', description: 'Failed to delete message', variant: 'destructive' }); return; }
    setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  const handleClearAllChats = async () => {
    const { error } = await supabase.from('conversations').delete().eq('user_id', user?.id);
    if (error) { toast({ title: 'Error', description: 'Failed to clear all chats', variant: 'destructive' }); return; }
    setConversations([]); setCurrentConversation(null); setMessages([]);
    toast({ title: 'All chats cleared' });
  };

  // ========== Hybrid Send: All queries go through the edge function ==========
  const sendMessage = async (content: string, imageUrl?: string) => {
    if (!content.trim() && !imageUrl) return;

    let conversation = currentConversation;
    if (!conversation) {
      conversation = await createNewConversation();
      if (!conversation) return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      image_url: imageUrl,
      created_at: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Save user message
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      role: 'user',
      content,
      image_url: imageUrl,
    });

    // Update conversation title if first message
    if (messages.length === 0) {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      await supabase.from('conversations').update({ title }).eq('id', conversation.id);
      setConversations(prev => prev.map(c => c.id === conversation!.id ? { ...c, title } : c));
      setCurrentConversation({ ...conversation, title });
    }

    // Call edge function (handles DB search + AI fallback)
    let botResponse: string;
    let botImageUrl: string | null = null;
    let botVideoUrl: string | null = null;
    let botWebsiteUrl: string | null = null;
    let botLinks: MessageLink[] | null = null;
    let source: string = 'ai';
    let resultType: string = 'ai_response';

    try {
      const allMessages = [...messages, { role: 'user', content, image_url: imageUrl }];
      const response = await supabase.functions.invoke('chat', {
        body: {
          messages: allMessages.map(m => ({ role: m.role, content: m.content, image_url: m.image_url })),
          language: settings.language || 'en'
        }
      });

      if (response.error) throw new Error(response.error.message);

      botResponse = response.data?.message || "I couldn't find an answer. Please try rephrasing your question.";
      source = response.data?.source || 'ai';
      resultType = response.data?.result_type || 'ai_response';
      botImageUrl = response.data?.image_url || null;
      botVideoUrl = response.data?.video_url || null;
      botWebsiteUrl = response.data?.website_url || null;
      if (response.data?.links && Array.isArray(response.data.links)) {
        botLinks = response.data.links;
      }
    } catch (error) {
      console.error('Chat error:', error);
      botResponse = "I'm having trouble processing your request. Please try again.";
      source = 'ai';
    }

    const botMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: botResponse,
      image_url: botImageUrl,
      video_url: botVideoUrl,
      website_url: botWebsiteUrl,
      links: botLinks,
      source,
      result_type: resultType,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, botMessage]);
    setIsLoading(false);

    // Play notification sound if enabled
    if (settings.sound_enabled) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 800; gain.gain.value = 0.1;
        osc.start(); osc.stop(ctx.currentTime + 0.15);
      } catch {}
    }

    // Save bot message
    try {
      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        role: 'assistant',
        content: botResponse,
        image_url: botImageUrl,
        source,
      });
      await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id);
    } catch (saveError) {
      console.error('Error saving messages:', saveError);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {!isOnline && <OfflineBanner />}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar - always visible on desktop, no mobile toggle */}
        <ChatSidebar
          conversations={conversations}
          currentConversation={currentConversation}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onClearAll={handleClearAllChats}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatHeader 
            conversation={currentConversation}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            onClearHistory={handleClearAllChats}
          />

          <ChatMessages
            messages={messages}
            isLoading={isLoading}
            onDeleteMessage={handleDeleteMessage}
            messagesEndRef={messagesEndRef}
          />

          <ChatInput
            onSendMessage={sendMessage}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
};

export default Chat;
