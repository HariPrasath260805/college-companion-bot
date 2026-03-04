
-- Internal timetable table for exam schedules per subject
CREATE TABLE public.internal_timetable (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_name TEXT NOT NULL,
  subject_code TEXT,
  department TEXT NOT NULL,
  year TEXT,
  semester TEXT,
  internal_number TEXT NOT NULL DEFAULT '1st Internal',
  exam_date DATE,
  exam_time TEXT,
  exam_duration TEXT,
  syllabus_coverage TEXT,
  exam_type TEXT DEFAULT 'Written',
  max_marks NUMERIC(5,2),
  room_number TEXT,
  faculty_name TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.internal_timetable ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "Anyone can read internal_timetable" ON public.internal_timetable
  FOR SELECT USING (true);

-- Admins can manage
CREATE POLICY "Admins can manage internal_timetable" ON public.internal_timetable
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Update timestamp trigger
CREATE TRIGGER update_internal_timetable_updated_at BEFORE UPDATE ON public.internal_timetable
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
