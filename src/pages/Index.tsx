import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AnimatedBackground } from '@/components/AnimatedBackground';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';
import { MessageSquare, LogIn, UserPlus, GraduationCap, Sparkles, Bot, Shield, LogOut, User } from 'lucide-react';

const Index = () => {
  const { user, signOut, isAdmin } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  // Fetch user's avatar
  useEffect(() => {
    const fetchAvatar = async () => {
      if (!user) {
        setAvatarUrl(null);
        return;
      }

      try {
        const { data } = await supabase
          .from('profiles')
          .select('avatar_url, full_name')
          .eq('id', user.id)
          .single();

        if (data?.avatar_url) {
          setAvatarUrl(data.avatar_url);
        }
        if (data?.full_name) {
          setDisplayName(data.full_name);
        } else {
          setDisplayName(user.user_metadata?.full_name || null);
        }
      } catch (error) {
        console.error('Error fetching avatar:', error);
        setDisplayName(user.user_metadata?.full_name || null);
      }
    };

    fetchAvatar();
  }, [user]);

  const handleLogout = async () => {
    await signOut();
  };

  const getInitials = () => {
    const name = user?.user_metadata?.full_name || user?.email;
    if (name) {
      return name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return 'U';
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <AnimatedBackground />
      
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between p-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center">
            <GraduationCap className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold">College AI</h1>
            <p className="text-xs text-muted-foreground">Intelligent Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          
          {user ? (
            <>
              {/* Profile Avatar Link */}
              <Link to="/profile">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Avatar className="w-7 h-7">
                    <AvatarImage src={avatarUrl || undefined} alt="Profile" />
                    <AvatarFallback className="text-xs gradient-bg text-primary-foreground">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline">{displayName || user?.email?.split('@')[0] || 'Profile'}</span>
                </Button>
              </Link>

              {/* Admin Link - only for admins */}
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <Shield className="w-4 h-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </Button>
                </Link>
              )}

              {/* Logout Button */}
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth">
                <Button variant="ghost" size="sm" className="gap-2">
                  <LogIn className="w-4 h-4" />
                  <span className="hidden sm:inline">Login</span>
                </Button>
              </Link>
              <Link to="/auth?mode=register">
                <Button variant="outline" size="sm" className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Register</span>
                </Button>
              </Link>
              <Link to="/admin/login">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Shield className="w-4 h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </Button>
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex flex-col items-center justify-center px-6 pt-12 pb-24">
        <div className="text-center max-w-4xl mx-auto animate-slide-up">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">AI-Powered College Assistant</span>
          </div>

          {/* Main Heading */}
          <h1 className="font-display text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Your Smart
            <span className="gradient-text block">College Companion</span>
          </h1>

          {/* Description */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
            Get instant answers about admissions, courses, schedules, and more. 
            Powered by AI with multilingual support and image analysis capabilities.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            {user ? (
              <Link to="/chat">
                <Button size="lg" className="gradient-bg text-primary-foreground gap-2 h-14 px-8 text-lg glow">
                  <MessageSquare className="w-5 h-5" />
                  Start Chatting
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/chat">
                  <Button size="lg" className="gradient-bg text-primary-foreground gap-2 h-14 px-8 text-lg glow">
                    <MessageSquare className="w-5 h-5" />
                    Start Chat
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button size="lg" variant="outline" className="gap-2 h-14 px-8 text-lg">
                    <LogIn className="w-5 h-5" />
                    Login
                  </Button>
                </Link>
                <Link to="/auth?mode=register">
                  <Button size="lg" variant="ghost" className="gap-2 h-14 px-8 text-lg">
                    <UserPlus className="w-5 h-5" />
                    Register
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <FeatureCard
              icon={<Bot className="w-6 h-6" />}
              title="AI-Powered"
              description="Smart responses using advanced AI with vision capabilities"
            />
            <FeatureCard
              icon={<MessageSquare className="w-6 h-6" />}
              title="Multilingual"
              description="Chat in Tamil, Hindi, English, and more languages"
            />
            <FeatureCard
              icon={<Sparkles className="w-6 h-6" />}
              title="Image Analysis"
              description="Upload images for notices, timetables, and circulars"
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 text-sm text-muted-foreground">
        <p>© 2024 College AI Chatbot. Built with ❤️ for students.</p>
      </footer>
    </div>
  );
};

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="glass p-6 rounded-2xl text-left hover:scale-105 transition-transform duration-300">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4">
        {icon}
      </div>
      <h3 className="font-display font-semibold text-lg mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default Index;
