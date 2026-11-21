export function sanitizeFilename(name) {
  const cleaned = String(name ?? '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, 80) || 'export'
}

function clickAnchor(anchor) {
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  clickAnchor(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  downloadBlob(filename, new Blob([text], { type: mime }))
}

export function downloadDataUrl(filename, dataUrl) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  clickAnchor(anchor)
}
