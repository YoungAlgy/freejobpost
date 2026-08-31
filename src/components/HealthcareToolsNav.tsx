const PRODUCTS = [
  {
    id: 'jobs',
    name: 'FreeJobPost',
    detail: 'Jobs',
    href: 'https://freejobpost.co',
  },
  {
    id: 'resumes',
    name: 'FreeResumePost',
    detail: 'Resumes',
    href: 'https://www.freeresumepost.co',
  },
] as const

type HealthcareToolsNavProps = {
  current: (typeof PRODUCTS)[number]['id']
}

export function HealthcareToolsNav({ current }: HealthcareToolsNavProps) {
  return (
    <div className="border-b border-slate-200 bg-slate-50">
      <nav
        aria-label="Healthcare hiring tools"
        className="mx-auto flex min-h-10 max-w-5xl items-center justify-between gap-3 px-4 py-1.5 sm:px-6"
      >
        <span className="hidden text-xs font-semibold text-slate-500 sm:inline">
          Free healthcare hiring tools
        </span>
        <div className="flex w-full items-center gap-1 text-xs sm:w-auto">
          {PRODUCTS.map((product) => {
            const isCurrent = product.id === current

            return (
              <a
                key={product.id}
                href={product.href}
                aria-current={isCurrent ? 'page' : undefined}
                aria-label={`${product.name}${isCurrent ? ', current site' : ''}`}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 font-semibold transition-colors sm:flex-none ${
                  isCurrent
                    ? 'bg-white text-[#17324D] shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-600 hover:bg-white hover:text-[#17324D]'
                }`}
              >
                <span>{product.name}</span>
                <span className="hidden font-normal text-slate-400 lg:inline">
                  {product.detail}
                </span>
              </a>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
