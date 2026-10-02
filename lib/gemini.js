// Minimal Gemini client using the REST API, with retry on rate limits.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function geminiJSON(prompt, { temperature = 0.2, deadlineMs = 50000 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set.');
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const started = Date.now();

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature, responseMimeType: 'application/json' },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      try {
        return JSON.parse(text.replace(/```json|```/g, '').trim());
      } catch {
        if (attempt < 2) continue;
        throw new Error('Gemini returned text that is not valid JSON.');
      }
    }

    const body = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    const wait = Math.min(20000, 3000 * 2 ** attempt);
    if (!retryable || Date.now() - started + wait > deadlineMs) {
      throw new Error(`Gemini error ${res.status}: ${body.slice(0, 300)}`);
    }
    await sleep(wait);
  }
}
