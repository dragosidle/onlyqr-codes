import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header.jsx'

export default function Layout() {
	const { pathname } = useLocation()

	return (
		<div className={pathname === '/' ? 'above-fold' : undefined}>
			<Header />
			<Outlet />
		</div>
	)
}
