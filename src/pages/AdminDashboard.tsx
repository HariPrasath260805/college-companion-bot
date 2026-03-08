import { useState, useEffect, useRef } from 'react';
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
  Plus, Pencil, Trash2, Search, Shield, MessageSquare,
  HelpCircle, Image, Loader2, Save, X, Video, Link2, Users, CalendarDays, FileText, Upload
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from 'react-router-dom';

interface Question {
  id: string;
  question_en: string;
  answer_en: string;
  category: string | null;
  image_url: string | null;
  video_url: string | null;
  website_url: string | null;
  created_at: string;
}

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
}

interface InternalTimetable {
  id: string;
  subject_name: string;
  subject_code: string | null;
  department: string;
  year: string | null;
  semester: string | null;
  internal_number: string;
  exam_date: string | null;
  exam_time: string | null;
  exam_duration: string | null;
  syllabus_coverage: string | null;
  exam_type: string | null;
  max_marks: number | null;
  room_number: string | null;
  faculty_name: string | null;
  notes: string | null;
  created_at: string;
}

const CATEGORIES = [
  'general', 'admissions', 'courses', 'fees', 'exams',
  'facilities', 'placement', 'hostel', 'events', 'other'
];

const DEPARTMENTS = ['Bsc Computer Science', 'Bsc Physics', 'Bsc Maths', 'Bsc Geology', 'Ba Tamil', 'Ba English', 'B Com', 'Ba Economics', 'Ba History', 'Other'];
const INTERNAL_NUMBERS = ['1st Internal', '2nd Internal', '3rd Internal', 'Model Exam', 'Retest'];

const AdminDashboard = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<Question[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);
  
  // Internal timetable state
  const [timetableEntries, setTimetableEntries] = useState<InternalTimetable[]>([]);
  const [filteredTimetable, setFilteredTimetable] = useState<InternalTimetable[]>([]);
  const [timetableSearch, setTimetableSearch] = useState('');
  const [timetableDeptFilter, setTimetableDeptFilter] = useState('all');
  const [isTimetableDialogOpen, setIsTimetableDialogOpen] = useState(false);
  const [editingTimetable, setEditingTimetable] = useState<InternalTimetable | null>(null);
  const [isTimetableLoading, setIsTimetableLoading] = useState(true);

  // College documents state
  interface CollegeDocument {
    id: string;
    Name: string | null;
    Department: string;
    Year: number | null;
    Regno: number;
    created_at: string;
  }
  const [collegeDocuments, setCollegeDocuments] = useState<CollegeDocument[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<CollegeDocument[]>([]);
  const [docSearch, setDocSearch] = useState('');
  const [docDeptFilter, setDocDeptFilter] = useState('all');
  const [isDocDialogOpen, setIsDocDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<CollegeDocument | null>(null);
  const [isDocLoading, setIsDocLoading] = useState(true);
  const [docName, setDocName] = useState('');
  const [docDepartment, setDocDepartment] = useState('CSE');
  const [docYear, setDocYear] = useState('');
  const [docRegno, setDocRegno] = useState('');
  const [isCsvUploading, setIsCsvUploading] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // Timetable form state
  const [ttSubjectName, setTtSubjectName] = useState('');
  const [ttSubjectCode, setTtSubjectCode] = useState('');
  const [ttDepartment, setTtDepartment] = useState('CSE');
  const [ttYear, setTtYear] = useState('');
  const [ttSemester, setTtSemester] = useState('');
  const [ttInternalNumber, setTtInternalNumber] = useState('1st Internal');
  const [ttExamDate, setTtExamDate] = useState('');
  const [ttExamTime, setTtExamTime] = useState('');
  const [ttExamDuration, setTtExamDuration] = useState('');
  const [ttSyllabusCoverage, setTtSyllabusCoverage] = useState('');
  const [ttExamType, setTtExamType] = useState('Written');
  const [ttMaxMarks, setTtMaxMarks] = useState('');
  const [ttRoomNumber, setTtRoomNumber] = useState('');
  const [ttFacultyName, setTtFacultyName] = useState('');
  const [ttNotes, setTtNotes] = useState('');

  // Question form state
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer, setFormAnswer] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formVideoUrl, setFormVideoUrl] = useState('');
  const [formWebsiteUrl, setFormWebsiteUrl] = useState('');

  const navigate = useNavigate();
  const { user, isAdmin, isLoading: authLoading, signOut } = useAuth();
  const { toast } = useToast();

  // Auth check
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        navigate('/admin/login');
      } else if (!isAdmin) {
        toast({ title: 'Access Denied', description: 'You do not have admin privileges.', variant: 'destructive' });
        navigate('/chat');
      }
    }
  }, [user, isAdmin, authLoading, navigate, toast]);

  useEffect(() => {
    if (isAdmin) {
      loadQuestions();
      loadUsers();
      loadTimetable();
      loadCollegeDocuments();
    }
  }, [isAdmin]);

  // Filter college documents
  useEffect(() => {
    let filtered = collegeDocuments;
    if (docSearch) {
      const q = docSearch.toLowerCase();
      filtered = filtered.filter(d => 
        (d.Name && d.Name.toLowerCase().includes(q)) ||
        d.Department.toLowerCase().includes(q) ||
        String(d.Regno).includes(q)
      );
    }
    if (docDeptFilter !== 'all') {
      filtered = filtered.filter(d => d.Department === docDeptFilter);
    }
    setFilteredDocuments(filtered);
  }, [collegeDocuments, docSearch, docDeptFilter]);

  // Filter questions
  useEffect(() => {
    let filtered = questions;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(q => q.question_en.toLowerCase().includes(query) || q.answer_en.toLowerCase().includes(query));
    }
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(q => q.category === selectedCategory);
    }
    setFilteredQuestions(filtered);
  }, [questions, searchQuery, selectedCategory]);

  // Filter timetable
  useEffect(() => {
    let filtered = timetableEntries;
    if (timetableSearch) {
      const q = timetableSearch.toLowerCase();
      filtered = filtered.filter(t => 
        t.subject_name.toLowerCase().includes(q) || 
        (t.subject_code && t.subject_code.toLowerCase().includes(q)) ||
        t.department.toLowerCase().includes(q) ||
        (t.faculty_name && t.faculty_name.toLowerCase().includes(q))
      );
    }
    if (timetableDeptFilter !== 'all') {
      filtered = filtered.filter(t => t.department === timetableDeptFilter);
    }
    setFilteredTimetable(filtered);
  }, [timetableEntries, timetableSearch, timetableDeptFilter]);

  const loadQuestions = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('questions').select('*').order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Error', description: 'Failed to load questions', variant: 'destructive' });
    } else {
      setQuestions(data || []);
    }
    setIsLoading(false);
  };

  const loadUsers = async () => {
    const { data, error } = await supabase.from('profiles').select('id, full_name, email, created_at').order('created_at', { ascending: false });
    if (!error && data) setRegisteredUsers(data);
  };

  const loadTimetable = async () => {
    setIsTimetableLoading(true);
    const { data, error } = await supabase.from('internal_timetable').select('*').order('exam_date', { ascending: true });
    if (error) {
      toast({ title: 'Error', description: 'Failed to load timetable', variant: 'destructive' });
    } else {
      setTimetableEntries((data as any[]) || []);
    }
    setIsTimetableLoading(false);
  };

  // ====== Question CRUD ======
  const openAddDialog = () => {
    setEditingQuestion(null);
    setFormQuestion(''); setFormAnswer(''); setFormCategory('general');
    setFormImageUrl(''); setFormVideoUrl(''); setFormWebsiteUrl('');
    setIsDialogOpen(true);
  };

  const openEditDialog = (question: Question) => {
    setEditingQuestion(question);
    setFormQuestion(question.question_en);
    setFormAnswer(question.answer_en);
    setFormCategory(question.category || 'general');
    setFormImageUrl(question.image_url || '');
    setFormVideoUrl(question.video_url || '');
    setFormWebsiteUrl(question.website_url || '');
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formQuestion.trim() || !formAnswer.trim()) {
      toast({ title: 'Validation Error', description: 'Question and answer are required', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    const questionData = {
      question_en: formQuestion.trim(),
      answer_en: formAnswer.trim(),
      category: formCategory,
      image_url: formImageUrl.trim() || null,
      video_url: formVideoUrl.trim() || null,
      website_url: formWebsiteUrl.trim() || null,
    };

    if (editingQuestion) {
      const { error } = await supabase.from('questions').update(questionData).eq('id', editingQuestion.id);
      if (error) {
        toast({ title: 'Error', description: 'Failed to update question', variant: 'destructive' });
      } else {
        toast({ title: 'Question updated successfully' });
        loadQuestions();
        setIsDialogOpen(false);
      }
    } else {
      const { error } = await supabase.from('questions').insert({ ...questionData, created_by: user?.id });
      if (error) {
        toast({ title: 'Error', description: 'Failed to add question', variant: 'destructive' });
      } else {
        toast({ title: 'Question added successfully' });
        loadQuestions();
        setIsDialogOpen(false);
      }
    }
    setIsSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: 'Failed to delete question', variant: 'destructive' });
    } else {
      toast({ title: 'Question deleted' });
      setQuestions(prev => prev.filter(q => q.id !== id));
    }
  };

  // ====== Timetable CRUD ======
  const openAddTimetable = () => {
    setEditingTimetable(null);
    setTtSubjectName(''); setTtSubjectCode(''); setTtDepartment('CSE');
    setTtYear(''); setTtSemester(''); setTtInternalNumber('1st Internal');
    setTtExamDate(''); setTtExamTime(''); setTtExamDuration('');
    setTtSyllabusCoverage(''); setTtExamType('Written'); setTtMaxMarks('');
    setTtRoomNumber(''); setTtFacultyName(''); setTtNotes('');
    setIsTimetableDialogOpen(true);
  };

  const openEditTimetable = (entry: InternalTimetable) => {
    setEditingTimetable(entry);
    setTtSubjectName(entry.subject_name);
    setTtSubjectCode(entry.subject_code || '');
    setTtDepartment(entry.department);
    setTtYear(entry.year || '');
    setTtSemester(entry.semester || '');
    setTtInternalNumber(entry.internal_number);
    setTtExamDate(entry.exam_date || '');
    setTtExamTime(entry.exam_time || '');
    setTtExamDuration(entry.exam_duration || '');
    setTtSyllabusCoverage(entry.syllabus_coverage || '');
    setTtExamType(entry.exam_type || 'Written');
    setTtMaxMarks(entry.max_marks?.toString() || '');
    setTtRoomNumber(entry.room_number || '');
    setTtFacultyName(entry.faculty_name || '');
    setTtNotes(entry.notes || '');
    setIsTimetableDialogOpen(true);
  };

  const handleSaveTimetable = async () => {
    if (!ttSubjectName.trim() || !ttDepartment.trim()) {
      toast({ title: 'Validation Error', description: 'Subject name and department are required', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    const data: any = {
      subject_name: ttSubjectName.trim(),
      subject_code: ttSubjectCode.trim() || null,
      department: ttDepartment,
      year: ttYear.trim() || null,
      semester: ttSemester.trim() || null,
      internal_number: ttInternalNumber,
      exam_date: ttExamDate || null,
      exam_time: ttExamTime.trim() || null,
      exam_duration: ttExamDuration.trim() || null,
      syllabus_coverage: ttSyllabusCoverage.trim() || null,
      exam_type: ttExamType || 'Written',
      max_marks: ttMaxMarks ? parseFloat(ttMaxMarks) : null,
      room_number: ttRoomNumber.trim() || null,
      faculty_name: ttFacultyName.trim() || null,
      notes: ttNotes.trim() || null,
    };

    if (editingTimetable) {
      const { error } = await supabase.from('internal_timetable').update(data).eq('id', editingTimetable.id);
      if (error) {
        toast({ title: 'Error', description: 'Failed to update timetable entry', variant: 'destructive' });
      } else {
        toast({ title: 'Timetable entry updated' });
        loadTimetable();
        setIsTimetableDialogOpen(false);
      }
    } else {
      const { error } = await supabase.from('internal_timetable').insert(data);
      if (error) {
        toast({ title: 'Error', description: 'Failed to add timetable entry', variant: 'destructive' });
      } else {
        toast({ title: 'Timetable entry added' });
        loadTimetable();
        setIsTimetableDialogOpen(false);
      }
    }
    setIsSaving(false);
  };

  const handleDeleteTimetable = async (id: string) => {
    const { error } = await supabase.from('internal_timetable').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: 'Failed to delete timetable entry', variant: 'destructive' });
    } else {
      toast({ title: 'Timetable entry deleted' });
      setTimetableEntries(prev => prev.filter(t => t.id !== id));
    }
  };

  // ====== College Documents CRUD ======
  const loadCollegeDocuments = async () => {
    setIsDocLoading(true);
    const { data, error } = await supabase.from('college_documents').select('*').order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Error', description: 'Failed to load documents', variant: 'destructive' });
    } else {
      setCollegeDocuments((data as any[]) || []);
    }
    setIsDocLoading(false);
  };

  const openAddDoc = () => {
    setEditingDoc(null);
    setDocName(''); setDocDepartment('CSE'); setDocYear(''); setDocRegno('');
    setIsDocDialogOpen(true);
  };

  const openEditDoc = (doc: CollegeDocument) => {
    setEditingDoc(doc);
    setDocName(doc.Name || '');
    setDocDepartment(doc.Department);
    setDocYear(doc.Year?.toString() || '');
    setDocRegno(doc.Regno.toString());
    setIsDocDialogOpen(true);
  };

  const handleSaveDoc = async () => {
    if (!docRegno.trim() || !docDepartment.trim()) {
      toast({ title: 'Validation Error', description: 'Regno and Department are required', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    const docData: any = {
      Name: docName.trim() || null,
      Department: docDepartment,
      Year: docYear ? parseInt(docYear) : null,
      Regno: parseFloat(docRegno),
    };

    if (editingDoc) {
      const { error } = await supabase.from('college_documents').update(docData).eq('id', editingDoc.id);
      if (error) {
        toast({ title: 'Error', description: 'Failed to update document', variant: 'destructive' });
      } else {
        toast({ title: 'Document updated' });
        loadCollegeDocuments();
        setIsDocDialogOpen(false);
      }
    } else {
      const { error } = await supabase.from('college_documents').insert(docData);
      if (error) {
        toast({ title: 'Error', description: 'Failed to add document', variant: 'destructive' });
      } else {
        toast({ title: 'Document added' });
        loadCollegeDocuments();
        setIsDocDialogOpen(false);
      }
    }
    setIsSaving(false);
  };

  const handleDeleteDoc = async (id: string) => {
    const { error } = await supabase.from('college_documents').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: 'Failed to delete document', variant: 'destructive' });
    } else {
      toast({ title: 'Document deleted' });
      setCollegeDocuments(prev => prev.filter(d => d.id !== id));
    }
  };

  // ====== CSV Import for College Documents ======
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsCsvUploading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      if (lines.length < 2) {
        toast({ title: 'Error', description: 'CSV file must have a header row and at least one data row', variant: 'destructive' });
        setIsCsvUploading(false);
        return;
      }

      // Parse header
      const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      const nameIdx = header.findIndex(h => h === 'name');
      const deptIdx = header.findIndex(h => h === 'department' || h === 'dept');
      const yearIdx = header.findIndex(h => h === 'year');
      const regnoIdx = header.findIndex(h => h === 'regno' || h === 'reg no' || h === 'registration number' || h === 'registration_number');

      if (regnoIdx === -1 || deptIdx === -1) {
        toast({ title: 'Error', description: 'CSV must have "Regno" and "Department" columns', variant: 'destructive' });
        setIsCsvUploading(false);
        return;
      }

      // Parse rows
      const parseCsvRow = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const char of line) {
          if (char === '"') { inQuotes = !inQuotes; }
          else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
          else { current += char; }
        }
        result.push(current.trim());
        return result;
      };

      const rows = lines.slice(1).map(parseCsvRow);
      const docs = rows
        .filter(cols => cols[regnoIdx] && cols[deptIdx])
        .map(cols => ({
          Name: nameIdx >= 0 ? (cols[nameIdx] || null) : null,
          Department: cols[deptIdx],
          Year: yearIdx >= 0 && cols[yearIdx] ? parseInt(cols[yearIdx]) : null,
          Regno: parseFloat(cols[regnoIdx]),
        }))
        .filter(d => !isNaN(d.Regno));

      if (docs.length === 0) {
        toast({ title: 'Error', description: 'No valid rows found in CSV', variant: 'destructive' });
        setIsCsvUploading(false);
        return;
      }

      // Batch insert (chunks of 100)
      let inserted = 0;
      for (let i = 0; i < docs.length; i += 100) {
        const chunk = docs.slice(i, i + 100);
        const { error } = await supabase.from('college_documents').insert(chunk);
        if (error) {
          console.error('CSV insert error:', error);
          toast({ title: 'Error', description: `Failed at row ${i + 1}: ${error.message}`, variant: 'destructive' });
          break;
        }
        inserted += chunk.length;
      }

      if (inserted > 0) {
        toast({ title: `${inserted} document${inserted !== 1 ? 's' : ''} imported successfully` });
        loadCollegeDocuments();
      }
    } catch (err) {
      console.error('CSV parse error:', err);
      toast({ title: 'Error', description: 'Failed to parse CSV file', variant: 'destructive' });
    }
    
    setIsCsvUploading(false);
    // Reset file input
    if (csvFileInputRef.current) csvFileInputRef.current.value = '';
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
                <img src='/512.png' />
              </div>
            </Link>
            <div>
              <h1 className="font-display text-xl font-bold flex items-center gap-2">
                <Shield className="w-5 h-5 text-destructive" />
                Admin Dashboard
              </h1>
              <p className="text-xs text-muted-foreground">Manage Q&A Database & Timetable</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <HelpCircle className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{questions.length}</p>
                  <p className="text-sm text-muted-foreground">Questions</p>
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
                  <p className="text-2xl font-bold">{questions.filter(q => q.image_url).length}</p>
                  <p className="text-sm text-muted-foreground">With Media</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{registeredUsers.length}</p>
                  <p className="text-sm text-muted-foreground">Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <CalendarDays className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{timetableEntries.length}</p>
                  <p className="text-sm text-muted-foreground">Exams</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Registered Users Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Registered Users
            </CardTitle>
            <CardDescription>{registeredUsers.length} user{registeredUsers.length !== 1 ? 's' : ''} signed up</CardDescription>
          </CardHeader>
          <CardContent>
            {registeredUsers.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No users registered yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {registeredUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                      {(u.full_name || u.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{u.full_name || 'Unnamed'}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email || 'No email'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs for Questions, Timetable, and Documents */}
        <Tabs defaultValue="questions" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="questions" className="gap-2">
              <HelpCircle className="w-4 h-4" /> Questions ({questions.length})
            </TabsTrigger>
            <TabsTrigger value="timetable" className="gap-2">
              <CalendarDays className="w-4 h-4" /> Timetable ({timetableEntries.length})
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="w-4 h-4" /> Documents ({collegeDocuments.length})
            </TabsTrigger>
          </TabsList>

          {/* Questions Tab */}
          <TabsContent value="questions">
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search questions..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={openAddDialog} className="gap-2 gradient-bg text-primary-foreground">
                <Plus className="w-4 h-4" /> Add Question
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Questions Database</CardTitle>
                <CardDescription>{filteredQuestions.length} question{filteredQuestions.length !== 1 ? 's' : ''} found</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
                ) : filteredQuestions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <HelpCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No questions found</p>
                    <p className="text-sm">Add your first question to get started!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredQuestions.map((question) => (
                      <div key={question.id} className="p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary capitalize">
                                {question.category || 'general'}
                              </span>
                              {question.image_url && (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-secondary/10 text-secondary flex items-center gap-1">
                                  <Image className="w-3 h-3" /> Image
                                </span>
                              )}
                              {question.video_url && (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-destructive/10 text-destructive flex items-center gap-1">
                                  <Video className="w-3 h-3" /> Video
                                </span>
                              )}
                              {question.website_url && (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-accent/10 text-accent-foreground flex items-center gap-1">
                                  <Link2 className="w-3 h-3" /> Link
                                </span>
                              )}
                            </div>
                            <h3 className="font-medium mb-1 line-clamp-2">{question.question_en}</h3>
                            <p className="text-sm text-muted-foreground line-clamp-2">{question.answer_en}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(question)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(question.id)}>
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
          </TabsContent>

          {/* Internal Timetable Tab */}
          <TabsContent value="timetable">
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search by subject, code, faculty..." value={timetableSearch} onChange={(e) => setTimetableSearch(e.target.value)} className="pl-10" />
              </div>
              <Select value={timetableDeptFilter} onValueChange={setTimetableDeptFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {DEPARTMENTS.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={openAddTimetable} className="gap-2 gradient-bg text-primary-foreground">
                <Plus className="w-4 h-4" /> Add Exam
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5" /> Internal Timetable
                </CardTitle>
                <CardDescription>{filteredTimetable.length} exam{filteredTimetable.length !== 1 ? 's' : ''} scheduled</CardDescription>
              </CardHeader>
              <CardContent>
                {isTimetableLoading ? (
                  <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
                ) : filteredTimetable.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No timetable entries found</p>
                    <p className="text-sm">Add your first internal exam schedule!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredTimetable.map((entry) => (
                      <div key={entry.id} className="p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="px-2 py-0.5 text-xs rounded-full bg-destructive/10 text-destructive font-medium">
                                {entry.internal_number}
                              </span>
                              <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                                {entry.department}
                              </span>
                              {entry.year && (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-secondary/10 text-secondary">
                                  Year {entry.year}
                                </span>
                              )}
                              {entry.semester && (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-accent/10 text-accent-foreground">
                                  Sem {entry.semester}
                                </span>
                              )}
                            </div>
                            <h3 className="font-medium mb-1">
                              {entry.subject_name}
                              {entry.subject_code && <span className="text-muted-foreground text-sm ml-2">({entry.subject_code})</span>}
                            </h3>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                              {entry.exam_date && <span>📅 {new Date(entry.exam_date).toLocaleDateString()}</span>}
                              {entry.exam_time && <span>🕐 {entry.exam_time}</span>}
                              {entry.exam_duration && <span>⏱️ {entry.exam_duration}</span>}
                              {entry.max_marks && <span>📝 {entry.max_marks} marks</span>}
                              {entry.room_number && <span>🏫 Room {entry.room_number}</span>}
                              {entry.faculty_name && <span>👨‍🏫 {entry.faculty_name}</span>}
                            </div>
                            {entry.syllabus_coverage && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">📚 {entry.syllabus_coverage}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="icon" onClick={() => openEditTimetable(entry)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteTimetable(entry.id)}>
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
          </TabsContent>
          {/* College Documents Tab */}
          <TabsContent value="documents">
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search by name, regno..." value={docSearch} onChange={(e) => setDocSearch(e.target.value)} className="pl-10" />
              </div>
              <Select value={docDeptFilter} onValueChange={setDocDeptFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {DEPARTMENTS.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="file"
                accept=".csv"
                ref={csvFileInputRef}
                onChange={handleCsvUpload}
                className="hidden"
              />
              <Button 
                variant="outline" 
                onClick={() => csvFileInputRef.current?.click()} 
                className="gap-2"
                disabled={isCsvUploading}
              >
                {isCsvUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isCsvUploading ? 'Importing...' : 'Import CSV'}
              </Button>
              <Button onClick={openAddDoc} className="gap-2 gradient-bg text-primary-foreground">
                <Plus className="w-4 h-4" /> Add Document
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" /> College Documents
                </CardTitle>
                <CardDescription>{filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''} found</CardDescription>
              </CardHeader>
              <CardContent>
                {isDocLoading ? (
                  <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
                ) : filteredDocuments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No documents found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredDocuments.map((doc) => (
                      <div key={doc.id} className="p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">{doc.Department}</span>
                              {doc.Year && <span className="px-2 py-0.5 text-xs rounded-full bg-secondary/10 text-secondary">Year {doc.Year}</span>}
                            </div>
                            <h3 className="font-medium mb-1">{doc.Name || 'Unnamed'}</h3>
                            <p className="text-sm text-muted-foreground">Regno: {doc.Regno}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="icon" onClick={() => openEditDoc(doc)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteDoc(doc.id)}>
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
          </TabsContent>
        </Tabs>
      </main>

      {/* Add/Edit Question Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingQuestion ? 'Edit Question' : 'Add New Question'}</DialogTitle>
            <DialogDescription>Fill in the question and answer details below.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Question (English)</label>
              <Textarea value={formQuestion} onChange={(e) => setFormQuestion(e.target.value)} placeholder="Enter the question..." className="min-h-[80px]" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Answer (English)</label>
              <Textarea value={formAnswer} onChange={(e) => setFormAnswer(e.target.value)} placeholder="Enter the answer..." className="min-h-[120px]" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><Image className="w-4 h-4" /> Image URL (Optional)</label>
              <Input value={formImageUrl} onChange={(e) => setFormImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><Video className="w-4 h-4" /> Video URL (Optional)</label>
              <Input value={formVideoUrl} onChange={(e) => setFormVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><Link2 className="w-4 h-4" /> Website URL (Optional)</label>
              <Input value={formWebsiteUrl} onChange={(e) => setFormWebsiteUrl(e.target.value)} placeholder="https://example.com" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              <X className="w-4 h-4 mr-2" /> Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gradient-bg text-primary-foreground">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {editingQuestion ? 'Update' : 'Add'} Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit College Document Dialog */}
      <Dialog open={isDocDialogOpen} onOpenChange={setIsDocDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDoc ? 'Edit Document' : 'Add New Document'}</DialogTitle>
            <DialogDescription>Fill in the college document details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="e.g., Karthi Kumar" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Department *</label>
              <Select value={docDepartment} onValueChange={setDocDepartment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Year</label>
                <Input type="number" value={docYear} onChange={(e) => setDocYear(e.target.value)} placeholder="e.g., 2" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Regno *</label>
                <Input type="number" value={docRegno} onChange={(e) => setDocRegno(e.target.value)} placeholder="e.g., 12345" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDocDialogOpen(false)}><X className="w-4 h-4 mr-2" /> Cancel</Button>
            <Button onClick={handleSaveDoc} disabled={isSaving} className="gradient-bg text-primary-foreground">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {editingDoc ? 'Update' : 'Add'} Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Timetable Dialog */}
      <Dialog open={isTimetableDialogOpen} onOpenChange={setIsTimetableDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTimetable ? 'Edit Exam Entry' : 'Add New Exam Entry'}</DialogTitle>
            <DialogDescription>Fill in the internal exam schedule details.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject Name *</label>
                <Input value={ttSubjectName} onChange={(e) => setTtSubjectName(e.target.value)} placeholder="e.g., Data Structures" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject Code</label>
                <Input value={ttSubjectCode} onChange={(e) => setTtSubjectCode(e.target.value)} placeholder="e.g., CS301" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Department *</label>
                <Select value={ttDepartment} onValueChange={setTtDepartment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map(dept => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Year</label>
                <Input value={ttYear} onChange={(e) => setTtYear(e.target.value)} placeholder="e.g., 2nd" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Semester</label>
                <Input value={ttSemester} onChange={(e) => setTtSemester(e.target.value)} placeholder="e.g., 3rd" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Internal Number</label>
                <Select value={ttInternalNumber} onValueChange={setTtInternalNumber}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERNAL_NUMBERS.map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Exam Type</label>
                <Select value={ttExamType} onValueChange={setTtExamType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Written">Written</SelectItem>
                    <SelectItem value="Online">Online</SelectItem>
                    <SelectItem value="Practical">Practical</SelectItem>
                    <SelectItem value="Viva">Viva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Exam Date</label>
                <Input type="date" value={ttExamDate} onChange={(e) => setTtExamDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Exam Time</label>
                <Input value={ttExamTime} onChange={(e) => setTtExamTime(e.target.value)} placeholder="e.g., 10:00 AM" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Duration</label>
                <Input value={ttExamDuration} onChange={(e) => setTtExamDuration(e.target.value)} placeholder="e.g., 1.5 hours" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Marks</label>
                <Input type="number" value={ttMaxMarks} onChange={(e) => setTtMaxMarks(e.target.value)} placeholder="e.g., 50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Room Number</label>
                <Input value={ttRoomNumber} onChange={(e) => setTtRoomNumber(e.target.value)} placeholder="e.g., A-201" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Faculty Name</label>
                <Input value={ttFacultyName} onChange={(e) => setTtFacultyName(e.target.value)} placeholder="e.g., Dr. Kumar" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Syllabus Coverage</label>
              <Textarea value={ttSyllabusCoverage} onChange={(e) => setTtSyllabusCoverage(e.target.value)} placeholder="e.g., Unit 1-3, Arrays, Linked Lists, Stacks..." className="min-h-[80px]" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea value={ttNotes} onChange={(e) => setTtNotes(e.target.value)} placeholder="Any additional instructions..." className="min-h-[60px]" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTimetableDialogOpen(false)}>
              <X className="w-4 h-4 mr-2" /> Cancel
            </Button>
            <Button onClick={handleSaveTimetable} disabled={isSaving} className="gradient-bg text-primary-foreground">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {editingTimetable ? 'Update' : 'Add'} Exam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
