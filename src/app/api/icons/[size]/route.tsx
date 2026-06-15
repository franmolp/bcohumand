import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: sizeStr } = await params
  const size = Math.min(512, Math.max(16, parseInt(sizeStr) || 192))
  const fontSize = Math.round(size * 0.3)

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: 'white',
            fontSize: `${fontSize}px`,
            fontWeight: 800,
            fontFamily: 'sans-serif',
            letterSpacing: '-1px',
          }}
        >
          BCO
        </span>
      </div>
    ),
    { width: size, height: size }
  )
}
