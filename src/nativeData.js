import { Capacitor } from '@capacitor/core'
import samplePoints from '../server/data/points.json'

const SUGGESTIONS_KEY = 'loop.pending-suggestions.v1'

function distanceBetween(lat1, lng1, lat2, lng2) {
  const radians = (degrees) => degrees * Math.PI / 180
  const latitudeDifference = radians(lat2 - lat1)
  const longitudeDifference = radians(lng2 - lng1)
  const value = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(longitudeDifference / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export async function loadDropPoints(material, location, signal) {
  if (Capacitor.isNativePlatform()) {
    if (signal.aborted) throw new DOMException('Request was cancelled.', 'AbortError')
    let points = samplePoints
    if (material) points = points.filter((point) => point.materials.includes(material))
    if (location) {
      points = points
        .map((point) => ({
          ...point,
          distanceKm: distanceBetween(location.lat, location.lng, point.lat, point.lng),
        }))
        .sort((left, right) => left.distanceKm - right.distanceKm)
    }
    return points
  }

  const params = new URLSearchParams()
  if (material) params.set('material', material)
  if (location) {
    params.set('lat', String(location.lat))
    params.set('lng', String(location.lng))
  }
  const response = await fetch(`/api/points?${params}`, { signal })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Could not load drop-off points.')
  return result.points
}

function readLocalSuggestions() {
  const saved = window.localStorage.getItem(SUGGESTIONS_KEY)
  if (!saved) return []
  const suggestions = JSON.parse(saved)
  if (!Array.isArray(suggestions)) {
    throw new Error('Saved suggestions are invalid. Clear this app’s stored data and try again.')
  }
  return suggestions
}

export async function saveDropPointSuggestion(payload) {
  if (Capacitor.isNativePlatform()) {
    const suggestion = {
      ...payload,
      id: crypto.randomUUID(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    const suggestions = readLocalSuggestions()
    suggestions.push(suggestion)
    window.localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(suggestions))
    return { suggestion, localOnly: true }
  }

  const response = await fetch('/api/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Your suggestion could not be saved.')
  return result
}
