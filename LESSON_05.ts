import OpenAI from 'openai';
import readline from 'node:readline/promises';
import chalk from 'chalk';
import boxen from 'boxen';
import { runInference } from './LESSON_01.js';
import { retrieveChunks } from './rag_retrieve.js';
import { logger } from './logger.js';
import { runInteractiveIfDirect } from './run.js';

// 1. Interactive Metadata for Lesson Runner
export const metadata = {
  number: '05',
  title: 'Retrieval-Augmented Generation (RAG) & CLI Chatbot',
  description: 'In this lesson, we explore Retrieval-Augmented Generation (RAG). RAG addresses LLM knowledge cutoffs and hallucinations by dynamically retrieving relevant facts from a local knowledge base to augment prompt context.',
  conclusion: [
    'You have successfully built and run a Hybrid RAG Chatbot grounded in the Insurellm knowledge base.',
    'By combining Orama (BM25 keyword search) and HNSWLib (dense vector similarity search) via Reciprocal Rank Fusion (RRF), you retrieved targeted context chunks, allowing the LLM to generate highly factual, cited answers.'
  ],
  explanations: [
    'Why RAG: LLMs are frozen in time post-training and hallucinate when asked about private corporate documents. RAG provides real-time factual grounding.',
    'Retrieval-Generation Loop: Retrieve matching documents based on user query -> Inject matches into the system prompt context -> Have the LLM synthesize the final answer.',
    'Hybrid Search & RRF: Keyword indexes search exact strings (IDs, proper names); vector spaces capture semantic meaning. Reciprocal Rank Fusion merges their rankings seamlessly.',
    'Alternative Architectures: Advanced RAG systems utilize Cross-Encoder Rerankers, hierarchical parent-child chunk chunking, query expansion/rewriting, and Graph RAG (relationship triples).'
  ],
  agnosticCode: `import { retrieveChunks } from './rag_retrieve.js';
import { runInference } from './LESSON_01.js';

// 1. Retrieve most relevant document snippets (Hybrid Search)
const query = "What is Insurellm's vision statement?";
const chunks = await retrieveChunks(query, 3);

// 2. Format system message with context passages
const context = chunks.map(c => \`Source: \${c.metadata.docRelativePath}\\nContent: \${c.content}\`).join('\\n\\n');

const messages = [
  {
    role: "system",
    content: "Use the following context to answer the question. Cite your sources.\\n\\n" + context
  },
  {
    role: "user",
    content: query
  }
];

// 3. Generate factual answer grounded in retrieval context
const answer = await runInference(messages);
console.log(answer);
`,
  useSpinner: false, // Disables the loader spinner so user input works cleanly
  allowableArgs: [],
  run: async (state: any, rl?: any) => {
    const isLocalRl = !rl;
    const activeRl = rl || readline.createInterface({ input: process.stdin, output: process.stdout });

    try {
      console.log(boxen(
        `${chalk.bold.green("Insurellm Grounded AI Assistant")}\n\n` +
        `This chatbot uses a hybrid RAG retrieval pipeline (SQLite + Orama keyword search + HNSWLib vector search) ` +
        `to retrieve facts about Insurellm's history, offices, and employee records, preventing hallucinations.\n\n` +
        `Type ${chalk.yellow("exit")} to exit the loop.`,
        { padding: 1, borderStyle: 'round', borderColor: 'green' }
      ));

      while (true) {
        const userInput = await activeRl.question(`\n${chalk.cyan('You: ')}`);
        if (userInput.trim().toLowerCase() === 'exit') {
          break;
        }

        if (!userInput.trim()) continue;

        // Step 1: Retrieve context chunks using our hybrid search pipeline
        logger.info({ query: userInput }, 'RAG Chatbot: Fetching context chunks...');
        const retrieved = await retrieveChunks(userInput, 10);

        if (retrieved.length === 0) {
          console.log(`\n${chalk.green('Agent:')} I could not find any relevant information about that in the Insurellm knowledge base.`);
          continue;
        }

        // Step 2: Assemble System Prompt & Context block
        const contextBlocks = retrieved.map((c, idx) => {
          return `[Context File #${idx + 1}: ${c.metadata.docRelativePath}]\n${c.content}`;
        }).join('\n\n');

        const systemMessage = 
          `You are a knowledgeable assistant for Insurellm.\n` +
          `Ground all answers strictly in the provided Context Blocks. ` +
          `Do not make up facts or extrapolate beyond the context.\n` +
          `If the Context Blocks do not contain enough information to answer, state clearly: "I cannot find the answer in the Insurellm documents."\n\n` +
          `Context Blocks:\n${contextBlocks}`;

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userInput }
        ];

        // Step 3: Run inference with OpenRouter or Ollama
        logger.info('RAG Chatbot: Generating answer...');
        const answer = await runInference(messages);

        // Step 4: Display results and references
        console.log(`\n${chalk.green('Agent:')} ${answer}`);
        
        console.log(`\n${chalk.yellow('--- Referenced Sources ---')}`);
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
