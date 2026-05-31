import OpenAI from 'openai';
import readline from 'node:readline/promises';
import chalk from 'chalk';
import boxen from 'boxen';
import { runInference } from './LESSON_01.js';
import { runStreamingAgentInference, handleStreamingToolCalls } from './LESSON_04.js';
import { retrieveChunks } from './rag_retrieve.js';
import { logger } from './logger.js';
import { runInteractiveIfDirect } from './run.js';


// 1. Tool schema definition for RAG retrieval
const chatbotTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'invokeRag',
      description: 'Search and retrieve detailed factual information about Insurellm (company history, offices, employee directory, contracts, policies). Call this ONLY when you need to look up specific facts about Insurellm to answer the query.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The standalone, keyword-rich search query. Convert the user\'s message and conversation context into a direct search string (e.g. replacing pronouns like "it", "they", or "she" with "Insurellm" or specific employee/contract names) that yields optimal search results.'
          }
        },
        required: ['query']
      }
    }
  }
];

/**
 * Helper to robustly extract a clean string query from potentially nested/wrapped LLM tool arguments.
 */
function extractQueryParam(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const extractFromObject = (obj: any): string | null => {
    const candidate = obj.query || obj.searchQuery || obj.description || obj.value;
    if (candidate && typeof candidate === 'string') {
      return candidate;
    }
    const values = Object.values(obj);
    const stringVal = values.find(v => typeof v === 'string' && v.length > 0 && v !== 'string');
    return (stringVal as string) || null;
  };

  if (typeof value === 'object') {
    const extracted = extractFromObject(value);
    return extracted !== null ? extracted : JSON.stringify(value);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        const extracted = extractFromObject(parsed);
        return extracted !== null ? extracted : value;
      }
    } catch (e) {
      // Keep original string
    }
    return value;
  }

  return String(value);
}

/**
 * Helper to prune older tool message contents from the history array.
 * This retains the message structure and IDs for compliance while freeing token space.
 */
function pruneHistoricalToolMessages(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): void {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'tool') {
      // If this tool message is followed by an assistant message that is NOT the final message, it belongs to a past turn
      let isPastTool = false;
      for (let j = i + 1; j < messages.length; j++) {
        if (messages[j].role === 'assistant' && j < messages.length - 1) {
          isPastTool = true;
          break;
        }
      }
      if (isPastTool && typeof msg.content === 'string' && !msg.content.startsWith('[Pruned')) {
        msg.content = `[Pruned: RAG search context omitted from history to save tokens]`;
      }
    }
  }
}

// 1.5. Tool implementation mapping for agent execution
const chatbotToolMap: Record<string, Function> = {
  invokeRag: async ({ query }: { query: any }) => {
    const searchQuery = extractQueryParam(query);
    const retrieved = await retrieveChunks(searchQuery, 10);

    if (retrieved.length === 0) {
      return { status: 'success', retrieved_documents: 'No relevant documents found.' };
    }

    // Display results and references in console
    console.log(`\n\n${chalk.yellow('--- Referenced Sources ---')}`);
    retrieved.forEach((c, idx) => {
      const rank = idx + 1;
      console.log(
        `${chalk.bold.yellow(`[Source #${rank}]`)} ${chalk.cyan(c.metadata.docRelativePath)} ` +
        `(Score: ${c.score.toFixed(4)}, Type: ${c.metadata.contentType})`
      );
      const snippet = c.content.length > 120 ? c.content.substring(0, 120) + '...' : c.content;
      console.log(chalk.dim(`  Snippet: "${snippet.replace(/\n/g, ' ')}"`));
    });
    console.log(chalk.yellow('--------------------------'));

    const contextBlocks = retrieved.map((c, idx) => {
      return `[Context File #${idx + 1}: ${c.metadata.docRelativePath}]\n${c.content}`;
    }).join('\n\n');

    return {
      status: 'success',
      retrieved_documents: contextBlocks
    };
  }
};

// 2. Interactive Metadata for Lesson Runner
export const metadata = {
  number: '05',
  title: 'Retrieval-Augmented Generation (RAG) & CLI Chatbot',
  description: 'In this lesson, we explore Retrieval-Augmented Generation (RAG). RAG addresses LLM knowledge cutoffs and hallucinations by dynamically retrieving relevant facts from a local knowledge base to augment prompt context.',
  conclusion: [
    'You have successfully built and run an Agentic Hybrid RAG Chatbot grounded in the Insurellm knowledge base.',
    'By utilizing Tool Calling and Streaming, the agent decides whether to invoke RAG (via the "invokeRag" tool) or respond directly (e.g. to simple greetings) and streams all generation turns word-by-word.'
  ],
  explanations: [
    'The Core Concept of RAG: Retrieval-Augmented Generation (RAG) resolves model knowledge cutoffs and hallucinations by retrieving relevant text passages from a database and injecting them into the prompt.',
    'Naive RAG Inefficiency: Compulsory retrieving documents for every single message is slow, increases token costs, and is useless for simple greetings (like "Hi" or "How are you?").',
    'Agentic RAG Routing: To optimize Step 2, we expose a search tool named "invokeRag" to the model. The model dynamically decides whether to call the tool for factual queries or reply directly without database search.',
    'Streaming Agent Response: Exposing tools to a streaming assistant (from Step 3) requires a dual-mode generator. We stream plain text chunks instantly, but intercept and aggregate tool parameter chunks in-memory.',
    'Hybrid Search Execution: If a tool call is detected in Step 4, we parse the clean query string using our "extractQueryParam" helper and run parallel Keyword (Orama) and Vector (HNSW) searches.',
    'Reciprocal Rank Fusion (RRF): We combine and rank the documents from Step 5 using their ranks to produce a single relevancy score, ensuring top results are highly accurate.',
    'Synthesis Turn: We inject the fused results from Step 6 back into the chat messages list as a tool output and perform a final inference request to stream the grounded answer.'
  ],
  agnosticCode: `import { retrieveChunks } from './rag_retrieve.js';
import { runInference } from './LESSON_01.js';

// 1. Define the RAG search tool
const tools = [{
  type: 'function',
  function: {
    name: 'invokeRag',
    description: 'Retrieve factual context about Insurellm.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    }
  }
}];

// 2. Chat history with routing instructions
const messages = [
  { role: 'system', content: 'Use the "invokeRag" tool only if you need specific company facts.' },
  { role: 'user', content: 'Hi there!' }
];

// 3. Inference returns direct text stream (no tool call needed)
// Accumulates text chunks as they arrive from the API.
`,
  useSpinner: false, // Disables the loader spinner so user input works cleanly
  allowableArgs: [],
  run: async (state: any, rl?: any) => {
    const isLocalRl = !rl;
    const activeRl = rl || readline.createInterface({ input: process.stdin, output: process.stdout });

    try {
      console.log(boxen(
        `${chalk.bold.green("Insurellm Grounded AI Assistant (Streaming & Agentic)")}\n\n` +
        `This chatbot uses an agentic RAG flow: it decides whether to invoke RAG (via the ${chalk.yellow("invokeRag")} tool) ` +
        `for facts about Insurellm, or respond directly to greetings/general chat without retrieval.\n` +
        `It streams responses in real-time, word-by-word.\n\n` +
        `Type ${chalk.yellow("exit")} to exit the loop.`,
        { padding: 1, borderStyle: 'round', borderColor: 'green' }
      ));

      const systemPrompt =
        `You are a knowledgeable assistant for Insurellm.\n` +
        `1. For simple greetings (like "Hi", "Hello"), pleasantries, or general queries, you must respond directly in natural language without using any tools.\n` +
        `2. For ANY question requiring factual details, policies, employees, or contracts (including follow-ups that use pronouns like "it", "he", "she", "they" to refer to Insurellm or its entities), you MUST invoke the "invokeRag" tool with a search query. Do not answer from memory or claim you cannot find the info without calling the tool first.\n` +
        `3. When calling the tool, rewrite the query to be a standalone, keyword-rich query based on the conversation history (e.g. rewrite "Who is the founder..??" to "founder" or "company founder"). Avoid using generic terms like "Insurellm" in the search query to prevent diluting retrieval scores. If the user's message contains multiple distinct questions or references different domains/entities (e.g., asking about both "Lisa Anderson" and "founder" at the same time), you MUST generate multiple separate "invokeRag" tool calls in parallel—one for each distinct topic—so the search engine can fetch precise documents for each.\n` +
        `4. Ground your final answer strictly in the returned "invokeRag" documents. Cite sources as "[path/file.md]". If the tool results specifically do not contain the answer, state: "I cannot find the answer in the Insurellm documents."`;

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt }
      ];

      while (true) {
        const userInput = await activeRl.question(`\n${chalk.cyan('You: ')}`);
        if (userInput.trim().toLowerCase() === 'exit') {
          break;
        }

        if (!userInput.trim()) continue;

        messages.push({ role: 'user', content: userInput });

        logger.info('RAG Chatbot: Generating response...');
        
        process.stdout.write(`\n${chalk.green('Agent: ')}`);
        let result = await runStreamingAgentInference(messages, chatbotTools);

        while (result.toolCalls && result.toolCalls.length > 0) {
          await handleStreamingToolCalls(result, messages, chatbotToolMap);
          
          logger.info('RAG Chatbot: Synthesizing next step...');
          process.stdout.write(`\n${chalk.green('Agent: ')}`);
          result = await runStreamingAgentInference(messages, chatbotTools);
        }

        // Push the final text response (which didn't trigger any more tool calls) to messages
        messages.push({
          role: 'assistant',
          content: result.content
        });

        // Prune older tool message contents to save context tokens and avoid history distraction
        pruneHistoricalToolMessages(messages);

        console.log(); // print extra newline
      }

      return 'RAG Chatbot REPL session completed successfully!';
    } finally {
      if (isLocalRl) {
        activeRl.close();
      }
    }
  }
};

runInteractiveIfDirect(import.meta.url, metadata);
