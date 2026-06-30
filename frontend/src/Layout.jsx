import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header.jsx'

export default function Layout() {
	const { pathname } = useLocation()

	if (pathname === '/') {
		return (
			<div className='above-fold'>
				<Header />
				<Outlet />
			</div>
		)
	}

	return (
		<>
			<Header />
			<Outlet />
		</>
	)
}
