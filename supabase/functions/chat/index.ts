import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
}

// UMIS ID pattern: alphanumeric, typically like "22UACS001"
const UMIS_PATTERN = /\b(\d{2}[A-Z]{2,5}\d{3,4})\b/i;

// Normalize text for comparison
function normalize(text: string): string {
  return text.toLowerCase().replace(/[?.,!'"]/g, '').replace(/\s+/g, ' ').trim();
}

// Extract key terms (remove filler words)
const fillerWords = ['what', 'is', 'the', 'of', 'for', 'a', 'an', 'in', 'to', 'and', 'or', 'how', 'much', 'show', 'me', 'tell', 'please', 'can', 'you', 'about', 'explain', 'give', 'details', 'my', 'get', 'find', 'search'];

function extractKeyTerms(text: string): string[] {
  return normalize(text).split(' ').filter(w => w.length > 1 && !fillerWords.includes(w));
}

// Action words that indicate specific info request
const actionWords = ['fee', 'fees', 'cost', 'price', 'admission', 'result', 'results', 'exam', 'exams',
  'schedule', 'timing', 'deadline', 'date', 'contact', 'phone', 'email', 'address', 'hostel',
  'placement', 'syllabus', 'eligibility', 'documents', 'required', 'process', 'apply', 'registration',
  'attendance', 'cgpa', 'marks', 'grade', 'department', 'course', 'faculty', 'staff', 'library',
  'scholarship', 'sports', 'club', 'event', 'notice', 'circular', 'holiday', 'vacation'];

// Critical terms for exact matching
const criticalTerms = ['1st', '2nd', '3rd', '4th', '5th', '6th', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth',
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'semester'];

/**
 * Search the database across multiple tables
 * Priority: UMIS student lookup > faq_data > questions > college_documents
 */
async function searchDatabase(supabaseClient: any, userMessage: string) {
  const normalizedInput = normalize(userMessage);
  const inputTerms = extractKeyTerms(userMessage);

  // 1. Check for UMIS ID pattern - fetch student record
  const umisMatch = userMessage.match(UMIS_PATTERN);
  if (umisMatch) {
    const umisId = umisMatch[1].toUpperCase();
    const { data: student, error } = await supabaseClient
      .from('students')
      .select('umis_id, name, department, year, section, attendance, cgpa, fee_status, email')
      .eq('umis_id', umisId)
      .maybeSingle();

    if (error) {
      console.error('Student lookup error:', error);
    }

    if (student) {
      return {
        type: 'student',
        source: 'database',
        data: student,
        message: formatStudentCard(student),
      };
    } else {
      return {
        type: 'student_not_found',
        source: 'database',
        message: `No student record found for UMIS ID: ${umisId}. Please verify the ID and try again, or contact the college office for assistance.`,
      };
    }
  }

  // 2. Search faq_data table
  const { data: faqs } = await supabaseClient.from('faq_data').select('*');
  if (faqs && faqs.length > 0) {
    const faqMatch = findBestTextMatch(faqs, 'question', 'answer', normalizedInput, inputTerms);
    if (faqMatch) {
      return {
        type: 'faq',
        source: 'database',
        message: faqMatch.answer,
        category: faqMatch.category,
      };
    }
  }

  // 3. Search questions table (existing knowledge base)
  const { data: questions } = await supabaseClient.from('questions').select('*');
  if (questions && questions.length > 0) {
    const qMatch = findBestQuestionMatch(questions, normalizedInput, inputTerms);
    if (qMatch) {
      if (qMatch.ambiguous) {
        const options = qMatch.matches.map((q: any, i: number) => `${i + 1}. ${q.question_en}`).join('\n');
        return {
          type: 'ambiguous',
          source: 'database',
          message: `I found multiple possible answers. Could you please clarify?\n\n${options}\n\nPlease provide more specific details.`,
        };
      }
      return {
        type: 'question',
        source: 'database',
        message: qMatch.match.answer_en,
        image_url: qMatch.match.image_url || null,
        video_url: qMatch.match.video_url || null,
        website_url: qMatch.match.website_url || null,
      };
    }
  }

  // 4. Search college_documents (JSONB)
  const { data: docs } = await supabaseClient.from('college_documents').select('*');
  if (docs && docs.length > 0) {
    const docMatch = findDocumentMatch(docs, normalizedInput, inputTerms);
    if (docMatch) {
      return {
        type: 'document',
        source: 'database',
        message: formatDocumentResponse(docMatch),
        document_title: docMatch.title,
        document_data: docMatch.data,
      };
    }
  }

  // No database match found
  return null;
}

/**
 * Generic text matching for faq_data
 */
function findBestTextMatch(items: any[], questionField: string, answerField: string, normalizedInput: string, inputTerms: string[]) {
  let bestScore = 0;
  let bestMatch: any = null;

  for (const item of items) {
    const questionText = normalize(item[questionField]);
    const questionTerms = extractKeyTerms(item[questionField]);
    const keywords = item.keywords?.map((k: string) => k.toLowerCase().trim()) || [];
    let score = 0;

    // Exact match
    if (normalizedInput === questionText) { score = 100; }
    // Keyword phrase match
    else if (keywords.some((kw: string) => normalize(kw) === normalizedInput)) { score = 95; }
    // Term overlap
    else {
      const matchedTerms = inputTerms.filter(t => questionTerms.includes(t));
      const ratio = inputTerms.length > 0 ? matchedTerms.length / inputTerms.length : 0;
      if (ratio >= 0.7 && matchedTerms.length >= 2) { score = 80 + ratio * 15; }
    }

    if (score > bestScore && score >= 70) {
      bestScore = score;
      bestMatch = item;
    }
  }
  return bestMatch;
}

/**
 * Advanced matching for questions table (preserves existing logic)
 */
function findBestQuestionMatch(questions: any[], normalizedInput: string, inputTerms: string[]) {
  const hasActionWord = inputTerms.some(term => actionWords.includes(term));
  const isExplanationQuery = !hasActionWord && inputTerms.length >= 1;
  if (isExplanationQuery) return null;

  const singleCommonWords = ['fee', 'fees', 'exam', 'result', 'admission', 'course', 'hostel'];
  const isVagueQuery = inputTerms.length === 1 && singleCommonWords.includes(inputTerms[0]);

  const scored = questions.map(q => {
    const questionText = normalize(q.question_en);
    const questionTerms = extractKeyTerms(q.question_en);
    const keywords = q.keywords?.map((k: string) => k.toLowerCase().trim()) || [];
    let score = 0;

    if (normalizedInput === questionText) { score = 100; }
    else if (keywords.some((kw: string) => normalize(kw) === normalizedInput)) { score = 98; }
    else if (keywords.some((kw: string) => {
      const kwTerms = extractKeyTerms(kw);
      return inputTerms.filter(t => kwTerms.includes(t)).length === inputTerms.length && inputTerms.length >= 1;
    })) { score = 92; }
    else if (inputTerms.length >= 1) {
      const matchedTerms = inputTerms.filter(term => questionTerms.some(qt => qt === term));
      const inputActionWords = inputTerms.filter(t => actionWords.includes(t));
      const questionActionWords = questionTerms.filter(t => actionWords.includes(t));
      const actionWordMatch = inputActionWords.length > 0 && inputActionWords.some(iaw => questionActionWords.includes(iaw));

      const inputSubjectWords = inputTerms.filter(t => !actionWords.includes(t));
      const questionSubjectWords = questionTerms.filter(t => !actionWords.includes(t));
      const subjectMatchRatio = inputSubjectWords.length > 0 
        ? inputSubjectWords.filter(isw => questionSubjectWords.includes(isw)).length / inputSubjectWords.length : 0;

      // Critical term mismatch check
      const inputCritical = inputTerms.filter(t => criticalTerms.includes(t));
      const questionCritical = questionTerms.filter(t => criticalTerms.includes(t));
      const criticalMismatch = inputCritical.length > 0 && questionCritical.length > 0 && (
        inputCritical.some(ic => !questionCritical.includes(ic)) || questionCritical.some(qc => !inputCritical.includes(qc))
      );

      if (criticalMismatch) { score = 0; }
      else if (matchedTerms.length === inputTerms.length && inputTerms.length >= 2) { score = 95; }
      else if (actionWordMatch && subjectMatchRatio >= 0.7) { score = 85 + subjectMatchRatio * 10; }
    }

    return { ...q, score };
  });

  const CONFIDENCE_THRESHOLD = isVagueQuery ? 85 : 70;
  const matches = scored.filter(q => q.score >= CONFIDENCE_THRESHOLD).sort((a, b) => b.score - a.score);
  if (matches.length === 0) return null;

  const topScore = matches[0].score;
  const topMatches = matches.filter(m => m.score >= topScore - 5);
  if (topMatches.length > 1 && topScore < 90) {
    return { ambiguous: true, matches: topMatches.slice(0, 3) };
  }
  return { ambiguous: false, match: matches[0] };
}

/**
 * Search college_documents including JSONB data
 */
function findDocumentMatch(docs: any[], normalizedInput: string, inputTerms: string[]) {
  let bestScore = 0;
  let bestDoc: any = null;

  for (const doc of docs) {
    let score = 0;
    const titleNorm = normalize(doc.title);
    const categoryNorm = normalize(doc.category || '');
    const dataStr = normalize(JSON.stringify(doc.data));

    // Title match
    if (normalizedInput.includes(titleNorm) || titleNorm.includes(normalizedInput)) { score = 90; }
    // Category match + term overlap
    else if (inputTerms.some(t => categoryNorm.includes(t))) {
      const dataTermMatch = inputTerms.filter(t => dataStr.includes(t)).length;
      score = 60 + (dataTermMatch / Math.max(inputTerms.length, 1)) * 30;
    }
    // Full text search in JSONB
    else {
      const dataTermMatch = inputTerms.filter(t => dataStr.includes(t)).length;
      if (dataTermMatch >= 2) { score = 50 + (dataTermMatch / Math.max(inputTerms.length, 1)) * 30; }
    }

    if (score > bestScore && score >= 65) {
      bestScore = score;
      bestDoc = doc;
    }
  }
  return bestDoc;
}

/**
 * Format student data as a structured card response
 */
function formatStudentCard(student: any): string {
  return [
    `📋 Student Information`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🆔 UMIS ID: ${student.umis_id}`,
    `👤 Name: ${student.name}`,
    `🏛️ Department: ${student.department || 'N/A'}`,
    `📅 Year: ${student.year || 'N/A'}`,
    `📌 Section: ${student.section || 'N/A'}`,
    `📊 Attendance: ${student.attendance != null ? student.attendance + '%' : 'N/A'}`,
    `📈 CGPA: ${student.cgpa != null ? student.cgpa : 'N/A'}`,
    `💰 Fee Status: ${student.fee_status || 'N/A'}`,
    `━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n');
}

/**
 * Format college document JSONB data as readable response
 */
function formatDocumentResponse(doc: any): string {
  const lines = [`📄 ${doc.title}`, `━━━━━━━━━━━━━━━━━━━━`];
  
  if (typeof doc.data === 'object' && doc.data !== null) {
    for (const [key, value] of Object.entries(doc.data)) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (Array.isArray(value)) {
        lines.push(`\n${label}:`);
        (value as any[]).forEach((item, i) => {
          if (typeof item === 'object') {
            lines.push(`  ${i + 1}. ${Object.entries(item).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
          } else {
            lines.push(`  ${i + 1}. ${item}`);
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        lines.push(`\n${label}:`);
        for (const [subKey, subVal] of Object.entries(value as Record<string, unknown>)) {
          lines.push(`  ${subKey}: ${subVal}`);
        }
      } else {
        lines.push(`${label}: ${value}`);
      }
    }
  }
  
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  return lines.join('\n');
}

// ============= Main Handler =============

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, language = 'en' } = await req.json();

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client for DB search
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const lastUserMessage = messages[messages.length - 1]?.content || '';
    const hasImage = !!messages[messages.length - 1]?.image_url;

    // ========== STEP 1: Search Database First (skip for image inputs) ==========
    if (!hasImage && lastUserMessage.trim()) {
      const dbResult = await searchDatabase(supabaseClient, lastUserMessage);

      if (dbResult) {
        // Student not found is still a DB result - don't fallback to AI for personal data
        if (dbResult.type === 'student_not_found') {
          return new Response(
            JSON.stringify({
              message: dbResult.message,
              source: 'database',
              result_type: 'student_not_found',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            message: dbResult.message,
            source: 'database',
            result_type: dbResult.type,
            image_url: dbResult.image_url || null,
            video_url: dbResult.video_url || null,
            website_url: dbResult.website_url || null,
            document_data: dbResult.document_data || null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ========== STEP 2: AI Fallback ==========
    const languageNames: Record<string, string> = { en: 'English', ta: 'Tamil' };
    const languageName = languageNames[language] || 'English';

    const systemPrompt = `You are a knowledgeable college assistant chatbot. You help students and staff with education and college-related questions.

CRITICAL CONTEXT:
- The system checked the college database first but found no specific answer.
- Your role is to provide helpful, accurate information using your general knowledge.

YOUR EXPERTISE INCLUDES:
- General education concepts, subjects, and academic guidance
- Typical college procedures (admissions, exams, fees, scholarships)
- Career guidance and placement preparation
- Study tips and academic success strategies

MANDATORY RULES:
1. Always respond in ${languageName} language
2. Be helpful, accurate, and student-friendly
3. Use a clear, concise, and professional tone
4. Do NOT use emojis in your responses
5. For specific college data (exact fees, dates, contact numbers), recommend contacting the college office
6. When analyzing images, extract and explain the key information clearly
7. NEVER return an empty response
8. Do NOT reveal that you are an AI fallback or mention database searches

You MUST respond with a JSON object:
{
  "type": "response",
  "text": "<your detailed response in ${languageName}>",
  "links": [
    {"title": "<Short title>", "url": "<valid URL>"}
  ]
}

Include 2-4 relevant learning links from trusted sources.
RESPOND ONLY WITH THE JSON OBJECT.`;

    const formattedMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

    for (const msg of messages) {
      if (msg.role === 'user' && msg.image_url) {
        formattedMessages.push({
          role: 'user',
          content: [
            { type: 'text', text: msg.content || 'Please analyze this image.' },
            { type: 'image_url', image_url: { url: msg.image_url } }
          ]
        });
      } else {
        formattedMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: formattedMessages,
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please contact support.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    let aiMessage = data.choices?.[0]?.message?.content || '';
    
    if (!aiMessage || aiMessage.trim().length < 10) {
      aiMessage = "I don't have exact information for this. Please contact the college helpdesk for assistance.";
    }

    // Parse AI response
    let responseMessage = aiMessage;
    let links: any[] | null = null;

    try {
      let cleaned = aiMessage.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);
      if (parsed.text) responseMessage = parsed.text;
      if (parsed.links && Array.isArray(parsed.links)) {
        links = parsed.links.filter((l: any) => l.title && l.url && l.url.startsWith('http')).slice(0, 5);
      }
    } catch {
      // Use raw text if not JSON
    }

    return new Response(
      JSON.stringify({
        message: responseMessage,
        source: 'ai',
        result_type: 'ai_response',
        links: links,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in chat function:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat request', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
