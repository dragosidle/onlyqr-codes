import { Link, useLocation } from 'react-router-dom'
import { IconBadgeAlert } from './icons'
import trollImg from './troll-shader-2.png'

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
						<img
							src={trollImg}
							alt=''
							style={{ display: 'block', width: '72px', height: '72px' }}
						/>
						<p className='brand' style={{ margin: 0 }}>
							<span style={{ color: '#02AFEF' }}>Only</span>
							<span style={{ color: '#008CD0' }}>QR.codes</span>
						</p>
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
