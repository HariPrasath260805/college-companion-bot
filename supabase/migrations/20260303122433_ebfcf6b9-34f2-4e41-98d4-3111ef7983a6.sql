
-- Students table for UMIS-based lookups
CREATE TABLE public.students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  umis_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  department TEXT,
  year TEXT,
  section TEXT,
  attendance NUMERIC(5,2),
  cgpa NUMERIC(4,2),
  fee_status TEXT DEFAULT 'pending',
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- FAQ data table for keyword-based Q&A
CREATE TABLE public.faq_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- College documents with flexible JSONB structure
CREATE TABLE public.college_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.college_documents ENABLE ROW LEVEL SECURITY;

-- Students: only authenticated users can read (single record lookups enforced in code)
CREATE POLICY "Authenticated users can read students" ON public.students
  FOR SELECT TO authenticated USING (true);

-- Admins can manage students
CREATE POLICY "Admins can manage students" ON public.students
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- FAQ: anyone can read, admins can manage
CREATE POLICY "Anyone can read faq_data" ON public.faq_data
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage faq_data" ON public.faq_data
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- College documents: anyone can read, admins can manage
CREATE POLICY "Anyone can read college_documents" ON public.college_documents
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage college_documents" ON public.college_documents
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Update timestamp triggers
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_faq_data_updated_at BEFORE UPDATE ON public.faq_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_college_documents_updated_at BEFORE UPDATE ON public.college_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
