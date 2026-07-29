# Payment & LLM Test Suite

This directory contains comprehensive tests for the Skyal payment integration and LLM chat assistant.

## Test Files

### Payment Integration Tests
- `payment-integration.test.ts` - Vitest tests for OrderView payment flow, Paystack integration, and callback handling

### LLM Chat Tests
- `llm-evaluation.test.ts` - Vitest unit tests for the chat API endpoint
- `api-chat.integration.test.ts` - Integration tests for the chat API
- `llm-evaluator.js` - Standalone evaluation script that runs comprehensive LLM tests

## Running Tests

### Run all tests with Vitest:
```bash
pnpm test
```

### Run payment-specific tests only:
```bash
pnpm test tests/payment-integration.test.ts
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

# Paystack test keys (for payment tests)
PAYSTACK_SECRET_KEY=sk_test_9bf956c2dd003fe655e372a1b34156316490163a
PAYSTACK_PUBLIC_KEY=pk_test_02d663e4d9074c4742b67313b0ce252c8f640afb
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_API_URL=http://localhost:3000
```

## Payment Test Coverage

The `payment-integration.test.ts` tests cover:

1. **OrderView Payment Flow** - Initialize payment, redirect to Paystack, handle errors
2. **Payment Verification** - URL params, sessionStorage verification on mount
3. **OrderCallbackPage** - Payment reference verification, success/error states
4. **Paystack Utilities** - Naira-to-kobo conversion, reference generation
5. **Order State Transitions** - PAYMENT_PENDING → PAYMENT_SUCCESS
6. **Edge Cases** - Missing reference, API errors, duplicate webhooks
7. **Form Validation** - Phone length, file upload, reorder flow
8. **Security** - HTTPS usage, secret key protection, signature verification


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
