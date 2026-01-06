import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image_url?: string | null;
  source?: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const Chat = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Load conversations
  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversation) {
      loadMessages(currentConversation.id);
    } else {
      setMessages([]);
    }
  }, [currentConversation]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error loading conversations:', error);
      return;
    }

    setConversations(data || []);
  };

  const loadMessages = async (conversationId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading messages:', error);
      return;
    }

    setMessages(data?.map(m => ({
      ...m,
      role: m.role as 'user' | 'assistant'
    })) || []);
  };

  const createNewConversation = async () => {
    if (!user) return null;

    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title: 'New Chat' })
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      toast({
        title: 'Error',
        description: 'Failed to create new conversation',
        variant: 'destructive',
      });
      return null;
    }

    setConversations(prev => [data, ...prev]);
    setCurrentConversation(data);
    setMessages([]);
    return data;
  };

  const handleNewChat = () => {
    setCurrentConversation(null);
    setMessages([]);
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setCurrentConversation(conversation);
  };

  const handleDeleteConversation = async (conversationId: string) => {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete conversation',
        variant: 'destructive',
      });
      return;
    }

    setConversations(prev => prev.filter(c => c.id !== conversationId));
    if (currentConversation?.id === conversationId) {
      setCurrentConversation(null);
      setMessages([]);
    }
    toast({ title: 'Conversation deleted' });
  };

  const handleDeleteMessage = async (messageId: string) => {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete message',
        variant: 'destructive',
      });
      return;
    }

    setMessages(prev => prev.filter(m => m.id !== messageId));
    toast({ title: 'Message deleted' });
  };

  const handleClearAllChats = async () => {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('user_id', user?.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to clear all chats',
        variant: 'destructive',
      });
      return;
    }

    setConversations([]);
    setCurrentConversation(null);
    setMessages([]);
    toast({ title: 'All chats cleared' });
  };

  const sendMessage = async (content: string, imageUrl?: string) => {
    if (!content.trim() && !imageUrl) return;

    let conversation = currentConversation;
    
    // Create new conversation if needed
    if (!conversation) {
      conversation = await createNewConversation();
      if (!conversation) return;
    }

    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      image_url: imageUrl,
      created_at: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Save user message to database
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      role: 'user',
      content,
      image_url: imageUrl,
    });

    // Update conversation title if first message
    if (messages.length === 0) {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      await supabase
        .from('conversations')
        .update({ title })
        .eq('id', conversation.id);
      
      setConversations(prev => 
        prev.map(c => c.id === conversation!.id ? { ...c, title } : c)
      );
      setCurrentConversation({ ...conversation, title });
    }

    // Search for answer in database first
    const { data: questions } = await supabase
      .from('questions')
      .select('*');

    // Simple keyword matching
    let botResponse: string;
    let source: string;
    
    const contentLower = content.toLowerCase();
    const matchedQuestion = questions?.find(q => {
      const questionLower = q.question_en.toLowerCase();
      const words = contentLower.split(' ').filter(w => w.length > 2);
      return words.some(word => questionLower.includes(word));
    });

    if (matchedQuestion) {
      // Found in database
      botResponse = matchedQuestion.answer_en;
      source = 'database';
    } else {
      // Use AI via edge function
      try {
        const allMessages = [...messages, { role: 'user', content, image_url: imageUrl }];
        const response = await supabase.functions.invoke('chat', {
          body: { 
            messages: allMessages.map(m => ({
              role: m.role,
              content: m.content,
              image_url: m.image_url
            })),
            language: 'en'
          }
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        botResponse = response.data?.message || 'I apologize, I could not generate a response.';
        source = 'ai';
      } catch (error) {
        console.error('AI error:', error);
        botResponse = 'I apologize, but I encountered an error. Please try again.';
        source = 'ai';
      }
    }

    // Add bot response
    const botMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: botResponse,
      source,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, botMessage]);
    setIsLoading(false);

    // Save bot message to database
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      role: 'assistant',
      content: botResponse,
      source,
    });

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversation.id);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background">
      {/* Mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        <Menu className="w-5 h-5" />
      </Button>

      {/* Sidebar */}
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
  );
};

export default Chat;
