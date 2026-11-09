import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { AppLauncher } from '@capacitor/app-launcher'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { loadDropPoints, saveDropPointSuggestion } from './nativeData'
import './App.css'

const MATERIALS = [
  { id: 'glass', name: 'Glass', icon: '◉' },
  { id: 'paper', name: 'Paper', icon: '▤' },
  { id: 'plastic', name: 'Plastic', icon: '♧' },
  { id: 'metal', name: 'Metal', icon: '▱' },
  { id: 'batteries', name: 'Batteries', icon: '▣' },
  { id: 'electronics', name: 'E-waste', icon: '⌘' },
]

const INITIAL_MAP_CENTER = [47.61, -122.33]

function Icon({ name, size = 18 }) {
  const paths = {
    leaf: <><path d="M20 4c-8 0-14 4-14 11a5 5 0 0 0 5 5c7 0 11-6 9-16Z" /><path d="M4 21c3-5 7-8 12-11" /></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    locate: <><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    back: <><path d="m15 18-6-6 6-6" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15m6-12v15" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    sparkle: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
  }

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function formatDistance(distanceKm) {
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`
  return `${distanceKm.toFixed(1)} km`
}

function App() {
  const [points, setPoints] = useState([])
  const [material, setMaterial] = useState('')
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locationMessage, setLocationMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [mobileView, setMobileView] = useState('list')
  const [suggestionOpen, setSuggestionOpen] = useState(false)
  const [suggestionBusy, setSuggestionBusy] = useState(false)
  const [suggestionError, setSuggestionError] = useState('')
  const [notice, setNotice] = useState('')
  const mapElement = useRef(null)
  const mapInstance = useRef(null)
  const markerLayer = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    const loadPoints = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const nextPoints = await loadDropPoints(material, location, controller.signal)
        setPoints(nextPoints)
        setSelectedId((current) => nextPoints.some((point) => point.id === current)
          ? current
          : nextPoints[0]?.id ?? null)
      } catch (error) {
        if (error.name !== 'AbortError') {
          setLoadError(error.message || 'Could not connect to the drop-off service.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadPoints()
    return () => controller.abort()
  }, [material, location])

  const visiblePoints = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return points
    return points.filter((point) =>
      `${point.name} ${point.address} ${point.materials.join(' ')}`.toLowerCase().includes(query),
    )
  }, [points, search])

  const locateMe = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      setLocating(true)
      setLocationMessage('')
      try {
        const permission = await Geolocation.checkPermissions()
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
          const requested = await Geolocation.requestPermissions()
          if (requested.location !== 'granted' && requested.coarseLocation !== 'granted') {
            setLocationMessage('Allow location access in Android settings to sort by distance.')
            return
          }
        }
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 12000,
        })
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
      } catch (error) {
        console.error('Could not get the device location.', error)
        setLocationMessage('Unable to get your location. Check Android location permissions and try again.')
      } finally {
        setLocating(false)
      }
      return
    }

    if (!navigator.geolocation) {
      setLocationMessage('Location is not available in this browser.')
      return
    }
    setLocating(true)
    setLocationMessage('')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ lat: coords.latitude, lng: coords.longitude })
        setLocationMessage('')
        setLocating(false)
      },
      (error) => {
        const messages = {
          1: 'Allow location access in your browser settings to sort by distance.',
          2: 'Your location could not be determined. Try again in a moment.',
          3: 'Finding your location took too long. Please try again.',
        }
        setLocationMessage(messages[error.code] || 'Unable to get your location.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }, [])

  const openDirections = useCallback(async (point) => {
    if (Capacitor.isNativePlatform()) {
      try {
        await AppLauncher.openUrl({ url: `geo:${point.lat},${point.lng}?q=${point.lat},${point.lng}` })
      } catch (error) {
        console.error('Could not open a maps app.', error)
        setNotice('Could not open a maps app. Please try again.')
      }
      return
    }
    window.open(directionsUrl(point), '_blank', 'noopener,noreferrer')
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined
    let disposed = false
    let listener

    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (suggestionOpen) {
        setSuggestionOpen(false)
      } else if (mobileView === 'map') {
        setMobileView('list')
      } else if (canGoBack) {
        window.history.back()
      } else {
        CapacitorApp.exitApp()
      }
    }).then((registeredListener) => {
      if (disposed) {
        registeredListener.remove()
      } else {
        listener = registeredListener
      }
    }).catch((error) => console.error('Could not register Android back navigation.', error))

    return () => {
      disposed = true
      if (listener) listener.remove()
    }
  }, [mobileView, suggestionOpen])

  useEffect(() => {
    if (!mapElement.current || mapInstance.current) return
    const map = L.map(mapElement.current, { zoomControl: false }).setView(INITIAL_MAP_CENTER, 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapInstance.current = map
    markerLayer.current = L.featureGroup().addTo(map)
    return () => {
      map.remove()
      mapInstance.current = null
      markerLayer.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapInstance.current
    const layer = markerLayer.current
    if (!map || !layer) return
    layer.clearLayers()

    visiblePoints.forEach((point) => {
      const marker = L.marker([point.lat, point.lng], {
        icon: L.divIcon({
          className: 'recycle-marker',
          html: '<span class="recycle-marker__dot"></span>',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(layer)
      const popup = document.createElement('div')
      popup.className = 'map-popup'
      const title = document.createElement('strong')
      title.textContent = point.name
      const address = document.createElement('span')
      address.textContent = point.address
      const directions = document.createElement('a')
      directions.href = directionsUrl(point)
      directions.textContent = 'Get directions'
      directions.addEventListener('click', (event) => {
        event.preventDefault()
        openDirections(point)
      })
      popup.append(title, address, directions)
      marker.bindPopup(popup)
      marker.on('click', () => setSelectedId(point.id))
    })

    if (location) {
      L.circleMarker([location.lat, location.lng], {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: '#4387ec',
        fillOpacity: 1,
      }).bindPopup('You are here').addTo(layer)
    }

    const bounds = layer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 })
    } else if (location) {
      map.setView([location.lat, location.lng], 13)
    }
  }, [visiblePoints, location, openDirections])

  useEffect(() => {
    if (mapInstance.current) {
      window.setTimeout(() => mapInstance.current?.invalidateSize(), 100)
    }
  }, [mobileView])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function submitSuggestion(event) {
    event.preventDefault()
    const form = event.currentTarget
    setSuggestionBusy(true)
    setSuggestionError('')
    const formData = new FormData(form)
    const payload = {
      name: formData.get('name'),
      address: formData.get('address'),
      materials: formData.getAll('materials'),
      details: formData.get('details'),
      ...(location ? { lat: location.lat, lng: location.lng } : {}),
    }
    try {
      const result = await saveDropPointSuggestion(payload)
      setSuggestionOpen(false)
      setNotice(result.localOnly
        ? 'Suggestion saved on this device for review.'
        : 'Thanks! Your suggestion was sent for review.')
      form.reset()
    } catch (error) {
      setSuggestionError(error.message || 'Your suggestion could not be saved. Please try again.')
    } finally {
      setSuggestionBusy(false)
    }
  }

  function directionsUrl(point) {
    return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Loop home">
          <span className="brand-mark"><Icon name="leaf" size={20} /></span>
          <span>loop<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-actions">
          <span className="demo-label"><span /> Seattle sample data</span>
          <button className="button button-outline suggest-top" onClick={() => setSuggestionOpen(true)}>
            <Icon name="plus" size={16} /> Suggest a spot
          </button>
        </div>
      </header>

      <main>
        <section className="intro">
          <div className="intro-copy">
            <span className="eyebrow"><Icon name="sparkle" size={15} /> SMALL ACT, BIG IMPACT</span>
            <h1>Good things<br />go <span>around.</span></h1>
            <p>Find a nearby place to drop off the things you’re ready to recycle.</p>
            <button className="button button-location" onClick={locateMe} disabled={locating}>
              <Icon name="locate" size={18} />
              {locating ? 'Finding you…' : location ? 'Update my location' : 'Use my location'}
              {!locating && <Icon name="arrow" size={16} />}
            </button>
            {locationMessage && <p className="location-message" role="status">{locationMessage}</p>}
            {location && <span className="location-caption">Sorted by distance from you</span>}
          </div>
          <div className="intro-art" aria-hidden="true">
            <div className="art-sun" />
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-leaf leaf-one">♧</div>
            <div className="art-leaf leaf-two">♧</div>
            <div className="art-center"><Icon name="leaf" size={56} /></div>
            <span className="art-caption">a little less waste<br />a lot more good</span>
          </div>
          <div className="intro-footnote"><span className="footnote-dot" /> Preview locations are examples, not verified facilities.</div>
        </section>

        <section className="finder" aria-label="Find a recycling drop-off">
          <div className="finder-heading">
            <div>
              <span className="section-kicker">YOUR NEIGHBORHOOD GUIDE</span>
              <h2>Find a drop-off</h2>
            </div>
            <span className="result-count">{visiblePoints.length} {visiblePoints.length === 1 ? 'place' : 'places'}</span>
          </div>

          <div className="finder-controls">
            <label className="searchbox">
              <Icon name="search" size={19} />
              <span className="sr-only">Search places or materials</span>
              <input
                type="search"
                placeholder="Search places or materials"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && <button className="clear-search" onClick={() => setSearch('')} aria-label="Clear search"><Icon name="close" size={15} /></button>}
            </label>
            <div className="material-filters" aria-label="Filter by material">
              <button
                className={`filter-chip ${material === '' ? 'active' : ''}`}
                onClick={() => setMaterial('')}
                aria-pressed={material === ''}
              >Everything</button>
              {MATERIALS.map((item) => (
                <button
                  key={item.id}
                  className={`filter-chip ${material === item.id ? 'active' : ''}`}
                  onClick={() => setMaterial(material === item.id ? '' : item.id)}
                  aria-pressed={material === item.id}
                >
                  <span aria-hidden="true">{item.icon}</span>{item.name}
                </button>
              ))}
            </div>
            <div className="mobile-view-switch" role="group" aria-label="Choose view">
              <button className={mobileView === 'list' ? 'active' : ''} onClick={() => setMobileView('list')}><Icon name="list" size={16} /> List</button>
              <button className={mobileView === 'map' ? 'active' : ''} onClick={() => setMobileView('map')}><Icon name="map" size={16} /> Map</button>
            </div>
          </div>

          {loadError ? (
            <div className="state-panel error-panel" role="alert">
              <span className="state-icon"><Icon name="pin" size={22} /></span>
              <h3>We couldn’t load places</h3>
              <p>{loadError}</p>
              <button className="button button-outline" onClick={() => window.location.reload()}>Try again</button>
            </div>
          ) : (
            <div className={`results-layout ${mobileView === 'map' ? 'show-map' : 'show-list'}`}>
              <div className="place-list" aria-live="polite">
                {loading ? (
                  <div className="state-panel"><span className="loading-spinner" /><p>Finding nearby places…</p></div>
                ) : visiblePoints.length ? (
                  visiblePoints.map((point, index) => (
                    <article
                      className={`place-card ${selectedId === point.id ? 'selected' : ''}`}
                      key={point.id}
                      onClick={() => setSelectedId(point.id)}
                    >
                      <div className={`place-symbol symbol-${MATERIALS.find((item) => point.materials.includes(item.id))?.id || 'glass'}`}>
                        <Icon name="pin" size={19} />
                      </div>
                      <div className="place-info">
                        <div className="place-title-row">
                          <h3>{point.name}</h3>
                          {index === 0 && location && <span className="nearest-tag">NEAREST</span>}
                        </div>
                        <p className="place-address">{point.address}</p>
                        <div className="place-tags">
                          {point.materials.map((id) => (
                            <span className="material-tag" key={id}>{MATERIALS.find((item) => item.id === id)?.name || id}</span>
                          ))}
                          {point.demo && <span className="sample-tag">Sample</span>}
                        </div>
                        <div className="place-footer">
                          <span className="distance"><Icon name="pin" size={13} />{point.distanceKm == null ? 'Enable location for distance' : formatDistance(point.distanceKm)}</span>
                          <a
                            className="directions-link"
                            href={directionsUrl(point)}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              openDirections(point)
                            }}
                          >Directions <Icon name="arrow" size={14} /></a>
                        </div>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="state-panel empty-panel">
                    <span className="state-icon"><Icon name="search" size={22} /></span>
                    <h3>No places found</h3>
                    <p>Try a different search or material filter.</p>
                    <button className="text-button" onClick={() => { setSearch(''); setMaterial('') }}>Clear filters</button>
                  </div>
                )}
                <button className="suggest-card" onClick={() => setSuggestionOpen(true)}>
                  <span className="suggest-plus"><Icon name="plus" size={18} /></span>
                  <span><strong>Know a good spot?</strong><small>Help your neighbors find it.</small></span>
                  <Icon name="arrow" size={17} />
                </button>
              </div>

              <div className="map-panel" aria-label="Map of recycling drop-off points">
                <div className="map-canvas" ref={mapElement} />
                <div className="map-legend"><span className="legend-dot" /> Drop-off spot <span className="legend-you" /> You</div>
                <span className="map-note">Map data &copy; OpenStreetMap contributors</span>
              </div>
            </div>
          )}
        </section>

        <footer className="footer">
          <span className="footer-brand"><Icon name="leaf" size={16} /> Better habits, one drop at a time.</span>
          <button className="footer-suggest" onClick={() => setSuggestionOpen(true)}>Suggest a place <Icon name="arrow" size={13} /></button>
        </footer>
      </main>

      {notice && <div className="toast" role="status"><Icon name="check" size={18} />{notice}</div>}

      {suggestionOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSuggestionOpen(false) }}>
          <section className="suggestion-modal" role="dialog" aria-modal="true" aria-labelledby="suggestion-title">
            <div className="modal-heading">
              <div>
                <span className="section-kicker">MAKE THE MAP BETTER</span>
                <h2 id="suggestion-title">Suggest a drop-off</h2>
              </div>
              <button className="icon-button" onClick={() => setSuggestionOpen(false)} aria-label="Close"><Icon name="close" size={19} /></button>
            </div>
            <p className="modal-intro">Share a place that accepts recyclables. Suggestions are saved for review.</p>
            <form onSubmit={submitSuggestion}>
              <label className="field-label">Place name<input name="name" required minLength="2" maxLength="80" placeholder="e.g. Community recycling center" /></label>
              <label className="field-label">Street address<input name="address" required minLength="3" maxLength="200" placeholder="Street, city, postal code" /></label>
              <fieldset className="material-fieldset">
                <legend>What can be dropped off?</legend>
                <div className="suggestion-materials">
                  {MATERIALS.map((item) => (
                    <label className="check-option" key={item.id}>
                      <input type="checkbox" name="materials" value={item.id} />
                      <span>{item.icon} {item.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="field-label">Helpful details <span className="optional">(optional)</span><textarea name="details" maxLength="500" rows="3" placeholder="Opening hours, accepted items, or anything else useful" /></label>
              {location && <p className="coordinates-note"><Icon name="locate" size={15} /> We’ll include your current location as a reference.</p>}
              {suggestionError && <p className="form-error" role="alert">{suggestionError}</p>}
              <div className="modal-actions">
                <button type="button" className="button button-quiet" onClick={() => setSuggestionOpen(false)}>Cancel</button>
                <button type="submit" className="button button-primary" disabled={suggestionBusy}>{suggestionBusy ? 'Sending…' : 'Send suggestion'}<Icon name="arrow" size={15} /></button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
