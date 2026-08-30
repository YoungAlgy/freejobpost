import { permanentRedirect } from 'next/navigation'

export default async function RetiredCitySpecialtyPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  permanentRedirect(`/city/${encodeURIComponent(slug)}`)
}
