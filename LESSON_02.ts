import OpenAI from 'openai';
import { encodingForModel } from 'js-tiktoken';
import { runInference } from './LESSON_01.js';
import { runInteractiveIfDirect } from './run.js';

// Define pricing rates per 1 Million tokens
export const RATES = {
  'gemini-2.5-flash': {
    inputRate: 0.075, // $0.075 per 1M tokens
    outputRate: 0.30, // $0.30 per 1M tokens
  },
  'gpt-4o': {
    inputRate: 2.50, // $2.50 per 1M tokens
    outputRate: 10.00, // $10.00 per 1M tokens
  }
};

const DEFAULT_PROMPT = "Explain the difference between a token and a word in 3 bullet points.";

export interface TokenStats {
  tokenCount: number;
  tokens: number[];
  cost?: number;
}

export interface CostStats {
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

/**
 * Agnostic function to count tokens locally using js-tiktoken.
 * 
 * @param text - The input text to tokenize.
 * @param model - The model encoding to use (defaults to 'gpt-4o').
 * @param ratePerMillion - Optional cost per 1 Million tokens to estimate cost.
 * @returns TokenStats containing count, token IDs, and optionally estimated cost.
 */
export function countTokens(
  text: string,
  model: string = 'gpt-4o',
  ratePerMillion?: number
): TokenStats {
  let encoder;
  try {
    encoder = encodingForModel(model as any);
  } catch (e) {
    encoder = encodingForModel('gpt-4o');
  }

  const tokens = encoder.encode(text);
  const tokenCount = tokens.length;

  const stats: TokenStats = {
    tokenCount,
    tokens,
  };

  if (ratePerMillion !== undefined) {
    stats.cost = (tokenCount / 1_000_000) * ratePerMillion;
  }

  return stats;
}

/**
 * Agnostic function to calculate the input, output, and total costs.
 * 
 * @param inputTokens - Number of prompt/input tokens.
 * @param outputTokens - Number of completion/output tokens.
 * @param inputRatePerMillion - Cost per 1M input tokens.
 * @param outputRatePerMillion - Cost per 1M output tokens.
 * @returns CostStats object containing calculated costs in USD.
 */
export function calculateCosts(
  inputTokens: number,
  outputTokens: number,
  inputRatePerMillion: number,
  outputRatePerMillion: number
): CostStats {
  const inputCost = (inputTokens / 1_000_000) * inputRatePerMillion;
  const outputCost = (outputTokens / 1_000_000) * outputRatePerMillion;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost
  };
}

export const metadata = {
  number: '02',
  title: 'Tokens, Estimation, and Cost Calculation',
  description: 'In LLM engineering, processing text incurs costs measured in "tokens". In this lesson, we estimate the input tokens locally before running inference, retrieve the actual token consumption metadata from the API, and calculate the financial cost of our request.',
  conclusion: [
    'You have successfully estimated input tokens locally using js-tiktoken, executed inference, retrieved actual token consumption metadata, and calculated API request costs.',
    'Remember that local estimation is a fast, free, offline approximation. Exact usage is always returned by the API metadata and is the basis for billing.'
  ],
  explanations: [
    'Understanding Tokens: LLMs process text in small units called "tokens" (chunks of characters, e.g., ~4 characters or 0.75 words each) rather than raw words.',
    'Tokenizer Models: A tokenizer splits raw text into token IDs based on a dictionary. In Step 1, we learned that LLMs read tokens; different LLMs use different tokenizer mappings (e.g. Tiktoken for OpenAI, LlamaTokenizer for Meta).',
    'Local Token Count Estimation: By loading a tokenizer model from Step 2, we can count the tokens in our prompt offline for free before sending it, using libraries like "js-tiktoken".',
    'Token Cost Rates: LLM providers publish pricing rates for their models, typically defined as cost per 1 Million input and output tokens.',
    'API Usage Metadata: When we submit the prompt from Step 3, the LLM endpoint returns a "usage" metadata block detailing the actual count of prompt (input) tokens and completion (output) tokens processed.',
    'Financial Cost Calculation: Using the actual token counts from Step 5 and the pricing rates from Step 4, we calculate the financial cost of our inference request in USD.'
  ],
  agnosticCode: `import { encodingForModel } from 'js-tiktoken';
import { runInference } from './LESSON_01.js';
import { logger } from './logger.js';

// 1. Load the tokenizer model encoding locally
const encoder = encodingForModel('gpt-4o');

// 2. Estimate token count of input text
const inputTokens = encoder.encode(promptText).length;
logger.info(\`Estimated input tokens: \${inputTokens}\`);

// 3. Perform inference and request raw completion output to inspect metadata
const completion = await runInference(messages, undefined, { returnRaw: true });

// 4. Retrieve actual token usage from completion metadata
const usage = completion.usage;
const actualInput = usage.prompt_tokens;
const actualOutput = usage.completion_tokens;

// 5. Calculate cost based on rate per 1,000,000 tokens
const inputCost = (actualInput / 1,000,000) * inputRatePerMillion;
const outputCost = (actualOutput / 1,000,000) * outputRatePerMillion;
const totalCost = inputCost + outputCost;`,
  allowableArgs: [
    {
      name: 'prompt',
      description: 'The prompt text to send and analyze.',
      default: DEFAULT_PROMPT
    },
    {
      name: 'estimateModel',
      description: "Tokenizer model to use for local estimation ('gpt-4o' or 'gpt-4')",
      default: 'gpt-4o'
    }
  ],
  run: async (state: any) => {
    const prompt = state.prompt || DEFAULT_PROMPT;
    const estimateModel = (state.estimateModel || 'gpt-4o').trim().toLowerCase();

    // 1. Calculate local token count estimate using agnostic function
    const geminiRates = RATES['gemini-2.5-flash'];
    const gptRates = RATES['gpt-4o'];

    const localStats = countTokens(prompt, estimateModel);

    // 2. Execute inference and get raw completion object
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'user', content: prompt }
    ];

    // We call runInference requesting raw response
    const completion = await runInference(messages, undefined, { returnRaw: true });

    const text = completion.choices[0]?.message?.content || '';
    const usage = completion.usage || {};
    const actualInput = usage.prompt_tokens || 0;
    const actualOutput = usage.completion_tokens || 0;

    // Calculate actual costs using agnostic function
    const geminiCosts = calculateCosts(
      actualInput,
      actualOutput,
      geminiRates.inputRate,
      geminiRates.outputRate
    );

    const gptCosts = calculateCosts(
      actualInput,
      actualOutput,
      gptRates.inputRate,
      gptRates.outputRate
    );

    // Build comparison message
    const localOutputStats = countTokens(text, estimateModel);

    const inputDiff = actualInput - localStats.tokenCount;
    const inputDiffSign = inputDiff >= 0 ? `+${inputDiff}` : `${inputDiff}`;

    const outputDiff = actualOutput - localOutputStats.tokenCount;
    const outputDiffSign = outputDiff >= 0 ? `+${outputDiff}` : `${outputDiff}`;

    return `Model Response:
"${text}"

=== TOKEN ESTIMATION vs ACTUAL USAGE ===
Local Tokenizer Input Estimate (${estimateModel}):  ${localStats.tokenCount} tokens
Actual API Prompt Input:                     ${actualInput} tokens (Diff: ${inputDiffSign} tokens)

Local Tokenizer Output Estimate (${estimateModel}): ${localOutputStats.tokenCount} tokens
Actual API Completion Output:                ${actualOutput} tokens (Diff: ${outputDiffSign} tokens)

Actual API Total Usage:                      ${actualInput + actualOutput} tokens

=== FINANCIAL COST ANALYSIS ===
Calculated rates based on Gemini 2.5 Flash on OpenRouter:
- Input Cost ($${geminiRates.inputRate}/1M):  $${geminiCosts.inputCost.toFixed(8)}
- Output Cost ($${geminiRates.outputRate}/1M): $${geminiCosts.outputCost.toFixed(8)}
- Total Cost:                    $${geminiCosts.totalCost.toFixed(8)}

Calculated rates if run on GPT-4o for comparison:
- Input Cost ($${gptRates.inputRate}/1M):    $${gptCosts.inputCost.toFixed(8)}
- Output Cost ($${gptRates.outputRate}/1M):  $${gptCosts.outputCost.toFixed(8)}
- Total Cost:                      $${gptCosts.totalCost.toFixed(8)}

(Note: Local estimation runs completely offline and costs $0.00.)`;
  }
};

runInteractiveIfDirect(import.meta.url, metadata);
