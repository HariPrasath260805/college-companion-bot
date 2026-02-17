-- Add video_url and website_url columns to questions table
ALTER TABLE public.questions ADD COLUMN video_url text DEFAULT NULL;
ALTER TABLE public.questions ADD COLUMN website_url text DEFAULT NULL;