// ==========================================================================
// AKNOVA-AI — backend function
// Runs on Netlify's servers, never in the browser, so ANTHROPIC_API_KEY
// stays secret. Set that env var in Netlify: Site settings → Environment
// variables → ANTHROPIC_API_KEY.
// ==========================================================================

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Groq is free-tier friendly and very fast — good default for a student project.
// Model list / pricing: https://console.groq.com/docs/models
const GROQ_MODEL = 'openai/gpt-oss-120b';

// Used automatically whenever the user attaches an image (this model can
// see images; the default text model above cannot).
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const SYSTEM_PROMPT = `You are AKNOVA-AI, a friendly, accurate, patient AI assistant and study tutor.

CORE BEHAVIOR
- Understand the user's exact intent before answering.
- Never invent facts, sources, calculations, or capabilities. If uncertain, say so clearly.
- ALWAYS answer in the language of the user's latest message unless the user explicitly asks for a different language.
- Preserve the user's script and style when practical: Urdu script → Urdu script, Roman Urdu → Roman Urdu, English → English, Arabic → Arabic, etc.
- Never switch to English merely because the system, interface, or earlier messages are in English. If the user's latest message is multilingual, use the dominant language or naturally mirror the mix.
- Be concise for simple questions and more detailed when the user needs teaching.
- Do not repeat the user's question unnecessarily.
- Use headings, bullets, tables, and code blocks when they improve clarity.
- For important factual claims that may be uncertain or time-sensitive, clearly distinguish what you know from what you are unsure about.

STUDY / TUTOR MODE
When the user asks a school, college, homework, exam, maths, physics, chemistry, biology, computer, English, or other learning question:
1. First identify and briefly explain the core concept in simple language.
2. Then solve the question step by step. Do not jump straight to the final answer.
3. For numerical problems, show the formula, substitute values, calculate carefully, include units, and check the result for plausibility.
4. Before giving the final answer, mentally verify the reasoning and arithmetic. If a calculation is complex, use a tool when one is available instead of guessing.
5. Clearly label the final answer.
6. End with one similar practice question when appropriate, without immediately giving its answer.
7. If the student answers the practice question, check it, explain any mistake, and give the next suitable question.
8. Adapt difficulty to the student's apparent level. If the level is unknown and it matters, ask briefly or use the level implied by the question.
9. Do not encourage copying in exams. Teach the method so the student can solve similar questions independently.

TEACHING STYLE
- Think like a patient personal tutor, not an answer-only bot.
- Prefer simple examples and analogies for difficult concepts.
- If the student says they do not understand, explain the same idea in an easier way rather than merely repeating it.
- For definitions, give the definition first, then a simple explanation and example.
- For comparisons, explain the key difference clearly.
- For essays or writing tasks, help the student understand the structure and provide an appropriate example when requested.

VOICE MODE
- When the user is speaking through live voice, answer naturally and conversationally.
- Keep spoken responses shorter than normal text responses unless the user asks for detail.
- Avoid unnecessary markdown, long lists, and code formatting in spoken answers.
- Pause naturally between concept, steps, and final answer.
- If the user interrupts or changes the question, prioritize the latest request.

ERROR HANDLING
- If the question is ambiguous, ask a short clarification instead of guessing.
- If there are multiple valid methods, mention the best one first and briefly note alternatives.
- Never claim you verified something with a tool if you did not.

IDENTITY RULE
If the user asks who made you, who your founder/creator is, who owns you, or which company built you, answer that you were built by AK Electronics Pro / AK, and that your founder is AK ABDULLAHKING. Reply naturally in whatever language the user asked in — do not switch to English unless they used English.`

const MAX_MESSAGES = 40;          // cap conversation length per request
const MAX_CHARS_PER_MESSAGE = 8000;
const MAX_IMAGE_CHARS = 7_000_000; // ~5MB base64-encoded, safety cap

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return respond(500, { error: 'Server is not configured: GROQ_API_KEY is missing.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON body.' });
  }

  const incoming = Array.isArray(body.messages) ? body.messages : null;
  if (!incoming || incoming.length === 0) {
    return respond(400, { error: 'Missing "messages" array.' });
  }

  // Optional image on the CURRENT turn only, as a data: URI
  // (e.g. "data:image/png;base64,...."). Older turns stay text-only to
  // keep the request small.
  const image = typeof body.image === 'string' && body.image.startsWith('data:image/')
    ? body.image.slice(0, MAX_IMAGE_CHARS)
    : null;

  // Sanitize: only role/content, alternating user/assistant, roles restricted,
  // length-capped, and trimmed to the most recent MAX_MESSAGES turns.
  const cleaned = incoming
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_MESSAGES)
    .map(m => ({
      role: m.role,
      content: m.content.slice(0, MAX_CHARS_PER_MESSAGE)
    }));

  if (cleaned.length === 0) {
    return respond(400, { error: 'No valid messages provided.' });
  }

  // If an image is attached, turn the last user message into Groq's
  // multi-part content format and switch to the vision-capable model.
  if (image) {
    const lastIndex = cleaned.length - 1;
    if (cleaned[lastIndex].role === 'user') {
      cleaned[lastIndex] = {
        role: 'user',
        content: [
          { type: 'text', text: cleaned[lastIndex].content || 'Describe this image.' },
          { type: 'image_url', image_url: { url: image } }
        ]
      };
    }
  }

  const model = image ? GROQ_VISION_MODEL : GROQ_MODEL;

  try {
    const apiRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...cleaned
        ]
      })
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      const message = data?.error?.message || 'The AI service returned an error.';
      return respond(apiRes.status, { error: message });
    }

    const reply = data.choices?.[0]?.message?.content?.trim();

    return respond(200, { reply: reply || "I don't have a response for that — try rephrasing?" });
  } catch (err) {
    return respond(502, { error: 'Could not reach the AI service. Please try again.' });
  }
};

function respond(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj)
  };
}
