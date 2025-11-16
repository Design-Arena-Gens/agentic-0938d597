// Shared PDF store for the application
// In production, use a database instead of in-memory storage
export const pdfStore: { [key: string]: string } = {}

export function getPdfStore() {
  return pdfStore
}

export function storePdfContent(filename: string, content: string) {
  pdfStore[filename] = content
}
