import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAIProvider } from '@/services/aiProviders';

describe('aiProviders request sanitization', () => {
  const mockJson = vi.fn();
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockJson.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
      content: [{ text: 'ok' }],
      candidates: [{ content: { parts: [{ text: 'ok' }] } }]
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: mockJson
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('omits nullish OpenAI numeric settings from the request body', async () => {
    const provider = getAIProvider('openai');

    await provider.processText(
      'hello world',
      'Classify this text.',
      'test-key',
      'gpt-4o-mini',
      undefined,
      'text',
      {
        maxTokens: null as unknown as number,
        temperature: undefined
      }
    );

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body).toMatchObject({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Classify this text.' },
        { role: 'user', content: 'hello world' }
      ]
    });
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('temperature');
  });

  it('omits an empty Gemini generationConfig payload', async () => {
    const provider = getAIProvider('gemini');

    await provider.processText(
      'hello world',
      'Classify this text.',
      'test-key',
      'gemini-2.0-flash',
      undefined,
      'text',
      {
        maxTokens: null as unknown as number,
        temperature: Number.NaN
      }
    );

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body).toMatchObject({
      model: 'gemini-2.0-flash',
      systemInstruction: {
        parts: [{ text: 'Classify this text.' }]
      }
    });
    expect(body).not.toHaveProperty('generationConfig');
  });
});
