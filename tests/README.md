# LLM Chat Evaluation Suite

This directory contains comprehensive evaluation scripts for testing the Skyal LLM chat assistant.

## Test Files

- `llm-evaluation.test.ts` - Vitest unit tests for the chat API endpoint
- `api-chat.integration.test.ts` - Integration tests for the chat API
- `llm-evaluator.js` - Standalone evaluation script that runs comprehensive LLM tests

## Running Tests

### Run all tests with Vitest:
```bash
pnpm test
```

### Run tests in watch mode:
```bash
pnpm test:watch
```

### Run with coverage:
```bash
pnpm test:coverage
```

### Run standalone LLM evaluator:
```bash
# First, start the Next.js development server
pnpm dev

# In another terminal, run the evaluator
node tests/llm-evaluator.js
```

The evaluator will automatically detect the running server at `http://localhost:3000` by default.

## Configuration

Set environment variables before running:

```bash
# Target API base (default: http://localhost:3000)
API_BASE=http://localhost:3000

# Agnes API key (for actual LLM testing - required for real API calls)
AGNES_API_KEY=your-key-here
```

## Test Scenarios

The evaluator runs 20+ test scenarios covering:

1. **Business Knowledge** - Skyal services, materials, turnaround times, delivery, payment, etc.
2. **Error Handling** - Unknown questions, missing API key, API errors
3. **Conversation** - Multi-turn context handling
4. **Quality** - Response length, plain language, tone
5. **System Prompt Adherence** - Not inventing order numbers, being warm but concise

## Results

Test results are saved to `tests/evaluation-results.json` in JSON format.

## Notes

- The standalone evaluator requires a running Next.js server
- For CI/CD, use the Vitest tests which mock the API calls
- The Agnes API key is required for real LLM testing (the evaluator will skip tests that require actual API calls if the key is not set)
