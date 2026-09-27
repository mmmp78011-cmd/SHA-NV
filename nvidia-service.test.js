import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NVIDIA_TEXT_NIM_URL = 'http://text-nim.test';
process.env.NVIDIA_TEXT_MODEL = 'openai/gpt-oss-20b';
process.env.NVIDIA_VISION_NIM_URL = 'http://vision-nim.test';
process.env.NVIDIA_VISION_MODEL = 'nvidia/nemotron-nano-12b-v2-vl';

const {
  analyzeDocument,
  generateAssistantResponse,
  generateAIResponse,
  generateGoalProgram
} = await import('../src/services/nvidia.service.js');
const { assistantOutputLimit } = await import('../src/config/assistant.js');

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
  assert.equal(request.body.max_tokens, 512);
  assert.equal(request.body.temperature, 0.55);
  assert.equal(request.body.response_format, undefined);
  assert.equal(request.body.reasoning_effort, undefined);
  assert.deepEqual(request.body.messages.map(message => message.role), ['system', 'user']);
  assert.equal(request.options.headers['Content-Type'], 'application/json');
});

test('NIM diagnostics log request parameters and token usage without response text or reasoning', async () => {
  const info = console.info;
  const captured = [];
  console.info = (...args) => captured.push(args);
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: 'Answer must not appear in logs', reasoning: 'Private reasoning must not appear' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 42, completion_tokens: 88, total_tokens: 130 }
  });
  try {
    await generateAssistantResponse({ systemPrompt: 'System prompt', userPrompt: 'User prompt', maxTokens: 3000 });
  } finally {
    console.info = info;
  }
  const logs = JSON.stringify(captured);
  assert.match(logs, /max_tokens/);
  assert.match(logs, /promptTokens/);
  assert.match(logs, /completionTokens/);
  assert.match(logs, /totalTokens/);
  assert.doesNotMatch(logs, /Answer must not appear|Private reasoning|System prompt|User prompt/);
});

test('four successive Assistant turns keep prior history and a GPT-OSS-safe token budget', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    return Response.json({
      choices: [{ message: { content: 'Réponse ' + calls.length, reasoning: 'raisonnement interne' }, finish_reason: 'stop' }]
    });
  };

  const prompts = [
    'Message actuel : question 1',
    'Messages récents :\nuser: question 1\nassistant: Réponse 1\nMessage actuel : question 2',
    'Messages récents :\nuser: question 1\nassistant: Réponse 1\nuser: question 2\nassistant: Réponse 2\nMessage actuel : question 3',
    'Messages récents :\nuser: question 1\nassistant: Réponse 1\nuser: question 2\nassistant: Réponse 2\nuser: question 3\nassistant: Réponse 3\nMessage actuel : question 4'
  ];
  for (const userPrompt of prompts) {
    await generateAssistantResponse({ systemPrompt: 'Tutorat', userPrompt, maxTokens: 130 });
  }

  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.body.model, 'openai/gpt-oss-20b');
    assert.equal(call.body.max_tokens, 512);
    assert.equal(call.body.response_format, undefined);
    assert.deepEqual(call.body.messages.map(message => message.role), ['system', 'user']);
    assert.ok(call.body.messages.every(message => typeof message.content === 'string' && message.content.length > 0));
  }
  assert.match(calls[1].body.messages[1].content, /user: question 1\nassistant: Réponse 1/);
  assert.match(calls[2].body.messages[1].content, /user: question 2\nassistant: Réponse 2/);
  assert.match(calls[3].body.messages[1].content, /user: question 3\nassistant: Réponse 3/);
});

test('reproduces a short-turn token exhaustion and verifies the Assistant budget fix', async () => {
  const sentBudgets = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    sentBudgets.push(body.max_tokens);
    if (body.max_tokens < 3000) {
      return Response.json({
        choices: [{ message: { content: null, reasoning: 'reasoning used the limited budget' }, finish_reason: 'length' }]
      });
    }
    return Response.json({ choices: [{ message: { content: 'Bonjour', reasoning: 'internal' }, finish_reason: 'stop' }] });
  };

  const shortTurnBudget = assistantOutputLimit('Pourquoi ?', 'explication');
  assert.equal(shortTurnBudget, 3000);
  await assert.rejects(
    generateAIResponse({ userPrompt: 'Pourquoi ?', maxTokens: 130 }),
    error => error.code === 'AI_OUTPUT_LIMIT'
  );
  assert.equal(await generateAssistantResponse({ userPrompt: 'Pourquoi ?', maxTokens: shortTurnBudget }), 'Bonjour');
  assert.deepEqual(sentBudgets, [130, 3000]);
});

test('Assistant output budgets scale with difficulty and message category', () => {
  assert.equal(assistantOutputLimit('Bonjour', 'conversation'), 3000);
  assert.equal(assistantOutputLimit('Explique-moi les fractions', 'explication'), 5000);
  assert.equal(assistantOutputLimit('Explique-moi les matrices', 'explication'), 6500);
  assert.equal(assistantOutputLimit('Résous cette équation en détail', 'explication'), 6500);
  assert.equal(assistantOutputLimit('Corrige ce programme Python', 'explication'), 7000);
  assert.equal(assistantOutputLimit('Question', 'exercice'), 4500);
  assert.equal(assistantOutputLimit('Question', 'controle'), 4500);
  assert.equal(assistantOutputLimit('Question', 'resume'), 4000);
});

test('Assistant retries exactly once with a larger budget only after empty length termination', async () => {
  const budgets = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    budgets.push(body.max_tokens);
    if (budgets.length === 1) {
      return Response.json({ choices: [{ message: { content: null, reasoning: 'internal' }, finish_reason: 'length' }] });
    }
    return Response.json({ choices: [{ message: { content: 'Réponse récupérée' }, finish_reason: 'stop' }] });
  };
  assert.equal(await generateAssistantResponse({ userPrompt: 'Question', maxTokens: 512 }), 'Réponse récupérée');
  assert.deepEqual(budgets, [512, 2560]);
});

test('Assistant does not retry an empty response unless finish_reason is length', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ choices: [{ message: { content: '', reasoning: 'internal' }, finish_reason: 'stop' }] });
  };
  await assert.rejects(generateAssistantResponse({ userPrompt: 'Question', maxTokens: 512 }), error => error.code === 'AI_EMPTY_RESPONSE');
  assert.equal(calls, 1);
});

test('content is returned without exposing a non-empty reasoning field', async () => {
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: 'Bonjour', reasoning: 'texte interne qui ne doit pas sortir' }, finish_reason: 'stop' }]
  });
  assert.equal(await generateAssistantResponse({ userPrompt: 'Dis bonjour' }), 'Bonjour');
});

test('empty content with reasoning is rejected explicitly and reasoning is never used as fallback', async () => {
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: '', reasoning: 'texte interne seulement' }, finish_reason: 'stop' }]
  });
  await assert.rejects(
    generateAssistantResponse({ userPrompt: 'Question' }),
    error => error.status === 502 && error.code === 'AI_EMPTY_RESPONSE' && /contenu vide/.test(error.message)
  );
});

test('a truncated GPT-OSS answer is reported as an output budget issue', async () => {
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: null, reasoning: 'raisonnement' }, finish_reason: 'length' }]
  });
  await assert.rejects(
    generateAssistantResponse({ userPrompt: 'Question' }),
    error => error.status === 502 && error.code === 'AI_OUTPUT_LIMIT'
  );
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
