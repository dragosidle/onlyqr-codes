import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
	IconBadgeAlert,
	IconGithub,
	IconPublicStats,
	IconStar,
	LogoMark,
	LogoOnlyQR,
} from './icons'

const GITHUB_REPO = 'dragosidle/onlyqr-codes'

function formatStarCount(count) {
	if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`
	return String(count)
}

export default function Header() {
	const { pathname } = useLocation()
	const isAbout = pathname === '/about'
	const [starCount, setStarCount] = useState(null)
	const [version, setVersion] = useState(null)

	useEffect(() => {
		fetch('/api/github/stars')
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (data && typeof data.count === 'number') {
					setStarCount(data.count)
				}
			})
			.catch(() => {})

		fetch('/api/github/version')
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (data && typeof data.version === 'string') {
					setVersion(data.version)
				}
			})
			.catch(() => {})
	}, [])

	return (
		<header className='site-header'>
			<div className='inner'>
				<Link to={isAbout ? '/' : '/about'} className='about-btn'>
					<IconBadgeAlert size={16} />
					<span>{isAbout ? 'Exit' : 'About'}</span>
				</Link>
				<div
					className='header-logo'
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						gap: '12px',
					}}>
					<Link
						id='page-title'
						to='/'
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '4px',
							textDecoration: 'none',
							color: 'inherit',
							cursor: 'pointer',
						}}>
						<LogoMark height={67} style={{ display: 'block' }} />
						<span style={{ position: 'relative', display: 'block', marginTop: '8px' }}>
							<LogoOnlyQR height={28} style={{ display: 'block' }} />
							{version !== null && <span className='header-version'>{version}</span>}
						</span>
					</Link>
					<div className='header-subtitles'>
						<h1 className='site-subtitle'>
							Free QR code generator for designers&nbsp;&&nbsp;developers
						</h1>
						<p className='value-prop'>
							No sign-ups, no paywall, no pointless customization, just good old SVGs.
						</p>
					</div>
				</div>
				<div className='header-right'>
					<a
						href='https://visitors.now/s/onlyqr.codes'
						target='_blank'
						rel='noopener noreferrer'
						className='about-btn stats-btn'
						data-visitors-event='stats-page'>
						<IconPublicStats size={16} />
						<span>Public stats</span>
					</a>
					<a
						href={`https://github.com/${GITHUB_REPO}`}
						target='_blank'
						rel='noopener noreferrer'
						className='about-btn github-btn'
						data-visitors-event='github-star'>
						<IconGithub size={16} />
						<span>Star on GitHub</span>
						{starCount !== null && (
							<span className='github-star-count'>
								<IconStar size={11} />
								{formatStarCount(starCount)}
							</span>
						)}
					</a>
				</div>
			</div>
		</header>
	)
}
