import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ThemeToggle';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Search, 
  LogOut, 
  Shield,
  MessageSquare,
  HelpCircle,
  Image,
  Loader2,
  Save,
  X,
  GraduationCap
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from 'react-router-dom';

interface Question {
  id: string;
  question_en: string;
  answer_en: string;
  category: string | null;
  image_url: string | null;
  created_at: string;
}

const CATEGORIES = [
  'general',
  'admissions',
  'courses',
  'fees',
  'exams',
  'facilities',
  'placement',
  'hostel',
  'events',
  'other'
];

const AdminDashboard = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<Question[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer, setFormAnswer] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formImageUrl, setFormImageUrl] = useState('');

  const navigate = useNavigate();
  const { user, isAdmin, isLoading: authLoading, signOut } = useAuth();
  const { toast } = useToast();

  // Auth check
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        navigate('/admin/login');
      } else if (!isAdmin) {
        toast({
          title: 'Access Denied',
          description: 'You do not have admin privileges.',
          variant: 'destructive',
        });
        navigate('/chat');
      }
    }
  }, [user, isAdmin, authLoading, navigate, toast]);

  // Load questions
  useEffect(() => {
    if (isAdmin) {
      loadQuestions();
    }
  }, [isAdmin]);

  // Filter questions
  useEffect(() => {
    let filtered = questions;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(q => 
        q.question_en.toLowerCase().includes(query) ||
        q.answer_en.toLowerCase().includes(query)
      );
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(q => q.category === selectedCategory);
    }

    setFilteredQuestions(filtered);
  }, [questions, searchQuery, selectedCategory]);

  const loadQuestions = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading questions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load questions',
        variant: 'destructive',
      });
    } else {
      setQuestions(data || []);
    }
    setIsLoading(false);
  };

  const openAddDialog = () => {
    setEditingQuestion(null);
    setFormQuestion('');
    setFormAnswer('');
    setFormCategory('general');
    setFormImageUrl('');
    setIsDialogOpen(true);
  };

  const openEditDialog = (question: Question) => {
    setEditingQuestion(question);
    setFormQuestion(question.question_en);
    setFormAnswer(question.answer_en);
    setFormCategory(question.category || 'general');
    setFormImageUrl(question.image_url || '');
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formQuestion.trim() || !formAnswer.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Question and answer are required',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    const questionData = {
      question_en: formQuestion.trim(),
      answer_en: formAnswer.trim(),
      category: formCategory,
      image_url: formImageUrl.trim() || null,
    };

    if (editingQuestion) {
      const { error } = await supabase
        .from('questions')
        .update(questionData)
        .eq('id', editingQuestion.id);

      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to update question',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Question updated successfully' });
        loadQuestions();
        setIsDialogOpen(false);
      }
    } else {
      const { error } = await supabase
        .from('questions')
        .insert({ ...questionData, created_by: user?.id });

      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to add question',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Question added successfully' });
        loadQuestions();
        setIsDialogOpen(false);
      }
    }

    setIsSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete question',
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Question deleted' });
      setQuestions(prev => prev.filter(q => q.id !== id));
    }
  };

  if (authLoading || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/chat" className="flex items-center gap-2">
              <div className="w-14 h-14 rounded-xl gradient-bg flex items-center justify-center">
                <img src='/512.png'  />
              </div>
            </Link>
            <div>
              <h1 className="font-display text-xl font-bold flex items-center gap-2">
                <Shield className="w-5 h-5 text-destructive" />
                Admin Dashboard
              </h1>
              <p className="text-xs text-muted-foreground">Manage Q&A Database</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <ThemeToggle />
           
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <HelpCircle className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{questions.length}</p>
                  <p className="text-sm text-muted-foreground">Total Questions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{CATEGORIES.length}</p>
                  <p className="text-sm text-muted-foreground">Categories</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <Image className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {questions.filter(q => q.image_url).length}
                  </p>
                  <p className="text-sm text-muted-foreground">With Images</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat} className="capitalize">
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={openAddDialog} className="gap-2 gradient-bg text-primary-foreground">
            <Plus className="w-4 h-4" />
            Add Question
          </Button>
        </div>

        {/* Questions List */}
        <Card>
          <CardHeader>
            <CardTitle>Questions Database</CardTitle>
            <CardDescription>
              {filteredQuestions.length} question{filteredQuestions.length !== 1 ? 's' : ''} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <HelpCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No questions found</p>
                <p className="text-sm">Add your first question to get started!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredQuestions.map((question) => (
                  <div 
                    key={question.id}
                    className="p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary capitalize">
                            {question.category || 'general'}
                          </span>
                          {question.image_url && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-secondary/10 text-secondary flex items-center gap-1">
                              <Image className="w-3 h-3" /> Image
                            </span>
                          )}
                        </div>
                        <h3 className="font-medium mb-1 line-clamp-2">{question.question_en}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">{question.answer_en}</p>
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(question)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(question.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingQuestion ? 'Edit Question' : 'Add New Question'}
            </DialogTitle>
            <DialogDescription>
              Fill in the question and answer details below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat} className="capitalize">
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Question (English)</label>
              <Textarea
                value={formQuestion}
                onChange={(e) => setFormQuestion(e.target.value)}
                placeholder="Enter the question..."
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Answer (English)</label>
              <Textarea
                value={formAnswer}
                onChange={(e) => setFormAnswer(e.target.value)}
                placeholder="Enter the answer..."
                className="min-h-[120px]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Image URL (Optional)</label>
              <Input
                value={formImageUrl}
                onChange={(e) => setFormImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gradient-bg text-primary-foreground">
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {editingQuestion ? 'Update' : 'Add'} Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
