import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { AnimatePresence, motion, useMotionValue, animate as animateMotion } from 'motion/react'
import NumberFlow from '@number-flow/react'
import {
	IllustrationQRPlaceholder,
	IconLink,
	IconText,
	IconEmail,
	IconCall,
	IconSMS,
	IconWifi,
	IconVCard,
	IconWhatsApp,
	IconCopy,
	IconDownload,
	IconTick,
	IconPunch,
	IconDelete,
} from './icons'
import GenerateButton from './GenerateButton'
import ClearButton from './ClearButton'
import aliDittherImg from './ali-ditther.avif'
import onlyQrExampleImg from './only-qr-example.avif'
import othersQrExampleImg from './others-qr-example.avif'

// JS getTimezoneOffset() returns minutes UTC is ahead of local time (negative
// for UTC+ zones). Sent only when reading today's count, so each viewer sees
// the count since their own local midnight.
const TZ_OFFSET = new Date().getTimezoneOffset()

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
	const withProto = text.includes('://') ? text : 'https://' + text
	// Lowercase the hostname only; path may be case-sensitive
	return withProto.replace(
		/^(https?:\/\/)([^/?#]+)/i,
		(_, proto, host) => proto + host.toLowerCase(),
	)
}

function stripDiacritics(text) {
	return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function extractWifiSsid(wifiUri) {
	const match = wifiUri.match(/;S:([^;]*)/)
	return match ? match[1] : wifiUri
}

function extractWifiPassword(wifiUri) {
	const match = wifiUri.match(/;P:([^;]*)/)
	return match ? match[1] : ''
}

function midTruncate(str, max = 35) {
	if (str.length <= max) return str
	const half = Math.floor((max - 1) / 2)
	return str.slice(0, half) + '…' + str.slice(str.length - (max - 1 - half))
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
	// { label: 'Text', Icon: IconText },
	// { label: 'Email', Icon: IconEmail },
	// { label: 'Call', Icon: IconCall },
	// { label: 'SMS', Icon: IconSMS },
	{ label: 'Wifi', Icon: IconWifi },
	{ label: 'vCard', Icon: IconVCard },
	{ label: 'WhatsApp', Icon: IconWhatsApp },
]

const CONFIRM_DURATION = 5000

function ConfirmButton({ className, onClick, children, ...props }) {
	const [confirmed, setConfirmed] = useState(false)
	const timerRef = useRef(null)

	const handleClick = () => {
		if (confirmed) return
		onClick?.()
		setConfirmed(true)
		timerRef.current = setTimeout(() => setConfirmed(false), CONFIRM_DURATION)
	}

	useEffect(() => () => clearTimeout(timerRef.current), [])

	return (
		<button
			className={`confirm-btn${confirmed ? ' confirm-btn--done' : ''}${className ? ` ${className}` : ''}`}
			onClick={handleClick}
			disabled={confirmed}
			{...props}>
			<span className='confirm-btn__label'>{children}</span>
			<span className='confirm-btn__tick' aria-hidden='true'>
				<IconTick size={22} />
			</span>
		</button>
	)
}

export default function App() {
	const [qrType, setQrType] = useState('Link') // stores the label string
	const tabRefs = useRef([])
	const [indicatorStyle, setIndicatorStyle] = useState({})

	useLayoutEffect(() => {
		const el = tabRefs.current[QR_TYPES.findIndex((t) => t.label === qrType)]
		if (el) setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth })
	}, [qrType])

	const [text, setText] = useState('')
	const [wifiSsid, setWifiSsid] = useState('')
	const [wifiPassword, setWifiPassword] = useState('')
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
	// Stays false until onExitComplete fires after the last card exits, so the
	// track stays mounted during the exit animation instead of vanishing instantly.
	const [isEmpty, setIsEmpty] = useState(() => loadDomains().length === 0)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	const [newUrls, setNewUrls] = useState(new Set())
	const [shaking, setShaking] = useState(false)
	const [shakingUrl, setShakingUrl] = useState('')
	const [punchingUrl, setPunchingUrl] = useState('') // domain whose punch variant is being fetched
	const [shakingPunchUrl, setShakingPunchUrl] = useState('')
	const [swingingPunchUrl, setSwingingPunchUrl] = useState('')
	const [punchNoticeDismissed, setPunchNoticeDismissed] = useState(false)
	const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 600px)').matches)
	useEffect(() => {
		const mq = window.matchMedia('(min-width: 600px)')
		const handler = (e) => setIsDesktop(e.matches)
		mq.addEventListener('change', handler)
		return () => mq.removeEventListener('change', handler)
	}, [])

	const [punchedThisSession, setPunchedThisSession] = useState(false)
	const showPunchNotice = punchedThisSession && !punchNoticeDismissed
	const dismissPunchNotice = () => setPunchNoticeDismissed(true)
	// The centered card (falls back to the most recent domain if the stored
	// activeUrl ever drifts out of the list).
	const activeDomain =
		domains.find((d) => d.url === activeUrl) || domains[domains.length - 1] || null

	// When a new QR is added after all were deleted, unhide the track before the
	// enter animation so the card can animate in normally.
	useEffect(() => {
		if (domains.length > 0) setIsEmpty(false)
	}, [domains.length])

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
	const trackX = useMotionValue(0)
	// Skip x animation on the first centering when data was pre-loaded from
	// localStorage (track appears instantly, so animating x would cause a slide).
	const pageLoadWithData = useRef(domains.length > 0)
	// Drag state — set true during a drag so card click handlers don't fire.
	const isDraggingRef = useRef(false)
	const centerActiveCard = () => {
		const track = trackRef.current
		const card = activeDomain && cardRefs.current[activeDomain.url]
		if (!track || !card) return
		const newX = track.offsetWidth / 2 - (card.offsetLeft + card.offsetWidth / 2)
		if (pageLoadWithData.current) {
			trackX.set(newX)
			pageLoadWithData.current = false
		} else {
			animateMotion(trackX, newX, { duration: 0.5, ease: [0.16, 1, 0.3, 1] })
		}
	}

	// Re-center whenever the active card or the number of cards changes — except
	// on deletion: the removed card is still mid-exit, so measuring now is stale
	// and would cause a double move. onExitComplete + ResizeObserver re-center
	// once the card has fully unmounted (a single, clean slide to center).
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
				const res = await fetch(`/api/stats/today?tz_offset=${TZ_OFFSET}`)
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
		window.visitors?.track('generate-btn')
		let value
		if (qrType === 'Wifi') {
			if (!wifiSsid.trim()) {
				setShaking(true)
				return
			}
			const security = wifiPassword.trim() ? 'WPA' : 'nopass'
			value = `WIFI:T:${security};S:${wifiSsid.trim()};P:${wifiPassword.trim()};;`
		} else {
			const raw = text.trim()
			if (!raw) return
			value = qrType === 'Link' ? normalizeUrl(raw) : raw
			if (qrType === 'Link' && !isValidLinkUrl(value)) {
				setShaking(true)
				return
			}
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
			let res
			if (qrType === 'Wifi') {
				// POST credentials so they never appear in server logs or request URLs.
				res = await fetch('/api/qr/wifi', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						ssid: wifiSsid.trim(),
						password: wifiPassword.trim(),
					}),
				})
			} else {
				const params = new URLSearchParams({ url: value })
				res = await fetch(`/api/qr?${params.toString()}`)
			}
			if (!res.ok) throw new Error(`Server returned ${res.status}`)
			const none = await res.text()
			setDomains((prev) =>
				[...prev, { url: value, type: qrType, svgs: { none }, punched: false }].slice(-MAX_DOMAINS),
			)
			setActiveUrl(value)
			setNewUrls((prev) => new Set([...prev, value]))
			document.activeElement?.blur()
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
			if (!d.punched) {
				setPunchedThisSession(true)
				setShakingPunchUrl(url)
			}
			setDomains((prev) => prev.map((x) => (x.url === url ? { ...x, punched: !x.punched } : x)))
			return
		}
		setError('')
		setPunchingUrl(url)
		setShakingPunchUrl(url)
		try {
			let res
			if (url.startsWith('WIFI:')) {
				res = await fetch('/api/qr/wifi', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						ssid: extractWifiSsid(url),
						password: extractWifiPassword(url),
						hole: 'large',
						shape: 'square',
					}),
				})
			} else {
				const params = new URLSearchParams({
					url,
					hole: 'large',
					shape: 'square',
				})
				res = await fetch(`/api/qr?${params.toString()}`)
			}
			if (!res.ok) throw new Error(`Server returned ${res.status}`)
			const punched = await res.text()
			setPunchedThisSession(true)
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

	const copySvg = (svg, name) => {
		if (!svg) return
		const named = svg
			.replace(/^<svg\b/, `<svg id="${name}"`)
			.replace(/^(<svg\b[^>]*>)/, `$1<title>${name}</title>`)
		navigator.clipboard.writeText(named)
	}

	const buildFilename = (d, punched) => {
		let base
		if (d.type === 'Link') {
			try {
				const hostname = new URL(d.url).hostname.replace(/^www\./, '')
				base = hostname.includes('.') ? hostname.slice(0, hostname.lastIndexOf('.')) : hostname
			} catch {
				base = 'qr'
			}
		} else if (d.type === 'Wifi') {
			const ssid = extractWifiSsid(d.url)
			base =
				ssid
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-+|-+$/g, '') || 'wifi'
		} else {
			base =
				d.url
					.slice(0, 24)
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-+|-+$/g, '') || 'qr'
		}
		return punched ? `${base}-punched` : base
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
				<main className='hero'>
					<div className='app-layout'>
						<div className='controls-col'>
							<section className='controls'>
								{/* type-tabs hidden for now
								<div className='type-tabs'>
									<div className='type-tab-indicator' style={indicatorStyle} />
									{QR_TYPES.map(({ label, Icon }, i) => (
										<button
											key={label}
											ref={(el) => (tabRefs.current[i] = el)}
											className={`type-tab${qrType === label ? ' active' : ''}${['Wifi', 'vCard', 'WhatsApp'].includes(label) ? ' disabled' : ''}`}
											disabled={['Wifi', 'vCard', 'WhatsApp'].includes(label)}
											onClick={() => setQrType(label)}>
											<Icon size={16} />
											{label}
										</button>
									))}
								</div>
								*/}

								{qrType === 'Wifi' ? (
									<div className='wifi-inputs'>
										<div className='input-with-action full-width'>
											<input
												type='text'
												placeholder='Network name (SSID)'
												value={wifiSsid}
												onChange={(e) => setWifiSsid(e.target.value)}
												onKeyDown={(e) => e.key === 'Enter' && generate()}
												maxLength={200}
											/>
										</div>
										<div className='input-with-action full-width'>
											<input
												type='password'
												placeholder='Password (optional)'
												value={wifiPassword}
												onChange={(e) => setWifiPassword(e.target.value)}
												onKeyDown={(e) => e.key === 'Enter' && generate()}
												maxLength={200}
											/>
											<GenerateButton
												onClick={generate}
												disabled={loading || wifiSsid.length === 0}
												hasText={wifiSsid.length > 0}
												shaking={shaking}
												onShakeEnd={() => setShaking(false)}
											/>
											{wifiSsid.length > 0 && (
												<ClearButton
													key='clear-wifi'
													onClick={() => {
														setWifiSsid('')
														setWifiPassword('')
													}}
												/>
											)}
										</div>
									</div>
								) : (
									<motion.div
										layout='size'
										className={`input-with-action${qrType === 'Text' ? ' full-width' : ''}`}
										transition={{ layout: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }}>
										<span ref={sizerRef} className='input-sizer' aria-hidden='true'>
											{text || 'domain.com'}
										</span>
										<input
											type='text'
											name='url'
											value={text}
											placeholder={
												qrType === 'Text'
													? 'You forget a thousand things everyday, pal.'
													: 'domain.com'
											}
											style={
												qrType !== 'Text' && inputWidth ? { width: `${inputWidth}px` } : undefined
											}
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
										{text.length > 0 && (
											<ClearButton key='clear-text' onClick={() => setText('')} />
										)}
									</motion.div>
								)}

								{error && <p className='error'>{error}</p>}
							</section>
						</div>

						<div className='qr-row'>
							{/* AnimatePresence is always mounted so initial={false} only
							    suppresses the track's enter on page load (present at mount),
							    but lets it swipe up when first added (new child). */}
							<AnimatePresence initial={false}>
								{!isEmpty && (
									// Carousel track: all domain cards in a row, translated so the
									// active (newest by default) card is centered. Generating a new
									// domain appends a card at the right and slides the track left,
									// so the previous one moves aside to make room.
									<motion.div
										key='track'
										className='qr-track'
										ref={trackRef}
										style={{ x: trackX }}
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										transition={{ opacity: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } }}
										data-single={domains.length === 1 || undefined}
										drag={domains.length > 1 ? 'x' : false}
										dragConstraints={{ left: -99999, right: 99999 }}
										dragElastic={0}
										dragMomentum={false}
										onDragStart={() => {
											isDraggingRef.current = true
										}}
										onDragEnd={(_, info) => {
											const track = trackRef.current
											if (!track) return
											const projectedX = trackX.get() + info.velocity.x * 0.1
											let nearestUrl = null
											let minDist = Infinity
											for (const [url, card] of Object.entries(cardRefs.current)) {
												const targetX =
													track.offsetWidth / 2 - (card.offsetLeft + card.offsetWidth / 2)
												if (Math.abs(projectedX - targetX) < minDist) {
													minDist = Math.abs(projectedX - targetX)
													nearestUrl = url
												}
											}
											requestAnimationFrame(() => {
												isDraggingRef.current = false
											})
											if (!nearestUrl) return
											if (nearestUrl !== activeUrl) {
												setActiveUrl(nearestUrl)
											} else {
												const card = cardRefs.current[nearestUrl]
												animateMotion(
													trackX,
													track.offsetWidth / 2 - (card.offsetLeft + card.offsetWidth / 2),
													{ duration: 0.35, ease: [0.16, 1, 0.3, 1] },
												)
											}
										}}>
										<AnimatePresence
											onExitComplete={() => {
												requestAnimationFrame(() => centerFnRef.current())
												if (domains.length === 0) setIsEmpty(true)
											}}>
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
														initial={{ opacity: 0, scale: 0.8 }}
														animate={{ opacity: 1, scale: isActive ? 1 : 0.9 }}
														exit={{ opacity: 0, scale: 0.9 }}
														transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
														onClick={() =>
															!isDraggingRef.current && !isActive && setActiveUrl(d.url)
														}>
														<div className='chip-row'>
															<button
																type='button'
																className={`domain-chip${shakingUrl === d.url ? ' shake' : ''}${newUrls.has(d.url) ? ' chip-entering' : ''}`}
																onClick={() => setActiveUrl(d.url)}
																onAnimationEnd={(e) => {
																	if (e.animationName === 'shake') setShakingUrl('')
																	if (e.animationName === 'chip-enter')
																		setNewUrls((prev) => {
																			const next = new Set(prev)
																			next.delete(d.url)
																			return next
																		})
																}}>
																{(() => {
																	const TypeIcon = QR_TYPES.find(
																		(t) => t.label === (d.type ?? 'Link'),
																	)?.Icon
																	return TypeIcon ? (
																		<TypeIcon size={14} style={{ flexShrink: 0 }} />
																	) : null
																})()}
																{d.type === 'Link' || !d.type
																	? displayUrl(d.url)
																	: d.type === 'Wifi'
																		? midTruncate(extractWifiSsid(d.url))
																		: midTruncate(d.url)}
															</button>
															<button
																type='button'
																className='chip-delete'
																onClick={(e) => {
																	e.stopPropagation()
																	deleteDomain(d.url)
																}}
																title='Delete'
																aria-label='Delete QR code'
																data-visitors-event='chip-delete'>
																<IconDelete size={18} />
															</button>
														</div>

														<div
															className={`preview${shakingPunchUrl === d.url ? ' shake' : ''}`}
															onAnimationEnd={(e) => {
																if (e.animationName === 'shake') setShakingPunchUrl('')
															}}>
															<div dangerouslySetInnerHTML={{ __html: svg }} />

															<div className='qr-actions'>
																<ConfirmButton
																	className='punch-btn'
																	onClick={() => copySvg(svg, buildFilename(d, punched))}
																	title='Copy SVG'
																	aria-label='Copy SVG'
																	data-visitors-event='copy-svg-btn'>
																	<IconCopy size={18} />
																	Copy SVG
																</ConfirmButton>

																<ConfirmButton
																	className='qr-download'
																	onClick={() => downloadSvg(svg, buildFilename(d, punched))}
																	title='Download SVG'
																	aria-label='Download SVG'
																	data-visitors-event='qr-download'>
																	<IconDownload size={18} />
																	Download
																</ConfirmButton>
															</div>
														</div>

														<button
															className={`secondary copy-svg-btn${punched ? ' no-icon' : ''}${swingingPunchUrl === d.url ? ' punching' : ''}`}
															onClick={() => {
																if (!punched) setSwingingPunchUrl(d.url)
																togglePunch(d.url)
															}}
															onAnimationEnd={() => setSwingingPunchUrl('')}
															disabled={punchingUrl === d.url}
															aria-pressed={punched}
															data-visitors-event='punch-btn'>
															{!punched && <IconPunch />}
															{punched ? 'Remove punch hole' : 'Punch a hole'}
														</button>
													</motion.div>
												)
											})}
										</AnimatePresence>
									</motion.div>
								)}
							</AnimatePresence>
							<AnimatePresence initial={false}>
								{isEmpty && (
									<motion.div
										key='placeholder'
										className='qr-col'
										initial={{ scale: 0.8, opacity: 0 }}
										animate={{ scale: 1, opacity: 1 }}
										transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
										<div className='preview'>
											<IllustrationQRPlaceholder style={{ opacity: 0.25 }} />
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</div>
					</div>
				</main>
				{todayCount !== null && (
					<motion.p
						className='today-counter'
						initial={{ opacity: 0, y: 16, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						transition={{ duration: 0.25, ease: 'easeOut' }}>
						<span key={dotKey} className='today-dot' />
						<NumberFlow className='today-count' value={todayCount ?? 0} /> codes generated today
					</motion.p>
				)}

			<AnimatePresence>
				{showPunchNotice && (
					<motion.div
						className='punch-notice'
						initial={{ x: isDesktop ? 0 : '-50%', y: 24, opacity: 0 }}
						animate={{ x: isDesktop ? 0 : '-50%', y: 0, opacity: 1 }}
						exit={{ x: isDesktop ? 0 : '-50%', y: 24, opacity: 0 }}
						transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
						<button className='punch-notice-close' onClick={dismissPunchNotice}>
							Close
						</button>
						<h3 className='punch-notice-title'>Punching is safe.</h3>
						<p className='punch-notice-body'>
							The QR is regenerated from scratch. Center modules are never drawn, not erased. QR
							codes at high error correction (level&nbsp;H) tolerate up to 30% module loss. The hole
							sits well within that threshold, so your code scans just as reliably.
						</p>
						<img src={aliDittherImg} alt='' className='punch-notice-image' />
					</motion.div>
				)}
			</AnimatePresence>
		</>
	)
}
