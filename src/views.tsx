import type { Child } from 'hono/jsx'
import { PRACTICE, type MessageRow, type OfferRow, type RequestRow, type SlotRow } from './db'
import { type DayHalf, MAX_OFFER_SLOTS, OFFER_HOURS, formatDay, formatWhen, londonParts } from './logic'

const CSS = `
*{box-sizing:border-box}body{font:16px/1.5 system-ui,sans-serif;margin:0;color:#1d2433;background:#f5f7fa}
header{background:#0b5e55;color:#fff;padding:.7rem 1rem;display:flex;gap:1rem;flex-wrap:wrap;align-items:center}
header a{color:#fff;text-decoration:none}header .brand{font-weight:700;margin-right:auto}
header form{margin:0}header button{background:none;border:1px solid #fff8;color:#fff;padding:.2rem .6rem}
main{max-width:820px;margin:1.2rem auto;padding:0 1rem}
.card{background:#fff;border:1px solid #dde3ea;border-radius:10px;padding:1rem 1.2rem;margin-bottom:1rem}
h1{font-size:1.5rem;margin:.2rem 0 1rem}h2{font-size:1.15rem;margin:.2rem 0 .7rem}
label{display:block;margin:.6rem 0 .2rem;font-weight:600}
input[type=text],input[type=tel],textarea{width:100%;padding:.55rem;border:1px solid #b8c2cc;border-radius:6px;font:inherit}
button,.btn{background:#0b5e55;color:#fff;border:0;border-radius:6px;padding:.6rem 1rem;font:inherit;cursor:pointer;text-decoration:none;display:inline-block}
button.secondary,.btn.secondary{background:#e8eef3;color:#1d2433}button.danger{background:#a33}
.check{display:flex;gap:.5rem;align-items:flex-start;font-weight:400}.check input{margin-top:.3rem}
table{border-collapse:collapse;width:100%}td,th{padding:.4rem .5rem;border-bottom:1px solid #eef1f4;text-align:left;vertical-align:top}
.grid td,.grid th{text-align:center}
.badge{display:inline-block;padding:.05rem .5rem;border-radius:99px;font-size:.8rem;font-weight:600;background:#e8eef3}
.urgent{background:#fde2e1;color:#8a1c1c}.routine{background:#e3f1ec;color:#0b5e55}
.open{background:#e3f1ec}.held{background:#fff3cd}.booked{background:#e8eef3;color:#667}
.notice{padding:.7rem 1rem;border-radius:8px;margin-bottom:1rem;background:#e3f1ec}.notice.error{background:#fde2e1}
.warn{background:#fff3cd;padding:.6rem .8rem;border-radius:8px;font-size:.95rem}
.muted{color:#667}.row{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}
.sms{border-left:4px solid #0b5e55}.sms p{margin:.3rem 0}
.split{display:grid;grid-template-columns:1fr 1fr;gap:1rem}@media(max-width:640px){.split{grid-template-columns:1fr}}
`

export function Layout(props: { title: string; children: Child }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title} · {PRACTICE}</title>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        <header>
          <a class="brand" href="/">{PRACTICE} · No-call booking</a>
          <a href="/request">Patient</a>
          <a href="/clinic">Clinic</a>
          <a href="/clinic/calendar">Calendar</a>
          <a href="/outbox">Texts</a>
          <form method="post" action="/demo/reset"><button>Reset demo</button></form>
        </header>
        <main>{props.children}</main>
      </body>
    </html>
  )
}

export function Notice(props: { msg?: { text: string; error?: boolean } }) {
  if (!props.msg) return null
  return <div class={props.msg.error ? 'notice error' : 'notice'}>{props.msg.text}</div>
}

const Urg = (p: { u: string }) => <span class={`badge ${p.u}`}>{p.u === 'urgent' ? 'Urgent' : 'Routine'}</span>

const CLINIC_STATUS: Record<string, string> = {
  new: 'To triage', offered: 'Offer sent', booked: 'Booked', needs_times: 'Waiting for more times', no_reply: 'No reply – offer expired',
}

export function Home() {
  return (
    <Layout title="Home">
      <h1>Book a GP appointment without phone tag</h1>
      <div class="card">
        <p>Patients say <b>when they're free</b> when they ask. The practice triages the request, sees which open slots fit,
          and texts 2–3 times. The patient taps one. Nobody has to call anybody.</p>
        <p class="muted">This demo shows both sides. Texts aren't really sent; they appear under <a href="/outbox">Texts</a>.</p>
        <div class="row">
          <a class="btn" href="/request">I'm a patient</a>
          <a class="btn secondary" href="/clinic">I'm the clinic</a>
        </div>
      </div>
    </Layout>
  )
}

export function AvailabilityGrid(props: { days: string[]; checked?: DayHalf[] }) {
  const isChecked = (day: string, half: string) => props.checked?.some((a) => a.day === day && a.half === half)
  return (
    <table class="grid">
      <thead><tr><th></th><th>Morning<br /><span class="muted">8:00–13:00</span></th><th>Afternoon<br /><span class="muted">13:00–18:30</span></th></tr></thead>
      <tbody>
        {props.days.map((d) => (
          <tr>
            <th style="text-align:left">{formatDay(d)}</th>
            {(['am', 'pm'] as const).map((h) => (
              <td><input type="checkbox" name="slot" value={`${d}:${h}`} checked={isChecked(d, h)} aria-label={`${formatDay(d)} ${h}`} style="width:1.3rem;height:1.3rem" /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function RequestForm(props: { days: string[]; errors?: string[]; values?: Record<string, string | string[]> }) {
  const v = (k: string) => (typeof props.values?.[k] === 'string' ? (props.values[k] as string) : '')
  const checked = ([] as string[]).concat(props.values?.slot ?? []).map((s) => {
    const [day, half] = s.split(':'); return { day, half } as DayHalf
  })
  return (
    <Layout title="Request an appointment">
      <h1>Request an appointment</h1>
      <p class="warn">If it's an emergency, call 999. For urgent advice out of hours, call NHS 111.</p>
      {props.errors && <div class="notice error"><ul style="margin:0;padding-left:1.2rem">{props.errors.map((e) => <li>{e}</li>)}</ul></div>}
      <form method="post" action="/request" class="card">
        <label for="name">Your name</label>
        <input type="text" id="name" name="name" value={v('name')} maxlength={80} required />
        <label for="phone">Mobile number</label>
        <input type="tel" id="phone" name="phone" value={v('phone')} placeholder="07700 900123" required />
        <label for="reason">What is it about?</label>
        <textarea id="reason" name="reason" rows={3} maxlength={500} required>{v('reason')}</textarea>
        <label>Do any of these apply?</label>
        <label class="check"><input type="checkbox" name="chest" checked={props.values?.chest === 'on'} /> Chest pain or difficulty breathing</label>
        <label class="check"><input type="checkbox" name="worse" checked={props.values?.worse === 'on'} /> It's getting worse quickly</label>
        <label>When could you come in? Tick every half-day that works.</label>
        <AvailabilityGrid days={props.days} checked={checked} />
        <p class="muted">We'll text you times that fit. You pick one from the link. No need to wait for a call.</p>
        <button>Send request</button>
      </form>
    </Layout>
  )
}

type Offer = (OfferRow & { slots: SlotRow[] }) | null

export function PatientStatus(props: {
  req: RequestRow; offer: Offer; booked: SlotRow | null; days: string[]; msg?: { text: string; error?: boolean }
}) {
  const { req, offer, booked } = props
  return (
    <Layout title="Your request">
      <h1>Hi {req.patient_name.split(' ')[0]}</h1>
      <Notice msg={props.msg} />
      {req.status === 'booked' && booked && (
        <div class="card"><h2>You're booked ✓</h2>
          <p><b>{formatWhen(booked.starts_at)}</b> with {booked.clinician} at {PRACTICE}.</p></div>
      )}
      {req.status === 'offered' && offer?.status === 'pending' && (
        <form method="post" action={`/r/${req.token}/accept`} class="card">
          <h2>Pick a time</h2>
          <p class="muted">These are held for you until {formatWhen(offer.expires_at)}.</p>
          {offer.slots.map((s) => (
            <p><button name="slot_id" value={String(s.id)} style="width:100%;text-align:left">
              {formatWhen(s.starts_at)} · {s.clinician} ({s.duration_min} min)</button></p>
          ))}
        </form>
      )}
      {req.status === 'needs_times' && (
        <form method="post" action={`/r/${req.token}/times`} class="card">
          <h2>None of your times were free</h2>
          <p>Please tick a few more half-days you could come in.</p>
          <AvailabilityGrid days={props.days} />
          <p><button>Add these times</button></p>
        </form>
      )}
      {(req.status === 'new' || req.status === 'no_reply') && (
        <div class="card"><h2>{req.status === 'new' ? 'Request received' : 'Your offer expired'}</h2>
          <p>{req.status === 'new'
            ? `${PRACTICE} will text you times that fit. You don't need to do anything or wait for a call.`
            : `The times we held have been released. We'll text you new ones. Your request hasn't been cancelled.`}</p></div>
      )}
      <div class="card muted"><b>Your request:</b> {req.reason}</div>
    </Layout>
  )
}

export function ClinicQueue(props: { requests: RequestRow[]; bookings: SlotRow[]; msg?: { text: string; error?: boolean } }) {
  const toAct = props.requests.filter((r) => r.status === 'new' || r.status === 'no_reply')
  const waiting = props.requests.filter((r) => r.status === 'offered' || r.status === 'needs_times')
  const Row = (p: { r: RequestRow }) => (
    <tr>
      <td><a href={`/clinic/requests/${p.r.id}`}>{p.r.patient_name}</a><br /><span class="muted">{p.r.reason.slice(0, 70)}</span></td>
      <td><Urg u={p.r.urgency ?? p.r.suggested_urgency} />{!p.r.urgency && <><br /><span class="muted">suggested</span></>}</td>
      <td>{CLINIC_STATUS[p.r.status]}<br /><span class="muted">{formatWhen(p.r.created_at)}</span></td>
    </tr>
  )
  return (
    <Layout title="Clinic queue">
      <h1>Clinic queue</h1>
      <Notice msg={props.msg} />
      <div class="card"><h2>Needs action ({toAct.length})</h2>
        {toAct.length === 0 ? <p class="muted">Nothing to triage. 🎉</p>
          : <table><tbody>{toAct.map((r) => <Row r={r} />)}</tbody></table>}
      </div>
      <div class="card"><h2>Waiting on patient ({waiting.length})</h2>
        {waiting.length === 0 ? <p class="muted">None.</p>
          : <table><tbody>{waiting.map((r) => <Row r={r} />)}</tbody></table>}
      </div>
      <div class="card"><h2>Booked through this app ({props.bookings.length})</h2>
        {props.bookings.length === 0 ? <p class="muted">None yet.</p> : (
          <table><tbody>{props.bookings.map((s) => (
            <tr><td>{formatWhen(s.starts_at)}</td><td>{s.clinician}</td>
              <td>{props.requests.find((r) => r.id === s.request_id)?.patient_name}</td></tr>
          ))}</tbody></table>
        )}
      </div>
    </Layout>
  )
}

export function ClinicRequest(props: {
  req: RequestRow; availability: DayHalf[]; matches: SlotRow[]; offer: Offer; booked: SlotRow | null
  msg?: { text: string; error?: boolean }
}) {
  const { req, offer } = props
  const inQueue = req.status === 'new' || req.status === 'no_reply'
  const urgency = req.urgency ?? req.suggested_urgency
  const flags = [req.flag_chest_or_breathing && 'Chest pain or difficulty breathing', req.flag_rapidly_worse && 'Getting worse quickly'].filter(Boolean)
  return (
    <Layout title={req.patient_name}>
      <p><a href="/clinic">← Queue</a></p>
      <h1>{req.patient_name} <Urg u={urgency} /></h1>
      <Notice msg={props.msg} />
      <div class="split">
        <div class="card">
          <h2>Request</h2>
          <p>{req.reason}</p>
          <p><b>Red flags:</b> {flags.length ? flags.join(', ') : 'none ticked'}</p>
          <p class="muted">{req.phone} · sent {formatWhen(req.created_at)} · {CLINIC_STATUS[req.status]}</p>
        </div>
        <div class="card">
          <h2>Free</h2>
          <ul style="margin:0;padding-left:1.2rem">
            {props.availability.map((a) => <li>{formatDay(a.day)} {a.half === 'am' ? 'morning' : 'afternoon'}</li>)}
          </ul>
        </div>
      </div>

      {inQueue && (
        <form method="post" action={`/clinic/requests/${req.id}/urgency`} class="card">
          <h2>1. Triage</h2>
          <p>Suggested from the patient's answers: <Urg u={req.suggested_urgency} />
            {req.urgency ? <> · confirmed as <Urg u={req.urgency} /></> : <> · <b>not confirmed yet</b></>}</p>
          <div class="row">
            <button name="urgency" value="urgent" class={urgency === 'urgent' ? '' : 'secondary'}>Urgent (within 24h, {OFFER_HOURS.urgent}h to reply)</button>
            <button name="urgency" value="routine" class={urgency === 'routine' ? '' : 'secondary'}>Routine ({OFFER_HOURS.routine}h to reply)</button>
          </div>
        </form>
      )}

      {inQueue && req.urgency && (
        props.matches.length > 0 ? (
          <form method="post" action={`/clinic/requests/${req.id}/offer`} class="card">
            <h2>2. Offer times</h2>
            <p class="muted">Open slots inside the patient's free times{req.urgency === 'urgent' ? ', within the next 24 hours' : ''}. Pick up to {MAX_OFFER_SLOTS}.</p>
            {props.matches.slice(0, 12).map((s, i) => (
              <label class="check"><input type="checkbox" name="slot_id" value={String(s.id)} checked={i < MAX_OFFER_SLOTS} />
                {formatWhen(s.starts_at)} · {s.clinician} ({s.role})</label>
            ))}
            <p><button>Text these times to the patient</button></p>
          </form>
        ) : (
          <form method="post" action={`/clinic/requests/${req.id}/ask-times`} class="card">
            <h2>2. No open slot fits</h2>
            <p>None of the open slots fall inside the patient's free times{req.urgency === 'urgent' ? ' in the next 24 hours. For an urgent case you may want to phone them' : ''}.</p>
            <button>Ask the patient for more times</button>
          </form>
        )
      )}

      {req.status === 'offered' && offer?.status === 'pending' && (
        <div class="card">
          <h2>Offer sent</h2>
          <p>Held until <b>{formatWhen(offer.expires_at)}</b>:</p>
          <ul>{offer.slots.map((s) => <li>{formatWhen(s.starts_at)} · {s.clinician}</li>)}</ul>
          <form method="post" action={`/clinic/requests/${req.id}/expire`}>
            <button class="secondary">Demo: expire this offer now</button>
          </form>
        </div>
      )}
      {req.status === 'needs_times' && <div class="card"><p>Waiting for the patient to add more times.</p></div>}
      {req.status === 'booked' && props.booked && (
        <div class="card"><h2>Booked ✓</h2><p>{formatWhen(props.booked.starts_at)} with {props.booked.clinician}.</p></div>
      )}
      <p class="muted">Patient's link: <a href={`/r/${req.token}`}>/r/{req.token.slice(0, 8)}…</a></p>
    </Layout>
  )
}

export function Calendar(props: { days: string[]; slots: SlotRow[] }) {
  const clinicians = [...new Map(props.slots.map((s) => [s.clinician_id, s.clinician])).entries()]
  return (
    <Layout title="Calendar">
      <h1>Calendar</h1>
      <p class="row"><span class="badge open">open</span><span class="badge held">held for an offer</span><span class="badge booked">booked</span></p>
      {props.days.map((day) => {
        const daySlots = props.slots.filter((s) => londonParts(new Date(s.starts_at)).day === day)
        if (daySlots.length === 0) return <div class="card"><h2>{formatDay(day)}</h2><p class="muted">Closed</p></div>
        return (
          <div class="card"><h2>{formatDay(day)}</h2>
            <table><tbody>{clinicians.map(([id, name]) => (
              <tr><th style="white-space:nowrap">{name}</th>
                <td><div class="row">{daySlots.filter((s) => s.clinician_id === id).map((s) => (
                  <span class={`badge ${s.status}`}>{formatWhen(s.starts_at).split(', ')[1] ?? formatWhen(s.starts_at)}</span>
                ))}</div></td></tr>
            ))}</tbody></table>
          </div>
        )
      })}
    </Layout>
  )
}

export function Outbox(props: { messages: MessageRow[] }) {
  return (
    <Layout title="Texts">
      <h1>Texts sent</h1>
      <p class="muted">In the real product these go out as SMS from "{PRACTICE}", so patients know who it is. Newest first.</p>
      {props.messages.length === 0 && <p>No texts yet.</p>}
      {props.messages.map((m) => (
        <div class="card sms">
          <p class="muted">To {m.to_phone} · {formatWhen(m.created_at)} · <a href={`/r/${m.token}`}>open patient link</a></p>
          <p>{m.body}</p>
        </div>
      ))}
    </Layout>
  )
}

export function NotFound() {
  return <Layout title="Not found"><h1>Not found</h1><p>That link doesn't match a request. <a href="/">Go home</a>.</p></Layout>
}
