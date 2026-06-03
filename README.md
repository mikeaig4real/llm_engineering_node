# Node.js LLM Engineering Toolkit

<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-v20%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-v5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://expressjs.com/"><img src="https://img.shields.io/badge/Express-v5-000000?style=flat-square&logo=express&logoColor=white" alt="Express"></a>
  <a href="https://sqlite.org/"><img src="https://img.shields.io/badge/SQLite-database-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite"></a>
  <a href="https://orama.com/"><img src="https://img.shields.io/badge/Orama-v3-EC4899?style=flat-square" alt="Orama"></a>
  <a href="https://github.com/hmartiro/hnswlib-node"><img src="https://img.shields.io/badge/HNSWLib-ANN-FF3670?style=flat-square" alt="HNSWLib"></a>
  <a href="https://vitest.dev/"><img src="https://img.shields.io/badge/tests-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest"></a>
  <a href="https://zod.dev/"><img src="https://img.shields.io/badge/Zod-v4-3E67B1?style=flat-square&logo=zod&logoColor=white" alt="Zod"></a>
  <a href="https://getpino.io/"><img src="https://img.shields.io/badge/Pino-logging-551A8B?style=flat-square&logo=pino&logoColor=white" alt="Pino"></a>
  <a href="https://ollama.com/"><img src="https://img.shields.io/badge/Ollama-local--AI-000000?style=flat-square&logo=ollama&logoColor=white" alt="Ollama"></a>
  <a href="https://openrouter.ai/"><img src="https://img.shields.io/badge/OpenRouter-inference-7E22CE?style=flat-square" alt="OpenRouter"></a>
  <a href="https://swagger.io/"><img src="https://img.shields.io/badge/Swagger-docs-85EA2D?style=flat-square&logo=swagger&logoColor=black" alt="Swagger"></a>
</p>

A modern, high-performance, flat-structured TypeScript template designed for doing LLM engineering inside the Node.js ecosystem. It features **Express 5** (with native async error support), **Zod v4** (for robust request schema validation), **Vitest/Supertest** (for fast API testing), and **Pino** (for structured JSON logging ready for observability).

Our core integrations establish connections to LLMs using the OpenAI SDK, counting and estimating tokens locally, calculating inference costs, configuring advanced parameters (like structured schema outputs, callback-based streaming, and cutoff limits), and invoking local tools/functions dynamically.

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

#### Optional: Local Ollama Setup (Inference & Embeddings)
To run inference and/or embeddings fully locally using Ollama:
1.  **Install Ollama**: Download and install it from [ollama.com](https://ollama.com).
2.  **Pull Required Models**:
    ```bash
    # For RAG Embeddings (e.g. bge-large)
    ollama pull bge-large
    
    # For LLM Inference (e.g. llama3.2)
    ollama pull llama3.2
    ```
3.  **Update `.env` Configuration**:
    ```env
    # Embedding Settings
    EMBEDDING_PROVIDER=ollama
    EMBEDDING_MODEL=bge-large
    EMBEDDING_DIMENSIONS=1024
    
    # Inference Settings
    INFERENCE_PROVIDER=ollama
    INFERENCE_MODEL=llama3.2
    
    OLLAMA_BASE_URL=http://localhost:11434
    ```
4.  **Configure Ollama Context Window (`num_ctx`)**:
    *   **Recommendation**: A context window size of **8,000 (`8192`)** or **16,000 (`16384`)** tokens is recommended for local execution.
    *   **Why**: By default, Ollama initializes models with a small `2048` token context window. In Lesson 5's hybrid RAG search, retrieving 10 chunks (roughly 3,000 - 5,000 tokens) plus system instructions and chat history will easily overflow `2048` tokens, leading to dropped context or inference failures.
    *   **Context Constraints**: If your hardware limits you to a lower context window (e.g., `4096`), you must reduce the retrieval limit count (e.g., from 10 to 4 chunks in `LESSON_05.ts`) to ensure requests fit inside the context window.

#### Optional: OpenRouter Setup for RAG Embeddings
To avoid running models locally and leverage cloud-based embedding endpoints:
1.  **Configure `.env`**:
    ```env
    EMBEDDING_PROVIDER=openrouter
    EMBEDDING_MODEL=openai/text-embedding-3-large
    EMBEDDING_DIMENSIONS=3072
    OPENROUTER_API_KEY=your_openrouter_api_key_here
    ```
    *Note: Standard embedding models available on OpenRouter include `openai/text-embedding-3-large` (3072 dimensions), `openai/text-embedding-3-small` (1536 dimensions), and `cohere/embed-english-v3.0` (1024 dimensions).*



### ⚠️ CRITICAL: Run Document Ingestion First
Before attempting to run RAG search queries, execute retrieval evaluation benchmarks, or launch Lesson 04 & Lesson 05 interactive agent/chatbot programs, you **MUST run document ingestion first** to build the necessary search indexes. 

Run the following command to ingest the knowledge base:
```bash
npm run ingest
```
This script parses the markdown files, chunks them using the context-retaining chunker, calculates embeddings, and populates the database and vector files under `.storage/`. Code-wise checks are built into the resource manager and CLI runner to automatically detect missing indexes and guide you to perform ingestion.

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
- **HNSWLib (`hnswlib-node`)**: Core approximate nearest neighbor (ANN) vector indexing.
- **Orama Search Index (`@orama/orama`)**: Memory-resident keyword/full-text search.
- **Better-SQLite3 (`better-sqlite3`)**: Relational database adapter for chunk metadata persistence.
- **Xenova Transformers (`@xenova/transformers`)**: Fast in-memory local ONNX feature extraction embeddings.
- **Commander & Inquirer**: Premium command line parsing and interactive console prompt dashboard UI.

### Available Scripts & CLI Usage

You can run various operations using the pre-configured npm scripts. Below are the execution and configuration options for each script:

*   **Run Development Server**:
    ```bash
    npm run dev
    ```
*   **Run Tests**:
    ```bash
    npm run test
    ```
*   **Launch Interactive CLI Menu**:
    ```bash
    npm run cli
    ```
    Launches a gamified interactive terminal dashboard to seamlessly switch between running lessons, triggering ingestions, querying the index, and running evaluations.
*   **Ingest Knowledge Base**:
    ```bash
    npm run ingest
    ```
    Clears local index caches and runs the dual-stage context-aware markdown chunking pipeline on the `knowledge-base/` folder.
*   **Search Hybrid Index**:
    ```bash
    npm run retrieve -- "[query]"
    ```
    Searches the combined Orama and HNSW indices using Reciprocal Rank Fusion (RRF), displaying the top-5 hydrated SQLite metadata matches inside formatted terminal cards.
*   **Evaluate Retrieval Engine**:
    ```bash
    # Run evaluation on all 150 test questions (will prompt interactively)
    npm run eval
    
    # Run evaluation for a single question index
    npm run eval -- --mode single --index 9
    
    # Run evaluation for a range of question indices
    npm run eval -- --mode range --start 1 --end 10
    ```

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

---

## Lesson 2: Tokens, Estimation, and Cost Calculation

This lesson demonstrates how LLM costs are calculated and billed based on "tokens". It teaches you how to estimate token counts offline, retrieve actual billing metadata from the API response, and compare estimated vs. actual execution charges.

View the complete implementation code here: [LESSON_02.ts](LESSON_02.ts)

### How to Run

You can launch the lesson interactively in two ways:

1. **Using NPM script**:
    ```bash
    npm run lesson 2
    ```
2. **Running the lesson file directly** (via TSX):
    ```bash
    npx tsx LESSON_02.ts
    ```

### Key Highlights
*   **Local Token Estimation**: Uses the lightweight `js-tiktoken` library to encode prompts locally and estimate input and output tokens offline for free.
*   **Actual Usage Tracking**: Inspects the raw OpenRouter completion response payload to extract exact token statistics.
*   **Cost Projection**: Performs dynamic cost calculations (in USD) using rates for Gemini 2.5 Flash on OpenRouter, alongside a price comparison if the same prompt had been run on GPT-4o.

---

## Lesson 3: Advanced Inference Options (Zod Schema, Streaming & Constraints)

This lesson explores several advanced inference options, reusing the decoupled `runInference` function from Lesson 1:
1. **Multishot Prompting vs. Structured Outputs**: Compares few-shot system instructions with the OpenAI SDK's built-in Zod-validated `response_format` structures.
2. **Streaming vs. Non-Streaming**: Triggers streaming outputs via a decoupled callback parameter (`streamCb`), demonstrating how to dynamically handle chunk deliveries.
3. **Token Limit Constraints**: Shows how to enforce output limitations using `max_tokens` (or `max_completion_tokens`) and inspect completion metadata (`finish_reason` and token usage logs).

View the complete implementation code here: [LESSON_03.ts](LESSON_03.ts)

### How to Run

You can launch the lesson interactively in two ways:

1. **Using NPM script**:
    ```bash
    npm run lesson 3
    ```
2. **Running the lesson file directly** (via TSX):
    ```bash
    npx tsx LESSON_03.ts
    ```

### Selecting Modes

When configuring the lesson arguments inside the interactive terminal, you can specify one of the following modes:
*   `structured` (Default) - Runs Zod-backed JSON schema extraction.
*   `multishot` - Performs JSON extraction using manual prompt examples.
*   `streaming` - Outputs words in real-time as they stream from the API.
*   `token_limit` - Enforces a maximum token boundary and logs completion reasons.


---

## Lesson 4: Tool Calling (Function Calling) & LLM Agents

This lesson introduces "tools" (function calling) which empower models to request execution of local client-side functions, enabling them to query databases, write files, or perform dynamic computations. Here, we build an agent that manages a hosted stateful Todo list through a terminal interactive REPL loop.

View the complete implementation code here: [LESSON_04.ts](LESSON_04.ts)

### How to Run

You can launch the lesson interactively in two ways:

1. **Using NPM script**:
    ```bash
    npm run lesson 4
    ```
2. **Running the lesson file directly** (via TSX):
    ```bash
    npx tsx LESSON_04.ts
    ```

### Key Highlights
*   **Tool Schema Definitions**: Shows how to structure tools as functions with parameters defined using standard JSON schema definitions.
*   **Agnostic Code & Execution Mapping**: Implements a modular `handleToolCalls` handler that automatically executes requested actions and routes execution outcomes back to the assistant in a unified chat history.
*   **Interactive Terminal REPL**: Launches a live terminal interface where you can chat naturally with the agent (e.g. *"add buy groceries"* or *"mark task 1 as done"*), seeing the local function triggers and updating/rendering an ASCII table in real time.
*   **ReAct Agent Looping**: Replaced the single-step tool execution logic with a standard `while` loop that recursively executes tool calls as long as the LLM requests them (`finish_reason === 'tool_calls'`). This allows the agent to chain multiple operations (like listing tasks, creating a task, and listing them again) dynamically in a single user turn.

### Streaming & Tool Calling Integration (`runStreamingAgentInference`)

Exposing tools to a streaming assistant introduces design complexity. We created a specialized helper `runStreamingAgentInference` and its companion `handleStreamingToolCalls` in `LESSON_04.ts` to solve this:
* **The Challenge**: During a streaming turn, the API yields a stream of tiny delta chunk packets. If the model chooses to respond directly, these packets contain text snippets (`delta.content`). If the model decides to invoke a tool, they instead contain incremental JSON slices (`delta.tool_calls`) representing function names and arguments.
* **The Solution**: The helper intercepts each delta packet in real-time. If it receives text content, it streams it directly to `process.stdout` so the user experiences zero latency. If it detects tool calling packets, it buffers and aggregates the JSON strings in-memory. Once the stream ends, it parses the completed arguments and triggers the local database search tool.

> [!IMPORTANT]
> **Why Streaming and Structured Outputs Cannot Be Enabled Together**
> In modern LLM engineering, **Structured Outputs** (e.g. enforcing JSON schema matching using `response_format` or Zod objects) and **Streaming** are mutually exclusive for schema-validated generation:
> 1. **Buffering & Validation**: Schema validation requires the entire JSON payload to be completely generated and parsed to ensure compliance before any data is returned.
> 2. **Parsing Failure Risks**: If raw tokens are streamed instantly as they are produced, there is no way to guarantee or enforce that the final output matches the schema in real-time.
> Therefore, for applications requiring real-time user-facing streams, we must fall back to natural text outputs or custom client-side parsing instead of hard-enforcing JSON schemas at the API level.

---

## Lesson 5: Designing and Optimizing a Hybrid RAG Retrieval Engine

This lesson documents the design, implementation, and tuning of a production-ready **Hybrid Retrieval-Augmented Generation (RAG) Engine** from scratch. It builds upon the core AI and tooling skills from Lessons 1–4, shifting the focus to high-performance document indexing, vector searches, full-text inverted indexes, and retrieval evaluation.

### How We Achieved Our Current Design

To build a decoupled and highly testable retrieval system, we established an abstract interface architecture (`interfaces.ts`) and constructed three dedicated storage adapters:
1.  **Relational Metadata Store (`sqlite_database.ts`)**: Powered by `better-sqlite3`. It indexes rich metadata (like file names, relative paths, sizes, and timestamps) and serializes complex parsed Markdown objects (tables, lists) as JSON strings.
2.  **Full-Text Inverted Index (`orama_index.ts`)**: Utilizes `@orama/orama` v3 to handle token-based full-text keyword matching on `contentText`, `docName`, and `docRelativePath`.
3.  **Dense Vector Index (`hnsw_index.ts`)**: Uses `hnswlib-node` to index high-dimensional embeddings (1024-dimensional vectors from a local or hosted `bge-large` model) using `cosine` distance metrics, mapping neighbor positions directly back to SQLite primary keys (`sqliteId`).
4.  **RAG Resource Manager (`rag_resources.ts`)**: Implements a singleton manager to keep active database connections, vector stores, and model loaders warm throughout the CLI and server runtime.

At query time, the system performs parallel retrievals across both Orama and HNSWLib, fusing their ranking candidates using **Reciprocal Rank Fusion (RRF)**:
$$RRF(d) = \sum_{m \in M} \frac{1}{60 + \text{rank}_m(d)}$$
The top candidate chunks are then hydrated directly from SQLite and returned as structured search snippets.

### Agentic RAG Optimization: Routing with Tool Calling (`invokeRag`)

To prevent performance bottlenecks, we implemented an **agentic tool-based RAG pipeline**. 

* **The Inefficiency**: In a standard naive RAG flow, every user message compulsory triggers document keyword and vector retrieval. For simple interactions (e.g. *"Hi"*, *"Hello"*, *"How are you?"*, or general pleasantries), performing database retrieval is highly inefficient, increases token consumption, and introduces unnecessary latency.
* **The Solution**: We expose a tool called `invokeRag` to the LLM. The agent is instructed to evaluate the query first:
  * **Direct Response**: For greetings and general chat, it responds directly in natural language without triggering any search.
  * **Tool Invocation**: For questions requiring Insurellm specific policies, employee data, or histories, it invokes `invokeRag(query)`. The client executes the hybrid search and returns the hydrated results to the model to synthesize the grounded answer.






```mermaid
flowchart TD
    %% Ingestion Flow
    subgraph Ingestion Pipeline
        Source[Source Markdown Files] --> Parser[Markdown Element Parser]
        Parser --> Merger[Context-Aware Heading Merger]
        Merger --> Chunker[Dual-Stage Chunker]
        
        Chunker --> DB_Ins[SQLite Insert]
        Chunker --> Embed[Ollama bge-large Embedder]
        
        DB_Ins --> SQL_DB[(SQLite DB)]
        Embed --> HNSW_Ins[HNSW Vector Index Insert]
        HNSW_Ins --> HNSW_DB[(HNSW Index)]
        
        Merger --> Orama_Ins[Orama Index Insert]
        Orama_Ins --> Orama_DB[(Orama Index)]
    end

    %% Retrieval Flow
    subgraph Retrieval Pipeline
        Query[Search Query] --> Prefix[BGE Query Prefixing]
        Query --> Keyword_Search[Orama Keyword Search]
        Prefix --> Dense_Search[HNSW Vector Search]
        
        Keyword_Search --> Candidates_K[Top 30 Keyword Candidates]
        Dense_Search --> Candidates_V[Top 30 Vector Candidates]
        
        Candidates_K & Candidates_V --> RRF[Reciprocal Rank Fusion]
        RRF --> RRF_Sort[Sorted Top 10 Candidates]
        RRF_Sort --> SQLite_Hydration[SQLite Node Hydration]
        SQLite_Hydration --> RAG_Output[Final Hydrated Snippets]
    end
```

### Key Engineering Challenges & Solutions

During evaluation, our retrieval pipeline originally performed below expectations. Through systematic diagnostics, we identified and solved three core RAG issues:

*   **Challenge 1: Vector Space Desynchronization & Model Alignment**
    *   *Issue*: Cosine similarity searches returned near-orthogonal results, leaving target documents outside the top 50 retrieved items.
    *   *Diagnosis*: The `bge-large` model family requires specific instruction prefixes for query vectors to align them with indexed passage vectors.
    *   *Solution*: We updated `rag_retrieve.ts` to automatically detect BGE models and prepend the required query prefix:
        ```typescript
        let embedQuery = query;
        if (config.EMBEDDING_MODEL.toLowerCase().includes('bge')) {
          embedQuery = `Represent this sentence for searching relevant passages: ${query}`;
        }
        ```
*   **Challenge 2: Stopword Noise Pollution in Keyword Search**
    *   *Issue*: On direct questions, Orama keyword searches were dominated by documents that did not contain the actual answer but frequently used common helper words (e.g. `"is"`, `"where"`, `"the"`).
    *   *Diagnosis*: Without stopwords filtering, common query terms generated high BM25 term scores, crowding out target documents containing rare search keywords like `"headquarters"`.
    *   *Solution*: We integrated a robust custom stopword list into Orama's tokenizer configuration at initialization:
        ```typescript
        this.db = create({
          schema: { ... },
          components: {
            tokenizer: {
              stopWords: ENGLISH_STOPWORDS, // 100+ standard English stopwords
            },
          },
        });
        ```
*   **Challenge 3: Information Loss on Chunk Boundaries (Heading/Detail Split)**
    *   *Issue*: For questions querying section titles (e.g., *"What is Insurellm's vision statement?"*), the system failed to retrieve the text details.
    *   *Diagnosis*: Naive markdown parsing split headings and paragraphs into separate chunks. The detail paragraph lost its heading context ("Vision Statement" / "Insurellm") and was unretrievable, while the heading chunk contained no details.
    *   *Solution*: We added **Context-Aware Heading Merging** in `rag_ingest.ts`. During parsing, when the pipeline encounters a markdown section heading, it automatically merges it with its immediate succeeding paragraph, list, or table element:
        ```typescript
        if (el.type === 'heading' && i + 1 < rawElements.length && rawElements[i + 1].type !== 'heading') {
          const nextEl = rawElements[i + 1];
          elements.push({
            ...el,
            text: `${el.text}\n${nextEl.text}`,
            raw: `${el.raw}\n${nextEl.raw}`,
            // Merge other metadata...
          });
          i++;
        }
        ```
*   **Challenge 4: Multi-Turn Conversation Reference & Retrieval Score Dilution**
    *   *Issue*: During multi-turn chat interactions, the user may ask follow-up questions referencing pronouns (e.g., asking *"Who is the founder..?"* after *"Tell me about the company"*). If the agent queries the search index with the raw question, retrieval fails due to lack of descriptive keywords. Furthermore, rewriting the query to prepend the company name (e.g., `"Insurellm founder"`) results in retrieval matches across every contract and careers document (since `"Insurellm"` appears in almost all files), diluting retrieval scores and drowning out the target employee profile.
    *   *Diagnosis*: Direct pronoun queries lack keywords, and generic words like `"Insurellm"` dominate BM25 and vector similarity scores.
    *   *Solution*: We updated the agent's system instructions to:
        1. Rewrite queries dynamically using conversation history to replace pronouns with concrete entities.
        2. Avoid stop words and generic company terms like `"Insurellm"`, prioritizing high-entropy search terms (e.g., rewriting *"Who is the founder..?"* to `"founder"` or `"company founder"` instead of `"Insurellm founder"`).
*   **Challenge 5: Local Ollama Context Limit Overflows & Retrieval Constraints**
    *   *Issue*: Running the RAG chatbot with a local Ollama model (`llama3.2`) resulted in missing context, cut-off outputs, or API errors on longer conversations.
    *   *Diagnosis*: Ollama's default context window is often restricted to `2048` tokens. Ingesting 10 retrieved document chunks (roughly 3,000–5,000 tokens) plus chat history and system prompts immediately exceeded this limit.
    *   *Solution*: We documented configurations to increase Ollama's context window (`num_ctx`) to `8192` or `16384` tokens. For hardware-limited systems, we established a fallback guideline to reduce the RAG chunk retrieval limit (e.g. from 10 to 4 chunks in `LESSON_05.ts`) to ensure the payload fits the context.
*   **Challenge 6: Context Window Bloat in Long Conversations (7+ Turns)**
    *   *Issue*: In extended multi-turn chat sessions (7+ turns), token consumption escalated rapidly, exceeding 30,000 tokens. This caused slow inference speeds, high API costs, and context window failures on local LLMs.
    *   *Diagnosis*: Each RAG retrieval appended up to 10 context chunks (~4,000 tokens) to the history. Piling up these historical document dumps in the chat history bloated the active context window.
    *   *Solution*: We implemented **Context-Preserving History Pruning** in `LESSON_05.ts`. At the completion of each assistant response, the REPL loop sweeps previous turns' `role: "tool"` messages and replaces their contents with a tiny summary placeholder (`"[Pruned: RAG search context omitted from history to save tokens]"`). This satisfies API structure rules while reducing context payload by over 85% and eliminating historical retrieval noise.
*   **Challenge 7: Heading/Subheading Dissociation during Ingestion**
    *   *Issue*: Markdown lists, requirements, or descriptions under specific sub-headers (like job openings or product features) were severed from their parent titles during chunking. When queried (e.g., about the Senior Full Stack Engineer role), RAG retrieved the lists without the job title, or retrieved the job title without the details, causing incomplete or incorrect responses.
    *   *Diagnosis*: Naive markdown chunking split the document into isolated paragraph/list chunks. If the title of a role was a bolded paragraph, it was ingested separately from the bullet points underneath it, leaving the bullet points with no contextual connection.
    *   *Solution*: We implemented a **Hierarchical Context-Retaining Chunker** in `rag_ingest.ts`. It groups sequential markdown elements under active headings and prepends the full active heading hierarchy (e.g. `# Careers > ## Current Opportunities > ### Engineering`) to every chunk. This ensures that every chunk contains the complete semantic path context.


### Final Retrieval Evaluation Benchmarks (150 Questions)

Following the implementation of these optimizations, a full evaluation run on the golden dataset of 150 questions demonstrated significant performance improvements:
*   **Mean Reciprocal Rank (MRR)**: `0.8544` (from `0.6828`)
*   **Mean nDCG**: `0.8476` (from `0.7202`)
*   **Keyword Coverage**: `97.34%` (366 / 376 keywords found in retrieved snippets, from `91.49%`)
*   **Mean Item Coverage**: `97.70%` (from `91.82%`)

#### Performance Breakdown by Category
*   **`direct_fact` (`0.8967` MRR / `0.8711` nDCG)**: Facts successfully routed to top ranks due to stopword filtering, element grouping, and parent heading context inheritance.
*   **`temporal` (`0.9833` MRR / `0.9595` nDCG)**: Highly distinct date/timeline keywords yield near-perfect retrieval.
*   **`numerical` (`0.8583` MRR / `0.8647` nDCG)**: Accurate numerical matching across contracts.
*   **`comparative` (`0.8389` MRR / `0.8666` nDCG)**: Solid capability in retrieving records for comparison.
*   **`relationship` (`0.8417` MRR / `0.8559` nDCG)**: Strong entity connection mapping.
*   **`spanning` (`0.6676` MRR / `0.6912` nDCG)**: Significant improvements in spanning queries targeting multiple document regions.
*   **`holistic` (`0.6988` MRR / `0.7282` nDCG)**: Enhanced performance on high-level documents summaries.
