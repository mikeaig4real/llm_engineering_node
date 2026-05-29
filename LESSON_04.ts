import OpenAI from 'openai';
import readline from 'node:readline/promises';
import { runInference } from './LESSON_01.js';
import { runInteractiveIfDirect } from './run.js';

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
    const statusStr = (todo.completed ? '✓ Done' : '⏵ Pending').padEnd(9);
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
export async function executeTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'listTodos':
      return listTodos();
    case 'addTodo':
      return addTodo(args.task);
    case 'updateTodo':
      return updateTodo(args.id, args.task, args.completed);
    case 'deleteTodo':
      return deleteTodo(args.id);
    default:
      throw new Error(`Unknown tool function: ${name}`);
  }
}

/**
 * Agnostic, modular helper to check, parse, and execute tool calls requested by LLM.
 * Updates the chat message history in-place with Assistant calls and Tool responses.
 */
export async function handleToolCalls(
  completion: any,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
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

    console.log(`\n\x1b[33m⚙️ [Tool Invocation] Calling "${name}" with args:\x1b[0m`, args);

    try {
      const result = await executeTool(name, args);
      console.log(`\x1b[32m✅ [Tool Result] Success!\x1b[0m`);

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    } catch (err: any) {
      console.error(`\x1b[31m❌ [Tool Error] Failed calling "${name}":\x1b[0m`, err.message);
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
    'Define Tool Schema: Structure each tool with a name, description, and Zod/JSON-schema describing parameters.',
    'Expose Tools: Pass the tool schema array to chat completions using the "tools" options payload.',
    'Model Detection: The LLM chooses whether to call a tool or reply in natural language.',
    'Execution Loop: If tool_calls are returned, parse arguments, execute local code, return responses with role="tool", and query the model again.'
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
      console.log(renderTodosTable());
      console.log('\n\x1b[1m--- Interactive Todo Agent REPL ---\x1b[0m');
      console.log('Ask the LLM to manage your todos (e.g. "Add a task to buy bread").');
      console.log('Type "exit" to exit the REPL loop.\n');

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

        console.log('\x1b[2mThinking...\x1b[0m');
        let completion = await runInference(messages, undefined, {
          tools: todoTools,
          returnRaw: true
        });

        const hadToolCalls = await handleToolCalls(completion, messages);

        if (hadToolCalls) {
          console.log('\x1b[2mProcessing tool results...\x1b[0m');
          completion = await runInference(messages, undefined, {
            returnRaw: true
          });
        }

        const finalResponse = completion.choices[0]?.message?.content || '';
        messages.push(completion.choices[0].message);

        console.log(`\n\x1b[35mAgent:\x1b[0m ${finalResponse}`);
        console.log(renderTodosTable());
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
