import { Link, useLocation } from 'react-router-dom'
import { IconBadgeAlert, LogoMark, LogoOnlyQR } from './icons'

export default function Header() {
	const { pathname } = useLocation()
	const isAbout = pathname === '/about'

	return (
		<header className='site-header'>
			<div className='inner' style={{ position: 'relative' }}>
				<Link to={isAbout ? '/' : '/about'} className='about-btn'>
					<IconBadgeAlert size={16} />
					<span>{isAbout ? 'Exit' : 'About'}</span>
				</Link>
				<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', margin: '0 auto' }}>
					<Link id='page-title' to='/' style={{ display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
						<LogoMark height={67} style={{ display: 'block' }} />
						<LogoOnlyQR height={40} style={{ display: 'block' }} />
					</Link>
					<div className='header-left'>
						<h1 className='site-subtitle'>Free QR code generator for designers&nbsp;&&nbsp;developers</h1>
						<p className='value-prop'>
							No sign-ups, no paywall, no pointless customization, just good old SVGs.
						</p>
					</div>
				</div>
			</div>
		</header>
	)
}
