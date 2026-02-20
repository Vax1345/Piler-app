// Netlify Function: generate.js
// Purpose: proxy requests from frontend to a Generative AI API (Replit AI Integrations or Google Gemini)
// Security: expects X-Proxy-Key header matching PROXY_SECRET env var. No secrets are stored in repo.

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const secret = process.env.PROXY_SECRET || '';
    const incomingSecret = (event.headers['x-proxy-key'] || event.headers['X-Proxy-Key'] || '').trim();
    if (!secret || incomingSecret !== secret) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const prompt = body.prompt || body.input || '';
    if (!prompt) return { statusCode: 400, body: JSON.stringify({ error: 'Missing prompt' }) };

    // Determine API source and credentials
    const replitKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    const replitBase = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL; // may be set for Replit integration
    const googleKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const model = process.env.GENERATIVE_MODEL || 'gemini-2.5-flash';

    // Prefer Replit AI integrations key if present, otherwise fall back to Google key
    let url;
    let useKeyInQuery = false;
    let apiKey = null;

    if (replitKey && replitBase) {
      apiKey = replitKey;
      url = `${replitBase.replace(/\/+$/, '')}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    } else if (googleKey) {
      apiKey = googleKey;
      // Google generative language often accepts key as query param on the REST endpoint
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateText?key=${encodeURIComponent(apiKey)}`;
      useKeyInQuery = true;
    } else {
      return { statusCode: 500, body: JSON.stringify({ error: 'No AI integration key configured on server' }) };
    }

    // Build request payload depending on endpoint expectations
    let fetchOptions;
    if (useKeyInQuery) {
      // Google-style generateText endpoint expects { prompt: { text: '...' }, ... }
      fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: { text: prompt }, temperature: 0.2, maxOutputTokens: 512 }),
      };
    } else {
      // Assume Replit/GenAI generateContent shape
      fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` },
        body: JSON.stringify({
          model: model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { maxOutputTokens: 512, temperature: 0.2 },
        }),
      };
    }

    const resp = await fetch(url, fetchOptions);
    const contentType = resp.headers.get ? resp.headers.get('content-type') || 'application/json' : 'application/json';
    const text = await resp.text();

    return {
      statusCode: resp.status,
      headers: { 'Content-Type': contentType },
      body: text,
    };
  } catch (err) {
    console.error('Netlify function generate error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};