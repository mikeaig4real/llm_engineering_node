import OpenAI from 'openai';
import { config } from './config.js';
import { logger } from './logger.js';
import { runInteractiveIfDirect } from './run.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const HTTP_REFERER = 'https://github.com/mikeaig4real/llm_engineering_node';
const X_TITLE = 'LLM Engineering Node.js Lesson 01';

const MODEL_ID = config.INFERENCE_MODEL;

const OLLAMA_MODELS_SET = new Set<string>([
  'llama3.2',
  'llama3.2:latest',
  'gemma3:4b',
]);

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";
const DEFAULT_USER_PROMPT = "Hello! Tell me a one-sentence joke about programming.";
const DEFAULT_TEMPERATURE = 0.7;

/**
 * Sends a chat completion request to the LLM via OpenRouter or Ollama.
 * This is an agnostic function that can be imported and reused by other lessons.
 *
 * @param messages - Array of chat messages (role, content).
 * @param modelId - The ID of the model to use (defaults to config.INFERENCE_MODEL).
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

  // Set default temperature if not provided
  if (apiOpts.temperature === undefined) {
    apiOpts.temperature = DEFAULT_TEMPERATURE;
  }

  let activeModelId = modelId;
  const isTargetOllama = 
    OLLAMA_MODELS_SET.has(modelId) || 
    config.INFERENCE_PROVIDER === 'ollama';

  if (isTargetOllama && apiOpts.tools && activeModelId.includes('gemma3')) {
    logger.warn(`Model "${activeModelId}" does not support tools in Ollama. Falling back to "llama3.2:latest" for tool calling.`);
    activeModelId = 'llama3.2:latest';
  }

  const clientBaseUrl = isTargetOllama 
    ? `${config.OLLAMA_BASE_URL}/v1` 
    : OPENROUTER_BASE_URL;

  const clientApiKey = isTargetOllama 
    ? 'ollama' 
    : config.OPENROUTER_API_KEY || 'dummy_key';

  const clientHeaders = isTargetOllama 
    ? {} 
    : {
        'HTTP-Referer': HTTP_REFERER,
        'X-Title': X_TITLE,
      };

  // Initialize OpenAI client dynamically on-the-fly
  const activeClient = new OpenAI({
    baseURL: clientBaseUrl,
    apiKey: clientApiKey,
    defaultHeaders: clientHeaders,
  });

  logger.info({ messages, modelId: activeModelId, opts: apiOpts, baseUrl: clientBaseUrl }, "Sending request to LLM...");

  try {
    const requestPayload: any = {
      model: activeModelId,
      messages,
      ...apiOpts,
    };

    if (isTargetOllama) {
      requestPayload.options = {
        num_ctx: 4096,
        ...(requestPayload.options || {})
      };
    }

    const completion = await activeClient.chat.completions.create(requestPayload);

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
    for await (const chunk of completion as any) {
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
  title: 'Connecting to LLMs (OpenAI SDK & OpenRouter/Ollama)',
  description: 'In LLM engineering, we interact with model completion endpoints. In this lesson, we use the OpenAI SDK configured to connect to OpenRouter or local Ollama and generate a completion response.',
  conclusion: [
    'You have successfully set up the OpenAI client, queried the selected model, and rendered its response in the terminal.',
    'Feel free to inspect the codebase and run other lessons to continue your learning journey.'
  ],
  explanations: [
    'Endpoint Connections: In LLM engineering, we query model completion endpoints via HTTP requests. We configure these endpoints (e.g., OpenRouter or local Ollama) by providing their "baseURL".',
    'OpenAI SDK client: To simplify querying, we instantiate the "OpenAI" SDK client. This client wraps the endpoint configuration from Step 1 and handles API key headers.',
    'Roles & Messages array: Models expect inputs as a structured array of chat turns. Each turn has a "role" (like "system" or "user") and "content".',
    'The System Prompt: This is the first message in the array from Step 3. It establishes the rules, constraints, and identity of the LLM before user input.',
    'The User Prompt: This is the second message in the array from Step 3. It represents the actual user query or instruction that the model needs to address.',
    'Inference Execution: Using the client from Step 2 and the messages array from Step 3, we call the "chat.completions.create" endpoint to submit our payload and await the model\'s output.',
    'Temperature Control: When calling the completion endpoint in Step 6, we pass a "temperature" parameter. Lower values (near 0) produce highly deterministic, consistent text, whereas higher values (near 1) allow for more creative variation.'
  ],
  agnosticCode: `import OpenAI from 'openai';
import { config } from './config.js';

export async function runInference(prompt: string, temperature = 0.7): Promise<string | null> {
  const isOllama = config.INFERENCE_PROVIDER === 'ollama';
  const openai = new OpenAI({
    baseURL: isOllama ? 'http://localhost:11434/v1' : 'https://openrouter.ai/api/v1',
    apiKey: isOllama ? 'ollama' : config.OPENROUTER_API_KEY,
  });

  const completion = await openai.chat.completions.create({
    model: config.INFERENCE_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature,
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
    },
    {
      name: 'temperature',
      description: 'Controls randomness: 0.0 is deterministic, 0.7 is balanced, 1.0+ is creative.',
      default: String(DEFAULT_TEMPERATURE)
    }
  ],
  run: async (state: any) => {
    const systemContent = state.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const userContent = state.userPrompt || DEFAULT_USER_PROMPT;
    const tempRaw = String(state.temperature !== undefined ? state.temperature : DEFAULT_TEMPERATURE).replace(/['"]/g, '').trim();
    const tempVal = isNaN(parseFloat(tempRaw)) ? DEFAULT_TEMPERATURE : parseFloat(tempRaw);

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
    return await runInference(messages, undefined, { temperature: tempVal });
  }
};

runInteractiveIfDirect(import.meta.url, metadata);
