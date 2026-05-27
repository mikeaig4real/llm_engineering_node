import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { runInference } from './LESSON_01.js';

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
    'Multishot Prompting: Format a prompt with system guidelines and examples, then manually parse JSON.',
    'Structured Outputs: Use Zod validation via zodResponseFormat to guarantee the completions payload matches our ContactSchema.',
    'Streaming: Pass stream: true with an agnostic streamCb callback to print chunks in real-time as they arrive.',
    'Token Limit: Pass max_tokens and returnRaw: true to inspect truncated responses, finish reasons, and usage metrics.'
  ],
  agnosticCode: `import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { runInference } from './LESSON_01.js';

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
  streamCb: (chunk) => console.log(chunk)
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
      console.log('\n--- Live Stream Starting ---');
      const finalResult = await runInference(messages, undefined, {
        stream: true,
        streamCb: (chunk) => {
          process.stdout.write(chunk);
        }
      });
      console.log('\n--- Live Stream Ended ---');
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

// Automatically execute the interactive lesson flow if this file is run directly via node/tsx
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('LESSON_03.ts') || 
  process.argv[1].endsWith('LESSON_03.js')
);

if (isDirectRun) {
  (async () => {
    try {
      const { startInteractiveLesson } = await import('./run.js');
      await startInteractiveLesson(metadata);
    } catch (err) {
      console.error('Failed to run Lesson 03 interactively:', err);
    }
  })();
}
