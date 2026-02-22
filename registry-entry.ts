export const tonToolRegistryEntry = {
  slug: 'ton',
  name: 'TON Tools (TonAPI + STON.fi)',
  description:
    'TON blockchain tools for the AI SDK using TonAPI plus STON.fi DEX/Omniston capabilities. Query chain data, build unsigned STON.fi swap/liquidity/vault transactions, and run write-capable local workflows like signing payloads and building external messages.',
  packageName: '@mhbdev/ai-sdk-ton-tools',
  tags: ['blockchain', 'ton', 'web3'],
  apiKeyEnvName: 'TONAPI_API_KEY',
  installCommand: {
    pnpm: 'pnpm install @mhbdev/ai-sdk-ton-tools',
    npm: 'npm install @mhbdev/ai-sdk-ton-tools',
    yarn: 'yarn add @mhbdev/ai-sdk-ton-tools',
    bun: 'bun add @mhbdev/ai-sdk-ton-tools',
  },
  codeExample: `import { generateText, stepCountIs } from 'ai';
import { createTonTools } from '@mhbdev/ai-sdk-ton-tools';

const tools = createTonTools({
  apiKey: process.env.TONAPI_API_KEY,
  network: 'mainnet',
});

const { text } = await generateText({
  model: 'openai/gpt-5.1-codex',
  prompt: 'Summarize recent events for a TON account.',
  tools,
  stopWhen: stepCountIs(3),
});

console.log(text);`,
  docsUrl: 'https://docs.ton.org',
  apiKeyUrl: 'https://tonconsole.com',
  websiteUrl: 'https://tonapi.io',
  npmUrl: 'https://www.npmjs.com/package/@mhbdev/ai-sdk-ton-tools',
};
