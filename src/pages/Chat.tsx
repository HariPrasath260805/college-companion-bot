import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { OfflineBanner } from '@/components/OfflineBanner';
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
  video_url?: string | null;
  website_url?: string | null;
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
    const { error: userMsgError } = await supabase.from('messages').insert({
      conversation_id: conversation.id,
      role: 'user',
      content,
      image_url: imageUrl,
    });

    if (userMsgError) {
      console.error('Error saving user message:', userMsgError);
      toast({
        title: 'Error',
        description: 'Failed to save message. Please check your connection.',
        variant: 'destructive',
      });
    }

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
    let botVideoUrl: string | null = null;
    let botWebsiteUrl: string | null = null;
    let botLinks: MessageLink[] | null = null;
    let source: string;
    
    // IMPORTANT: Skip database check if user uploaded an image - go directly to AI
    const hasImage = !!imageUrl;
    
    // Normalize text for comparison - remove filler words and punctuation
    const normalize = (text: string) => 
      text.toLowerCase()
        .replace(/[?.,!'"]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    // ACTION WORDS that indicate user wants specific info (not just explanation)
    const actionWords = ['fee', 'fees', 'cost', 'price', 'admission', 'result', 'results', 'exam', 'exams', 
      'schedule', 'timing', 'deadline', 'date', 'contact', 'phone', 'email', 'address', 'hostel', 
      'placement', 'syllabus', 'eligibility', 'documents', 'required', 'process', 'apply', 'registration'];
    
    // CRITICAL TERMS - ordinals that MUST match if present in both input and question
    const criticalTerms = ['1st', '2nd', '3rd', '4th', '5th', '6th', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth',
      'i', 'ii', 'iii', 'iv', 'v', 'vi', 'semester'];
    
    // Extract key terms (remove common filler words)
    const fillerWords = ['what', 'is', 'the', 'of', 'for', 'a', 'an', 'in', 'to', 'and', 'or', 'how', 'much', 'show', 'me', 'tell', 'please', 'can', 'you', 'about', 'explain', 'give', 'details', 'year', 'sem'];
    
    const extractKeyTerms = (text: string) => {
      return normalize(text)
        .split(' ')
        .filter(w => w.length > 1 && !fillerWords.includes(w));
    };
    
    const normalizedInput = normalize(content);
    const inputTerms = extractKeyTerms(content);
    
    // Check if query has ACTION words (fees, admission, etc.) - these should check database
    const hasActionWord = inputTerms.some(term => actionWords.includes(term));
    
    // Check if query is ONLY a subject/topic with no action word - should go to AI for explanation
    const isExplanationQuery = !hasActionWord && inputTerms.length >= 1;
    
    // Check if query is too vague (single common word only)
    const singleCommonWords = ['fee', 'fees', 'exam', 'result', 'admission', 'course', 'hostel'];
    const isVagueQuery = inputTerms.length === 1 && singleCommonWords.includes(inputTerms[0]);
    
    // Smart matching function
    const findBestMatch = async () => {
      // Skip database for images
      if (hasImage) return null;
      
      // Skip database for pure explanation queries (no action words)
      // e.g., "computer science" should go to AI to explain, not match "computer science fees"
      if (isExplanationQuery) {
        console.log('Explanation query detected, skipping database:', inputTerms);
        return null;
      }
      
      // For vague queries, still try to find matches but require higher confidence
      const { data: questions } = await supabase
        .from('questions')
        .select('*');
      
      if (!questions || questions.length === 0) return null;
      
    // Score each question
        const scored = questions.map(q => {
          const questionText = normalize(q.question_en);
          const questionTerms = extractKeyTerms(q.question_en);
          const category = q.category?.toLowerCase() || '';
          const keywords = q.keywords?.map((k: string) => k.toLowerCase().trim()) || [];
          
          let score = 0;
          let matchReason = '';
          
          // 1. Exact normalized match against main question (100%)
          if (normalizedInput === questionText) {
            score = 100;
            matchReason = 'exact';
          }
          
          // 2. Exact match against any keyword PHRASE (keywords are alternative full questions)
          // e.g., keywords: ["gasc image", "government arts and science college image"]
          if (score === 0 && keywords.length > 0) {
            for (const keyword of keywords) {
              const normalizedKeyword = normalize(keyword);
              if (normalizedInput === normalizedKeyword) {
                score = 98;
                matchReason = 'keyword-phrase-exact';
                break;
              }
            }
          }
          
          // 3. Term-based match against keywords as phrases
          // Check if all input terms appear in any single keyword phrase
          if (score === 0 && keywords.length > 0) {
            for (const keyword of keywords) {
              const keywordTerms = extractKeyTerms(keyword);
              const matchedCount = inputTerms.filter(t => keywordTerms.includes(t)).length;
              if (matchedCount === inputTerms.length && inputTerms.length >= 1) {
                score = 92;
                matchReason = 'keyword-phrase-terms';
                break;
              }
              // Also check reverse: all keyword terms in input
              const reverseCount = keywordTerms.filter(t => inputTerms.includes(t)).length;
              if (reverseCount === keywordTerms.length && keywordTerms.length >= 2) {
                score = 90;
                matchReason = 'keyword-phrase-reverse';
                break;
              }
            }
          }
          
          // 4. Flexible term matching - works regardless of word order or phrasing
          if (score === 0 && inputTerms.length >= 1) {
            const matchedTerms = inputTerms.filter(term => 
              questionTerms.some(qt => qt === term)
            );
            
            const inputActionWords = inputTerms.filter(t => actionWords.includes(t));
            const questionActionWords = questionTerms.filter(t => actionWords.includes(t));
            const actionWordMatch = inputActionWords.length > 0 && 
              inputActionWords.some(iaw => questionActionWords.includes(iaw));
            
            const inputSubjectWords = inputTerms.filter(t => !actionWords.includes(t));
            const questionSubjectWords = questionTerms.filter(t => !actionWords.includes(t));
            const subjectMatchCount = inputSubjectWords.filter(isw => 
              questionSubjectWords.includes(isw)
            ).length;
            const subjectMatchRatio = inputSubjectWords.length > 0 
              ? subjectMatchCount / inputSubjectWords.length 
              : 0;
            
            // Reverse match: how many of the question's subject terms are in the input
            const reverseSubjectCount = questionSubjectWords.filter(qsw =>
              inputSubjectWords.includes(qsw)
            ).length;
            const reverseSubjectRatio = questionSubjectWords.length > 0
              ? reverseSubjectCount / questionSubjectWords.length
              : 0;
            
            // Check critical terms - if input has ordinals/year terms, they MUST match
            const inputCritical = inputTerms.filter(t => criticalTerms.includes(t));
            const questionCritical = questionTerms.filter(t => criticalTerms.includes(t));
            const criticalMismatch = inputCritical.length > 0 && questionCritical.length > 0 && (
              inputCritical.some(ic => !questionCritical.includes(ic)) ||
              questionCritical.some(qc => !inputCritical.includes(qc))
            );
            
            if (criticalMismatch) {
              score = 0;
              matchReason = 'critical-mismatch';
            } else if (matchedTerms.length === inputTerms.length && inputTerms.length >= 2) {
              // All input terms found in question
              score = 95;
              matchReason = 'all-terms-match';
            } else if (actionWordMatch && reverseSubjectRatio >= 0.8 && subjectMatchRatio >= 0.5) {
              // All question subject terms are in input + action word matches
              score = 92;
              matchReason = 'reverse-full-match';
            } else if (actionWordMatch && subjectMatchRatio >= 0.7) {
              score = 85 + (subjectMatchRatio * 10);
              matchReason = 'subject-action-match';
            } else if (actionWordMatch && reverseSubjectRatio >= 0.8) {
              // Input may have extra words but covers all question terms
              score = 85;
              matchReason = 'reverse-subject-action';
            }
          }
          
          // 5. Category + term combination
          if (score === 0 && category) {
            const categoryMatch = inputTerms.some(t => category === t);
            const hasOtherMatch = inputTerms.some(t => 
              questionTerms.some(qt => qt === t)
            );
            if (categoryMatch && hasOtherMatch) {
              score = 72;
              matchReason = 'category-term';
            }
          }
          
          return { ...q, score, matchReason };
        });
      
      // Filter and sort
      const CONFIDENCE_THRESHOLD = isVagueQuery ? 85 : 70;
      const matches = scored
        .filter(q => q.score >= CONFIDENCE_THRESHOLD)
        .sort((a, b) => b.score - a.score);
      
      if (matches.length === 0) return null;
      
      // Return best match or ambiguous if multiple close scores
      const topScore = matches[0].score;
      const topMatches = matches.filter(m => m.score >= topScore - 5);
      
      if (topMatches.length > 1 && topScore < 90) {
        return { ambiguous: true, matches: topMatches.slice(0, 3) };
      }
      
      return { ambiguous: false, match: matches[0] };
    };
    
    const matchResult = await findBestMatch();
    
    if (matchResult && !matchResult.ambiguous && matchResult.match) {
      // Confident database match (70%+ confidence)
      botResponse = matchResult.match.answer_en;
      botImageUrl = matchResult.match.image_url || null;
      botVideoUrl = matchResult.match.video_url || null;
      botWebsiteUrl = matchResult.match.website_url || null;
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
      video_url: botVideoUrl,
      website_url: botWebsiteUrl,
      links: botLinks,
      source,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, botMessage]);
    setIsLoading(false);

    // Save bot message to database with error handling
    try {
      const { error: botMsgError } = await supabase.from('messages').insert({
        conversation_id: conversation.id,
        role: 'assistant',
        content: botResponse,
        image_url: botImageUrl,
        source,
      });

      if (botMsgError) {
        console.error('Error saving bot message:', botMsgError);
      }

      // Update conversation timestamp
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversation.id);

      // Direct refetch to ensure consistency on slow networks
      // Preserve links from optimistic state (not stored in DB)
      const currentMessages = [...messages, userMessage, botMessage];
      const { data: dbMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });
      
      if (dbMessages) {
        setMessages(dbMessages.map(m => {
          const optimistic = currentMessages.find(om => om.content === m.content && om.role === m.role);
          return {
            ...m,
            role: m.role as 'user' | 'assistant',
            links: optimistic?.links || null,
          };
        }));
      }
    } catch (saveError) {
      console.error('Error saving messages:', saveError);
      // Messages are still shown optimistically even if save fails
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
    </div>
  );
};

export default Chat;
