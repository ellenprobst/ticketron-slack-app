const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * Downloads a single Slack file, handling Enterprise Grid redirects.
 *
 * Enterprise Grid redirects file URLs (url_private, thumbnails) to the
 * enterprise login page, dropping the Authorization header. This works
 * around it by: 1) catching the redirect, 2) extracting the real file
 * path from the ?redir= query param, 3) fetching that path directly on
 * the enterprise domain with the bot token.
 *
 * @param {Object} file - Slack file object from event or message.
 * @param {string} token - Bot token for authorization.
 * @returns {Promise<{mimeType: string, data: string} | null>} Base64-encoded image or null on failure.
 */
async function downloadSlackFile(file, token) {
  const downloadUrl = file.url_private_download || file.url_private
  let resp = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'manual',
  })

  if (resp.status >= 300 && resp.status < 400) {
    const location = resp.headers.get('location')
    const redirectUrl = new URL(location)
    const redir = redirectUrl.searchParams.get('redir')
    if (redir) {
      // Build direct URL: enterprise domain + decoded redir path
      const directUrl = `${redirectUrl.origin}${redir}`
      console.log(
        '\x1b[90m%s\x1b[0m',
        `[downloadImages] Enterprise redirect detected, trying direct URL: ${directUrl}`,
      )
      resp = await fetch(directUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
    } else {
      // Simple redirect — follow with auth header
      resp = await fetch(location, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  }

  if (!resp.ok) {
    console.log(
      '\x1b[33m%s\x1b[0m',
      `[downloadImages] Failed to download file ${file.name}: ${resp.status}`,
    )
    return null
  }

  const contentType = resp.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) {
    console.log(
      '\x1b[33m%s\x1b[0m',
      `[downloadImages] Skipping ${file.name}: expected image, got ${contentType}`,
    )
    return null
  }

  const buffer = await resp.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  console.log(
    '\x1b[32m%s\x1b[0m',
    `[downloadImages] Downloaded: ${file.name} (${contentType}, ${Math.round(buffer.byteLength / 1024)}KB)`,
  )

  return {
    mimeType: contentType.split(';')[0],
    data: base64,
  }
}

/**
 * Extracts and downloads supported images from Slack messages and/or the current event.
 * Collects files from both prior thread messages and the current event to handle
 * the case where a user posts an image first, then mentions the bot in a reply.
 *
 * @param {Object} params
 * @param {Array<Object>} params.threadMessages - Prior thread messages (may contain files).
 * @param {Object} params.event - The current Slack event (may contain files).
 * @param {string} params.token - Bot token for authorization.
 * @returns {Promise<Array<{mimeType: string, data: string}>>} Array of base64-encoded images.
 */
export async function downloadImages({ threadMessages, event, token }) {
  const allFiles = [
    ...threadMessages.flatMap((msg) => msg.files || []),
    ...(event.files || []),
  ]
  const imageFiles = allFiles.filter((f) =>
    SUPPORTED_IMAGE_TYPES.has(f.mimetype),
  )

  if (imageFiles.length === 0) return []

  /** @type {Array<{mimeType: string, data: string}>} */
  const images = []
  for (const file of imageFiles) {
    try {
      const image = await downloadSlackFile(file, token)
      if (image) images.push(image)
    } catch (err) {
      console.log(
        '\x1b[33m%s\x1b[0m',
        `[downloadImages] Error downloading file ${file.name}: ${err.message}`,
      )
    }
  }

  return images
}
