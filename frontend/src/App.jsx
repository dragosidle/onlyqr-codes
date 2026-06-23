import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import NumberFlow from '@number-flow/react'
import {
	IllustrationQRPlaceholder,
	IconLink,
	IconText,
	IconEmail,
	IconCall,
	IconSMS,
	IconCopy,
	IconDownload,
	IconPunch,
	IconPunchActive,
	IconDelete,
} from './icons'
import GenerateButton from './GenerateButton'
import trollImg from './troll.avif' // bundled by Vite -> correct hashed URL in dev & prod

// Persisted multi-domain history. Each entry is
//   { url, svgs: { none, punched? }, punched: boolean }
// `none` is the default QR fetched on generate; `punched` (in svgs) is the
// punch-hole variant generated lazily when the user clicks the punch button.
const STORAGE_KEY = 'onlyqr:domains:v2'
const ACTIVE_KEY = 'onlyqr:activeUrl:v2'
const MAX_DOMAINS = 24 // keep localStorage bounded

function loadDomains() {
	try {
		const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY))
		if (!Array.isArray(parsed)) return []
		return parsed.filter((d) => d && typeof d.url === 'string' && d.svgs?.none)
	} catch {
		return []
	}
}

function loadActiveUrl() {
	try {
		return localStorage.getItem(ACTIVE_KEY) || ''
	} catch {
		return ''
	}
}

function isValidLinkUrl(text) {
	const raw = text.trim()
	if (!raw) return false
	try {
		const url = new URL(raw.includes('://') ? raw : 'https://' + raw)
		return url.hostname.includes('.')
	} catch {
		return false
	}
}

function normalizeUrl(text) {
	return text.includes('://') ? text : 'https://' + text
}

function stripDiacritics(text) {
	return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function displayUrl(url) {
	const bare = url.replace(/^https:\/\//, '')
	const firstSlash = bare.indexOf('/')
	if (firstSlash === -1) return bare.length > 50 ? bare.slice(0, 50) + '…' : bare
	const secondSlash = bare.indexOf('/', firstSlash + 1)
	const truncated = secondSlash === -1 ? bare : bare.slice(0, secondSlash) + '…'
	return truncated.length > 50 ? truncated.slice(0, 50) + '…' : truncated
}

const QR_TYPES = [
	{ label: 'Link', Icon: IconLink },
	{ label: 'Text', Icon: IconText },
	{ label: 'Email', Icon: IconEmail },
	{ label: 'Call', Icon: IconCall },
	{ label: 'SMS', Icon: IconSMS },
]

export default function App() {
	const [qrType, setQrType] = useState('Link') // stores the label string
	const tabRefs = useRef([])
	const [indicatorStyle, setIndicatorStyle] = useState({})

	useLayoutEffect(() => {
		const el = tabRefs.current[QR_TYPES.findIndex((t) => t.label === qrType)]
		if (el) setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth })
	}, [qrType])

	const [text, setText] = useState('')
	// Auto-size the URL input to its content: a hidden sizer span mirrors the
	// text (or placeholder), and we set the input width from its measurement so
	// the pill grows with what's typed and pushes the Generate button along.
	const sizerRef = useRef(null)
	const [inputWidth, setInputWidth] = useState(null)
	useLayoutEffect(() => {
		const el = sizerRef.current
		if (!el) return
		// Sizer width + the input's horizontal padding (32px left, 12px right)
		// + a few px so the caret never clips. The container's max-width caps the
		// overall pill, after which the input shrinks and scrolls internally.
		const PADDING = 44
		const CARET = 6
		setInputWidth(el.offsetWidth + PADDING + CARET)
	}, [text])
	const [domains, setDomains] = useState(loadDomains)
	const [activeUrl, setActiveUrl] = useState(loadActiveUrl)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	const [shaking, setShaking] = useState(false)
	const [shakingUrl, setShakingUrl] = useState('')
	const [punchingUrl, setPunchingUrl] = useState('') // domain whose punch variant is being fetched
	const [deleteVisible, setDeleteVisible] = useState(false) // focused card's delete button
	const deleteTimer = useRef(null)

	// The centered card (falls back to the most recent domain if the stored
	// activeUrl ever drifts out of the list).
	const activeDomain =
		domains.find((d) => d.url === activeUrl) || domains[domains.length - 1] || null

	// Reveal the focused card's delete button, then auto-hide it after 3s.
	const revealDelete = () => {
		setDeleteVisible(true)
		clearTimeout(deleteTimer.current)
		deleteTimer.current = setTimeout(() => setDeleteVisible(false), 3000)
	}

	// Reset the delete reveal whenever focus moves to a different card.
	useEffect(() => {
		setDeleteVisible(false)
		clearTimeout(deleteTimer.current)
		return () => clearTimeout(deleteTimer.current)
	}, [activeDomain?.url])

	// Persist the domain history and the active selection.
	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(domains))
		} catch {
			/* quota exceeded or storage unavailable — keep working in-memory */
		}
	}, [domains])

	useEffect(() => {
		try {
			localStorage.setItem(ACTIVE_KEY, activeUrl)
		} catch {
			/* ignore */
		}
	}, [activeUrl])

	// --- Carousel positioning -------------------------------------------------
	// The track holds every domain card in a row. We translate it so the active
	// card sits dead center; older cards then trail off to the left. The newest
	// card becomes active on generate, so the latest QR is always centered.
	const trackRef = useRef(null)
	const cardRefs = useRef({})
	const [trackX, setTrackX] = useState(0)

	const centerActiveCard = () => {
		const track = trackRef.current
		const card = activeDomain && cardRefs.current[activeDomain.url]
		if (!track || !card) return
		setTrackX(track.offsetWidth / 2 - (card.offsetLeft + card.offsetWidth / 2))
	}

	// Re-center whenever the active card or the number of cards changes — except
	// on deletion: the removed card is still mid-exit, so measuring now is stale
	// and would cause a double move. The ResizeObserver below re-centers once it
	// actually unmounts (a single, clean slide to center).
	const prevLenRef = useRef(domains.length)
	useLayoutEffect(() => {
		const shrank = domains.length < prevLenRef.current
		prevLenRef.current = domains.length
		if (!shrank) centerActiveCard()
	}, [activeDomain?.url, domains.length])

	// A deleted card stays mounted through its exit animation, so the layout
	// effect above measures stale offsets. Observe the track's actual size and
	// re-center once it settles (e.g. after the exiting card finally unmounts).
	// centerFnRef always holds the latest closure so the observer sees fresh state.
	const centerFnRef = useRef(centerActiveCard)
	centerFnRef.current = centerActiveCard
	useEffect(() => {
		const track = trackRef.current
		if (!track || typeof ResizeObserver === 'undefined') return
		const ro = new ResizeObserver(() => centerFnRef.current())
		ro.observe(track)
		const onResize = () => centerFnRef.current()
		window.addEventListener('resize', onResize)
		return () => {
			ro.disconnect()
			window.removeEventListener('resize', onResize)
		}
	}, [])

	// Live daily counter
	const [todayCount, setTodayCount] = useState(null)
	const [dotKey, setDotKey] = useState(0)

	useEffect(() => {
		const poll = async () => {
			try {
				const res = await fetch('/api/stats/today')
				if (res.ok) {
					const { count } = await res.json()
					setTodayCount(count)
					setDotKey((k) => k + 1)
				}
			} catch {
				/* ignore — counter stays hidden until first successful fetch */
			}
		}
		poll()
		const id = setInterval(poll, 5000)
		return () => clearInterval(id)
	}, [])

	const generate = async () => {
		const raw = text.trim()
		if (!raw) return
		const value = qrType === 'Link' ? normalizeUrl(raw) : raw
		if (qrType === 'Link' && !isValidLinkUrl(value)) {
			setShaking(true)
			return
		}
		// Already have a card for this domain. If it isn't focused, just bring it
		// into focus. Only shake its chip when it's already focused and the user
		// retries generating it.
		if (domains.some((d) => d.url === value)) {
			if (activeDomain?.url === value) setShakingUrl(value)
			else setActiveUrl(value)
			return
		}
		setError('')
		setLoading(true)
		try {
			const params = new URLSearchParams({ url: value })
			const res = await fetch(`/api/qr?${params.toString()}`)
			if (!res.ok) throw new Error(`Server returned ${res.status}`)
			const none = await res.text()
			setDomains((prev) =>
				[...prev, { url: value, type: qrType, svgs: { none }, punched: false }].slice(-MAX_DOMAINS),
			)
			setActiveUrl(value)
		} catch (e) {
			setError(e.message || 'Something went wrong.')
		} finally {
			setLoading(false)
		}
	}

	// The punch button: lazily generate (and cache) the punch-hole variant for a
	// domain, then show it in place of the default. Clicking again reverts.
	const togglePunch = async (url) => {
		const d = domains.find((x) => x.url === url)
		if (!d) return
		// Already have the variant (or turning it off) — just flip the flag.
		if (d.punched || d.svgs.punched) {
			setDomains((prev) => prev.map((x) => (x.url === url ? { ...x, punched: !x.punched } : x)))
			return
		}
		setError('')
		setPunchingUrl(url)
		try {
			const params = new URLSearchParams({ url, hole: 'large', shape: 'square' })
			const res = await fetch(`/api/qr?${params.toString()}`)
			if (!res.ok) throw new Error(`Server returned ${res.status}`)
			const punched = await res.text()
			setDomains((prev) =>
				prev.map((x) =>
					x.url === url ? { ...x, svgs: { ...x.svgs, punched }, punched: true } : x,
				),
			)
		} catch (e) {
			setError(e.message || 'Something went wrong.')
		} finally {
			setPunchingUrl('')
		}
	}

	// Remove a domain (and its cached QR) from the browser. If it was focused,
	// shift focus to the neighbour that slides into its place.
	const deleteDomain = (url) => {
		const idx = domains.findIndex((d) => d.url === url)
		const next = domains.filter((d) => d.url !== url)
		setDomains(next)
		if (activeDomain?.url === url) {
			const fallback = next[idx] || next[next.length - 1] || null
			setActiveUrl(fallback ? fallback.url : '')
		}
	}

	const copySvg = (svg) => {
		if (!svg) return
		navigator.clipboard.writeText(svg)
	}

	const downloadSvg = (svg, name) => {
		if (!svg) return
		const blob = new Blob([svg], { type: 'image/svg+xml' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `${name}.svg`
		a.click()
		URL.revokeObjectURL(url)
	}

	return (
		<>
			<header className='site-header'>
				<div className='inner'>
					<div className='header-left'>
						<div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
							<img
								src={trollImg}
								alt=''
								style={{ display: 'block', width: '72px', height: '72px' }}
							/>
							<p className='brand' style={{ margin: 0 }}>
								<span style={{ color: '#02AFEF' }}>Only</span>
								<span style={{ color: '#008CD0' }}>QR.codes</span>
							</p>
						</div>
						<h1 className='site-subtitle'>QR codes for developers & designers</h1>
						<p className='value-prop'>No accounts, no paywall, just good old SVGs</p>
					</div>
				</div>
			</header>

			<main className='hero'>
				<div className='inner'>
					<div className='app-layout'>
						<div className='controls-col'>
							<section className='controls'>
								<div className='input-with-action'>
									<span ref={sizerRef} className='input-sizer' aria-hidden='true'>
										{text || 'domain.com'}
									</span>
									<input
										type='text'
										name='url'
										value={text}
										placeholder='domain.com'
										style={inputWidth ? { width: `${inputWidth}px` } : undefined}
										onChange={(e) => {
											let v = stripDiacritics(e.target.value)
											if (qrType === 'Link') v = v.replace(/ /g, '-')
											setText(v)
										}}
										onKeyDown={(e) => e.key === 'Enter' && generate()}
										maxLength={500}
									/>
									<GenerateButton
										onClick={generate}
										disabled={loading || text.length === 0}
										hasText={text.length > 0}
										shaking={shaking}
										onShakeEnd={() => setShaking(false)}
									/>
								</div>

								{error && <p className='error'>{error}</p>}
							</section>
						</div>

						<div className='qr-row'>
							{domains.length > 0 ? (
								// Carousel track: all domain cards in a row, translated so the
								// active (newest by default) card is centered. Generating a new
								// domain appends a card at the right and slides the track left,
								// so the previous one moves aside to make room.
								<motion.div
									className='qr-track'
									ref={trackRef}
									animate={{ x: trackX }}
									transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
									<AnimatePresence initial={false}>
										{domains.map((d) => {
											const punched = !!(d.punched && d.svgs.punched)
											const svg = punched ? d.svgs.punched : d.svgs.none
											const isActive = activeDomain?.url === d.url
											return (
												<motion.div
													key={d.url}
													ref={(el) => {
														if (el) cardRefs.current[d.url] = el
														else delete cardRefs.current[d.url]
													}}
													className={`qr-card${isActive ? ' active' : ''}`}
													initial={{ opacity: 0, scale: 0.9 }}
													animate={{ opacity: 1, scale: isActive ? 1 : 0.9 }}
													exit={{ opacity: 0, scale: 0.9 }}
													transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
													onClick={() => !isActive && setActiveUrl(d.url)}
													onMouseEnter={isActive ? revealDelete : undefined}>
													<div className='chip-row'>
														<button
															type='button'
															className={`domain-chip${shakingUrl === d.url ? ' shake' : ''}`}
															onClick={() => setActiveUrl(d.url)}
															onAnimationEnd={(e) => {
																if (e.animationName === 'shake') setShakingUrl('')
															}}>
															{(() => {
																const TypeIcon = QR_TYPES.find((t) => t.label === (d.type ?? 'Link'))?.Icon
																return TypeIcon ? <TypeIcon size={14} style={{ flexShrink: 0 }} /> : null
															})()}
															{d.type === 'Link' || !d.type ? displayUrl(d.url) : d.url}
														</button>
														<button
															type='button'
															className={`chip-delete${isActive && deleteVisible ? ' show' : ''}`}
															onMouseEnter={() => clearTimeout(deleteTimer.current)}
															onMouseLeave={revealDelete}
															onClick={(e) => {
																e.stopPropagation()
																deleteDomain(d.url)
															}}
															title='Delete'
															aria-label='Delete QR code'
															data-visitors-event="chip-delete">
															<IconDelete size={18} />
														</button>
													</div>

													<div className='preview'>
														<div dangerouslySetInnerHTML={{ __html: svg }} />

														<button
															className='punch-btn'
															onClick={() => togglePunch(d.url)}
															disabled={punchingUrl === d.url}
															aria-pressed={punched}
															aria-label={punched ? 'Remove punch hole' : 'Punch a hole'}
															title={punched ? 'Remove punch hole' : 'Punch a hole'}
															data-visitors-event="punch-btn">
															{punched ? <IconPunchActive /> : <IconPunch />}
														</button>

														<button
															className='qr-download'
															onClick={() => downloadSvg(svg, punched ? 'qr-punched' : 'qr')}
															title='Download SVG'
															aria-label='Download SVG'
															data-visitors-event="qr-download">
															<IconDownload />
															Download
														</button>
													</div>

													<button className='secondary copy-svg-btn' onClick={() => copySvg(svg)} data-visitors-event="copy-svg-btn">
														<IconCopy />
														Copy SVG
													</button>
												</motion.div>
											)
										})}
									</AnimatePresence>
								</motion.div>
							) : (
								<div className='qr-col'>
									<div className='preview'>
										<IllustrationQRPlaceholder style={{ opacity: 0.25 }} />
									</div>
								</div>
							)}
						</div>
					</div>

					{todayCount !== null && (
						<p className='today-counter'>
							<span key={dotKey} className='today-dot' />
							<NumberFlow className='today-count' value={todayCount ?? 0} /> codes generated today
						</p>
					)}
				</div>
			</main>

			<section className='manifesto'>
				<div className='inner'>
					<p>
						Most QR code tools have lost the plot. They want you to create an account, host your
						files, track your scans, and pick from seventeen color schemes. That's not a QR
						generator, that's a platform trying to lock you in.
					</p>
					<p>This tool does one thing: it takes a string and turns it into a QR code. That's it.</p>
					<p>
						No sign-up. No file hosting. No analytics. No PNG, no JPG, no "premium export." Just a
						clean SVG file. The only format a designer or developer actually needs. Scalable to any
						size, ready to drop straight into Figma, Illustrator, or your codebase.
					</p>
					<p>
						The QR code itself is generated the way it was meant to look: sharp, square dots on a
						clean grid. Rounded dots are a design trend that serves no one. They don't improve
						scannability, they don't make the code more legible, and they certainly don't make it
						more "on brand." A QR code is a machine-readable pattern, not a mood board. Rounding the
						corners is just visual noise dressed up as customization.
					</p>
					<p>
						Old school by design, because a QR code is a simple thing, and simple things deserve
						simple tools.
					</p>
				</div>
			</section>
		</>
	)
}
