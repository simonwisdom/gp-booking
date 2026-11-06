import { Hono } from 'hono'

type Env = { Bindings: { DB: D1Database } }

const app = new Hono<Env>()

app.get('/', async (c) => {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM clinicians').first<{ n: number }>()
  return c.text(`GP booking: ${row?.n ?? 0} clinicians`)
})

export default app
