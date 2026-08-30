// The old feed documents the retired aggregate-board and Ava-family product.
// Keep its URL recoverable for existing feed readers without publishing stale
// product claims.
export function GET(request: Request): Response {
  return Response.redirect(new URL('/', request.url), 308)
}
