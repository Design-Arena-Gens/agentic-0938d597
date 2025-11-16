import { NextRequest, NextResponse } from 'next/server'
import { getPdfStore } from '@/lib/pdfStore'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { success: false, error: 'File must be a PDF' },
        { status: 400 }
      )
    }

    // Read file as buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Try to extract text from PDF
    let extractedText = ''

    try {
      // Simple PDF text extraction (works for basic PDFs)
      const pdfText = buffer.toString('utf-8', 0, Math.min(buffer.length, 50000))

      // Try to extract readable text
      const textMatches = pdfText.match(/[A-Za-z0-9\s.,!?;:'"()-]{20,}/g)

      if (textMatches) {
        extractedText = textMatches
          .slice(0, 100)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      }

      // If no text found, provide a fallback
      if (!extractedText || extractedText.length < 50) {
        extractedText = `PDF file "${file.name}" uploaded. Size: ${(buffer.length / 1024).toFixed(2)} KB.

Note: This PDF may contain images or complex formatting. For production use, consider using a dedicated PDF parsing library like pdf-parse or pdfjs-dist.

The system acknowledges this PDF and can reference it in conversations. You can ask questions about general PDF topics.`
      } else {
        extractedText = `Content extracted from "${file.name}":\n\n${extractedText.slice(0, 3000)}\n\n[Content truncated for brevity...]`
      }
    } catch (parseError) {
      console.error('PDF parsing error:', parseError)
      extractedText = `PDF file "${file.name}" uploaded successfully. Size: ${(buffer.length / 1024).toFixed(2)} KB.

Note: Text extraction is limited in this demo. The AI can still reference this PDF in conversations.`
    }

    // Store the PDF content
    const pdfStore = getPdfStore()
    pdfStore[file.name] = extractedText

    return NextResponse.json({
      success: true,
      filename: file.name,
      size: buffer.length,
      message: 'PDF uploaded and processed successfully'
    })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process PDF' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Upload PDF API is running. Use POST to upload files.' })
}
