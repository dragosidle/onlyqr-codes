import { Fragment } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header.jsx'

export default function Layout() {
	const { pathname } = useLocation()

	const Wrapper = pathname === '/' ? 'div' : Fragment

	return (
		<Wrapper {...(pathname === '/' ? { className: 'above-fold' } : {})}>
			<Header />
			<Outlet />
		</Wrapper>
	)
}
