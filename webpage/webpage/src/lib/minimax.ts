import OpenAI from 'openai';

export type MiniMaxMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1';
const MINIMAX_MODEL = 'MiniMax-M2.5';

function getMiniMaxApiKey() {
  return import.meta.env.VITE_MINIMAX_API_KEY?.trim();
}

export function hasMiniMaxApiKey() {
  return Boolean(getMiniMaxApiKey());
}

export const minimaxClient = new OpenAI({
  apiKey: getMiniMaxApiKey() || 'missing-minimax-key',
  baseURL: MINIMAX_BASE_URL,
  dangerouslyAllowBrowser: true,
});

export async function chatWithMiniMax(messages: MiniMaxMessage[]) {
  const apiKey = getMiniMaxApiKey();

  if (!apiKey) {
    throw new Error('未配置 MiniMax API Key，请先在环境变量中设置 VITE_MINIMAX_API_KEY。');
  }

  const response = await minimaxClient.chat.completions.create({
    model: MINIMAX_MODEL,
    messages,
    temperature: 0.3,
  });

  const content = response.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() : '';
}
