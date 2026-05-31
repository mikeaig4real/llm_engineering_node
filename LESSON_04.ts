import OpenAI from 'openai';
import readline from 'node:readline/promises';
import chalk from 'chalk';
import { runInference } from './LESSON_01.js';
import { runInteractiveIfDirect } from './run.js';
import { logger } from './logger.js';
import { config } from './config.js';

// Stateful todo list in-memory array
export interface Todo {
  id: string;
  task: string;
  completed: boolean;
}

export let todos: Todo[] = [
  { id: '1', task: 'Review LLM engineering concepts', completed: true },
  { id: '2', task: 'Implement function calling in Lesson 4', completed: false }
];

// 1. Agnostic Todo Operations
export function listTodos(): Todo[] {
  return todos;
}

export function addTodo(task: string): Todo {
  const newTodo: Todo = {
    id: String(todos.length > 0 ? Math.max(...todos.map(t => parseInt(t.id))) + 1 : 1),
    task,
    completed: false
  };
  todos.push(newTodo);
  return newTodo;
}

export function updateTodo(id: string, task?: string, completed?: boolean): Todo {
  const todo = todos.find(t => t.id === id);
  if (!todo) {
    throw new Error(`Todo with ID "${id}" not found.`);
  }
  if (task !== undefined) todo.task = task;
  if (completed !== undefined) todo.completed = completed;
  return todo;
}

export function deleteTodo(id: string): Todo {
  const index = todos.findIndex(t => t.id === id);
  if (index === -1) {
    throw new Error(`Todo with ID "${id}" not found.`);
  }
  const [deleted] = todos.splice(index, 1);
  return deleted;
}

// Helper to render ASCII Table of current Todos
export function renderTodosTable(): string {
  if (todos.length === 0) {
    return '\n(No tasks in the todo list.)\n';
  }
  
  let output = '\nCURRENT TODO LIST:\n';
  output += '┌────┬──────────────────────────────────────────────────┬───────────┐\n';
  output += '│ ID │ Task                                             │ Status    │\n';
  output += '├────┼──────────────────────────────────────────────────┼───────────┤\n';
  
  for (const todo of todos) {
    const idStr = todo.id.padEnd(2);
    const taskStr = todo.task.substring(0, 48).padEnd(48);
    const statusStr = (todo.completed ? 'Done' : 'Pending').padEnd(9);
    output += `│ ${idStr} │ ${taskStr} │ ${statusStr} │\n`;
  }
  
  output += '└────┴──────────────────────────────────────────────────┴───────────┘\n';
  return output;
}

// 2. OpenAI Tool Schemas
export const todoTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'listTodos',
      description: 'List all existing tasks/todos in the list.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'addTodo',
      description: 'Add a new todo item to the list.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The task description to add.'
          }
        },
        required: ['task']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateTodo',
      description: 'Update the task description or completion status of an existing todo.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The ID of the todo to update.'
          },
          task: {
            type: 'string',
            description: 'The updated task description (optional).'
          },
          completed: {
            type: 'boolean',
            description: 'The updated completion status (optional).'
          }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteTodo',
      description: 'Delete a todo item from the list by ID.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The ID of the todo to delete.'
          }
        },
        required: ['id']
      }
    }
  }
];

// 3. Execution mapping helper
export const todoToolMap: Record<string, Function> = {
  listTodos: () => listTodos(),
  addTodo: ({ task }: { task: string }) => addTodo(task),
  updateTodo: ({ id, task, completed }: { id: string; task?: string; completed?: boolean }) => updateTodo(id, task, completed),
  deleteTodo: ({ id }: { id: string }) => deleteTodo(id)
};

/**
 * Agnostic, modular helper to check, parse, and execute tool calls requested by LLM.
 * Updates the chat message history in-place with Assistant calls and Tool responses.
 */
export async function handleToolCalls(
  completion: any,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  toolMap: Record<string, Function>
): Promise<boolean> {
  const choice = completion.choices[0];
  const toolCalls = choice?.message?.tool_calls;

  if (!toolCalls || toolCalls.length === 0) {
    return false;
  }

  // Push assistant request containing the tool calls
  messages.push(choice.message);

  for (const toolCall of toolCalls) {
    const { name } = toolCall.function;
    const args = JSON.parse(toolCall.function.arguments);

    logger.info({ args }, `[Tool Invocation] Calling "${name}"`);

    try {
      const func = toolMap[name];
      if (!func) {
        throw new Error(`Tool function "${name}" not found in toolMap.`);
      }

      const result = await func(args);
      logger.info('[Tool Result] Success!');

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    } catch (err: any) {
      logger.error(err, `[Tool Error] Failed calling "${name}"`);
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: err.message })
      });
    }
  }

  return true;
}

// 4. Interactive Metadata for Lesson Runner
export const metadata = {
  number: '04',
  title: 'Tool Calling (Function Calling) & LLM Agents',
  description: 'In LLM engineering, "tools" allow models to fetch real-time data, execute actions, and perform computations by requesting the local client to run custom code. Here, we build an agent that manages a Todo list.',
  conclusion: [
    'You have successfully built an LLM Todo agent powered by Tool Calling (Function Calling).',
    'The agent detected user intent, requested matching local database changes (tool calls), and received the formatted execution results back to produce final responses.'
  ],
  explanations: [
    'The Concept of Tool Calling: LLMs cannot access external databases or execute actions on their own. We resolve this by defining local functions (tools) that the model can request to run.',
    'Tool Schemas: To let the model know about the tools from Step 1, we write schemas describing their name, purpose, and required parameter shapes (using JSON schema structures).',
    'Exposing Tools: We pass the tool schema array from Step 2 to the completion request using the "tools" options parameter.',
    'Intent Detection & Interception: When calling the model with tools from Step 3, the model decides if it needs to run a function. If it does, it pauses generation and returns a "tool_calls" request containing the function name and structured JSON arguments.',
    'Tool Execution Mapping: We match the name requested in Step 4 against a local dictionary mapping names to actual JavaScript functions. We parse the arguments and execute the local task.',
    'Unified Chat History: After executing the function in Step 5, we append both the assistant\'s tool call request and the function output (as a message with role: "tool") to the chat history array.',
    'Final Synthesis Request: We submit the updated chat history from Step 6 back to the model, allowing it to read the result of the function call and generate the final answer.'
  ],
  agnosticCode: `import { runInference } from './LESSON_01.js';

// Define tool schema
const tools = [{
  type: 'function',
  function: {
    name: 'addTodo',
    description: 'Add a new todo item.',
    parameters: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] }
  }
}];

// Perform call with tools
const response = await runInference(messages, undefined, { tools });

// Detect and execute
if (response.choices[0].message.tool_calls) {
  const toolCall = response.choices[0].message.tool_calls[0];
  const result = executeLocalTodoFunction(toolCall.function.name, JSON.parse(toolCall.function.arguments));
  
  // Feed back to LLM
  messages.push(response.choices[0].message);
  messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
  const finalAnswer = await runInference(messages);
}`,
  useSpinner: false, // Turn off loader spinner so user can interact cleanly
  allowableArgs: [], // REPL runs interactively inside run()
  run: async (state: any, rl?: any) => {
    const isLocalRl = !rl;
    const activeRl = rl || readline.createInterface({ input: process.stdin, output: process.stdout });

    try {
      logger.info(renderTodosTable());
      logger.info('--- Interactive Todo Agent REPL ---');
      logger.info('Ask the LLM to manage your todos (e.g. "Add a task to buy bread").');
      logger.info('Type "exit" to exit the REPL loop.');

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: 'You are a helpful task manager assistant. You must manage a todo list. Always use the provided tools to add, list, update, or delete todos. Do not assume or hallucinate todo states; query the list first. Summarize your actions in a friendly, concise sentence.'
        }
      ];

      while (true) {
        const userInput = await activeRl.question('\n\x1b[36mYou: \x1b[0m');
        if (userInput.trim().toLowerCase() === 'exit') {
          break;
        }

        if (!userInput.trim()) continue;

        messages.push({ role: 'user', content: userInput });

        logger.info('Thinking...');
        let completion = await runInference(messages, undefined, {
          tools: todoTools,
          returnRaw: true
        });

        while (completion.choices[0]?.message?.tool_calls && completion.choices[0].message.tool_calls.length > 0) {
          logger.info('Processing tool results...');
          await handleToolCalls(completion, messages, todoToolMap);
          completion = await runInference(messages, undefined, {
            tools: todoTools,
            returnRaw: true
          });
        }

        const finalResponse = completion.choices[0]?.message?.content || '';
        messages.push(completion.choices[0].message);

        logger.info(`Agent: ${finalResponse}`);
        logger.info(renderTodosTable());
      }

      return 'REPL Session complete. You successfully exited the loop!';
    } finally {
      if (isLocalRl) {
        activeRl.close();
      }
    }
  }
};

runInteractiveIfDirect(import.meta.url, metadata);

/**
 * Executes a streaming inference request to the LLM, outputting text chunks
 * directly to the terminal in real-time while accumulating and aggregating
/**
 * Helper to check if a buffered stream segment is a raw JSON tool call or greeting wrapper
 * (frequently returned by small models like Llama 3.2 in tool environments) and parse it.
 */
function handleInterceptedJsonWrapper(
  buffer: string,
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[]
): { content: string | null; toolCall?: any } | null {
  const trimmed = buffer.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && parsed.name) {
      const toolName = parsed.name;
      const toolArgs = parsed.parameters || parsed.arguments || {};

      // Check if this matches a registered tool name
      const isRegisteredTool = tools && tools.some(t => (t as any).function?.name === toolName);

      if (isRegisteredTool) {
        return {
          content: null,
          toolCall: {
            id: `call_intercepted_${Math.random().toString(36).substring(2, 9)}`,
            type: 'function',
            function: {
              name: toolName,
              arguments: typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs)
            }
          }
        };
      } else {
        // It's a dummy tool call or greeting wrapper (e.g. "hello", "greet", "empty")
        return {
          content: "Hello! How can I assist you with Insurellm today?"
        };
      }
    }
  } catch (e) {
    // Not valid JSON
  }

  return null;
}

/**
 * Executes a streaming inference request to the LLM, outputting text chunks
 * directly to the terminal in real-time while accumulating and aggregating
 * any tool call delta chunks for agent execution.
 */
export async function runStreamingAgentInference(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
  modelId: string = config.INFERENCE_MODEL
): Promise<{
  content: string | null;
  toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
}> {
  const completion = await runInference(messages, modelId, {
    tools,
    stream: true,
    returnRaw: true
  });

  let fullContent = '';
  let toolCallsAggregator: any[] = [];
  let isBuffering = false;
  let buffer = '';

  for await (const chunk of completion) {
    const choice = chunk.choices[0];
    if (!choice) continue;

    const delta = choice.delta;

    // Stream text content chunks to stdout in real-time
    if (delta.content) {
      fullContent += delta.content;

      if (!isBuffering && fullContent.trim().startsWith('{')) {
        isBuffering = true;
      }

      if (isBuffering) {
        buffer += delta.content;
      } else {
        process.stdout.write(chalk.green(delta.content));
      }
    }

    // Accumulate tool call JSON delta chunks
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (!toolCallsAggregator[tc.index]) {
          toolCallsAggregator[tc.index] = {
            id: '',
            type: 'function',
            function: { name: '', arguments: '' }
          };
        }
        const current = toolCallsAggregator[tc.index];
        if (tc.id) current.id += tc.id;
        if (tc.type) current.type = tc.type;
        if (tc.function?.name) current.function.name += tc.function.name;
        if (tc.function?.arguments) current.function.arguments += tc.function.arguments;
      }
    }
  }

  // Handle buffered content at the end to detect plain JSON tool wrappers
  if (isBuffering) {
    const parsedWrapper = handleInterceptedJsonWrapper(buffer, tools);
    if (parsedWrapper) {
      if (parsedWrapper.toolCall) {
        toolCallsAggregator.push(parsedWrapper.toolCall);
      } else if (parsedWrapper.content) {
        fullContent = parsedWrapper.content;
        process.stdout.write(chalk.green(parsedWrapper.content));
      }
    } else {
      // Just print the raw buffer as is
      process.stdout.write(chalk.green(buffer));
    }
  }

  const toolCalls = toolCallsAggregator.filter(tc => tc && tc.id);

  return {
    content: fullContent || null,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined
  };
}

/**
 * Agnostic, modular helper to check, parse, and execute tool calls requested by a streaming LLM.
 * Updates the chat message history in-place with Assistant calls and Tool responses.
 */
export async function handleStreamingToolCalls(
  result: { content: string | null; toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] },
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  toolMap: Record<string, Function>
): Promise<boolean> {
  if (!result.toolCalls || result.toolCalls.length === 0) {
    return false;
  }

  // Push assistant request containing the tool calls
  messages.push({
    role: 'assistant',
    content: result.content,
    tool_calls: result.toolCalls
  });

  for (const toolCall of result.toolCalls) {
    if (toolCall.type === 'function') {
      const fn = (toolCall as any).function;
      const { name } = fn;
      const args = JSON.parse(fn.arguments);

      logger.info({ args }, `[Tool Invocation] Calling "${name}"`);

      try {
        const func = toolMap[name];
        if (!func) {
          throw new Error(`Tool function "${name}" not found in toolMap.`);
        }

        const outcome = await func(args);
        logger.info('[Tool Result] Success!');

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: typeof outcome === 'string' ? outcome : JSON.stringify(outcome)
        });
      } catch (err: any) {
        logger.error(err, `[Tool Error] Failed calling "${name}"`);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: err.message })
        });
      }
    }
  }

  return true;
}

