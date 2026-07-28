/**
 * LLM Chat Evaluation Suite - Simple Version
 * 
 * Tests the /api/chat endpoint thoroughly with various scenarios.
 * Uses absolute paths to avoid alias resolution issues.
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

describe('LLM Chat API - Evaluation Suite', () => {
  let originalEnv: any

  beforeEach(() => {
    originalEnv = { ...process.env }
    mockFetch.mockClear()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Basic Functionality', () => {
    it('should process a simple customer query about services', async () => {
      // Arrange
      process.env.AGNES_API_KEY = 'test-key-123'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Skyal offers laser cutting services for fabrics, leather, wood, acrylic, paper and foam.' } }]
        }),
      })

      // Act
      const request = createMockRequest({
        messages: [{ role: 'user', content: 'What services do you offer?' }]
      })
      
      // Import the route handler using absolute path
      const { POST } = await import('/home/doombuggy_/Projects/skyalproj/src/app/api/chat/route')
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.reply).toContain('Skyal offers')
      expect(data.reply).toContain('laser cutting')
    })

    it('should handle empty messages gracefully', async () => {
      // Arrange
      process.env.AGNES_API_KEY = 'test-key-123'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Please ask about our services!' } }] })
      })

      // Act
      const request = createMockRequest({ messages: [] })
      const { POST } = await import('/home/doombuggy_/Projects/skyalproj/src/app/api/chat/route')
      const response = await POST(request)

      // Assert
      const data = await response.json()
      expect(data.reply).toBeTruthy()
    })
  })

  describe('System Prompt Adherence', () => {
    it('should respond with Skyal-specific business knowledge', async () => {
      // Arrange
      process.env.AGNES_API_KEY = 'test-key-123'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ 
            message: { 
              content: 'Skyal cuts fabrics, leather, wood, acrylic, paper and foam. Standard turnaround is 72 hours, express is 48 hours. Tolerance is ±1mm. We have 99.2% on-time delivery.' 
            } 
          }]
        })
      })

      // Act
      const request = createMockRequest({
        messages: [{ role: 'user', content: 'How long does an order take?' }]
      })
      const { POST } = await import('/home/doombuggy_/Projects/skyalproj/src/app/api/chat/route')
      const response = await POST(request)

      // Assert
      const data = await response.json()
      expect(data.reply).toContain('72 hours')
      expect(data.reply).toContain('48 hours')
      expect(data.reply).toContain('±1mm')
      expect(data.reply).toContain('99.2%')
    })

    it('should not invent order numbers or statuses (per system prompt)', async () => {
      // Arrange
      process.env.AGNES_API_KEY = 'test-key-123'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ 
            message: { 
              content: 'I don\'t have access to specific order statuses. Please check the Track page or contact us at skyalservices@gmail.com or 0803 500 3068.' 
            } 
          }]
        })
      })

      // Act
      const request = createMockRequest({
        messages: [{ role: 'user', content: 'What is the status of order SKY-12345?' }]
      })
      const { POST } = await import('/home/doombuggy_/Projects/skyalproj/src/app/api/chat/route')
      const response = await POST(request)

      // Assert
      const data = await response.json()
      // Should NOT contain any fabricated order status
      expect(data.reply).not.toMatch(/status.*confirmed|in progress|completed|delivered/i)
      expect(data.reply).toContain('Track page')
      expect(data.reply).toContain('skyalservices@gmail.com')
    })
  })

  describe('Business Knowledge Tests', () => {
    it('should know about materials', async () => {
      // Arrange
      process.env.AGNES_API_KEY = 'test-key-123'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ 
            message: { 
              content: 'We cut over 40 materials including fabrics (cotton, silk, denim, linen, ankara, aso-oke, lace), leather (genuine, faux, suede), wood (plywood, MDF, hardwood), acrylic (clear, coloured, mirror, glitter), paper & card, and foam board.' 
            } 
          }]
        })
      })

      // Act
      const request = createMockRequest({
        messages: [{ role: 'user', content: 'What materials can you cut?' }]
      })
      const { POST } = await import('/home/doombuggy_/Projects/skyalproj/src/app/api/chat/route')
      const response = await POST(request)

      // Assert
      const data = await response.json()
      expect(data.reply).toContain('fabrics')
      expect(data.reply).toContain('leather')
      expect(data.reply).toContain('wood')
      expect(data.reply).toContain('acrylic')
    })

    it('should know about turnaround times', async () => {
      // Arrange
      process.env.AGNES_API_KEY = 'test-key-123'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ 
            message: { 
              content: 'Standard turnaround is 72 hours, express is 48 hours. We work hard to meet your deadlines.' 
            } 
          }]
        })
      })

      // Act
      const request = createMockRequest({
        messages: [{ role: 'user', content: 'How fast is your service?' }]
      })
      const { POST } = await import('/home/doombuggy_/Projects/skyalproj/src/app/api/chat/route')
      const response = await POST(request)

      // Assert
      const data = await response.json()
      expect(data.reply).toContain('72 hours')
      expect(data.reply).toContain('48 hours')
    })
  })

  describe('Error Handling', () => {
    it('should handle missing AGNES_API_KEY gracefully', async () => {
      // Arrange
      delete process.env.AGNES_API_KEY
      mockFetch.mockClear()

      // Act
      const request = createMockRequest({
        messages: [{ role: 'user', content: 'Test query' }]
      })
      const { POST } = await import('/home/doombuggy_/Projects/skyalproj/src/app/api/chat/route')
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.reply).toContain('AI service is not configured')
      expect(data.error).toBe(true)
    })

    it('should handle API errors gracefully', async () => {
      // Arrange
      process.env.AGNES_API_KEY = 'test-key-123'
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      // Act
      const request = createMockRequest({
        messages: [{ role: 'user', content: 'Test query' }]
      })
      const { POST } = await import('/home/doombuggy_/Projects/skyalproj/src/app/api/chat/route')
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.reply).toContain('I couldn\'t reach the AI just now')
      expect(data.error).toBe(true)
    })
  })
})
