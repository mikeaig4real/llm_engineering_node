# Node.js LLM Engineering Toolkit

A modern, high-performance, flat-structured TypeScript template designed for doing LLM engineering inside the Node.js ecosystem. It features **Express 5** (with native async error support), **Zod v4** (for robust request schema validation), **Vitest/Supertest** (for fast API testing), and **Pino** (for structured JSON logging ready for observability).

Our first core integration establishes connection to LLMs using the OpenAI SDK (configured for OpenRouter).

---

## Prerequisites

Before running the project, ensure you have the following installed on your system:
- **Node.js**: `v20.0.0` or higher (recommended: `v22.16.0` or higher)
- **npm**: `v10.0.0` or higher

---

## Quick Start

### 1. Install Dependencies
Run the following command to install the required packages:
```bash
npm install
```

### 2. Configure Environment Variables
Copy the environment template file:
```bash
cp .env.example .env
```
Open the newly created `.env` file and add your credentials:
```env
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

### 3. Run in Development Mode
Start the live-reloading dev server powered by `tsx`:
```bash
npm run dev
```
The server will start listening on [http://localhost:3000](http://localhost:3000).

### 4. Run the Tests
Verify the code works correctly using Vitest:
```bash
npm run test
```

### 5. Build for Production
To compile the TypeScript code to JavaScript:
```bash
npm run build
npm start
```
Compiles and bundles the output directly into `/dist`.

---

## Core Technologies & Scripts

- **Express 5**: Native async handling.
- **Zod v4**: Fast schema validation.
- **Pino**: High-performance structured JSON logging.
- **Vitest & Supertest**: Developer-friendly API and request unit testing.
- **TSX**: Modern and fast TypeScript runner (watch-mode enabled).

### Available Scripts
- `npm run dev` - Run development server in watch mode.
- `npm run build` - Clean output directory and compile TypeScript.
- `npm run start` - Start compiled production server.
- `npm run test` - Run test suite.
- `npm run test:watch` - Launch Vitest interactive runner.
- `npm run lesson <number> [args]` - Dynamically run a specific lesson (e.g., `npm run lesson 1`) and pass optional arguments.

---

## API Endpoints

- **`GET /`**: Welcome route showing `welcome to LLM_ENGINEERING WITH NODEJS`.
- **`GET /docs`**: Interactive Swagger API documentation UI.
- **`GET /health`**: Health status indicator.
- **`POST /echo`**: Echoes input messages (validates that `message` is present and non-empty using Zod).

---

## Lesson 1: Connecting to LLMs (OpenAI SDK & OpenRouter)

This lesson demonstrates how to initialize and configure the OpenAI SDK client to connect to language models via OpenRouter, send a prompt, and handle the chat completion response.

View the complete implementation code here: [LESSON_01.ts](LESSON_01.ts)

### How to Run

You can launch the lesson interactively in two ways:

1.  **Using NPM script**:
    ```bash
    npm run lesson 1
    ```
2.  **Running the lesson file directly** (via TSX):
    ```bash
    npx tsx LESSON_01.ts
    ```

### Interactive Features

When you run a lesson, the universal runner guides you through a gamified learning experience:
*   **Step-by-Step Walkthrough**: View lesson descriptions, conceptual explanations, and agnostic code snippets in visually structured cards.
*   **Live Parameter Customization**: Interactively configure lesson arguments (e.g. entering a custom prompt) or press `Enter` to use the lesson defaults.
*   **Auto-Save & Checkpoints**: Your progress is automatically saved at every major step.
*   **Graceful Exit**: You can type `exit` at any interactive prompt to save your session. The next time you start the lesson, you will be prompted to resume where you left off.
*   **Agnostic Core Functions**: Core execution logic is completely decoupled from the runner UI, allowing functions to be cleanly imported, reused, and shared across lessons.
