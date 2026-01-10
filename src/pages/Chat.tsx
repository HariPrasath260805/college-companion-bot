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

    // Search for answer in database with structured matching
    const { data: questions } = await supabase
      .from('questions')
      .select('*');

    let botResponse: string;
    let botImageUrl: string | null = null;
    let botLinks: MessageLink[] | null = null;
    let source: string;
    
    const contentLower = content.toLowerCase().trim();
    
    // Define known entities for extraction
    const knownCourses = [
      'bcom', 'b.com', 'bca', 'bba', 'bsc', 'b.sc', 'ba', 'b.a',
      'mcom', 'm.com', 'mca', 'mba', 'msc', 'm.sc', 'ma', 'm.a',
      'cse', 'ece', 'eee', 'mech', 'civil', 'it', 'aids', 'aiml',
      'computer science', 'electronics', 'electrical', 'mechanical',
      'commerce', 'arts', 'science', 'engineering', 'management',
      'pgdca', 'diploma', 'phd', 'pg', 'ug'
    ];
    
    const knownTopics = [
      'fees', 'fee structure', 'fee details', 'tuition',
      'admission', 'admissions', 'eligibility', 'entrance', 'apply',
      'exam', 'examination', 'schedule', 'timetable', 'syllabus',
      'hostel', 'accommodation', 'rooms', 'mess',
      'placement', 'placements', 'job', 'career', 'internship',
      'scholarship', 'scholarships', 'financial aid',
      'faculty', 'teachers', 'professors', 'staff',
      'library', 'lab', 'laboratory', 'facilities',
      'events', 'fest', 'cultural', 'sports',
      'transport', 'bus', 'shuttle'
    ];
    
    // Generic words to avoid matching alone
    const genericWords = ['fees', 'admission', 'course', 'exam', 'hostel', 'placement', 'details', 'information', 'about', 'what', 'how', 'when', 'where', 'tell', 'me'];
    
    // Extract course/entity from user input
    const extractedCourse = knownCourses.find(course => 
      contentLower.includes(course.toLowerCase())
    );
    
    // Extract topic from user input
    const extractedTopic = knownTopics.find(topic => 
      contentLower.includes(topic.toLowerCase())
    );
    
    // Score-based matching function
    const scoreMatch = (question: { question_en: string; category?: string | null; keywords?: string[] | null }) => {
      const questionLower = question.question_en.toLowerCase();
      const category = question.category?.toLowerCase() || '';
      const keywords = question.keywords?.map(k => k.toLowerCase()) || [];
      
      let score = 0;
      
      // Check for course match (high weight)
      if (extractedCourse) {
        if (questionLower.includes(extractedCourse) || 
            keywords.some(k => k.includes(extractedCourse))) {
          score += 50;
        }
      }
      
      // Check for topic match (high weight)
      if (extractedTopic) {
        if (questionLower.includes(extractedTopic) || 
            category.includes(extractedTopic) ||
            keywords.some(k => k.includes(extractedTopic))) {
          score += 40;
        }
      }
      
      // Check for longer phrase matches (prefer specific matches)
      const userWords = contentLower.split(/\s+/).filter(w => 
        w.length > 2 && !genericWords.includes(w)
      );
      
      // Consecutive word matching (phrase matching)
      for (let len = Math.min(5, userWords.length); len >= 2; len--) {
        for (let i = 0; i <= userWords.length - len; i++) {
          const phrase = userWords.slice(i, i + len).join(' ');
          if (questionLower.includes(phrase)) {
            score += len * 10; // Longer phrases get higher scores
          }
        }
      }
      
      // Individual significant word matches (lower weight)
      userWords.forEach(word => {
        if (questionLower.includes(word)) {
          score += 5;
        }
        if (keywords.some(k => k.includes(word))) {
          score += 3;
        }
      });
      
      return score;
    };
    
    // Score all questions
    const scoredQuestions = questions?.map(q => ({
      ...q,
      score: scoreMatch(q)
    })).filter(q => q.score > 0) || [];
    
    // Sort by score descending
    scoredQuestions.sort((a, b) => b.score - a.score);
    
    // Determine if we have a confident match
    const topMatch = scoredQuestions[0];
    const secondMatch = scoredQuestions[1];
    
    // Conditions for using database answer:
    // 1. Must have both course AND topic extracted and matched (score >= 90)
    // 2. OR must have very high confidence single match with significant lead
    // 3. Must not have multiple equally-good matches
    
    const hasConfidentMatch = topMatch && (
      // High score with course + topic
      (topMatch.score >= 90 && extractedCourse && extractedTopic) ||
      // Very high score with significant lead over second match
      (topMatch.score >= 80 && (!secondMatch || topMatch.score - secondMatch.score >= 30))
    );
    
    const hasAmbiguousMatches = topMatch && secondMatch && 
      topMatch.score === secondMatch.score && topMatch.score > 0;

    if (hasConfidentMatch && !hasAmbiguousMatches) {
      // Confident database match - include image if present
      botResponse = topMatch.answer_en;
      botImageUrl = topMatch.image_url || null;
      source = 'database';
    } else if (hasAmbiguousMatches && scoredQuestions.length <= 3) {
      // Multiple matches - ask for clarification
      const options = scoredQuestions.slice(0, 3).map((q, i) => 
        `${i + 1}. ${q.question_en}`
      ).join('\n');
      botResponse = `I found multiple possible answers. Could you please clarify which one you're asking about?\n\n${options}\n\nOr you can rephrase your question with more specific details (e.g., course name + topic like "BCA fees" or "CSE admission").`;
      source = 'database';
    } else {
      // AI fallback - handles both simple responses and image generation
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
        botResponse = 'I apologize, but I encountered an error. Please try again.';
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
