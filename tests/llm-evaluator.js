#!/usr/bin/env node
/**
 * LLM Chat Evaluation Script
 * 
 * Thoroughly tests the Skyal LLM chat endpoint with various scenarios.
 * 
 * Usage:
 *   node tests/llm-evaluator.js
 *   pnpm test
 */

import fs from 'fs'
import path from 'path'

// Configuration
const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const CHAT_ENDPOINT = '/api/chat'
const TEST_TIMEOUT = 30000 // 30 seconds

// Test scenarios - comprehensive coverage of Skyal business knowledge
const TEST_SCENARIOS = [
  // Basic information queries
  {
    id: 'basic-services',
    category: 'Business Knowledge',
    question: 'What services does Skyal offer?',
    expectedKeywords: ['laser cutting', 'fabrics', 'leather', 'wood', 'acrylic'],
    description: 'Tests basic service offerings knowledge'
  },
  {
    id: 'materials',
    category: 'Business Knowledge',
    question: 'What materials can you cut?',
    expectedKeywords: ['fabrics', 'leather', 'wood', 'acrylic', 'paper', 'foam', '40+'],
    description: 'Tests material knowledge'
  },
  {
    id: 'turnaround',
    category: 'Business Knowledge',
    question: 'How long does an order take?',
    expectedKeywords: ['72 hours', '48 hours', 'standard', 'express'],
    description: 'Tests turnaround time knowledge'
  },
  {
    id: 'tolerance',
    category: 'Business Knowledge',
    question: 'What is your tolerance?',
    expectedKeywords: ['±1mm', '1mm'],
    description: 'Tests precision/tolerance knowledge'
  },
  {
    id: 'on-time',
    category: 'Business Knowledge',
    question: 'What is your on-time delivery rate?',
    expectedKeywords: ['99.2%', 'on-time'],
    description: 'Tests on-time delivery statistics'
  },
  {
    id: 'delivery',
    category: 'Business Knowledge',
    question: 'What delivery options do you have?',
    expectedKeywords: ['studio pickup', 'Ogba', 'Ikeja', 'Lagos delivery', 'nationwide'],
    description: 'Tests delivery options knowledge'
  },
  {
    id: 'quality-guarantee',
    category: 'Business Knowledge',
    question: 'What is your quality guarantee?',
    expectedKeywords: ['recut free', 'quality guarantee'],
    description: 'Tests quality policy knowledge'
  },
  {
    id: 'payment',
    category: 'Business Knowledge',
    question: 'How do I pay?',
    expectedKeywords: ['Paystack', 'pay-on-delivery', 'NGN'],
    description: 'Tests payment methods knowledge'
  },
  {
    id: 'hours',
    category: 'Business Knowledge',
    question: 'What are your operating hours?',
    expectedKeywords: ['06:00–22:00', 'WAT', 'quotes within 4 hours'],
    description: 'Tests operating hours knowledge'
  },
  {
    id: 'contact',
    category: 'Business Knowledge',
    question: 'How can I contact you?',
    expectedKeywords: ['skyalservices@gmail.com', '0803 500 3068'],
    description: 'Tests contact information knowledge'
  },
  // Error handling queries
  {
    id: 'unknown-order',
    category: 'Error Handling',
    question: 'What is the status of order SKY-12345?',
    expectedKeywords: ["don't have", 'Track page', 'contact'],
    forbiddenKeywords: ['confirmed', 'completed', 'in progress', 'delivered', 'status:'],
    description: 'Tests that AI doesn\'t invent order statuses'
  },
  {
    id: 'unknown-info',
    category: 'Error Handling',
    question: 'What is your annual revenue?',
    expectedKeywords: ["don't have", 'contact', 'support'],
    description: 'Tests graceful handling of unknown questions'
  },
  // Multi-turn conversation tests
  {
    id: 'multi-turn-1',
    category: 'Conversation',
    question: 'First: What materials do you cut? Second: Can you cut silk?',
    expectedKeywords: ['silk', 'fabric', 'material'],
    description: 'Tests multi-turn context handling'
  },
  // Format and tone tests
  {
    id: 'concise-response',
    category: 'Quality',
    question: 'Tell me about Skyal.',
    expectedKeywords: ['Skyal', 'cutting'],
    maxLength: 300,
    description: 'Tests response conciseness (should be short per system prompt)'
  },
  {
    id: 'plain-language',
    category: 'Quality',
    question: 'Explain your laser cutting process.',
    expectedKeywords: ['cut', 'design', 'file'],
    forbiddenKeywords: ['algorithm', 'parameter', 'optimization', 'infrastructure', 'architecture'],
    description: 'Tests plain language usage (no jargon)'
  },
  // Warmth tests
  {
    id: 'warm-tone',
    category: 'Quality',
    question: 'Hello!',
    expectedKeywords: ['help', 'Hi', 'hello', 'welcome'],
    description: 'Tests warm but not wordy tone'
  },
  // Specific business facts
  {
    id: 'quote-timing',
    category: 'Business Knowledge',
    question: 'How fast do you return quotes?',
    expectedKeywords: ['4 hours', 'during operating hours'],
    description: 'Tests quote timing knowledge'
  },
  {
    id: 'free-recut',
    category: 'Business Knowledge',
    question: 'What if my cut is not right?',
    expectedKeywords: ['recut free', 'not right'],
    description: 'Tests recut policy knowledge'
  }
]

// Utility functions
async function fetchChat(messages) {
  const response = await fetch(`${API_BASE}${CHAT_ENDPOINT}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return await response.json()
}

async function runSingleTest(scenario) {
  const startTime = Date.now()
  let result = {
    scenario: scenario.id,
    category: scenario.category,
    question: scenario.question,
    passed: false,
    feedback: [],
    responseTime: null,
    responseText: null,
  }

  try {
    const response = await fetchChat([{ role: 'user', content: scenario.question }])
    result.responseTime = Date.now() - startTime
    result.responseText = response.reply || ''

    // Check required keywords
    if (scenario.expectedKeywords) {
      const lowerResponse = response.reply?.toLowerCase() || ''
      const missingKeywords = scenario.expectedKeywords.filter(kw => !lowerResponse.includes(kw.toLowerCase()))
      
      if (missingKeywords.length > 0) {
        result.feedback.push(`MISSING keywords: ${missingKeywords.join(', ')}`)
      } else {
        result.feedback.push('All expected keywords present')
      }
    }

    // Check forbidden keywords
    if (scenario.forbiddenKeywords && response.reply) {
      const lowerResponse = response.reply.toLowerCase()
      const forbiddenFound = scenario.forbiddenKeywords.filter(kw => lowerResponse.includes(kw.toLowerCase()))
      
      if (forbiddenFound.length > 0) {
        result.feedback.push(`FORBIDDEN keywords found: ${forbiddenFound.join(', ')}`)
      } else {
        result.feedback.push('No forbidden keywords')
      }
    }

    // Check length constraints
    if (scenario.maxLength && response.reply && response.reply.length > scenario.maxLength) {
      result.feedback.push(`Response too long (${response.reply.length} > ${scenario.maxLength} chars)`)
    } else {
      result.feedback.push('Response length acceptable')
    }

    // Determine pass/fail
    const hasRequiredKeywords = !scenario.expectedKeywords || !scenario.expectedKeywords.some(kw => !(response.reply || '').includes(kw))
    const noForbiddenKeywords = !scenario.forbiddenKeywords || !scenario.forbiddenKeywords.some(kw => (response.reply || '').toLowerCase().includes(kw.toLowerCase()))
    
    result.passed = hasRequiredKeywords && noForbiddenKeywords

    if (result.passed) {
      result.feedback.push('✓ TEST PASSED')
    } else {
      result.feedback.push('✗ TEST FAILED')
    }
  } catch (error) {
    result.passed = false
    result.feedback.push(`ERROR: ${error.message}`)
    result.responseTime = Date.now() - startTime
  }

  return result
}

async function runAllTests() {
  console.log('=' .repeat(70))
  console.log('LLM Chat Evaluation Suite - Skyal AI Assistant')
  console.log('=' .repeat(70))
  console.log(`Testing against: ${API_BASE}${CHAT_ENDPOINT}`)
  console.log(`Total scenarios: ${TEST_SCENARIOS.length}`)
  console.log(`Date: ${new Date().toISOString()}`)
  console.log('=' .repeat(70))
  console.log()

  const results = []
  const passedCount = {}
  const failedCount = {}
  const categoryStats = {}

  // Run tests sequentially to avoid rate limiting
  for (const scenario of TEST_SCENARIOS) {
    console.log(`\n[${results.length + 1}/${TEST_SCENARIOS.length}] Testing: ${scenario.id}`)
    console.log(`Question: ${scenario.question}`)
    console.log(`Category: ${scenario.category}`)
    console.log('-'.repeat(50))

    const result = await runSingleTest(scenario)
    results.push(result)

    // Update stats
    if (!passedCount[scenario.category]) passedCount[scenario.category] = 0
    if (!failedCount[scenario.category]) failedCount[scenario.category] = 0
    if (!categoryStats[scenario.category]) categoryStats[scenario.category] = { total: 0, passed: 0, failed: 0 }

    categoryStats[scenario.category].total++
    if (result.passed) {
      categoryStats[scenario.category].passed++
      passedCount[scenario.category]++
    } else {
      categoryStats[scenario.category].failed++
      failedCount[scenario.category]++
    }

    // Print result
    console.log(`Result: ${result.passed ? '✓ PASS' : '✗ FAIL'}`)
    console.log(`Response Time: ${result.responseTime ? result.responseTime + 'ms' : 'N/A'}`)
    if (result.responseText) {
      console.log(`Response: ${result.responseText.substring(0, 150)}${result.responseText.length > 150 ? '...' : ''}`)
    }
    result.feedback.forEach(fb => console.log(`  • ${fb}`))
  }

  // Summary
  console.log('\n' + '=' .repeat(70))
  console.log('SUMMARY')
  console.log('=' .repeat(70))

  const totalPassed = results.filter(r => r.passed).length
  const totalFailed = results.length - totalPassed
  const overallAccuracy = ((totalPassed / results.length) * 100).toFixed(1)

  console.log(`Overall: ${totalPassed}/${results.length} tests passed (${overallAccuracy}%)`)
  console.log()

  // Category breakdown
  console.log('By Category:')
  console.log('-'.repeat(50))
  for (const [category, stats] of Object.entries(categoryStats)) {
    const catAccuracy = ((stats.passed / stats.total) * 100).toFixed(1)
    console.log(`  ${category}: ${stats.passed}/${stats.total} passed (${catAccuracy}%)`)
  }

  console.log()
  console.log('=' .repeat(70))

  // Save results to file
  const outputPath = path.join(__dirname, 'tests', 'evaluation-results.json')
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`Results saved to: ${outputPath}`)

  // Exit with appropriate code
  process.exit(totalFailed === 0 ? 0 : 1)
}

// Run the evaluation
runAllTests().catch(err => {
  console.error('Evaluation failed:', err)
  process.exit(1)
})
