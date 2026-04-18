import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const google = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export const MODELS = {
  // Daily execution — multi-criteria reasoning + narrative
  sonnet: 'claude-sonnet-4-6',
  // Weekly strategy review — deep analysis
  opus: 'claude-opus-4-7',
  // Fast structured ops — order sizing, midday checks
  flash: 'gemini-2.0-flash',
  // News/sentiment grounding with Google Search
  pro: 'gemini-2.5-pro-preview-05-06',
} as const;

export async function claudeJson<T>(
  model: string,
  system: string,
  user: string,
  maxTokens = 1024
): Promise<T> {
  const msg = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
  const match = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  if (!match) throw new Error('No JSON in Claude response: ' + text.slice(0, 200));
  return JSON.parse(match[1]);
}

export async function claudeText(
  model: string,
  system: string,
  user: string,
  maxTokens = 2048
): Promise<string> {
  const msg = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text : '';
}

export async function geminiText(modelName: string, prompt: string): Promise<string> {
  const model = google.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
