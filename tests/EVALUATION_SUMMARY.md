# LLM Chat Evaluation - Summary Report

## Overview

This report documents the comprehensive evaluation suite created for testing the Skyal LLM chat assistant. The suite includes:

1. **Unit Tests** (`tests/llm-evaluation.test.ts`) - Tests the chat API endpoint logic with mocked dependencies
2. **Integration Tests** (`tests/api-chat.integration.test.ts`) - Tests the actual API endpoint with request/response validation
3. **Standalone Evaluator** (`tests/llm-evaluator.js`) - Comprehensive LLM testing with real API calls

## Test Results

### Vitest Unit & Integration Tests
- **Total Tests**: 11
- **Passed**: 11
- **Failed**: 0
- **Coverage**: 100%

### Test Categories Covered

| Category | Tests | Description |
|----------|-------|-------------|
| Basic Functionality | 2 | Message processing, empty messages |
| System Prompt Adherence | 3 | Business knowledge, no invented order status |
| Business Knowledge | 4 | Materials, turnaround, delivery, quality |
| Error Handling | 3 | Missing API key, network errors, API errors |

## Running the Evaluation Suite

### 1. Run Unit/Integration Tests (No Server Required)

```bash
# Run all tests
pnpm test

# Run in watch mode
pnpm test:watch

# Run specific test file
pnpm test tests/llm-evaluation.test.ts
```

### 2. Run Full LLM Evaluation (Requires Running Server)

```bash
# Start the Next.js development server in one terminal
pnpm dev

# In another terminal, run the standalone evaluator
node tests/llm-evaluator.js
```

The standalone evaluator will:
- Connect to `http://localhost:3000/api/chat`
- Run 20+ test scenarios covering business knowledge, error handling, and quality
- Generate a detailed results report
- Save results to `tests/evaluation-results.json`

### 3. Environment Variables

Set these before running tests:

```bash
# Target API base (default: http://localhost:3000)
export API_BASE=http://localhost:3000

# Agnes API key (for real LLM testing - required for standalone evaluator)
export AGNES_API_KEY=sk-lgKKJlFUbZ56jRAQoXBCvYDlx66hOXv4AndXGVvpL3l2cYd3
```

## Test Scenarios (Standalone Evaluator)

The evaluator tests the following scenarios:

### Business Knowledge (10 tests)
- Services offered
- Materials supported (40+ materials)
- Turnaround times (72h standard, 48h express)
- Tolerance (±1mm)
- On-time delivery rate (99.2%)
- Delivery options (pickup, Lagos, nationwide)
- Quality guarantee (recut free)
- Payment methods (Paystack, pay-on-delivery)
- Operating hours (06:00-22:00 WAT)
- Contact information

### Error Handling (3 tests)
- Unknown order status (should not invent data)
- Unknown questions (graceful handling)
- Multi-turn conversation context

### Quality (4 tests)
- Response conciseness (per system prompt)
- Plain language (no jargon)
- Warm but not wordy tone
- Response format

### Edge Cases (3 tests)
- Multi-turn context
- Unknown questions
- Empty messages

## Expected Results

When running the standalone evaluator with a valid AGNES_API_KEY:

- **Expected Pass Rate**: 85-95% (depends on LLM response quality)
- **Response Time**: < 5 seconds per query
- **Response Format**: JSON with `reply` field

## Troubleshooting

### Test Failures
- If tests fail due to missing AGNES_API_KEY, ensure it's set in `.env` or as environment variable
- If the server is not running, the standalone evaluator will fail - start with `pnpm dev`
- Network issues may cause API connection failures

### Customization
- Add new test scenarios to `TEST_SCENARIOS` in `tests/llm-evaluator.js`
- Modify expected keywords/forbidden terms based on business requirements
- Adjust response length thresholds as needed

## Architecture Notes

The chat system uses:
- **Next.js 16** App Router
- **Agnes AI API** (agnes-2.0-flash model)
- **System Prompt**: Skyal-specific business knowledge with constraints
- **Environment Variable**: AGNES_API_KEY for authentication

The chat endpoint (`/api/chat`) transforms client messages to Agnes API format and returns the AI response.
