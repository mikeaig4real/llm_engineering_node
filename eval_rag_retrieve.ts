import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import boxen from 'boxen';
import inquirer from 'inquirer';
import { logger } from './logger.js';
import { retrieveChunks, RetrievalResult } from './rag_retrieve.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const METRIC_THRESHOLDS = {
  mrrHigh: 0.35,
  mrrMedium: 0.20,
  coverageHigh: 0.70,
  coverageMedium: 0.50,
};

export interface RetrievalEval {
  mrr: number;
  ndcg: number;
  keywordsFound: number;
  totalKeywords: number;
  keywordCoverage: number;
}

export interface TestQuestion {
  question: string;
  keywords: string[];
  referenceAnswer: string;
  category: string;
}

export function isKeywordInDoc(keyword: string, doc: RetrievalResult): boolean {
  const contentMatch = doc.content.toLowerCase().includes(keyword.toLowerCase());
  const nameMatch = doc.metadata.docName?.toLowerCase().includes(keyword.toLowerCase());
  const pathMatch = doc.metadata.docRelativePath?.toLowerCase().includes(keyword.toLowerCase());
  return contentMatch || nameMatch || pathMatch;
}

/**
 * Calculate reciprocal rank for a single keyword (case-insensitive).
 */
export function calculateMrr(keyword: string, retrievedDocs: RetrievalResult[]): number {
  for (let i = 0; i < retrievedDocs.length; i++) {
    if (isKeywordInDoc(keyword, retrievedDocs[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * Calculate Discounted Cumulative Gain.
 */
export function calculateDcg(relevances: number[], k: number): number {
  let dcg = 0;
  const limit = Math.min(relevances.length, k);
  for (let i = 0; i < limit; i++) {
    dcg += relevances[i] / Math.log2(i + 2);
  }
  return dcg;
}

/**
 * Calculate nDCG for a single keyword (binary relevance, case-insensitive).
 */
export function calculateNdcg(keyword: string, retrievedDocs: RetrievalResult[], k: number = 10): number {
  const relevances = retrievedDocs.map(doc => isKeywordInDoc(keyword, doc) ? 1 : 0);
  const dcg = calculateDcg(relevances, k);
  const idealRelevances = [...relevances].sort((a, b) => b - a);
  const idcg = calculateDcg(idealRelevances, k);
  return idcg > 0 ? dcg / idcg : 0.0;
}

/**
 * Evaluate retrieval performance for a single test question.
 */
export async function evaluateRetrievalSingle(test: TestQuestion, k: number = 10): Promise<RetrievalEval> {
  const retrievedDocs = await retrieveChunks(test.question, k);

  let keywordsFound = 0;
  let totalMrr = 0;
  let totalNdcg = 0;

  for (const kw of test.keywords) {
    const found = retrievedDocs.some(doc => isKeywordInDoc(kw, doc));
    if (found) {
      keywordsFound++;
    }
    totalMrr += calculateMrr(kw, retrievedDocs);
    totalNdcg += calculateNdcg(kw, retrievedDocs, k);
  }

  const totalKeywords = test.keywords.length;
  const mrr = totalKeywords > 0 ? totalMrr / totalKeywords : 0.0;
  const ndcg = totalKeywords > 0 ? totalNdcg / totalKeywords : 0.0;
  const keywordCoverage = totalKeywords > 0 ? keywordsFound / totalKeywords : 0.0;

  return {
    mrr,
    ndcg,
    keywordsFound,
    totalKeywords,
    keywordCoverage
  };
}

/**
 * Runs evaluation metrics on questions in the golden dataset.
 */
export async function evaluateRetrieval(
  k: number = 10,
  opts?: { mode?: 'all' | 'single' | 'range'; index?: number; start?: number; end?: number }
): Promise<void> {
  const testsFilePath = path.resolve(process.cwd(), 'evaluation/tests.jsonl');
  if (!fs.existsSync(testsFilePath)) {
    throw new Error(`Tests file not found at: ${testsFilePath}`);
  }

  const lines = fs.readFileSync(testsFilePath, 'utf-8').split('\n');
  const allQuestions: TestQuestion[] = [];
  for (const line of lines) {
    if (line.trim()) {
      const parsed = JSON.parse(line);
      allQuestions.push({
        question: parsed.question,
        keywords: parsed.keywords,
        referenceAnswer: parsed.reference_answer,
        category: parsed.category
      });
    }
  }

  let questions = allQuestions;
  let startIndex = 0;

  // Resolve evaluation scope
  let mode = opts?.mode;
  let targetIndex = opts?.index;
  let startRange = opts?.start;
  let endRange = opts?.end;

  if (!mode) {
    const ans = await inquirer.prompt<{ mode: 'all' | 'single' | 'range' }>([
      {
        type: 'list',
        name: 'mode',
        message: chalk.cyan('Select evaluation scope:'),
        choices: [
          { name: 'Evaluate all questions (1-150)', value: 'all' },
          { name: 'Evaluate a single question index', value: 'single' },
          { name: 'Evaluate a range of question indices', value: 'range' }
        ]
      }
    ]);
    mode = ans.mode;
  }

  if (mode === 'single') {
    if (targetIndex === undefined) {
      const ans = await inquirer.prompt<{ index: string }>([
        {
          type: 'input',
          name: 'index',
          message: chalk.cyan(`Enter question index (1-${allQuestions.length}):`),
          validate: (val: string) => {
            const num = parseInt(val, 10);
            return (!isNaN(num) && num >= 1 && num <= allQuestions.length)
              ? true
              : `Please enter a valid index between 1 and ${allQuestions.length}`;
          }
        }
      ]);
      targetIndex = parseInt(ans.index, 10);
    }
    startIndex = targetIndex - 1;
    questions = [allQuestions[startIndex]];
  } else if (mode === 'range') {
    if (startRange === undefined || endRange === undefined) {
      const ans = await inquirer.prompt<{ start: string; end: string }>([
        {
          type: 'input',
          name: 'start',
          message: chalk.cyan(`Enter start index (1-${allQuestions.length}):`),
          validate: (val: string) => {
            const num = parseInt(val, 10);
            return (!isNaN(num) && num >= 1 && num <= allQuestions.length)
              ? true
              : 'Please enter a valid start index.';
          }
        },
        {
          type: 'input',
          name: 'end',
          message: chalk.cyan(`Enter end index (must be >= start index, max ${allQuestions.length}):`),
          validate: (val: string, answers?: any) => {
            if (!answers) return true;
            const startNum = parseInt(answers.start, 10);
            const num = parseInt(val, 10);
            return (!isNaN(num) && num >= startNum && num <= allQuestions.length)
              ? true
              : `Please enter a valid end index between ${startNum} and ${allQuestions.length}`;
          }
        }
      ]);
      startRange = parseInt(ans.start, 10);
      endRange = parseInt(ans.end, 10);
    }
    startIndex = startRange - 1;
    questions = allQuestions.slice(startIndex, endRange);
  }

  logger.info(`Starting evaluation on ${questions.length} question(s) with k = ${k}...`);

  const results: RetrievalEval[] = [];
  const categoryMetrics: Record<string, { mrrSum: number; ndcgSum: number; count: number }> = {};

  let index = 0;
  for (const test of questions) {
    index++;
    const currentAbsoluteIndex = startIndex + index;

    console.log(`\n${chalk.bold.yellow(`[Question #${currentAbsoluteIndex}]`)}: "${test.question}"`);
    console.log(`${chalk.cyan('Category:')}        ${test.category}`);
    console.log(`${chalk.cyan('Keywords:')}        ${test.keywords.join(', ')}`);
    console.log(`${chalk.cyan('Expected Answer:')} ${test.referenceAnswer}`);

    const evalResult = await evaluateRetrievalSingle(test, k);
    results.push(evalResult);

    console.log(
      `  ${chalk.green('Result:')} MRR: ${evalResult.mrr.toFixed(4)} | ` +
      `nDCG: ${evalResult.ndcg.toFixed(4)} | ` +
      `Coverage: ${(evalResult.keywordCoverage * 100).toFixed(1)}% ` +
      `(${evalResult.keywordsFound}/${evalResult.totalKeywords} keywords found)`
    );

    const category = test.category || 'unknown';
    if (!categoryMetrics[category]) {
      categoryMetrics[category] = { mrrSum: 0, ndcgSum: 0, count: 0 };
    }
    categoryMetrics[category].mrrSum += evalResult.mrr;
    categoryMetrics[category].ndcgSum += evalResult.ndcg;
    categoryMetrics[category].count += 1;
  }

  // Calculate overall metrics
  const totalQuestions = results.length;
  const avgMrr = results.reduce((sum, r) => sum + r.mrr, 0) / totalQuestions;
  const avgNdcg = results.reduce((sum, r) => sum + r.ndcg, 0) / totalQuestions;
  const totalKeywordsFound = results.reduce((sum, r) => sum + r.keywordsFound, 0);
  const totalKeywords = results.reduce((sum, r) => sum + r.totalKeywords, 0);
  const avgCoverage = results.reduce((sum, r) => sum + r.keywordCoverage, 0) / totalQuestions;

  const colorMetric = (val: number, padSize = 0) => {
    const str = val.toFixed(4).padEnd(padSize);
    if (val >= METRIC_THRESHOLDS.mrrHigh) return chalk.bold.green(str);
    if (val >= METRIC_THRESHOLDS.mrrMedium) return chalk.bold.yellow(str);
    return chalk.bold.red(str);
  };

  const colorPercentage = (pct: number) => {
    const text = (pct * 100).toFixed(2) + '%';
    if (pct >= METRIC_THRESHOLDS.coverageHigh) return chalk.bold.green(text);
    if (pct >= METRIC_THRESHOLDS.coverageMedium) return chalk.bold.yellow(text);
    return chalk.bold.red(text);
  };

  // Construct Overall summary panel
  const overallSummary = [
    `${chalk.cyan('k Parameter:')}        ${k}`,
    `${chalk.cyan('Total Questions:')}    ${totalQuestions}`,
    `${chalk.cyan('Mean MRR:')}           ${colorMetric(avgMrr)}`,
    `${chalk.cyan('Mean nDCG:')}          ${colorMetric(avgNdcg)}`,
    `${chalk.cyan('Total Keywords:')}     ${totalKeywordsFound} / ${totalKeywords} found`,
    `${chalk.cyan('Keyword Coverage:')}   ${colorPercentage(totalKeywordsFound / totalKeywords)}`,
    `${chalk.cyan('Mean Item Coverage:')} ${colorPercentage(avgCoverage)}`
  ].join('\n');

  console.log(boxen(
    `${chalk.bold.yellow('OVERALL RETRIEVAL PERFORMANCE')}\n\n${overallSummary}`,
    { padding: 1, borderStyle: 'double', borderColor: 'yellow', margin: 1 }
  ));

  // Construct Category breakdown
  let categoryTable = `${chalk.bold.magenta('| Category     | Count | Mean MRR | Mean nDCG |')}\n`;
  categoryTable += `${chalk.gray('| ------------ | ----- | -------- | --------- |')}\n`;

  for (const [category, data] of Object.entries(categoryMetrics)) {
    const meanMrr = data.mrrSum / data.count;
    const meanNdcg = data.ndcgSum / data.count;
    
    const catStr = category.padEnd(12);
    const countStr = String(data.count).padEnd(5);
    
    categoryTable += `| ${chalk.white(catStr)} | ${chalk.cyan(countStr)} | ${colorMetric(meanMrr, 8)} | ${colorMetric(meanNdcg, 9)} |\n`;
  }

  console.log(boxen(
    `${chalk.bold.magenta('Category Performance Breakdown')}\n\n${categoryTable}`,
    { padding: 1, borderStyle: 'round', borderColor: 'magenta' }
  ));
}

// Support direct run
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  (async () => {
    try {
      await evaluateRetrieval(10);
    } catch (err: any) {
      if (err instanceof Error && (err.name === 'ExitPromptError' || err.message.includes('SIGINT') || err.message.includes('force closed'))) {
        console.log(chalk.yellow('\n\nOperation cancelled. Goodbye!'));
        process.exit(0);
      }
      logger.error(err, 'Evaluation runner error');
    }
  })();
}
