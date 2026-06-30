import { NextRequest, NextResponse } from 'next/server'
import { getConcept2AuthUrl } from '@/lib/concept2'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { randomBytes } from 'crypto'

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const state = randomBytes(16).toString('hex')
  const url = getConcept2AuthUrl(state)

  const response = NextResponse.redirect(url)
  response.cookies.set('concept2_state', state, { httpOnly: true, maxAge: 600 })
  return response
}
