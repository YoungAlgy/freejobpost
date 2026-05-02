#!/usr/bin/env node
// Add a domain to AWS SES + retrieve the DNS records needed to verify it.
//
// Usage:
//   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-east-1 \
//     node scripts/ses_verify_domain.mjs <domain>
//
// Example:
//   ... node scripts/ses_verify_domain.mjs freeresumepost.co
//
// What this does:
//   1. Calls SES VerifyDomainIdentity for the domain (idempotent — safe to re-run).
//   2. Calls SES VerifyDomainDkim to get 3 DKIM CNAME records.
//   3. Prints all the DNS records needed at the registrar (name.com) in a
//      copy-paste-friendly format.
//
// IAM permissions required:
//   ses:VerifyDomainIdentity, ses:VerifyDomainDkim,
//   ses:GetIdentityVerificationAttributes, ses:GetIdentityDkimAttributes
//
// References:
//   https://docs.aws.amazon.com/ses/latest/APIReference/API_VerifyDomainIdentity.html
//   https://docs.aws.amazon.com/ses/latest/APIReference/API_VerifyDomainDkim.html

import crypto from 'node:crypto'

const accessKey = process.env.AWS_ACCESS_KEY_ID
const secretKey = process.env.AWS_SECRET_ACCESS_KEY
const region = process.env.AWS_REGION || 'us-east-1'
const domain = process.argv[2]

if (!accessKey || !secretKey) {
  console.error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY required')
  process.exit(1)
}
if (!domain) {
  console.error('Usage: node scripts/ses_verify_domain.mjs <domain>')
  process.exit(1)
}

async function sesCall(action, params = {}) {
  const formParams = { Action: action, Version: '2010-12-01', ...params }
  const body = new URLSearchParams(formParams).toString()
  const host = `email.${region}.amazonaws.com`
  const url = `https://${host}/`

  const headers = await sigV4Sign({
    method: 'POST',
    host,
    path: '/',
    body,
    region,
    service: 'email',
    accessKey,
    secretKey,
  })

  const res = await fetch(url, { method: 'POST', headers, body })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${action} failed (${res.status}): ${text.slice(0, 500)}`)
  }
  return text
}

function xmlExtract(xml, tag) {
  const matches = [...xml.matchAll(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g'))]
  return matches.map((m) => m[1])
}

console.log(`\n=== Setting up SES for ${domain} (region ${region}) ===\n`)

// Step 1: VerifyDomainIdentity → returns a TXT record token for _amazonses.<domain>
const verifyRes = await sesCall('VerifyDomainIdentity', { Domain: domain })
const verifyToken = xmlExtract(verifyRes, 'VerificationToken')[0]
if (!verifyToken) throw new Error('No verification token returned')
console.log(`✓ Domain identity registered (VerificationToken: ${verifyToken.slice(0, 12)}...)`)

// Step 2: VerifyDomainDkim → returns 3 DKIM tokens
const dkimRes = await sesCall('VerifyDomainDkim', { Domain: domain })
const dkimTokens = xmlExtract(dkimRes, 'member')
if (dkimTokens.length !== 3) throw new Error(`Expected 3 DKIM tokens, got ${dkimTokens.length}`)
console.log(`✓ DKIM tokens minted (${dkimTokens.length} CNAMEs to publish)\n`)

// Step 3: Print DNS records
console.log(`──────────────────────────────────────────────────────────────────────`)
console.log(`DNS records to add at name.com for ${domain}:`)
console.log(`──────────────────────────────────────────────────────────────────────\n`)

console.log(`1. Domain verification (TXT)`)
console.log(`   Type:  TXT`)
console.log(`   Host:  _amazonses.${domain}    (or just "_amazonses" depending on registrar UI)`)
console.log(`   Value: "${verifyToken}"`)
console.log(``)

console.log(`2. DKIM signing (3 × CNAME)`)
for (let i = 0; i < dkimTokens.length; i++) {
  console.log(`   #${i + 1}:`)
  console.log(`     Type:  CNAME`)
  console.log(`     Host:  ${dkimTokens[i]}._domainkey.${domain}`)
  console.log(`     Value: ${dkimTokens[i]}.dkim.amazonses.com`)
}
console.log(``)

console.log(`3. SPF (TXT, only if no existing SPF record)`)
console.log(`   If ${domain} already has an SPF record (v=spf1 ...), ADD`)
console.log(`   "include:amazonses.com" to it. If not, create:`)
console.log(`   Type:  TXT`)
console.log(`   Host:  ${domain}    (apex / root)`)
console.log(`   Value: "v=spf1 include:amazonses.com ~all"`)
console.log(``)

console.log(`4. DMARC (TXT, recommended)`)
console.log(`   Type:  TXT`)
console.log(`   Host:  _dmarc.${domain}`)
console.log(`   Value: "v=DMARC1; p=none; rua=mailto:dmarc@${domain}"`)
console.log(`   (Start at p=none for monitoring; ratchet to p=quarantine after 30+ days clean)`)
console.log(``)

console.log(`──────────────────────────────────────────────────────────────────────`)
console.log(`After publishing, SES verifies within ~10-20 minutes. Re-run this`)
console.log(`script to check status, or use ses_check_status.mjs.`)
console.log(`──────────────────────────────────────────────────────────────────────\n`)

// ─── SigV4 helper (same algorithm as the edge function ses.ts) ─────────────

async function sigV4Sign(p) {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256Hex(p.body)

  const canonicalHeaders =
    `content-type:application/x-www-form-urlencoded; charset=UTF-8\n` +
    `host:${p.host}\n` +
    `x-amz-date:${amzDate}\n`
  const signedHeaders = 'content-type;host;x-amz-date'
  const canonicalRequest = [
    p.method, p.path, '', canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/${p.region}/${p.service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest),
  ].join('\n')

  const kDate = hmac(`AWS4${p.secretKey}`, dateStamp)
  const kRegion = hmac(kDate, p.region)
  const kService = hmac(kRegion, p.service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = hmac(kSigning, stringToSign).toString('hex')

  return {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Host': p.host,
    'X-Amz-Date': amzDate,
    'Authorization':
      `AWS4-HMAC-SHA256 Credential=${p.accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex')
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest()
}
