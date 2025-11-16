import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { pdfStore } from '@/lib/pdfStore'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
})

async function searchInternet(query: string): Promise<string> {
  try {
    // Use a simple web search by fetching Wikipedia
    const searchQuery = encodeURIComponent(query)
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${searchQuery}&limit=3&format=json`

    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AIChat/1.0)',
      },
    })

    if (response.data && response.data[1] && response.data[1].length > 0) {
      const titles = response.data[1]
      const descriptions = response.data[2]
      const links = response.data[3]

      let results = 'Search results from Wikipedia:\n\n'
      for (let i = 0; i < titles.length; i++) {
        results += `${i + 1}. ${titles[i]}\n${descriptions[i]}\nURL: ${links[i]}\n\n`
      }

      // Try to fetch content from the first result
      if (links[0]) {
        try {
          const pageResponse = await axios.get(links[0], {
            timeout: 5000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; AIChat/1.0)',
            },
          })

          const $ = cheerio.load(pageResponse.data)

          // Extract main content from Wikipedia
          const paragraphs = $('.mw-parser-output > p')
            .slice(0, 5)
            .map((_, el) => $(el).text().trim())
            .get()
            .filter(text => text.length > 50)
            .join('\n\n')

          if (paragraphs) {
            results += `\nDetailed content from ${titles[0]}:\n${paragraphs.slice(0, 2000)}`
          }
        } catch (e) {
          console.error('Error fetching page content:', e)
        }
      }

      return results
    }

    return 'No relevant results found.'
  } catch (error) {
    console.error('Search error:', error)
    return 'Unable to search the internet at this time.'
  }
}

function needsInternetSearch(message: string): boolean {
  const searchKeywords = [
    'search', 'look up', 'find', 'what is', 'who is', 'when', 'where',
    'current', 'latest', 'recent', 'news', 'today', 'now', 'information about',
    'tell me about', 'explain', 'definition of'
  ]

  const lowerMessage = message.toLowerCase()
  return searchKeywords.some(keyword => lowerMessage.includes(keyword))
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }

    const lastMessage = messages[messages.length - 1]

    // Check if we need to search the internet
    let contextInfo = ''
    if (needsInternetSearch(lastMessage.content)) {
      contextInfo = await searchInternet(lastMessage.content)
    }

    // Check if there's PDF content
    let pdfContext = ''
    if (Object.keys(pdfStore).length > 0) {
      pdfContext = '\n\nPDF Content Available:\n' + Object.values(pdfStore).join('\n\n---\n\n')
    }

    // Prepare messages for OpenAI
    const systemMessage = {
      role: 'system' as const,
      content: `You are a helpful AI assistant with access to internet search results and PDF document analysis.

When answering questions:
1. If internet search results are provided, use them to give accurate, current information
2. If PDF content is available, reference it when relevant
3. Be concise but informative
4. Cite sources when using search results

${contextInfo ? `\n\nInternet Search Results:\n${contextInfo}` : ''}
${pdfContext ? `\n\n${pdfContext}` : ''}`
    }

    const chatMessages = [
      systemMessage,
      ...messages.map((m: any) => ({
        role: m.role,
        content: m.content
      }))
    ]

    // Use OpenAI API or fallback to a mock response
    let aiResponse = ''

    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'dummy-key') {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: chatMessages as any,
          temperature: 0.7,
          max_tokens: 1000,
        })

        aiResponse = completion.choices[0]?.message?.content || 'No response generated.'
      } catch (openaiError) {
        console.error('OpenAI API error:', openaiError)
        aiResponse = generateMockResponse(lastMessage.content, contextInfo, pdfContext)
      }
    } else {
      // Mock response when no API key
      aiResponse = generateMockResponse(lastMessage.content, contextInfo, pdfContext)
    }

    return NextResponse.json({ message: aiResponse })

  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    )
  }
}

function generateMockResponse(query: string, searchResults: string, pdfContent: string): string {
  let response = ''

  if (searchResults) {
    response += `Based on the internet search results:\n\n${searchResults.slice(0, 800)}\n\n`
  }

  if (pdfContent) {
    response += `I also have access to the uploaded PDF document(s). `
  }

  if (!searchResults && !pdfContent) {
    response = `I received your message: "${query}"\n\n`
  }

  response += `I'm here to help! Note: For full AI capabilities, configure the OPENAI_API_KEY environment variable in your Vercel deployment settings.\n\n`

  if (searchResults) {
    response += 'I found relevant information from Wikipedia that should help answer your question. '
  }

  response += 'Feel free to ask follow-up questions or upload PDF documents for analysis!'

  return response
}

// Export GET to prevent 405 errors
export async function GET() {
  return NextResponse.json({ message: 'Chat API is running. Use POST to send messages.' })
}
