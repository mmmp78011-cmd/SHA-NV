import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NVIDIA_TEXT_NIM_URL = 'http://text-nim.test';
process.env.NVIDIA_TEXT_MODEL = 'openai/gpt-oss-20b';
process.env.NVIDIA_VISION_NIM_URL = 'http://vision-nim.test';
process.env.NVIDIA_VISION_MODEL = 'nvidia/nemotron-nano-12b-v2-vl';

const {
  analyzeDocument,
  generateAssistantResponse,
  generateGoalProgram
} = await import('../src/services/nvidia.service.js');

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('text assistant calls the configured text NIM and only returns message content', async () => {
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return Response.json({ choices: [{ message: { content: 'Réponse française', reasoning: 'ne pas exposer' } }] });
  };

  const answer = await generateAssistantResponse({ systemPrompt: 'Tutorat', userPrompt: 'Explique les fractions', maxTokens: 400 });
  assert.equal(answer, 'Réponse française');
  assert.equal(request.url, 'http://text-nim.test/v1/chat/completions');
  assert.equal(request.body.model, 'openai/gpt-oss-20b');
  assert.equal(request.body.messages.at(-1).content, 'Explique les fractions');
  assert.equal(request.body.max_tokens, 400);
  assert.equal(request.options.headers['Content-Type'], 'application/json');
});

test('Goal program requests JSON and parses a fenced structured response', async () => {
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    const fence = String.fromCharCode(96).repeat(3);
    return Response.json({ choices: [{ message: { content: fence + 'json\n{"goalSummary":"Python","weeks":[]}\n' + fence } }] });
  };

  const plan = await generateGoalProgram('Programme Python', 5000);
  assert.deepEqual(plan, { goalSummary: 'Python', weeks: [] });
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.model, 'openai/gpt-oss-20b');
});

test('image request goes to vision NIM, then its text analysis goes to GPT-OSS', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    const answer = calls.length === 1 ? 'L’image montre 2/3 + 1/3.' : 'La réponse est 1.';
    return Response.json({ choices: [{ message: { content: answer } }] });
  };

  const answer = await analyzeDocument({
    buffer: Buffer.from('image-data'),
    fileType: 'image/png',
    prompt: 'Résous cette fraction',
    systemPrompt: 'Réponds simplement.'
  });
  assert.equal(answer, 'La réponse est 1.');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://vision-nim.test/v1/chat/completions');
  assert.equal(calls[0].body.model, 'nvidia/nemotron-nano-12b-v2-vl');
  assert.equal(calls[0].body.messages[0].content[1].type, 'image_url');
  assert.equal(calls[0].body.messages[0].content[1].image_url.url, 'data:image/png;base64,aW1hZ2UtZGF0YQ==');
  assert.equal(calls[1].url, 'http://text-nim.test/v1/chat/completions');
  assert.equal(calls[1].body.model, 'openai/gpt-oss-20b');
  assert.match(calls[1].body.messages.at(-1).content, /L’image montre 2\/3 \+ 1\/3/);
});

test('provider HTTP failures become a stable application error', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  await assert.rejects(
    generateAssistantResponse({ userPrompt: 'Bonjour' }),
    error => error.status === 503 && error.code === 'AI_PROVIDER_ERROR'
  );
});

test('malformed JSON from NIM is rejected instead of fabricated', async () => {
  globalThis.fetch = async () => new Response('{invalid', { status: 200 });
  await assert.rejects(
    generateAssistantResponse({ userPrompt: 'Bonjour' }),
    error => error.status === 502 && error.code === 'AI_INVALID_RESPONSE'
  );
});
