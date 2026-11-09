import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
const pointsFile = path.join(serverDirectory, 'data', 'points.json')
const suggestionsFile = path.join(serverDirectory, 'data', 'suggestions.json')
const materialIds = new Set(['glass', 'paper', 'plastic', 'metal', 'batteries', 'electronics'])
const app = express()
const port = Number(process.env.PORT) || 3001
let suggestionWriteQueue = Promise.resolve()

app.disable('x-powered-by')
app.use(express.json({ limit: '10kb' }))

async function readJson(filePath) {
  return JSON.parse((await readFile(filePath, 'utf8')).replace(/^\uFEFF/, ''))
}

function isValidCoordinate(value, minimum, maximum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

function distanceBetween(lat1, lng1, lat2, lng2) {
  const radians = (degrees) => degrees * Math.PI / 180
  const latitudeDifference = radians(lat2 - lat1)
  const longitudeDifference = radians(lng2 - lng1)
  const value = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(longitudeDifference / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

app.get('/api/points', async (request, response) => {
  const { material } = request.query
  if (material !== undefined && (typeof material !== 'string' || !materialIds.has(material))) {
    return response.status(400).json({ error: 'Choose a supported material filter.' })
  }

  const hasLatitude = request.query.lat !== undefined
  const hasLongitude = request.query.lng !== undefined
  if (hasLatitude !== hasLongitude) {
    return response.status(400).json({ error: 'Provide both latitude and longitude to sort by distance.' })
  }

  let origin
  if (hasLatitude) {
    const lat = Number(request.query.lat)
    const lng = Number(request.query.lng)
    if (!isValidCoordinate(lat, -90, 90) || !isValidCoordinate(lng, -180, 180)) {
      return response.status(400).json({ error: 'The latitude or longitude is invalid.' })
    }
    origin = { lat, lng }
  }

  let points = await readJson(pointsFile)
  if (material) points = points.filter((point) => point.materials.includes(material))
  if (origin) {
    points = points
      .map((point) => ({
        ...point,
        distanceKm: distanceBetween(origin.lat, origin.lng, point.lat, point.lng),
      }))
      .sort((left, right) => left.distanceKm - right.distanceKm)
  }

  return response.json({ points })
})

app.post('/api/suggestions', async (request, response) => {
  const { name, address, materials, details, lat, lng } = request.body ?? {}
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
    return response.status(400).json({ error: 'Enter a place name between 2 and 80 characters.' })
  }
  if (typeof address !== 'string' || address.trim().length < 3 || address.trim().length > 200) {
    return response.status(400).json({ error: 'Enter an address between 3 and 200 characters.' })
  }
  if (!Array.isArray(materials) || materials.length === 0 || materials.some((value) => !materialIds.has(value))) {
    return response.status(400).json({ error: 'Select at least one supported material.' })
  }
  if (details !== undefined && (typeof details !== 'string' || details.length > 500)) {
    return response.status(400).json({ error: 'Details must be 500 characters or fewer.' })
  }

  const hasLatitude = lat !== undefined
  const hasLongitude = lng !== undefined
  if (hasLatitude !== hasLongitude
    || (hasLatitude && (!isValidCoordinate(lat, -90, 90) || !isValidCoordinate(lng, -180, 180)))) {
    return response.status(400).json({ error: 'The optional location coordinates are invalid.' })
  }

  const suggestion = {
    id: randomUUID(),
    name: name.trim(),
    address: address.trim(),
    materials: [...new Set(materials)],
    ...(details?.trim() ? { details: details.trim() } : {}),
    ...(hasLatitude ? { lat, lng } : {}),
    status: 'pending',
    createdAt: new Date().toISOString(),
  }

  const saveSuggestion = async () => {
    const suggestions = await readJson(suggestionsFile)
    suggestions.push(suggestion)
    const temporaryFile = `${suggestionsFile}.${suggestion.id}.tmp`
    await writeFile(temporaryFile, `${JSON.stringify(suggestions, null, 2)}\n`, 'utf8')
    await rename(temporaryFile, suggestionsFile)
  }
  suggestionWriteQueue = suggestionWriteQueue.then(saveSuggestion, saveSuggestion)
  await suggestionWriteQueue

  return response.status(201).json({ suggestion })
})

const builtIndex = path.resolve(serverDirectory, '..', 'dist', 'index.html')
if (existsSync(builtIndex)) {
  app.use(express.static(path.dirname(builtIndex)))
  app.get(/.*/, (_request, response) => response.sendFile(builtIndex))
}

app.use('/api', (_request, response) => response.status(404).json({ error: 'API route not found.' }))
app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({ error: 'Request body must be valid JSON.' })
  }
  console.error('Request failed:', error)
  return response.status(500).json({ error: 'The server could not complete the request.' })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Recycling locator API listening on http://localhost:${port}`)
})
