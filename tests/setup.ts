import { vi } from 'vitest'

// Mock environment variables for tests
vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: vi.fn((data, opts) => ({
      json: () => data,
      status: opts?.status || 200,
    })),
  },
}))

// Set up the AGNES_API_KEY for tests
process.env.AGNES_API_KEY = 'test-api-key'
