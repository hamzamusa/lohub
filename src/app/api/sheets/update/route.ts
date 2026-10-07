import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { isSheetsF1AppendEnabled } from '@/lib/sheetsF1AppendEnabled'
import OpenAI from 'openai'

function getGoogleSheetsClient() {
  const credentialsJson = process.env.GOOGLE_VISION || process.env.GOOGLE_SHEETS
  if (!credentialsJson?.trim()) {
    throw new Error('GOOGLE_VISION or GOOGLE_SHEETS environment variable is not set')
  }

  let credentials: Record<string, unknown>
  try {
    credentials = JSON.parse(credentialsJson)
  } catch (error) {
    throw new Error(
      `Failed to parse Google credentials JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }
  return new OpenAI({ apiKey })
}

async function translateToEnglish(text: string): Promise<string> {
  try {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are a translator. Translate the given Arabic text to English. Keep any numbers and special characters as is. Return ONLY the translated text, nothing else.',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0.3,
    })

    return completion.choices[0]?.message?.content || text
  } catch (error) {
    console.error('Translation error:', error)
    return text
  }
}

export async function POST(req: Request) {
  if (!isSheetsF1AppendEnabled()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: 'Google Sheet F1 append is disabled (SHEETS_F1_APPEND_ENABLED is not true)',
    })
  }

  try {
    const supabase = getSupabaseRouteClient()
    const data = await req.json()

    console.log('Received data:', {
      emergency_room_id: data.emergency_room_id,
      err_id: data.err_id,
      err_name: data.err_name,
      state_name: data.state_name,
    })

    const { data: roomData, error: roomError } = await supabase
      .from('emergency_rooms')
      .select('name, name_ar, err_code')
      .eq('id', data.emergency_room_id)
      .single()

    if (roomError) {
      console.error('Error fetching ERR name:', roomError)
      console.error('emergency_room_id:', data.emergency_room_id)
    } else {
      console.log('Successfully fetched room data:', roomData)
    }

    const [translatedObjectives, translatedTimeframe, translatedSupport] = await Promise.all([
      translateToEnglish(data.project_objectives),
      translateToEnglish(data.estimated_timeframe),
      translateToEnglish(data.additional_support),
    ])

    const totalUSD = data.expenses.reduce((sum: number, exp: any) => sum + (exp.total_cost || 0), 0)

    console.log('Room data:', roomData)
    console.log('Using ERR name:', roomData?.name)

    const sheetRow = [
      data.grant_id,
      roomData?.err_code || data.err_id,
      roomData?.name || '',
      'Pending',
      new Date().toLocaleDateString(),
      '',
      '',
      '',
      data.donor_name,
      '',
      data.state_name,
      '',
      data.primary_sectors || '',
      data.secondary_sectors || '',
      translatedObjectives,
      data.estimated_beneficiaries,
      '',
      '',
      '',
      totalUSD,
      '',
      '',
      '',
      '',
      translatedTimeframe,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      translatedSupport,
      '',
      '',
    ]

    const sheets = getGoogleSheetsClient()
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Activities!A:AQ',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [sheetRow],
      },
    })

    console.log('Sheet response:', response.data)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating Google Sheet:', error)
    return NextResponse.json(
      {
        error: 'Failed to update Google Sheet',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
