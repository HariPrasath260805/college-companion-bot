const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
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

    // Build system prompt with language context
    const languageNames: Record<string, string> = {
      en: 'English',
      ta: 'Tamil',
      hi: 'Hindi',
      te: 'Telugu',
      kn: 'Kannada',
      ml: 'Malayalam',
    };

    const languageName = languageNames[language] || 'English';

    const systemPrompt = `You are an intelligent AI assistant for a college. You help students and staff with information about:
- Admissions and enrollment procedures
- Course details, syllabus, and curriculum
- Fee structures and payment information
- Exam schedules and academic calendar
- Campus facilities and resources
- Placement and career services
- Hostel and accommodation
- Events and extracurricular activities
- General college policies and guidelines

IMPORTANT INSTRUCTIONS:
1. Always respond in ${languageName} language
2. Be helpful, friendly, and professional
3. If you don't know something specific to this college, provide general guidance and suggest contacting the relevant department
4. When analyzing images (notices, timetables, circulars), extract and explain the key information
5. Keep responses concise but informative

If the user asks to change the language, acknowledge the change and respond in the new language from then on.`;

    // Format messages for the AI
    const formattedMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    for (const msg of messages) {
      if (msg.role === 'user' && msg.image_url) {
        // Message with image
        formattedMessages.push({
          role: 'user',
          content: [
            { type: 'text', text: msg.content || 'Please analyze this image.' },
            { type: 'image_url', image_url: { url: msg.image_url } }
          ]
        });
      } else {
        formattedMessages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    // Call Lovable AI Gateway
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: formattedMessages,
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiMessage = data.choices?.[0]?.message?.content || 'I apologize, but I could not generate a response. Please try again.';

    return new Response(
      JSON.stringify({ 
        message: aiMessage,
        source: 'ai'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in chat function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to process chat request',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
