import genericQrImg from './generic-qr.png'
import genericSvgCodeImg from './generic-svg-code.png'
import onlyQrCodeImg from './only-qr-code.png'
import onlyQrCodeCodeImg from './only-qr-code-code.png'
import { LogoMark } from './icons'

export default function About() {
	return (
		<>
			<main>
				<section className='manifesto'>
					<div className='inner'>
						<p>
							Most QR code tools want you to create an account, host your files, track your scans,
							and pick from seventeen color schemes. That's not a QR generator anymore, that's a
							platform trying to lock you in. This tool does one thing: it takes a string and turns
							it into a QR code.
						</p>
						<p>
							No sign-up, no file hosting, no analytics, no PNG or JPG, no "premium export" Just a
							clean SVG file. The only format a designer or developer actually needs. Scalable to
							any size, ready to drop straight into Figma, Illustrator, or your codebase.
						</p>
						<p>
							The QR code itself is generated the way it was meant to look: sharp, square dots on a
							clean grid. Rounded dots are a design trend that serves no one. They don't improve
							scannability, they don't make the code more legible, and they certainly don't make it
							more "on brand." A QR code is a machine-readable pattern, not a moodboard element.
							Rounding the corners is just visual noise dressed up as customization.
						</p>
						<p>Old school by design, enjoy it!</p>
					</div>
				</section>

				<section className='qr-examples'>
					<div className='qr-examples-columns'>
						<div className='qr-examples-column'>
							<div className='qr-example-square-wrap'>
								<span className='qr-example-label'>Other &ldquo;premium&rdquo; QR generators</span>
								<img src={genericQrImg} alt='Generic QR example' className='qr-example qr-example--square' />
							</div>
							<img src={genericSvgCodeImg} alt='Generic QR SVG code' className='qr-example qr-example--code' />
						</div>
						<div className='qr-examples-column'>
							<div className='qr-example-square-wrap'>
								<LogoMark height={64} className='qr-example-label qr-example-label--logo' />
								<img src={onlyQrCodeImg} alt='OnlyQR example' className='qr-example qr-example--square' />
							</div>
							<img src={onlyQrCodeCodeImg} alt='OnlyQR SVG code' className='qr-example qr-example--code' />
						</div>
					</div>
				</section>

				<section className='manifesto'>
					<div className='inner'>
						<p>
							Most, if not all generators produce SVGs made of hundreds of individual squares.
							Onlyqr.codes merges them all into a single unified shape before rendering. No stacked
							rectangles, no hidden seams. Logo holes are real cutouts baked into the geometry, not
							white boxes covering what's underneath. One clean path that scales perfectly.
						</p>
						<p>
							Because everything resolves to a single <code>&lt;path&gt;</code> element, the output
							file is a fraction of the size you'd get from a traditional rect-based generator.
						</p>
					</div>
				</section>
			</main>
		</>
	)
}
