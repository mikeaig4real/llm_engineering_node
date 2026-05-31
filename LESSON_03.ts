import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { runInference } from './LESSON_01.js';
import { runInteractiveIfDirect } from './run.js';
import { logger } from './logger.js';

// Schema defining our structured contact details
export const ContactSchema = z.object({
  name: z.string().describe("The full name of the contact."),
  age: z.number().describe("The age of the contact as a number."),
  city: z.string().describe("The city where the contact lives."),
  skills: z.array(z.string()).describe("A list of professional skills or hobbies.")
});

// Lesson Metadata consumed by the interactive runner CLI
export const metadata = {
  number: '03',
  title: 'Advanced Inference Options (Zod Schema, Streaming & Constraints)',
  description: 'In this lesson, we explore completions configurations: Zod-validated Structured Outputs vs. Multishot prompting, decoupled callback-based Streaming, and max token cutoff limits.',
  conclusion: [
    'You have successfully explored advanced inference configurations, including Zod-validated Structured Outputs, callback-based Streaming, and max token cutoff constraints.',
    'Feel free to inspect the codebase and run other lessons to continue your learning journey.'
  ],
  explanations: [
    'Multishot Prompting: We can guide an LLM\'s response structure by providing context examples (input/output pairs) in the system prompt. However, we must manually parse the output string as JSON which is error-prone.',
    'JSON Schemas: To avoid manual parsing from Step 1, we define a strict schema (like Zod) that represents the exact shape of data we expect.',
    'Structured Outputs: We pass the Zod schema from Step 2 to the API using "zodResponseFormat". The model matches this schema exactly, guaranteeing a clean JSON output.',
    'Decoupled Streaming: Rather than waiting for the entire text to generate (high latency), we can stream responses token-by-token. We pass a "streamCb" callback to handle and print each chunk instantly.',
    'Generational Constraints: We can enforce safety or budget boundaries by specifying a "max_tokens" limit on the request from Step 3 or 4, truncating outputs that exceed our threshold.',
    'Finish Reasons: By inspecting the raw API metadata returned from Step 5, we read the "finish_reason" (e.g. "length" or "stop") to determine if the generation stopped naturally or hit a constraint.'
  ],
  agnosticCode: `import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { runInference } from './LESSON_01.js';
import { logger } from './logger.js';

const ContactSchema = z.object({
  name: z.string(),
  age: z.number(),
  city: z.string(),
  skills: z.array(z.string())
});

// 1. Structured Outputs
const result = await runInference(messages, undefined, {
  response_format: zodResponseFormat(ContactSchema, 'contact')
});

// 2. Streaming (with callback)
await runInference(messages, undefined, {
  stream: true,
  streamCb: (chunk) => logger.info(chunk)
});

// 3. Constraints & Metadata
const raw = await runInference(messages, undefined, {
  max_tokens: 10,
  returnRaw: true
});`,
  allowableArgs: [
    {
      name: 'mode',
      description: "Choose mode: 'multishot', 'structured', 'streaming', or 'token_limit'",
      default: 'structured'
    },
    {
      name: 'prompt',
      description: 'Input text to parse into contact schema',
      default: 'John Doe is a 29 year old software engineer living in New York who loves TypeScript and Rust.'
    },
    {
      name: 'maxTokens',
      description: 'Max tokens (only used in token_limit mode)',
      default: '10'
    }
  ],
  useSpinner: (state: any) => {
    return (state.mode || '').trim().toLowerCase() !== 'streaming';
  },
  run: async (state: any) => {
    const mode = (state.mode || 'structured').trim().toLowerCase();
    const prompt = state.prompt || "John Doe is a 29 year old software engineer living in New York who loves TypeScript and Rust.";
    const maxTokensRaw = String(state.maxTokens || '10').replace(/['"]/g, '').trim();
    const maxTokensVal = isNaN(parseInt(maxTokensRaw, 10)) ? 10 : parseInt(maxTokensRaw, 10);

    if (mode === 'multishot') {
      const systemPrompt = `You are a helper that extracts structured data from text and outputs it in valid JSON format.
Your output must be a single JSON object containing: name (string), age (number), city (string), skills (array of strings).

Here are examples of how to do this:

Input: "Jane Smith is 34. She lives in Chicago and works with Python and Django."
Output:
{
  "name": "Jane Smith",
  "age": 34,
  "city": "Chicago",
  "skills": ["Python", "Django"]
}

Input: "Alex is a 22yo surfer from Malibu skilled in React."
Output:
{
  "name": "Alex",
  "age": 22,
  "city": "Malibu",
  "skills": ["React", "surfing"]
}

Process the following input and return ONLY the JSON representation:`;
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Input: "${prompt}"\nOutput:` }
      ];
      const resText = await runInference(messages);
      try {
        const parsed = JSON.parse(resText || '{}');
        return JSON.stringify(parsed, null, 2);
      } catch (err) {
        return `Failed to parse JSON output:
        ${ resText }`;
      }
    }

    else if (mode === 'structured') {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: 'Extract contact details from the input text.' },
        { role: 'user', content: prompt }
      ];
      const resText = await runInference(messages, undefined, {
        response_format: zodResponseFormat(ContactSchema, "contact")
      });
      try {
        const parsed = JSON.parse(resText || '{}');
        return JSON.stringify(parsed, null, 2);
      } catch (err) {
        return `Failed to parse structured output: ${resText}`;
      }
    }

    else if (mode === 'streaming') {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'user', content: prompt }
      ];
      logger.info('--- Live Stream Starting ---');
      const finalResult = await runInference(messages, undefined, {
        stream: true,
        streamCb: (chunk) => {
          process.stdout.write(chunk);
        }
      });
      logger.info('--- Live Stream Ended ---');
      return `Full Stream Content:\n\n${finalResult}`;
    }

    else if (mode === 'token_limit') {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'user', content: prompt }
      ];
      const completion = await runInference(messages, undefined, {
        max_tokens: maxTokensVal,
        returnRaw: true
      });
      
      const text = completion.choices[0]?.message?.content || '';
      const finishReason = completion.choices[0]?.finish_reason || 'unknown';
      const usage = completion.usage || {};

      return `Truncated Response:
"${text}"

Metadata:
- Finish Reason: ${finishReason}
- Input Tokens: ${usage.prompt_tokens || 0}
- Output Tokens: ${usage.completion_tokens || 0}
- Total Tokens: ${usage.total_tokens || 0}`;
    }

    else {
      throw new Error(`Unsupported mode: ${mode}`);
    }
  }
};

runInteractiveIfDirect(import.meta.url, metadata);

