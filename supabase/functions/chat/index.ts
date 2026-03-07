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
function normalize(text: string | null | undefined): string {
  if (!text) return '';
  return String(text).toLowerCase().replace(/[?.,!'"]/g, '').replace(/\s+/g, ' ').trim();
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

// Exam-related keywords
const examKeywords = ['internal', 'exam', 'test', 'timetable', 'schedule', 'date', 'when'];

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

  // 4. Search internal_timetable
  const { data: timetable } = await supabaseClient.from('internal_timetable').select('*');
  if (timetable && timetable.length > 0) {
    const ttMatch = findTimetableMatch(timetable, normalizedInput, inputTerms);
    if (ttMatch) {
      return {
        type: 'timetable',
        source: 'database',
        message: formatTimetableCard(ttMatch),
      };
    }
  }

  // 5. Search college_documents by Regno ONLY (not by name)
  // Check if input contains a numeric registration number (any digit count)
  const regnoPattern = /\b(\d+)\b/;
  const regnoMatch = userMessage.match(regnoPattern);
  if (regnoMatch) {
    const regnoValue = parseInt(regnoMatch[1]);
    const { data: docs } = await supabaseClient
      .from('college_documents')
      .select('*')
      .eq('Regno', regnoValue);
    
    if (docs && docs.length === 1) {
      return {
        type: 'document',
        source: 'database',
        message: formatDocumentResponse(docs[0]),
        document_title: docs[0].Name || 'College Document',
        document_data: { Name: docs[0].Name, Department: docs[0].Department, Year: docs[0].Year, Regno: docs[0].Regno },
      };
    } else if (docs && docs.length > 1) {
      // Multiple records with same regno (shouldn't happen but handle it)
      const list = docs.map((d: any) => `- ${d.Name} (Dept: ${d.Department}, Year: ${d.Year})`).join('\n');
      return {
        type: 'document',
        source: 'database',
        message: `Multiple records found for Regno ${regnoValue}:\n${list}\n\nPlease contact the admin for clarification.`,
      };
    } else {
      // Regno was provided but no match found
      return {
        type: 'document_not_found',
        source: 'database',
        message: `No record found for Registration Number: ${regnoValue}. Please verify the number and try again.`,
      };
    }
  }

  // If user seems to be asking about a person by name, redirect to use Regno/UMIS
  const nameQueryIndicators = ['details', 'info', 'information', 'who', 'student', 'about'];
  const hasNameQuery = inputTerms.some(t => nameQueryIndicators.includes(t));
  const looksLikePersonName = !umisMatch && !regnoMatch && inputTerms.length <= 4 && 
    !inputTerms.some(t => actionWords.includes(t)) && 
    !inputTerms.some(t => examKeywords.includes(t));
  
  // Check if any input term matches a name in college_documents
  if (hasNameQuery || looksLikePersonName) {
    const { data: allDocs } = await supabaseClient.from('college_documents').select('Name, Regno');
    if (allDocs && allDocs.length > 0) {
      const matchingDocs = allDocs.filter((d: any) => {
        const nameNorm = normalize(d.Name);
        return inputTerms.some(t => nameNorm.includes(t) && t.length > 2);
      });
      if (matchingDocs.length > 0) {
        return {
          type: 'name_redirect',
          source: 'database',
          message: `I found ${matchingDocs.length} record(s) matching that name. For accurate results, please provide the Registration Number (Regno) or UMIS ID instead of a name, as multiple students may share similar names.\n\nExample: "details of 12345" or "22UACS001"`,
        };
      }
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
  // Score all docs
  const scored = docs.map(doc => {
    let score = 0;
    const nameNorm = normalize(doc.Name);
    const deptNorm = normalize(doc.Department);
    const allText = `${nameNorm} ${deptNorm} ${doc.Regno || ''} ${doc.Year || ''}`.toLowerCase();

    // Exact full name match
    if (nameNorm && normalizedInput === nameNorm) { score = 100; }
    // Full name contained
    else if (nameNorm && normalizedInput.includes(nameNorm)) { score = 95; }
    // Partial name match - check if ALL input name terms match in the name
    else if (nameNorm) {
      const nameTerms = nameNorm.split(' ').filter(t => t.length > 1);
      const inputNameTerms = inputTerms.filter(t => !['name', 'details', 'info', 'document', 'student', 'regno', 'department', 'year'].includes(t));
      if (inputNameTerms.length > 0) {
        const matchedInName = inputNameTerms.filter(t => nameTerms.some(nt => nt.includes(t) || t.includes(nt)));
        if (matchedInName.length === inputNameTerms.length && inputNameTerms.length >= 1) {
          score = 85;
        } else if (matchedInName.length > 0 && matchedInName.length < inputNameTerms.length) {
          // Partial name match - could be ambiguous
          score = 60 + (matchedInName.length / inputNameTerms.length) * 20;
        }
      }
    }
    // Department match + term overlap
    if (score < 60 && deptNorm && inputTerms.some(t => deptNorm.includes(t))) {
      const dataTermMatch = inputTerms.filter(t => allText.includes(t)).length;
      score = Math.max(score, 60 + (dataTermMatch / Math.max(inputTerms.length, 1)) * 30);
    }
    // Regno exact match
    if (doc.Regno && inputTerms.some(t => String(doc.Regno) === t)) {
      score = 98;
    }

    return { ...doc, score };
  });

  const THRESHOLD = 65;
  const matches = scored.filter(d => d.score >= THRESHOLD).sort((a, b) => b.score - a.score);
  
  if (matches.length === 0) return null;
  
  // If multiple matches with similar scores (ambiguous - e.g. "karthi" matches "karthi geyan" and "karthi kumar")
  const topScore = matches[0].score;
  const ambiguousMatches = matches.filter(m => m.score >= topScore - 10);
  
  if (ambiguousMatches.length > 1 && topScore < 95) {
    // Return special ambiguous result
    return { _ambiguous: true, _matches: ambiguousMatches.slice(0, 5) };
  }
  
  return matches[0];
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
  const lines = [`📄 College Document`, `━━━━━━━━━━━━━━━━━━━━`];
  
  if (doc.Name) lines.push(`👤 Name: ${doc.Name}`);
  if (doc.Regno) lines.push(`🆔 Reg No: ${doc.Regno}`);
  if (doc.Department) lines.push(`🏛️ Department: ${doc.Department}`);
  if (doc.Year) lines.push(`📅 Year: ${doc.Year}`);
  
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  return lines.join('\n');
}

/**
 * Search internal_timetable by subject name/code
 */
function findTimetableMatch(entries: any[], normalizedInput: string, inputTerms: string[]) {
  const examKeywords = ['internal', 'exam', 'test', 'timetable', 'schedule', 'date', 'when'];
  const hasExamContext = inputTerms.some(t => examKeywords.includes(t));
  
  // Detect which internal number the user is asking about
  const internalNumberMap: Record<string, string[]> = {
    '1st Internal': ['1st', 'first', '1', 'internal 1'],
    '2nd Internal': ['2nd', 'second', '2', 'internal 2'],
    '3rd Internal': ['3rd', 'third', '3', 'internal 3'],
    '4th Internal': ['4th', 'fourth', '4', 'internal 4'],
    '5th Internal': ['5th', 'fifth', '5', 'internal 5'],
  };
  
  let requestedInternal: string | null = null;
  for (const [internalName, patterns] of Object.entries(internalNumberMap)) {
    for (const pattern of patterns) {
      // Check for patterns like "2nd internal", "internal 2", "second internal"
      if (normalizedInput.includes(pattern + ' internal') || 
          normalizedInput.includes('internal ' + pattern) ||
          normalizedInput.includes(pattern + ' exam') ||
          // Check standalone ordinals like "2nd" in context of exam/internal
          (hasExamContext && inputTerms.includes(pattern))) {
        requestedInternal = internalName;
        break;
      }
    }
    if (requestedInternal) break;
  }

  let bestScore = 0;
  let bestMatch: any = null;

  for (const entry of entries) {
    let score = 0;
    const subjectNorm = normalize(entry.subject_name);
    const codeNorm = normalize(entry.subject_code);
    const deptNorm = normalize(entry.department);
    const entryInternalNorm = normalize(entry.internal_number);

    // If user asked for a specific internal number, SKIP entries that don't match
    if (requestedInternal && entryInternalNorm !== normalize(requestedInternal)) {
      continue; // Skip this entry entirely
    }

    // Exact subject name match
    if (normalizedInput.includes(subjectNorm) || subjectNorm.includes(normalizedInput)) {
      score = 95;
    }
    // Subject code match
    else if (codeNorm && (normalizedInput.includes(codeNorm) || codeNorm.includes(normalizedInput))) {
      score = 93;
    }
    // Term overlap with subject
    else {
      const subjectTerms = extractKeyTerms(entry.subject_name);
      // Filter out exam/internal related terms for subject matching
      const subjectInputTerms = inputTerms.filter(t => !examKeywords.includes(t) && !['1st', '2nd', '3rd', '4th', '5th', 'first', 'second', 'third', 'fourth', 'fifth', '1', '2', '3', '4', '5'].includes(t));
      const matched = subjectInputTerms.filter(t => subjectTerms.includes(t) || subjectNorm.includes(t));
      const ratio = subjectInputTerms.length > 0 ? matched.length / subjectInputTerms.length : 0;
      if (matched.length >= 1 && (hasExamContext || ratio >= 0.5)) {
        score = 60 + ratio * 30;
      }
    }

    if (score > bestScore && score >= 65) {
      bestScore = score;
      bestMatch = entry;
    }
  }
  return bestMatch;
}

/**
 * Format internal timetable entry as a structured card
 */
function formatTimetableCard(entry: any): string {
  const lines = [
    `📋 Internal Exam Schedule`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📚 Subject: ${entry.subject_name}${entry.subject_code ? ` (${entry.subject_code})` : ''}`,
    `🏛️ Department: ${entry.department}`,
  ];
  if (entry.year) lines.push(`📅 Year: ${entry.year}`);
  if (entry.semester) lines.push(`📌 Semester: ${entry.semester}`);
  lines.push(`📝 ${entry.internal_number}`);
  if (entry.exam_date) lines.push(`📆 Date: ${new Date(entry.exam_date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
  if (entry.exam_time) lines.push(`🕐 Time: ${entry.exam_time}`);
  if (entry.exam_duration) lines.push(`⏱️ Duration: ${entry.exam_duration}`);
  if (entry.exam_type) lines.push(`📄 Type: ${entry.exam_type}`);
  if (entry.max_marks) lines.push(`💯 Max Marks: ${entry.max_marks}`);
  if (entry.room_number) lines.push(`🏫 Room: ${entry.room_number}`);
  if (entry.faculty_name) lines.push(`👨‍🏫 Faculty: ${entry.faculty_name}`);
  if (entry.syllabus_coverage) lines.push(`\n📖 Syllabus Coverage:\n${entry.syllabus_coverage}`);
  if (entry.notes) lines.push(`\n📌 Notes: ${entry.notes}`);
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
