#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const root = process.cwd();
const apiEnvPath = path.join(root, 'apps/api/.env');
const webEnvPath = path.join(root, 'apps/web/.env.local');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return dotenv.parse(fs.readFileSync(filePath, 'utf8'));
}

const apiEnv = loadEnv(apiEnvPath);
const webEnv = loadEnv(webEnvPath);

const requiredApi = ['DATABASE_URL', 'REDIS_URL'];
const requiredWeb = ['NEXT_PUBLIC_API_URL'];

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
}

function isLikelyUrl(v) {
  try {
    const u = new URL(v);
    return Boolean(u.protocol && u.host);
  } catch {
    return false;
  }
}

const errors = [];

for (const key of requiredApi) {
  const value = process.env[key] ?? apiEnv[key];
  if (!value) errors.push(`[api] missing ${key}`);
}
for (const key of requiredWeb) {
  const value = process.env[key] ?? webEnv[key];
  if (!value) errors.push(`[web] missing ${key}`);
}

const llmBase = firstNonEmpty(
  process.env.OPENAI_BASE_URL,
  process.env.LLM_BASE_URL,
  apiEnv.OPENAI_BASE_URL,
  apiEnv.LLM_BASE_URL,
);
const llmApiKey = firstNonEmpty(
  process.env.OPENAI_API_KEY,
  process.env.LLM_API_KEY,
  apiEnv.OPENAI_API_KEY,
  apiEnv.LLM_API_KEY,
);
const llmModel = firstNonEmpty(
  process.env.OPENAI_MODEL,
  process.env.LLM_MODEL,
  apiEnv.OPENAI_MODEL,
  apiEnv.LLM_MODEL,
);

if (!llmBase) errors.push('[api] missing LLM_BASE_URL or OPENAI_BASE_URL');
if (!llmApiKey) errors.push('[api] missing LLM_API_KEY or OPENAI_API_KEY');
if (!llmModel) errors.push('[api] missing LLM_MODEL or OPENAI_MODEL');

const dbUrl = process.env.DATABASE_URL ?? apiEnv.DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? apiEnv.REDIS_URL;
const webApi = process.env.NEXT_PUBLIC_API_URL ?? webEnv.NEXT_PUBLIC_API_URL;

if (dbUrl && !dbUrl.startsWith('postgresql://')) {
  errors.push('[api] DATABASE_URL should start with postgresql://');
}
if (redisUrl && !(redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://'))) {
  errors.push('[api] REDIS_URL should start with redis:// or rediss://');
}
if (llmBase && !isLikelyUrl(llmBase)) {
  errors.push('[api] LLM_BASE_URL should be a valid URL');
}
if (webApi && !isLikelyUrl(webApi)) {
  errors.push('[web] NEXT_PUBLIC_API_URL should be a valid URL');
}

if (errors.length) {
  console.error('\n❌ Test env preflight failed:\n');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log('\n✅ Test env preflight passed');
console.log(`- DATABASE_URL: ${dbUrl}`);
console.log(`- REDIS_URL: ${redisUrl}`);
console.log(`- LLM_BASE_URL: ${llmBase}`);
console.log(`- LLM_MODEL: ${llmModel}`);
console.log(`- NEXT_PUBLIC_API_URL: ${webApi}`);
