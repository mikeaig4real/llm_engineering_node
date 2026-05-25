import OpenAI from 'openai';
import { config } from './config.js';
import { logger } from './logger.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const HTTP_REFERER = 'https://github.com/mikeaig4real/llm_engineering_node';
const X_TITLE = 'LLM Engineering Node.js Lesson 01';
const MODEL_ID = 'google/gemini-2.5-flash';

// Initialize OpenAI client pointing to OpenRouter
const openai = new OpenAI({
  baseURL: OPENROUTER_BASE_URL,
  apiKey: config.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': HTTP_REFERER,
    'X-Title': X_TITLE,
  },
});

const DEFAULT_PROMPT = "Hello! Tell me a one-sentence joke about programming.";

/**
 * Sends a chat completion request to the LLM via OpenRouter.
 * This is an agnostic function that can be imported and reused by other lessons.
 *
 * @param messages - Array of chat messages (role, content).
 * @param modelId - The ID of the model to use (defaults to google/gemini-2.5-flash).
 * @param opts - Additional options for the OpenAI client completion request.
 * @returns The string response content, or null if empty.
 */
export async function runInference(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  modelId: string = MODEL_ID,
  opts: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParams> = {}
): Promise<any> {
  logger.info({ messages, modelId, opts }, "Sending request to LLM...");

  try {
    const completion = await openai.chat.completions.create({
      model: modelId,
      messages,
      ...opts,
    });

    if ('choices' in completion) {
      const responseText = completion.choices[0]?.message?.content || null;
      logger.info({ responseText }, "Received response from LLM");
      return responseText;
    }

    logger.info("Received streaming response from LLM");
    return completion;
  } catch (error) {
    logger.error(error, "Error occurred while calling completions library");
    throw error;
  }
}

// Lesson Metadata consumed by the interactive runner CLI
export const metadata = {
  number: '01',
  title: 'Connecting to LLMs (OpenAI SDK & OpenRouter)',
  description: 'In LLM engineering, we interact with model completion endpoints. In this lesson, we use the OpenAI SDK configured to connect to OpenRouter (using Gemini 2.5 Flash) and generate a completion response.',
  explanations: [
    'Initialize the OpenAI client pointing to the OpenRouter base URL (https://openrouter.ai/api/v1).',
    'Pass custom headers like HTTP-Referer (for site credit) and X-Title (for client identifier).',
    'Call the chat.completions.create endpoint, passing the target model google/gemini-2.5-flash and the user prompt.'
  ],
  agnosticCode: `import OpenAI from 'openai';
import { config } from './config.js';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: config.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/mikeaig4real/llm_engineering_node',
    'X-Title': 'LLM Engineering Node.js Lesson 01',
  },
});

export async function runInference(prompt: string): Promise<string | null> {
  const completion = await openai.chat.completions.create({
    model: 'google/gemini-2.5-flash',
    messages: [{ role: 'user', content: prompt }],
  });
  return completion.choices[0]?.message?.content || null;
}`,
  allowableArgs: [
    {
      name: 'prompt',
      description: 'The prompt to send to the language model.',
      default: DEFAULT_PROMPT
    }
  ],
  run: async (state: any) => {
    const prompt = state.prompt || DEFAULT_PROMPT;
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "user",
        content: prompt,
      },
    ];
    return await runInference(messages);
  }
};

// Automatically execute the interactive lesson flow if this file is run directly via node/tsx
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('LESSON_01.ts') || 
  process.argv[1].endsWith('LESSON_01.js')
);

if (isDirectRun) {
  (async () => {
    try {
      const { startInteractiveLesson } = await import('./run.js');
      await startInteractiveLesson(metadata);
    } catch (err) {
      console.error('Failed to run Lesson 01 interactively:', err);
    }
  })();
}
