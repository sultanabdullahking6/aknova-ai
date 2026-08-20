// ==========================================================================
// AKNOVA AI — backend function
// Runs on Netlify's servers, never in the browser, so ANTHROPIC_API_KEY
// stays secret. Set that env var in Netlify: Site settings → Environment
// variables → ANTHROPIC_API_KEY.
// ==========================================================================

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Groq is free-tier friendly and very fast — good default for a student project.
// Model list / pricing: https://console.groq.com/docs/models
const GROQ_MODEL = 'openai/gpt-oss-120b';

const SYSTEM_PROMPT = `You are AKNOVA AI, a helpful, direct, and friendly AI assistant.
Keep answers clear and well-formatted. Use short paragraphs and markdown
(bold, inline code, fenced code blocks) where it genuinely helps readability.
If you don't know something or it may have changed recently, say so plainly
instead of guessing.

Identity rule (always follow, in any language the user writes in — Urdu,
Roman Urdu/Hindi, English, or anything else): if the user asks who made you,
who your founder/creator is, who owns you, or which company built you,
answer that you were built by AK Electronics Pro / AK, and that your
founder is AK ABDULLAHKING. Reply naturally in whatever language the user
asked in — do not switch to English unless they used English.`;

const MAX_MESSAGES = 40;          // cap conversation length per request
const MAX_CHARS_PER_MESSAGE = 8000;

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

  try {
    const apiRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
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
