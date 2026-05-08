import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page Not Found',
  description:
    'The page you are looking for does not exist. Browse open healthcare jobs by specialty or state.',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-20 text-center">
      <h1 className="text-6xl font-black tracking-tight mb-4">404</h1>
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Page not found</h2>
      <p className="text-gray-600 mb-10 max-w-md mx-auto">
        That page doesn&rsquo;t exist or got moved. Try one of the links below.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
        <Link
          href="/jobs"
          className="inline-flex justify-center items-center bg-green-600 text-black px-6 py-3 font-black border-2 border-black hover:bg-green-500 transition-colors"
        >
          Browse all jobs
        </Link>
        <Link
          href="/post-job"
          className="inline-flex justify-center items-center bg-white text-black px-6 py-3 font-bold border-2 border-black hover:bg-black hover:text-white transition-colors"
        >
          Post a job free
        </Link>
        <Link
          href="/"
          className="inline-flex justify-center items-center text-gray-700 px-6 py-3 font-bold hover:underline"
        >
          Home
        </Link>
      </div>

      <div className="text-left border-2 border-black bg-gray-50 p-6">
        <h3 className="text-xs font-black tracking-wider uppercase mb-4">
          Popular searches
        </h3>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Florida jobs', href: '/state/florida' },
            { label: 'Texas jobs', href: '/state/texas' },
            { label: 'California jobs', href: '/state/california' },
            { label: 'Family medicine', href: '/specialty/family-medicine' },
            { label: 'Psychiatry', href: '/specialty/psychiatry' },
            { label: 'RN', href: '/specialty/registered-nurse' },
            { label: 'Cardiology', href: '/specialty/cardiology' },
            { label: 'How it works', href: '/how-it-works' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm px-3 py-1.5 border-2 border-black bg-white hover:bg-green-50 transition-colors font-bold"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
