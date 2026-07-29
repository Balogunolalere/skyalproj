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

// Set up API keys for tests
process.env.AGNES_API_KEY = 'test-api-key'
process.env.PAYSTACK_SECRET_KEY = 'sk_test_12345'
// Set NODE_ENV using Object.defineProperty since process.env properties can be read-only
Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true, configurable: true })

// Mock localStorage/sessionStorage for Node.js environment
const mockStore: Record<string, string> = {}

function createStorage() {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(key => delete store[key]); },
    get length() { return Object.keys(store).length; },
    key(n: number) { return Object.keys(store)[n] || null; },
  }
}

const localStorage = createStorage()
const sessionStorage = createStorage()

// Assign to global directly
global.localStorage = localStorage
global.sessionStorage = sessionStorage

// Mock window object for Node.js environment
const mockWindow = {
  location: { href: '', search: '' },
  localStorage: global.localStorage,
  sessionStorage: global.sessionStorage,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}

Object.defineProperty(global, 'window', { value: mockWindow, writable: true })
Object.defineProperty(globalThis, 'window', { value: mockWindow, writable: true })

// Also expose as top-level global (in case tests use it directly)
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = mockWindow
}

// Mock formatNaira utility for tests
vi.mock('@/components/skyal/data', () => ({
  formatNaira: (n: number) => `₦${n.toLocaleString()}`,
  type: 'ViewId',
  MATERIALS: [],
  SERVICES: [],
}))
