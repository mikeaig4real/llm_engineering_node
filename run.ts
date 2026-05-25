import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import readline from 'node:readline/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROGRESS_FILE = path.join(__dirname, '.lesson_progress.json');

// Color Utilities
export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
};

// UI Drawings
export function clearScreen() {
  process.stdout.write('\x1Bc');
}

export function drawHeader(lessonNumber: string, title: string) {
  const line = '═'.repeat(title.length + 16);
  console.log(`${c.cyan}${c.bold}╔${line}╗`);
  console.log(`║   LESSON ${lessonNumber}: ${title}  ║`);
  console.log(`╚${line}╝${c.reset}\n`);
}

export function drawCard(title: string, content: string) {
  console.log(`${c.yellow}┌── ${title} ──────────────────────────────────────────────────${c.reset}`);
  content.split('\n').forEach((line) => {
    console.log(`  ${line}`);
  });
  console.log(`${c.yellow}└─────────────────────────────────────────────────────────────${c.reset}\n`);
}

// Custom Spinner
export async function runWithSpinner<T>(message: string, action: () => Promise<T>): Promise<T> {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  
  const timer = setInterval(() => {
    process.stdout.write(`\r${c.cyan}${frames[i]}${c.reset} ${message}`);
    i = (i + 1) % frames.length;
  }, 80);

  try {
    const result = await action();
    return result;
  } finally {
    clearInterval(timer);
    process.stdout.write(`\r\x1b[K`); // Clear line
  }
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
    // Fail silently to avoid interrupting the lesson flow
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

// Interactive helper for questioning to allow 'exit' saving flow
async function askQuestion(
  rl: readline.Interface,
  query: string,
  stepId: string,
  lessonNumber: string,
  state: any
): Promise<string> {
  const answer = await rl.question(query);
  if (answer.trim().toLowerCase() === 'exit') {
    await saveProgress(lessonNumber, stepId, state);
    console.log(`\n${c.yellow}Progress saved at step: ${stepId}. You can resume Lesson ${lessonNumber} later!${c.reset}`);
    rl.close();
    process.exit(0);
  }
  return answer;
}

// Main Interactive Runner
export async function startInteractiveLesson(metadata: any) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let currentStep = 'WELCOME';
  let state: any = {};

  // Check if there is saved progress
  const saved = loadProgress(metadata.number);
  if (saved) {
    clearScreen();
    console.log(`${c.yellow}${c.bold}Saved progress found for Lesson ${metadata.number}!${c.reset}`);
    console.log(`Saved step: ${c.cyan}${saved.currentStep}${c.reset} (from ${new Date(saved.timestamp).toLocaleString()})\n`);
    const answer = await rl.question('Do you want to resume? (y/n) ');
    if (answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes') {
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
        drawHeader(metadata.number, metadata.title);
        console.log(`${c.bold}Description:${c.reset}`);
        console.log(metadata.description);
        console.log(`\n${c.dim}(Tip: You can type 'exit' at any prompt to save progress and quit)${c.reset}\n`);
        
        await askQuestion(rl, 'Press Enter to continue...', 'WELCOME', metadata.number, state);
        currentStep = 'EXPLANATION';
      }

      else if (currentStep === 'EXPLANATION') {
        await saveProgress(metadata.number, 'EXPLANATION', state);
        clearScreen();
        drawHeader(metadata.number, metadata.title);
        console.log(`${c.bold}What we are about to do:${c.reset}\n`);
        metadata.explanations.forEach((exp: string, index: number) => {
          console.log(`${c.green}${index + 1}.${c.reset} ${exp}`);
        });
        console.log();
        
        await askQuestion(rl, 'Press Enter to continue to Code Preview...', 'EXPLANATION', metadata.number, state);
        currentStep = 'CODE_PREVIEW';
      }

      else if (currentStep === 'CODE_PREVIEW') {
        await saveProgress(metadata.number, 'CODE_PREVIEW', state);
        clearScreen();
        drawHeader(metadata.number, metadata.title);
        console.log(`${c.bold}Lesson Function Code:${c.reset}\n`);
        drawCard('LESSON FUNCTION', metadata.agnosticCode);
        
        await askQuestion(rl, 'Press Enter to configure arguments...', 'CODE_PREVIEW', metadata.number, state);
        currentStep = 'INPUT_ARGS';
      }

      else if (currentStep === 'INPUT_ARGS') {
        await saveProgress(metadata.number, 'INPUT_ARGS', state);
        clearScreen();
        drawHeader(metadata.number, metadata.title);
        console.log(`${c.bold}Configure Arguments:${c.reset}\n`);
        
        for (const arg of metadata.allowableArgs) {
          console.log(`${c.cyan}${arg.name}${c.reset}: ${arg.description}`);
          const defaultVal = state[arg.name] !== undefined ? state[arg.name] : arg.default;
          console.log(`${c.dim}(Default: "${defaultVal}")${c.reset}`);
          const inputVal = await askQuestion(rl, `Enter value for ${arg.name}: `, 'INPUT_ARGS', metadata.number, state);
          state[arg.name] = inputVal.trim() !== '' ? inputVal : defaultVal;
          console.log();
        }

        await saveProgress(metadata.number, 'INPUT_ARGS', state);
        
        await askQuestion(rl, 'Press Enter to execute inference...', 'INPUT_ARGS', metadata.number, state);
        currentStep = 'EXECUTION';
      }

      else if (currentStep === 'EXECUTION') {
        await saveProgress(metadata.number, 'EXECUTION', state);
        clearScreen();
        drawHeader(metadata.number, metadata.title);
        console.log(`${c.bold}Running Inference...${c.reset}\n`);
        
        let response;
        try {
          response = await runWithSpinner('Calling OpenRouter API...', async () => {
            return await metadata.run(state);
          });
        } catch (err: any) {
          response = `Error: ${err.message}`;
        }
        
        state.result = response;
        await saveProgress(metadata.number, 'CONCLUSION', state);
        
        console.log(`\n${c.green}${c.bold}Response received:${c.reset}`);
        drawCard('OUTPUT RESULT', response || 'No response returned.');
        
        await askQuestion(rl, 'Press Enter to view the lesson conclusion...', 'CONCLUSION', metadata.number, state);
        currentStep = 'CONCLUSION';
      }

      else if (currentStep === 'CONCLUSION') {
        clearScreen();
        drawHeader(metadata.number, metadata.title);
        console.log(`${c.green}${c.bold}✓ Lesson Completed!${c.reset}\n`);
        console.log('You have successfully set up the OpenAI client, queried the Gemini model via OpenRouter, and rendered its response in the terminal.');
        console.log('Feel free to inspect the codebase and run other lessons to continue your learning journey.\n');
        
        clearProgress(metadata.number);
        await rl.question('Press Enter to exit the interactive lesson...');
        rl.close();
        break;
      }
    }
  } catch (error) {
    console.error('\nAn error occurred during interactive session:', error);
    rl.close();
  }
}

// Universal CLI Execution Handler
async function main() {
  const args = process.argv.slice(2);
  const lessonArg = args[0];

  if (!lessonArg) {
    console.error(`\x1b[31mError: Please specify a lesson number (e.g., 1 or 01).\x1b[0m`);
    console.error('Usage: npm run lesson <lesson_number> [arguments]');
    process.exit(1);
  }

  const lessonNumber = lessonArg.padStart(2, '0');
  const filename = `LESSON_${lessonNumber}.ts`;
  const filePath = path.join(__dirname, filename);

  if (!fs.existsSync(filePath)) {
    console.error(`\x1b[31mError: Lesson file "${filename}" not found.\x1b[0m`);
    console.error(`Looked at path: ${filePath}`);
    process.exit(1);
  }

  try {
    const moduleUrl = pathToFileURL(filePath).href;
    const lessonModule = await import(moduleUrl);

    if (lessonModule.metadata && typeof lessonModule.metadata.run === 'function') {
      await startInteractiveLesson(lessonModule.metadata);
    } else {
      console.error(`\x1b[31mError: Lesson ${lessonNumber} does not export "metadata" or its metadata does not define a "run" function.\x1b[0m`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\x1b[31mError executing Lesson ${lessonArg}:\x1b[0m`, error);
    process.exit(1);
  }
}

// Execute CLI runner if run directly via tsx/node
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('run.ts') || 
  process.argv[1].endsWith('run.js')
);

if (isDirectRun) {
  main();
}
