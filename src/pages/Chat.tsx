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

    let botResponse: string;
    let botImageUrl: string | null = null;
    let botLinks: MessageLink[] | null = null;
    let source: string;
    
    // IMPORTANT: Skip database check if user uploaded an image - go directly to AI
    const hasImage = !!imageUrl;
    
    // Common single keywords that should NOT trigger database match alone
    const commonKeywords = [
      'fee', 'fees', 'exam', 'exams', 'result', 'results', 'admission', 
      'admissions', 'course', 'courses', 'hostel', 'library', 'class',
      'student', 'teacher', 'college', 'university', 'department'
    ];
    
    // Normalize text for comparison
    const normalize = (text: string) => 
      text.toLowerCase()
        .replace(/[?.,!'"]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    const contentLower = content.toLowerCase().trim();
    const normalizedInput = normalize(contentLower);
    const inputWords = normalizedInput.split(' ').filter(w => w.length > 2);
    
    // Check if input is just common keywords (too vague)
    const isVagueQuery = inputWords.length <= 2 && 
      inputWords.every(w => commonKeywords.includes(w));
    
    // Smart matching function with high confidence threshold
    const findBestMatch = async () => {
      // Skip database for images or vague queries
      if (hasImage || isVagueQuery) return null;
      
      const { data: questions } = await supabase
        .from('questions')
        .select('*');
      
      if (!questions || questions.length === 0) return null;
      
      // Score each question with semantic similarity
      const scored = questions.map(q => {
        const questionText = normalize(q.question_en);
        const questionWords = questionText.split(' ').filter(w => w.length > 2);
        const category = q.category?.toLowerCase() || '';
        const keywords = q.keywords?.map((k: string) => k.toLowerCase()) || [];
        
        let score = 0;
        let matchReason = '';
        
        // 1. Exact match (100% confidence)
        if (normalizedInput === questionText) {
          score = 100;
          matchReason = 'exact';
        }
        // 2. Input substantially contains question or vice versa (85% confidence)
        else if (normalizedInput.includes(questionText) || questionText.includes(normalizedInput)) {
          // Only if significant length match (not just 1-2 words)
          if (Math.min(normalizedInput.length, questionText.length) > 10) {
            score = 85;
            matchReason = 'substring';
          }
        }
        
        // 3. Semantic word overlap scoring
        if (score === 0) {
          // Remove common keywords from consideration for overlap
          const meaningfulInputWords = inputWords.filter(w => !commonKeywords.includes(w));
          const meaningfulQuestionWords = questionWords.filter(w => !commonKeywords.includes(w));
          
          // Count matching meaningful words
          const matchedMeaningful = meaningfulInputWords.filter(w => 
            meaningfulQuestionWords.some(qw => qw.includes(w) || w.includes(qw))
          );
          
          // Also count matched common words but with lower weight
          const matchedCommon = inputWords.filter(w => 
            commonKeywords.includes(w) && questionWords.some(qw => qw.includes(w))
          );
          
          // Calculate weighted overlap
          const meaningfulOverlap = meaningfulInputWords.length > 0 
            ? matchedMeaningful.length / meaningfulInputWords.length 
            : 0;
          const commonOverlap = matchedCommon.length > 0 ? 0.2 : 0; // Small bonus for matching common words
          
          // Require at least 60% meaningful word overlap
          if (meaningfulOverlap >= 0.6 && meaningfulInputWords.length >= 2) {
            score = 50 + (meaningfulOverlap * 35) + (commonOverlap * 10);
            matchReason = 'semantic';
          }
          
          // Keyword array match (direct match with stored keywords)
          if (keywords.length > 0) {
            const keywordMatches = keywords.filter((k: string) => 
              normalizedInput.includes(k) && k.length > 3
            );
            if (keywordMatches.length >= 2 || 
                (keywordMatches.length >= 1 && keywordMatches[0].length > 5)) {
              score = Math.max(score, 70 + (keywordMatches.length * 5));
              matchReason = 'keywords';
            }
          }
          
          // Category relevance bonus
          if (category && meaningfulInputWords.some(w => category.includes(w))) {
            score += 5;
          }
        }
        
        return { ...q, score, matchReason };
      });
      
      // Filter by 70% confidence threshold
      const CONFIDENCE_THRESHOLD = 70;
      const matches = scored
        .filter(q => q.score >= CONFIDENCE_THRESHOLD)
        .sort((a, b) => b.score - a.score);
      
      if (matches.length === 0) return null;
      
      // Check for ambiguous matches (multiple with similar scores)
      const topScore = matches[0].score;
      const topMatches = matches.filter(m => m.score >= topScore - 10);
      
      if (topMatches.length > 1 && topScore < 85) {
        // Ambiguous - return clarification needed
        return { ambiguous: true, matches: topMatches.slice(0, 3) };
      }
      
      return { ambiguous: false, match: matches[0] };
    };
    
    const matchResult = await findBestMatch();
    
    if (matchResult && !matchResult.ambiguous && matchResult.match) {
      // Confident database match (70%+ confidence)
      botResponse = matchResult.match.answer_en;
      botImageUrl = matchResult.match.image_url || null;
      source = 'database';
    } else if (matchResult && matchResult.ambiguous && matchResult.matches) {
      // Multiple matches - ask for clarification
      const options = matchResult.matches.map((q: any, i: number) => 
        `${i + 1}. ${q.question_en}`
      ).join('\n');
      botResponse = `I found multiple possible answers. Could you please clarify which one you are asking about?\n\n${options}\n\nPlease provide more specific details.`;
      source = 'database';
    } else {
      // No database match OR image input - use AI
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

        botResponse = response.data?.message || "I don't have exact information for this. Could you please clarify your question?";
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
        botResponse = "I don't have exact information for this. Could you please clarify your question?";
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
