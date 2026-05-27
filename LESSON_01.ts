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

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";
const DEFAULT_USER_PROMPT = "Hello! Tell me a one-sentence joke about programming.";

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
  opts: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParams> & {
    returnRaw?: boolean;
    streamCb?: (text: string) => void;
  } = {}
): Promise<any> {
  const { returnRaw, streamCb, ...apiOpts } = opts;
  logger.info({ messages, modelId, opts: apiOpts }, "Sending request to LLM...");

  try {
    const completion = await openai.chat.completions.create({
      model: modelId,
      messages,
      ...apiOpts,
    });

    if (returnRaw) {
      return completion;
    }

    if ('choices' in completion) {
      const responseText = completion.choices[0]?.message?.content || null;
      logger.info({ responseText }, "Received response from LLM");
      return responseText;
    }

    // It's a stream!
    logger.info("Received streaming response from LLM");
    let fullText = "";
    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || "";
      fullText += content;
      if (streamCb) {
        streamCb(content);
      }
    }
    logger.info("Streaming complete");
    return fullText;
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
  conclusion: [
    'You have successfully set up the OpenAI client, queried the Gemini model via OpenRouter, and rendered its response in the terminal.',
    'Feel free to inspect the codebase and run other lessons to continue your learning journey.'
  ],
  explanations: [
    'Initialize the OpenAI client pointing to the OpenRouter base URL (https://openrouter.ai/api/v1).',
    'Pass custom headers like HTTP-Referer (for site credit) and X-Title (for client identifier).',
    'Structure the messages: APIs expect an array representing chat turns, each with a "role" and "content".',
    'System Role: Provides context or rules to model persona (e.g. "You are a helpful assistant") that guide the entire chat behavior.',
    'User Role: Represents the user query to the model.',
    'Call the chat.completions.create endpoint, passing the target model google/gemini-2.5-flash and the system + user messages.'
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
      name: 'systemPrompt',
      description: "The system instructions defining the model's behavior/persona.",
      default: DEFAULT_SYSTEM_PROMPT
    },
    {
      name: 'userPrompt',
      description: 'The user query/prompt to send to the model.',
      default: DEFAULT_USER_PROMPT
    }
  ],
  run: async (state: any) => {
    const systemContent = state.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const userContent = state.userPrompt || DEFAULT_USER_PROMPT;
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemContent,
      },
      {
        role: "user",
        content: userContent,
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
