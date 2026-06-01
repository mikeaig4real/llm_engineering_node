import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { Command } from 'commander';
import boxen from 'boxen';

import { ingestDocuments } from './rag_ingest.js';
import { retrieveChunks } from './rag_retrieve.js';
import { evaluateRetrieval } from './eval_rag_retrieve.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROGRESS_FILE = path.join(__dirname, '.lesson_progress.json');

// UI Drawing utilities
export function clearScreen() {
  process.stdout.write('\x1Bc');
}

// Progress Persistence Structures
interface ProgressState {
  currentStep: string;
  savedData: any;
  timestamp: string;
}

interface ProgressDB {
  [lessonNumber: string]: ProgressState;
}

export async function saveProgress(lessonNumber: string, stepId: string, savedData: any = {}) {
  try {
    let db: ProgressDB = {};
    if (fs.existsSync(PROGRESS_FILE)) {
      const content = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      db = JSON.parse(content);
    }
    db[lessonNumber] = {
      currentStep: stepId,
      savedData,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (error) {
    // Fail silently
  }
}

export function loadProgress(lessonNumber: string): ProgressState | null {
  try {
    if (!fs.existsSync(PROGRESS_FILE)) return null;
    const content = fs.readFileSync(PROGRESS_FILE, 'utf-8');
    const db: ProgressDB = JSON.parse(content);
    return db[lessonNumber] || null;
  } catch (error) {
    return null;
  }
}

export function clearProgress(lessonNumber: string) {
  try {
    if (!fs.existsSync(PROGRESS_FILE)) return;
    const content = fs.readFileSync(PROGRESS_FILE, 'utf-8');
    const db: ProgressDB = JSON.parse(content);
    delete db[lessonNumber];
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (error) {
    // Fail silently
  }
}

// Main Interactive Runner
export async function startInteractiveLesson(metadata: any) {
  let currentStep = 'WELCOME';
  let state: any = {};

  // Check if there is saved progress
  const saved = loadProgress(metadata.number);
  if (saved) {
    clearScreen();
    console.log(boxen(
      `${chalk.bold.yellow(`Saved progress found for Lesson ${metadata.number}!`)}\n` +
      `Saved step: ${chalk.cyan(saved.currentStep)} (from ${new Date(saved.timestamp).toLocaleString()})`,
      { padding: 1, borderStyle: 'round', borderColor: 'yellow' }
    ));
    
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'resume',
        message: 'Do you want to resume?',
        default: true
      }
    ]);
    
    if (answers.resume) {
      currentStep = saved.currentStep;
      state = saved.savedData || {};
    } else {
      clearProgress(metadata.number);
    }
  }

  try {
    while (true) {
      if (currentStep === 'WELCOME') {
        await saveProgress(metadata.number, 'WELCOME', state);
        clearScreen();
        
        console.log(boxen(
          `${chalk.bold.yellow(`LESSON ${metadata.number}: ${metadata.title}`)}\n\n` +
          `${chalk.white(metadata.description)}`,
          { padding: 1, borderStyle: 'round', borderColor: 'yellow' }
        ));
        
        console.log(chalk.dim("\n(Tip: You can type 'exit' at any prompt to save progress and quit)\n"));
        
        const ans = await inquirer.prompt([
          {
            type: 'input',
            name: 'continue',
            message: chalk.dim("Press Enter to continue...")
          }
        ]);
        if (ans.continue.trim().toLowerCase() === 'exit') {
          await saveProgress(metadata.number, 'WELCOME', state);
          console.log(chalk.yellow(`Progress saved at step: WELCOME. You can resume Lesson ${metadata.number} later!`));
          break;
        }
        currentStep = 'EXPLANATION';
      }

      else if (currentStep === 'EXPLANATION') {
        await saveProgress(metadata.number, 'EXPLANATION', state);
        clearScreen();
        
        const explanationLines = metadata.explanations.map((exp: string, index: number) => {
          return `${chalk.green(index + 1)}. ${exp}`;
        }).join('\n');
        
        console.log(boxen(
          `${chalk.bold.magenta("What we are about to do:")}\n\n${explanationLines}`,
          { padding: 1, borderStyle: 'single', borderColor: 'magenta' }
        ));
        
        const ans = await inquirer.prompt([
          {
            type: 'input',
            name: 'continue',
            message: chalk.dim("Press Enter to continue to Code Preview...")
          }
        ]);
        if (ans.continue.trim().toLowerCase() === 'exit') {
          await saveProgress(metadata.number, 'EXPLANATION', state);
          console.log(chalk.yellow(`Progress saved at step: EXPLANATION. You can resume Lesson ${metadata.number} later!`));
          break;
        }
        currentStep = 'CODE_PREVIEW';
      }

      else if (currentStep === 'CODE_PREVIEW') {
        await saveProgress(metadata.number, 'CODE_PREVIEW', state);
        clearScreen();
        
        console.log(boxen(
          chalk.gray(metadata.agnosticCode),
          {
            title: chalk.bold.blue(' Agnostic Code Preview '),
            titleAlignment: 'left',
            borderStyle: 'single',
            borderColor: 'blue',
            padding: 1
          }
        ));
        
        const ans = await inquirer.prompt([
          {
            type: 'input',
            name: 'continue',
            message: chalk.dim("Press Enter to configure arguments...")
          }
        ]);
        if (ans.continue.trim().toLowerCase() === 'exit') {
          await saveProgress(metadata.number, 'CODE_PREVIEW', state);
          console.log(chalk.yellow(`Progress saved at step: CODE_PREVIEW. You can resume Lesson ${metadata.number} later!`));
          break;
        }
        currentStep = 'INPUT_ARGS';
      }

      else if (currentStep === 'INPUT_ARGS') {
        await saveProgress(metadata.number, 'INPUT_ARGS', state);
        clearScreen();
        
        console.log(chalk.bold('Configure Arguments:\n'));
        
        if (metadata.allowableArgs && metadata.allowableArgs.length > 0) {
          const promptQuestions = metadata.allowableArgs.map((arg: any) => {
            const defaultVal = state[arg.name] !== undefined ? state[arg.name] : arg.default;
            return {
              type: 'input',
              name: arg.name,
              message: chalk.cyan(`Enter value for ${arg.name} (${arg.description}):`),
              default: defaultVal
            };
          });
          
          const answers = await inquirer.prompt(promptQuestions);
          Object.assign(state, answers);
        } else {
          console.log(chalk.dim('No configuration arguments required for this lesson.'));
        }

        await saveProgress(metadata.number, 'INPUT_ARGS', state);
        
        const ans = await inquirer.prompt([
          {
            type: 'input',
            name: 'continue',
            message: chalk.dim("Press Enter to execute lesson task...")
          }
        ]);
        if (ans.continue.trim().toLowerCase() === 'exit') {
          await saveProgress(metadata.number, 'INPUT_ARGS', state);
          console.log(chalk.yellow(`Progress saved at step: INPUT_ARGS. You can resume Lesson ${metadata.number} later!`));
          break;
        }
        currentStep = 'EXECUTION';
      }

      else if (currentStep === 'EXECUTION') {
        await saveProgress(metadata.number, 'EXECUTION', state);
        clearScreen();
        
        console.log(chalk.bold('Executing Lesson Task...\n'));
        
        const useSpinner = typeof metadata.useSpinner === 'function'
          ? metadata.useSpinner(state)
          : (metadata.useSpinner !== false);

        let response;
        if (useSpinner) {
          const spinner = ora(chalk.cyan('Running inference...')).start();
          try {
            response = await metadata.run(state);
            spinner.succeed(chalk.green('Task executed successfully!'));
          } catch (err: any) {
            spinner.fail(chalk.red('Task execution failed!'));
            response = `Error: ${err.message}`;
          }
        } else {
          try {
            response = await metadata.run(state);
          } catch (err: any) {
            response = `Error: ${err.message}`;
          }
        }
        
        state.result = response;
        await saveProgress(metadata.number, 'CONCLUSION', state);
        
        console.log(`\n${chalk.green.bold('Response received:')}`);
        console.log(boxen(
          chalk.white(response || 'No response returned.'),
          { padding: 1, borderStyle: 'round', borderColor: 'green' }
        ));
        
        const ans = await inquirer.prompt([
          {
            type: 'input',
            name: 'continue',
            message: chalk.dim("Press Enter to view the lesson conclusion...")
          }
        ]);
        if (ans.continue.trim().toLowerCase() === 'exit') {
          await saveProgress(metadata.number, 'CONCLUSION', state);
          console.log(chalk.yellow(`Progress saved at step: CONCLUSION. You can resume Lesson ${metadata.number} later!`));
          break;
        }
        currentStep = 'CONCLUSION';
      }

      else if (currentStep === 'CONCLUSION') {
        clearScreen();
        
        const conclusionText = Array.isArray(metadata.conclusion)
          ? metadata.conclusion.join('\n\n')
          : metadata.conclusion;
          
        console.log(boxen(
          `${chalk.bold.green('✓ Lesson Completed!')}\n\n${conclusionText}`,
          { padding: 1, borderStyle: 'double', borderColor: 'green' }
        ));
        
        clearProgress(metadata.number);
        await inquirer.prompt([
          {
            type: 'input',
            name: 'exit',
            message: chalk.dim('Press Enter to return to main menu...')
          }
        ]);
        break;
      }
    }
  } catch (error) {
    console.error(chalk.red('\nAn error occurred during interactive session:'), error);
  }
}

/**
 * Automatically starts the interactive lesson if the module is executed directly.
 */
export function runInteractiveIfDirect(moduleUrl: string, metadata: any) {
  if (!process.argv[1]) return;

  const currentFilePath = path.resolve(fileURLToPath(moduleUrl));
  const entryFilePath = path.resolve(process.argv[1]);

  const cleanCurrent = currentFilePath.replace(/\.(ts|js)$/, '').toLowerCase();
  const cleanEntry = entryFilePath.replace(/\.(ts|js)$/, '').toLowerCase();

  if (cleanCurrent === cleanEntry) {
    startInteractiveLesson(metadata).catch((err) => {
      console.error(chalk.red(`Failed to run Lesson ${metadata.number} interactively:`), err);
    });
  }
}

async function launchLesson(lessonNumber: string) {
  const formattedNum = lessonNumber.padStart(2, '0');
  const filename = `LESSON_${formattedNum}.ts`;
  const filePath = path.join(__dirname, filename);

  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`Error: Lesson file "${filename}" not found.`));
    return;
  }

  try {
    const moduleUrl = pathToFileURL(filePath).href;
    const lessonModule = await import(moduleUrl);

    if (lessonModule.metadata && typeof lessonModule.metadata.run === 'function') {
      await startInteractiveLesson(lessonModule.metadata);
    } else {
      console.error(chalk.red(`Error: Lesson ${formattedNum} does not export "metadata" or "run" function.`));
    }
  } catch (error) {
    console.error(chalk.red(`Error executing Lesson ${lessonNumber}:`), error);
  }
}

async function promptReturnToMenu() {
  console.log();
  await inquirer.prompt([
    {
      type: 'input',
      name: 'back',
      message: chalk.dim('Press Enter to return to main menu...')
    }
  ]);
  await showMainMenu();
}

async function showMainMenu() {
  clearScreen();
  console.log(boxen(
    chalk.bold.cyan("LLM Engineering - Node.js CLI Tools"),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'cyan',
      title: 'Interactive Dashboard',
      titleAlignment: 'center'
    }
  ));

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Choose an action to perform:',
      choices: [
        { name: 'Run Interactive Lesson', value: 'lesson' },
        { name: 'Run Document Ingestion (rag_ingest)', value: 'ingest' },
        { name: 'Test Retrieval (rag_retrieve)', value: 'retrieve' },
        { name: 'Run Retrieval Evaluation (eval_rag_retrieve)', value: 'eval' },
        { name: 'Exit', value: 'exit' }
      ]
    }
  ]);

  if (answers.action === 'lesson') {
    const lessonAnswers = await inquirer.prompt([
      {
        type: 'list',
        name: 'lesson',
        message: 'Select a lesson to run:',
        choices: [
          { name: 'Lesson 01: Connecting to LLMs (OpenAI SDK & OpenRouter/Ollama)', value: '01' },
          { name: 'Lesson 02: Tokens, Estimation, and Cost Calculation', value: '02' },
          { name: 'Lesson 03: Advanced Inference Options (Zod Schema, Streaming)', value: '03' },
          { name: 'Lesson 04: Tool Calling (Function Calling) & LLM Agents', value: '04' },
          { name: 'Lesson 05: Retrieval-Augmented Generation (RAG) & CLI Chatbot', value: '05' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (lessonAnswers.lesson === 'back') {
      await showMainMenu();
      return;
    }
    await launchLesson(lessonAnswers.lesson);
    await showMainMenu();
  } else if (answers.action === 'ingest') {
    const spinner = ora(chalk.cyan('Running document ingestion...')).start();
    try {
      spinner.stop(); // Stop spinner to avoid garbling Pino log outputs
      await ingestDocuments();
      console.log(chalk.green('\n[SUCCESS] Document Ingestion completed successfully!'));
    } catch (err: any) {
      console.error(chalk.red(`\n[ERROR] Document Ingestion failed: ${err.message}`));
    }
    await promptReturnToMenu();
  } else if (answers.action === 'retrieve') {
    const ans = await inquirer.prompt([
      {
        type: 'input',
        name: 'query',
        message: chalk.cyan('Enter search query:'),
        validate: input => input.trim() ? true : 'Query cannot be empty.'
      }
    ]);
    const spinner = ora(chalk.cyan('Executing RAG search...')).start();
    try {
      const results = await retrieveChunks(ans.query, 10);
      spinner.succeed(chalk.green('Search finished. Here are the top 10 results:'));
      
      results.forEach((res, i) => {
        console.log(boxen(
          `${chalk.bold.yellow(`[Result ${i + 1}] Score: ${res.score.toFixed(4)}`)}\n` +
          `${chalk.cyan('Source:')} ${res.metadata.docRelativePath} (${res.metadata.contentType})\n` +
          `${chalk.dim('---')}\n` +
          `${chalk.white(res.content)}`,
          { padding: 0.5, margin: 0.5, borderStyle: 'round', borderColor: 'cyan' }
        ));
      });
    } catch (err: any) {
      spinner.fail(chalk.red(`Retrieval failed: ${err.message}`));
    }
    await promptReturnToMenu();
  } else if (answers.action === 'eval') {
    const ans = await inquirer.prompt([
      {
        type: 'input',
        name: 'k',
        message: chalk.cyan('Enter k (number of top results to retrieve):'),
        default: '10',
        validate: input => isNaN(parseInt(input)) ? 'Please enter a valid number.' : true
      }
    ]);
    const spinner = ora(chalk.cyan('Running retrieval evaluation...')).start();
    try {
      spinner.stop(); // Stop spinner to avoid garbling Pino log outputs
      await evaluateRetrieval(parseInt(ans.k));
      console.log(chalk.green('\n[SUCCESS] Retrieval Evaluation completed!'));
    } catch (err: any) {
      console.error(chalk.red(`\n[ERROR] Retrieval Evaluation failed: ${err.message}`));
    }
    await promptReturnToMenu();
  } else {
    console.log(chalk.cyan('Goodbye!'));
    process.exit(0);
  }
}

// Unified Commander CLI Configuration
const program = new Command();

program
  .name('rag-cli')
  .description('A unified CLI to run lessons, ingestion, and evaluation of the RAG pipeline.')
  .version('1.0.0');

program
  .command('menu')
  .description('Launch the interactive CLI dashboard (default)')
  .action(async () => {
    await showMainMenu();
  });

program
  .command('lesson [number]')
  .description('Run a specific interactive lesson (1-5)')
  .action(async (number) => {
    let lessonNum = number;
    if (!lessonNum) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'lesson',
          message: 'Select a lesson to run:',
          choices: [
            { name: 'Lesson 01: Connecting to LLMs (OpenAI SDK & OpenRouter/Ollama)', value: '01' },
            { name: 'Lesson 02: Tokens, Estimation, and Cost Calculation', value: '02' },
            { name: 'Lesson 03: Advanced Inference Options (Zod Schema, Streaming)', value: '03' },
            { name: 'Lesson 04: Tool Calling (Function Calling) & LLM Agents', value: '04' },
            { name: 'Lesson 05: Retrieval-Augmented Generation (RAG) & CLI Chatbot', value: '05' }
          ]
        }
      ]);
      lessonNum = answers.lesson;
    }
    await launchLesson(lessonNum);
  });

program
  .command('ingest')
  .description('Run document ingestion pipeline')
  .action(async () => {
    try {
      await ingestDocuments();
      console.log(chalk.green('\n[SUCCESS] Document Ingestion completed successfully!'));
      process.exit(0);
    } catch (err: any) {
      console.error(chalk.red(`\n[ERROR] Document Ingestion failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('retrieve')
  .description('Test retrieval functionality')
  .argument('[query]', 'Query text to search for')
  .action(async (query) => {
    let searchQuery = query;
    if (!searchQuery) {
      const ans = await inquirer.prompt([
        {
          type: 'input',
          name: 'query',
          message: chalk.cyan('Enter search query:'),
          validate: input => input.trim() ? true : 'Query cannot be empty.'
        }
      ]);
      searchQuery = ans.query;
    }

    const spinner = ora(chalk.cyan('Executing RAG search...')).start();
    try {
      const results = await retrieveChunks(searchQuery, 10);
      spinner.succeed(chalk.green('Search finished. Here are the top 10 results:'));
      
      results.forEach((res, i) => {
        console.log(boxen(
          `${chalk.bold.yellow(`[Result ${i + 1}] Score: ${res.score.toFixed(4)}`)}\n` +
          `${chalk.cyan('Source:')} ${res.metadata.docRelativePath} (${res.metadata.contentType})\n` +
          `${chalk.dim('---')}\n` +
          `${chalk.white(res.content)}`,
          { padding: 0.5, margin: 0.5, borderStyle: 'round', borderColor: 'cyan' }
        ));
      });
      process.exit(0);
    } catch (err: any) {
      spinner.fail(chalk.red(`Retrieval failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('evaluate-retrieval')
  .description('Run retrieval evaluation metrics')
  .option('-k <value>', 'number of documents to retrieve', '10')
  .option('--mode <mode>', 'evaluation scope mode: all, single, range')
  .option('--index <value>', 'single test question index (1-150)')
  .option('--start <value>', 'range start index (1-150)')
  .option('--end <value>', 'range end index (1-150)')
  .action(async (options) => {
    const kVal = parseInt(options.k);
    const mode = options.mode;
    const index = options.index ? parseInt(options.index, 10) : undefined;
    const start = options.start ? parseInt(options.start, 10) : undefined;
    const end = options.end ? parseInt(options.end, 10) : undefined;
    try {
      await evaluateRetrieval(kVal, { mode, index, start, end });
      console.log(chalk.green('\n[SUCCESS] Retrieval Evaluation completed!'));
      process.exit(0);
    } catch (err: any) {
      console.error(chalk.red(`\n[ERROR] Retrieval Evaluation failed: ${err.message}`));
      process.exit(1);
    }
  });

// Run directly
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('run.ts') || 
  process.argv[1].endsWith('run.js')
);

if (isDirectRun) {
  const handleGracefulExit = (err: any) => {
    if (err instanceof Error && (err.name === 'ExitPromptError' || err.message.includes('SIGINT') || err.message.includes('force closed'))) {
      console.log(chalk.yellow('\n\nOperation cancelled. Goodbye!'));
      process.exit(0);
    }
    console.error(chalk.red('Error:'), err);
    process.exit(1);
  };

  // If no arguments or command specified, default to showing the menu
  if (process.argv.length <= 2) {
    showMainMenu().catch(handleGracefulExit);
  } else {
    program.parseAsync(process.argv).catch(handleGracefulExit);
  }
}
