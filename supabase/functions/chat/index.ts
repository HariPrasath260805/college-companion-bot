const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
}

// Keywords that trigger image generation for educational content
const imageGenerationTriggers = [
  'explain', 'explanation', 'diagram', 'flow', 'process', 'architecture',
  'example', 'show me', 'draw', 'image', 'illustrate', 'visualize',
  'how does', 'how it works', 'structure', 'flowchart', 'chart',
  'demonstrate', 'depict', 'represent', 'layout', 'design', 'model'
];

// Topics that should NOT trigger image generation
const noImageTopics = [
  'fees', 'fee structure', 'phone', 'contact', 'address', 'email',
  'timing', 'hours', 'date', 'deadline', 'cost', 'price', 'number',
  'location', 'directions', 'office', 'registration number'
];

function shouldGenerateImage(content: string): boolean {
  const contentLower = content.toLowerCase();
  
  // Check if any no-image topic is present
  const hasNoImageTopic = noImageTopics.some(topic => contentLower.includes(topic));
  if (hasNoImageTopic) return false;
  
  // Check if any image generation trigger is present
  return imageGenerationTriggers.some(trigger => contentLower.includes(trigger));
}

function extractTopicForImage(content: string): string {
  // Extract the main topic for image generation
  const contentLower = content.toLowerCase();
  
  // Remove common question words
  let topic = contentLower
    .replace(/^(what|how|can you|please|explain|show me|draw|tell me about|describe)\s*/gi, '')
    .replace(/\?+$/, '')
    .trim();
  
  return topic;
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
    const lastUserMessage = messages[messages.length - 1]?.content || '';
    const needsImage = shouldGenerateImage(lastUserMessage);

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

${needsImage ? `
SPECIAL INSTRUCTION FOR THIS RESPONSE:
The user is asking for an explanation or visualization. You MUST respond with a JSON object in this exact format:
{
  "type": "text+image+links",
  "text": "<your detailed explanation in ${languageName}>",
  "image_prompt": "<detailed English prompt for generating an educational diagram/illustration that helps explain the concept. Include: clean background, labeled components, educational style, college-level clarity>",
  "links": [
    {"title": "<resource name>", "url": "<valid educational URL>"},
    {"title": "<resource name>", "url": "<valid educational URL>"}
  ]
}

For image_prompt: Create detailed, educational diagrams with labeled components, clean minimal backgrounds, and clear visual hierarchy.
For links: Provide 2-3 trusted educational resources (official docs, Wikipedia, YouTube tutorials, educational blogs). Avoid ads, affiliate links, or random forums.

RESPOND ONLY WITH THE JSON OBJECT, NO OTHER TEXT.
` : ''}

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

    // Call Lovable AI Gateway for text response
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
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please contact support.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    let aiMessage = data.choices?.[0]?.message?.content || 'I apologize, but I could not generate a response. Please try again.';

    // Check if response is JSON (educational with image)
    let responseData: {
      message: string;
      source: string;
      generated_image?: string;
      links?: { title: string; url: string }[];
    } = {
      message: aiMessage,
      source: 'ai'
    };

    // Try to parse as JSON for image+links response
    if (needsImage) {
      try {
        // Clean up the response (remove markdown code blocks if present)
        let cleanedMessage = aiMessage.trim();
        if (cleanedMessage.startsWith('```json')) {
          cleanedMessage = cleanedMessage.slice(7);
        }
        if (cleanedMessage.startsWith('```')) {
          cleanedMessage = cleanedMessage.slice(3);
        }
        if (cleanedMessage.endsWith('```')) {
          cleanedMessage = cleanedMessage.slice(0, -3);
        }
        cleanedMessage = cleanedMessage.trim();

        const parsed = JSON.parse(cleanedMessage);
        
        if (parsed.type === 'text+image+links' && parsed.image_prompt) {
          responseData.message = parsed.text;
          responseData.links = parsed.links || [];

          // Generate the educational image using Lovable AI image model
          console.log('Generating educational image with prompt:', parsed.image_prompt);
          
          try {
            const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash-image-preview',
                messages: [
                  {
                    role: 'user',
                    content: `Generate an educational diagram: ${parsed.image_prompt}. Make it clean, professional, with labeled components suitable for college students.`
                  }
                ],
                modalities: ['image', 'text']
              }),
            });

            if (imageResponse.ok) {
              const imageData = await imageResponse.json();
              const generatedImageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
              
              if (generatedImageUrl) {
                responseData.generated_image = generatedImageUrl;
                console.log('Educational image generated successfully');
              }
            } else {
              console.error('Image generation failed:', await imageResponse.text());
            }
          } catch (imgError) {
            console.error('Error generating image:', imgError);
            // Continue without image - text response is still valid
          }
        }
      } catch (parseError) {
        console.log('Response is not JSON, using as plain text:', parseError);
        // Response is not JSON, use as-is
      }
    }

    return new Response(
      JSON.stringify(responseData),
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
