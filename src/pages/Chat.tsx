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

export interface MessageLink {
  title: string;
  url: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image_url?: string | null;
  source?: string | null;
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

  // Load conversations and setup realtime
  useEffect(() => {
    if (user) {
      loadConversations();
      
      // Subscribe to new conversations
      const conversationChannel = supabase
        .channel('conversations-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setConversations(prev => [payload.new as Conversation, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
              setConversations(prev => 
                prev.map(c => c.id === payload.new.id ? payload.new as Conversation : c)
              );
            } else if (payload.eventType === 'DELETE') {
              setConversations(prev => prev.filter(c => c.id !== payload.old.id));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(conversationChannel);
      };
    }
  }, [user]);

  // Load messages when conversation changes + realtime subscription
  useEffect(() => {
    if (currentConversation) {
      loadMessages(currentConversation.id);
      
      // Subscribe to new messages for current conversation
      const messageChannel = supabase
        .channel(`messages-${currentConversation.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${currentConversation.id}`
          },
          (payload) => {
            const newMsg = payload.new as Message;
            setMessages(prev => {
              // Avoid duplicates (optimistic updates)
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, { ...newMsg, role: newMsg.role as 'user' | 'assistant' }];
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${currentConversation.id}`
          },
          (payload) => {
            setMessages(prev => prev.filter(m => m.id !== payload.old.id));
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(messageChannel);
      };
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

    // Search for answer in database first (database-first approach)
    const { data: questions } = await supabase
      .from('questions')
      .select('*');

    let botResponse: string;
    let botImageUrl: string | null = null;
    let botLinks: MessageLink[] | null = null;
    let source: string;
    
    const contentLower = content.toLowerCase().trim();
    
    // Simple but effective matching function
    const findBestMatch = () => {
      if (!questions || questions.length === 0) return null;
      
      // Normalize text for comparison
      const normalize = (text: string) => 
        text.toLowerCase()
          .replace(/[?.,!]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      
      const normalizedInput = normalize(contentLower);
      const inputWords = normalizedInput.split(' ').filter(w => w.length > 2);
      
      // Score each question
      const scored = questions.map(q => {
        const questionText = normalize(q.question_en);
        const questionWords = questionText.split(' ').filter(w => w.length > 2);
        const category = q.category?.toLowerCase() || '';
        
        let score = 0;
        
        // Exact match (highest priority)
        if (normalizedInput === questionText) {
          score = 100;
        }
        // Input contains question or vice versa
        else if (normalizedInput.includes(questionText) || questionText.includes(normalizedInput)) {
          score = 80;
        }
        else {
          // Word overlap scoring
          const matchedWords = inputWords.filter(w => questionText.includes(w));
          const overlapRatio = matchedWords.length / Math.max(inputWords.length, 1);
          
          // At least 50% word overlap needed
          if (overlapRatio >= 0.5) {
            score = 40 + (overlapRatio * 40);
          }
          
          // Category bonus
          if (category && inputWords.some(w => category.includes(w))) {
            score += 10;
          }
          
          // Keyword bonus (if keywords exist)
          if (q.keywords && Array.isArray(q.keywords)) {
            const keywordMatch = q.keywords.some(k => 
              normalizedInput.includes(k.toLowerCase())
            );
            if (keywordMatch) score += 15;
          }
        }
        
        return { ...q, score };
      });
      
      // Filter and sort by score
      const matches = scored
        .filter(q => q.score >= 40) // Minimum threshold
        .sort((a, b) => b.score - a.score);
      
      if (matches.length === 0) return null;
      
      // Check for ambiguous matches (multiple with same high score)
      const topScore = matches[0].score;
      const topMatches = matches.filter(m => m.score === topScore);
      
      if (topMatches.length > 1 && topScore < 80) {
        // Ambiguous - return clarification needed
        return { ambiguous: true, matches: topMatches.slice(0, 3) };
      }
      
      return { ambiguous: false, match: matches[0] };
    };
    
    const matchResult = findBestMatch();
    
    if (matchResult && !matchResult.ambiguous && matchResult.match) {
      // Confident database match
      botResponse = matchResult.match.answer_en;
      botImageUrl = matchResult.match.image_url || null;
      source = 'database';
    } else if (matchResult && matchResult.ambiguous && matchResult.matches) {
      // Multiple matches - ask for clarification
      const options = matchResult.matches.map((q: any, i: number) => 
        `${i + 1}. ${q.question_en}`
      ).join('\n');
      botResponse = `I found multiple possible answers. Could you please clarify which one you are asking about?\n\n${options}\n\nPlease rephrase your question with more specific details.`;
      source = 'database';
    } else {
      // No database match - use AI fallback
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

        botResponse = response.data?.message || "Sorry, I don't have that information right now. Please contact the college office for accurate details.";
        source = 'ai';
        
        // Handle AI-generated image
        if (response.data?.generated_image) {
          botImageUrl = response.data.generated_image;
        }
        
        // Handle learning links
        if (response.data?.links && Array.isArray(response.data.links)) {
          botLinks = response.data.links;
        }
      } catch (error) {
        console.error('AI error:', error);
        botResponse = "Sorry, I don't have that information right now. Please contact the college office for accurate details.";
        source = 'ai';
      }
    }

    // Add bot response with image and links if present
    const botMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: botResponse,
      image_url: botImageUrl,
      links: botLinks,
      source,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, botMessage]);
    setIsLoading(false);

    // Save bot message to database (links stored in content or separate handling)
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      role: 'assistant',
      content: botResponse,
      image_url: botImageUrl,
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
