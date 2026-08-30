import { permanentRedirect } from 'next/navigation'

export default async function RetiredSpecialtyStatePaginationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  permanentRedirect(`/specialty/${encodeURIComponent(slug)}`)
}
