/**
 * LLM Chat API Integration Tests
 * 
 * Tests the actual /api/chat endpoint with mocked dependencies
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Mock the fetch API globally
const mockFetch = vi.fn()
global.fetch = mockFetch as any

// Helper to create a mock request
function createMockRequest(body: any) {
  return {
    json: async () => body,
  } as unknown as NextRequest
}

describe('LLM Chat API - Integration Tests', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  afterEach(() => {
    // Clean up
  })

  it('should successfully process a chat request with valid API key', async () => {
    // Arrange
    const mockApiKey = 'test-agnes-key-123'
    process.env.AGNES_API_KEY = mockApiKey
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Skyal offers laser cutting for fabrics, leather, wood, acrylic, paper and foam. Standard turnaround is 72 hours.',
            },
          },
        ],
      }),
    })

    // Act
    const request = createMockRequest({
      messages: [
        { role: 'user', content: 'What services do you offer?' },
      ],
    })

    const { POST } = await import('/home/doombuggy_/Projects/skyalproj/src/app/api/chat/route')
    const response = await POST(request)

    // Assert
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.reply).toContain('Skyal offers')
    expect(data.reply).toContain('laser cutting')
    
    // Verify fetch was called with correct parameters
    expect(mockFetch).toHaveBeenCalledWith('https://apihub.agnes-ai.com/v1/chat/completions', expect.any(Object))
    const fetchCall = mockFetch.mock.calls[0][1]
    expect(fetchCall.method).toBe('POST')
    expect(fetchCall.headers['Authorization']).toBe(`Bearer ${mockApiKey}`)
    expect(fetchCall.headers['Content-Type']).toBe('application/json')
    expect(fetchCall.body).toContain('"model":"agnes-2.0-flash"')
  })

  it('should handle missing AGNES_API_KEY gracefully', async () => {
    // Arrange
    delete process.env.AGNES_API_KEY
    mockFetch.mockClear()

    // Act
    const request = createMockRequest({
      messages: [{ role: 'user', content: 'Test' }]
    })
    const { POST } = await import('/home/doombuggy_/Projects/skyalproj/src/app/api/chat/route')
    const response = await POST(request)

    // Assert
    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.reply).toContain('AI service is not configured')
    expect(data.error).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should transform message roles correctly', async () => {
    // Arrange
    process.env.AGNES_API_KEY = 'test-key'
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Thank you for your question!' } }],
      }),
    })

    // Act
    const request = createMockRequest({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'What about materials?' },
      ],
    })

    const { POST } = await import('/home/doombuggy_/Projects/skyalproj/src/app/api/chat/route')
    await POST(request)

    // Assert - The messages should be properly transformed
    const callArgs = mockFetch.mock.calls[0][1]
    const body = JSON.parse(callArgs.body)
    
    // System message should be first
    expect(body.messages[0].role).toBe('system')
    // User messages should be user role
    expect(body.messages[1].role).toBe('user')
    // Assistant message should be assistant role
    expect(body.messages[2].role).toBe('assistant')
    // Next user message should be user role
    expect(body.messages[3].role).toBe('user')
  })
})
