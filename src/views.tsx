import type { Child } from 'hono/jsx'
import { PRACTICE, type MessageRow, type OfferRow, type RequestRow, type SlotRow } from './db'
import { type DayHalf, type FieldError, MAX_OFFER_SLOTS, OFFER_HOURS, formatDay, formatWhen, londonParts } from './logic'

// Visual language follows GOV.UK / NHS design-system patterns (plain type, high contrast,
// big targets, yellow focus ring, error summary) without their branding.
const CSS = `
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:Arial,"Helvetica Neue",sans-serif;font-size:19px;line-height:1.4;color:#0b0c0c;background:#f0f4f5}
@media(max-width:640px){body{font-size:16px}}
a{color:#1d70b8;text-decoration:underline;text-underline-offset:.15em}a:hover{color:#003078;text-decoration-thickness:3px}
a:focus,button:focus,input:focus,textarea:focus,summary:focus{outline:3px solid transparent;background:#ffdd00;color:#0b0c0c;box-shadow:0 -2px #ffdd00,0 4px #0b0c0c;text-decoration:none}
input:focus,textarea:focus{background:#fff;box-shadow:inset 0 0 0 2px #0b0c0c;outline:3px solid #ffdd00;outline-offset:0}
.skip{position:absolute;left:-9999px}.skip:focus{left:1rem;top:.5rem;padding:.4rem .6rem;z-index:9}
header.site{background:#0b4f4a;color:#fff;border-bottom:8px solid #2a9d8f}
header.site .in{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem 1.4rem;padding:.8rem 1rem}
header.site .brand{color:#fff;font-weight:700;font-size:1.15rem;text-decoration:none;margin-right:auto}
header.site .brand span{display:block;font-weight:400;font-size:.85rem;opacity:.9}
header.site nav a{color:#fff;font-weight:700;text-decoration:none;padding:.3rem 0;border-bottom:4px solid transparent}
header.site nav a[aria-current]{border-bottom-color:#fff}
header.site nav{display:flex;gap:1.2rem;flex-wrap:wrap}
.in{max-width:960px;margin:0 auto}.wide .in{max-width:1280px}
.phase{background:#fff;border-bottom:1px solid #b1b4b6;font-size:.85rem}
.phase .in{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;padding:.5rem 1rem}
.phase form{margin:0 0 0 auto}
.tag{display:inline-block;padding:.15rem .5rem;font-weight:700;font-size:.85rem;line-height:1.2;border-radius:0}
.tag.demo{background:#1d70b8;color:#fff;text-transform:uppercase;letter-spacing:.03em}
.tag.urgent{background:#f4cdc6;color:#2a0b06}.tag.routine{background:#cce2d8;color:#005a30}
.tag.grey{background:#e5e6e7;color:#0b0c0c}.tag.yellow{background:#fff7bf;color:#594d00}.tag.blue{background:#bbd4ea;color:#0c2d4a}
main{display:block;padding:1.2rem 1rem 3rem}
h1{font-size:2rem;line-height:1.15;margin:.3rem 0 1.2rem}h2{font-size:1.35rem;margin:0 0 .8rem}
@media(max-width:640px){h1{font-size:1.6rem}}
p{margin:0 0 1rem}.lede{font-size:1.2rem}
.hint{color:#505a5f;display:block;margin-bottom:.4rem;font-weight:400}
.back{display:inline-block;margin-bottom:1rem;font-size:.9rem;color:#0b0c0c}.back:before{content:"‹ ";font-weight:700}
.card{background:#fff;border:1px solid #d8dde0;border-bottom:4px solid #d8dde0;padding:1.2rem 1.4rem;margin-bottom:1.4rem}
@media(max-width:640px){.card{padding:1rem}}
.field{margin-bottom:1.6rem}.field.err{border-left:5px solid #d4351c;padding-left:1rem}
.field .msg{display:block;color:#d4351c;font-weight:700;margin-bottom:.4rem}
label.l,legend.l{display:block;font-weight:700;margin-bottom:.3rem;font-size:1.05rem}
fieldset{border:0;padding:0;margin:0}
input[type=text],input[type=tel],textarea{width:100%;max-width:30em;padding:.4rem .5rem;border:2px solid #0b0c0c;border-radius:0;font:inherit}
.field.err input,.field.err textarea{border-color:#d4351c}
.cb{display:flex;gap:.7rem;align-items:center;margin:.5rem 0;cursor:pointer;font-weight:400}
.cb input,.grid input{width:32px;height:32px;margin:0;accent-color:#0b0c0c;flex:none}
button,.btn{display:inline-block;font:inherit;font-weight:400;line-height:1.2;padding:.55rem .9rem .45rem;border:2px solid transparent;border-radius:0;
  background:#00703c;color:#fff;box-shadow:0 2px 0 #002d18;cursor:pointer;text-decoration:none;margin:0 .6rem .8rem 0}
button:hover,.btn:hover{background:#005a30;color:#fff}
button.secondary,.btn.secondary{background:#f3f2f1;color:#0b0c0c;box-shadow:0 2px 0 #929191}button.secondary:hover{background:#dbdad9}
button.choice{display:block;width:100%;text-align:left;background:#fff;color:#0b0c0c;border:2px solid #0b0c0c;box-shadow:0 2px 0 #0b0c0c;padding:.8rem 1rem}
button.choice:hover{background:#f3f2f1}button.choice b{display:block;font-size:1.1rem}
button.selected{outline:3px solid #0b0c0c}
.error-summary{border:5px solid #d4351c;background:#fff;padding:1rem 1.2rem;margin-bottom:1.6rem}
.error-summary h2{margin-bottom:.6rem}.error-summary ul{margin:0;padding-left:1.1rem}.error-summary a{color:#d4351c;font-weight:700}
.notice{border-left:10px solid #1d70b8;background:#fff;padding:.8rem 1rem;margin-bottom:1.4rem;font-weight:700}
.notice.error{border-color:#d4351c}.notice.ok{border-color:#00703c}
.warning{display:flex;gap:.8rem;align-items:flex-start;font-weight:700;margin:0 0 1.4rem}
.warning i{flex:none;width:34px;height:34px;border-radius:50%;background:#0b0c0c;color:#fff;font-style:normal;font-size:1.4rem;display:flex;align-items:center;justify-content:center}
.panel{background:#00703c;color:#fff;text-align:center;padding:1.6rem 1rem;margin-bottom:1.4rem}.panel h1{margin:0 0 .5rem;color:#fff}
.panel p{font-size:1.2rem;margin:0}
.inset{border-left:10px solid #b1b4b6;padding:.4rem 0 .4rem 1rem;margin:0 0 1.2rem}
dl.summary{margin:0;display:grid;grid-template-columns:minmax(8em,30%) 1fr;border-top:1px solid #b1b4b6}
dl.summary dt,dl.summary dd{margin:0;padding:.6rem .6rem .6rem 0;border-bottom:1px solid #b1b4b6}dl.summary dt{font-weight:700}
table.t{border-collapse:collapse;width:100%}table.t th,table.t td{text-align:left;padding:.6rem .8rem .6rem 0;border-bottom:1px solid #b1b4b6;vertical-align:top}
table.t th{font-weight:700}
.grid{border-collapse:collapse}.grid th,.grid td{padding:.35rem .9rem .35rem 0;border-bottom:1px solid #d8dde0;text-align:left}
.grid td{text-align:center}
.muted{color:#505a5f}.row{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}
.two{display:grid;grid-template-columns:1fr 1fr;gap:1.4rem}@media(max-width:720px){.two{grid-template-columns:1fr}}
.steps{counter-reset:s;list-style:none;padding:0;margin:0 0 1rem}.steps li{counter-increment:s;padding-left:2.6rem;position:relative;margin-bottom:.8rem}
.steps li:before{content:counter(s);position:absolute;left:0;top:-.1rem;width:1.9rem;height:1.9rem;border-radius:50%;background:#0b4f4a;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center}

/* Calendar week view */
.cal-wrap{overflow-x:auto;background:#fff;border:1px solid #b1b4b6}
.cal{display:grid;grid-template-columns:56px repeat(7,minmax(130px,1fr));min-width:980px;font-size:13px}
.cal .head{position:sticky;top:0;background:#fff;border-bottom:2px solid #0b0c0c;padding:.4rem .3rem;text-align:center;z-index:2}
.cal .head b{display:block;font-size:15px}.cal .head.today b{color:#fff;background:#1d70b8;display:inline-block;padding:0 .4rem;border-radius:3px}
.cal .lanes{display:grid;font-size:11px;color:#505a5f;margin-top:.2rem}
.cal .times{position:relative;border-right:1px solid #b1b4b6}
.cal .times span{position:absolute;right:6px;transform:translateY(-50%);color:#505a5f;font-size:12px}
.cal .col{position:relative;border-right:1px solid #e5e6e7;background-image:repeating-linear-gradient(#fff 0,#fff calc(var(--hr) - 1px),#e5e6e7 calc(var(--hr) - 1px),#e5e6e7 var(--hr))}
.cal .col.closed{background:#f3f2f1}
.cal .ev{position:absolute;margin:0 2px;padding:2px 3px;border-radius:3px;overflow:hidden;white-space:nowrap;line-height:1.2;text-decoration:none;color:#0b0c0c;border-left:4px solid;font-size:12px}
.cal .ev small{display:block;font-size:11px;font-weight:400;overflow:hidden;text-overflow:ellipsis}
.cal .ev.open{background:#e8f4ee;border-color:#00703c}
.cal .ev.held{background:repeating-linear-gradient(45deg,#fff7bf 0 6px,#fff2a0 6px 12px);border-color:#b58800}
.cal .ev.booked{background:#e5e6e7;border-color:#6f777b;color:#505a5f}
.cal .ev.mine{background:#d2e2f1;border-color:#1d70b8;color:#0c2d4a;font-weight:700}
.cal .ev.past{opacity:.45}
.cal .now{position:absolute;left:0;right:0;height:2px;background:#d4351c;z-index:1}.cal .now:before{content:"";position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:50%;background:#d4351c}
.key{display:flex;flex-wrap:wrap;gap:.4rem 1.2rem;margin:0 0 1rem;font-size:.9rem;align-items:center}
.key .sw{display:inline-block;width:14px;height:14px;border-left:4px solid;margin-right:.35rem;vertical-align:-2px}

/* Texts */
.phone{max-width:420px;margin:0 auto;background:#fff;border:1px solid #b1b4b6;border-radius:28px;overflow:hidden;box-shadow:0 8px 24px #0b0c0c22}
.phone .bar{background:#f7f7f8;border-bottom:1px solid #d8dde0;padding:.8rem 1rem;text-align:center;position:relative}
.phone .bar .avatar{margin:0 auto .3rem}.phone .bar b{display:block}.phone .bar small{color:#505a5f}
.phone .bar a{position:absolute;left:1rem;top:1.2rem;font-size:.9rem}
.thread{padding:1rem .8rem 1.4rem;display:flex;flex-direction:column;gap:.5rem;font-size:16px}
.thread time{display:block;text-align:center;color:#6f777b;font-size:12px;margin:.6rem 0 .1rem}
.bubble{align-self:flex-start;max-width:85%;background:#e9e9eb;padding:.55rem .8rem;border-radius:18px 18px 18px 4px;overflow-wrap:anywhere}
.bubble a{color:#0b5cad}
.avatar{width:44px;height:44px;border-radius:50%;background:#0b4f4a;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
.convos{list-style:none;margin:0;padding:0;background:#fff;border:1px solid #b1b4b6;max-width:640px}
.convos a{display:flex;gap:.8rem;align-items:center;padding:.8rem 1rem;border-bottom:1px solid #e5e6e7;text-decoration:none;color:#0b0c0c}
.convos a:hover{background:#f3f2f1}.convos .meta{flex:1;min-width:0}
.convos .top{display:flex;justify-content:space-between;gap:.5rem}.convos .top small{color:#505a5f;white-space:nowrap}
.convos .prev{color:#505a5f;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`

type Section = 'home' | 'patient' | 'clinic' | 'calendar' | 'texts'

export function Layout(props: { title: string; section?: Section; wide?: boolean; children: Child }) {
  const nav: [Section, string, string][] = [
    ['patient', '/request', 'Request an appointment'], ['clinic', '/clinic', 'Clinic queue'],
    ['calendar', '/clinic/calendar', 'Calendar'], ['texts', '/outbox', 'Texts'],
  ]
  return (
    <html lang="en-GB">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title} – {PRACTICE}</title>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body class={props.wide ? 'wide' : ''}>
        <a class="skip" href="#main">Skip to main content</a>
        <header class="site">
          <div class="in">
            <a class="brand" href="/">{PRACTICE}<span>Appointments without phone calls</span></a>
            <nav aria-label="Main">
              {nav.map(([s, href, label]) => <a href={href} aria-current={props.section === s ? 'page' : undefined}>{label}</a>)}
            </nav>
          </div>
        </header>
        <div class="phase">
          <div class="in">
            <span class="tag demo">Demo</span>
            <span>Sample practice. Texts are not really sent, they appear under Texts.</span>
            <form method="post" action="/demo/reset"><button class="secondary" style="margin:0;padding:.25rem .6rem;font-size:.85rem">Reset demo</button></form>
          </div>
        </div>
        <main id="main" class="in">{props.children}</main>
      </body>
    </html>
  )
}

export function Notice(props: { msg?: { text: string; error?: boolean } }) {
  if (!props.msg) return null
  return <div class={props.msg.error ? 'notice error' : 'notice ok'} role={props.msg.error ? 'alert' : 'status'}>{props.msg.text}</div>
}

const Urg = (p: { u: string }) => <strong class={`tag ${p.u}`}>{p.u === 'urgent' ? 'Urgent' : 'Routine'}</strong>

const STATUS: Record<string, [string, string]> = {
  new: ['To triage', 'blue'], offered: ['Offer sent', 'yellow'], booked: ['Booked', 'routine'],
  needs_times: ['Asked for more times', 'grey'], no_reply: ['No reply, offer expired', 'urgent'],
}
const Status = (p: { s: string }) => <strong class={`tag ${STATUS[p.s][1]}`}>{STATUS[p.s][0]}</strong>
const initials = (name: string) => name.split(/\s+/).filter((w) => !/^(dr|nurse)$/i.test(w)).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
const hhmm = (iso: string) => {
  const m = londonParts(new Date(iso)).minutes
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function Home() {
  return (
    <Layout title="Home" section="home">
      <h1>Book a GP appointment without waiting for a call</h1>
      <p class="lede">Tell the practice when you're free. They text you times that fit. Tap one and you're booked.</p>
      <div class="two">
        <div class="card">
          <h2>For patients</h2>
          <ol class="steps">
            <li>Say what it's about and tick the mornings or afternoons you're free.</li>
            <li>Get a text from {PRACTICE} with 2 or 3 times.</li>
            <li>Tap the one you want. No phone calls, no hold music.</li>
          </ol>
          <a class="btn" href="/request">Request an appointment</a>
        </div>
        <div class="card">
          <h2>For the practice</h2>
          <ol class="steps">
            <li>See requests in one queue, urgent first.</li>
            <li>Confirm urgent or routine.</li>
            <li>Send times that match the patient's availability. Unanswered offers release themselves.</li>
          </ol>
          <a class="btn secondary" href="/clinic">Open the clinic queue</a>
        </div>
      </div>
    </Layout>
  )
}

export function AvailabilityGrid(props: { days: string[]; checked?: DayHalf[] }) {
  const isChecked = (day: string, half: string) => props.checked?.some((a) => a.day === day && a.half === half)
  return (
    <table class="grid">
      <thead><tr><th scope="col">Day</th><th scope="col">Morning<br /><span class="hint">8am to 1pm</span></th><th scope="col">Afternoon<br /><span class="hint">1pm to 6:30pm</span></th></tr></thead>
      <tbody>
        {props.days.map((d) => (
          <tr>
            <th scope="row">{formatDay(d)}</th>
            {(['am', 'pm'] as const).map((h) => (
              <td><input type="checkbox" name="slot" value={`${d}:${h}`} checked={isChecked(d, h)}
                aria-label={`${formatDay(d)} ${h === 'am' ? 'morning' : 'afternoon'}`} /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function RequestForm(props: { days: string[]; errors?: FieldError[]; values?: Record<string, string | string[]> }) {
  const v = (k: string) => (typeof props.values?.[k] === 'string' ? (props.values[k] as string) : '')
  const errFor = (f: FieldError['field']) => props.errors?.find((e) => e.field === f)
  const checked = ([] as string[]).concat(props.values?.slot ?? []).map((s) => {
    const [day, half] = s.split(':'); return { day, half } as DayHalf
  })
  const Field = (p: { f: FieldError['field']; children: Child }) => {
    const e = errFor(p.f)
    return <div class={e ? 'field err' : 'field'}>{e && <span class="msg" id={`${p.f}-error`}><span class="skip">Error:</span> {e.text}</span>}{p.children}</div>
  }
  return (
    <Layout title={props.errors ? 'Error: Request an appointment' : 'Request an appointment'} section="patient">
      <a class="back" href="/">Back</a>
      {props.errors && (
        <div class="error-summary" role="alert" tabindex={-1}>
          <h2>There is a problem</h2>
          <ul>{props.errors.map((e) => <li><a href={`#${e.field === 'slot' ? 'availability' : e.field}`}>{e.text}</a></li>)}</ul>
        </div>
      )}
      <h1>Request an appointment</h1>
      <div class="warning"><i aria-hidden="true">!</i><span>If it's an emergency, call 999. For urgent advice when we're closed, call 111.</span></div>
      <form method="post" action="/request" novalidate>
        <Field f="name">
          <label class="l" for="name">Full name</label>
          <input type="text" id="name" name="name" value={v('name')} autocomplete="name" spellcheck={false} />
        </Field>
        <Field f="phone">
          <label class="l" for="phone">Mobile number</label>
          <span class="hint">We'll text you from "{PRACTICE}", so you know who it is.</span>
          <input type="tel" id="phone" name="phone" value={v('phone')} autocomplete="tel" style="max-width:12em" />
        </Field>
        <Field f="reason">
          <label class="l" for="reason">What do you need an appointment for?</label>
          <span class="hint">A sentence or two is enough.</span>
          <textarea id="reason" name="reason" rows={3}>{v('reason')}</textarea>
        </Field>
        <div class="field">
          <fieldset>
            <legend class="l">Do any of these apply to you now?</legend>
            <span class="hint">This helps us see urgent requests first. A person always checks.</span>
            <label class="cb"><input type="checkbox" name="chest" checked={props.values?.chest === 'on'} /> Chest pain or difficulty breathing</label>
            <label class="cb"><input type="checkbox" name="worse" checked={props.values?.worse === 'on'} /> It's getting worse quickly</label>
          </fieldset>
        </div>
        <Field f="slot">
          <fieldset id="availability">
            <legend class="l">When could you come in?</legend>
            <span class="hint">Tick every morning or afternoon that works. More ticks mean a sooner appointment.</span>
            <AvailabilityGrid days={props.days} checked={checked} />
          </fieldset>
        </Field>
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
    <Layout title="Your appointment request" section="patient">
      <Notice msg={props.msg?.error ? props.msg : undefined} />
      {req.status === 'booked' && booked && (
        <>
          <div class="panel"><h1>You're booked</h1><p><strong>{formatWhen(booked.starts_at)}</strong><br />with {booked.clinician}</p></div>
          <p>We've sent the details to {req.phone}. Please arrive 5 minutes early at {PRACTICE}.</p>
        </>
      )}
      {req.status === 'offered' && offer?.status === 'pending' && (
        <form method="post" action={`/r/${req.token}/accept`}>
          <h1>Choose an appointment time</h1>
          <p>We're holding these for you until <strong>{formatWhen(offer.expires_at)}</strong>. Tap one to book it.</p>
          {offer.slots.map((s) => (
            <button class="choice" name="slot_id" value={String(s.id)}>
              <b>{formatWhen(s.starts_at)}</b>{s.clinician} · {s.duration_min} minutes
            </button>
          ))}
          <p class="muted" style="margin-top:1rem">If none of these work, do nothing. When the hold ends we'll free the times and text you new ones.</p>
        </form>
      )}
      {req.status === 'needs_times' && (
        <form method="post" action={`/r/${req.token}/times`}>
          <h1>We need a few more times</h1>
          <p>None of the times you gave are free. Tick some more mornings or afternoons you could come in.</p>
          <div class="field"><fieldset><legend class="l">When could you come in?</legend><AvailabilityGrid days={props.days} /></fieldset></div>
          <button>Add these times</button>
        </form>
      )}
      {req.status === 'new' && (
        <>
          <h1>Request received</h1>
          <div class="inset">You don't need to call us or wait for a call. We'll text {req.phone} with times that fit.</div>
        </>
      )}
      {req.status === 'no_reply' && (
        <>
          <h1>Your offer has ended</h1>
          <div class="inset">We've released the times we held. Your request is <strong>not cancelled</strong>: we'll text you new times.</div>
        </>
      )}
      <h2 style="margin-top:1.6rem">Your request</h2>
      <dl class="summary">
        <dt>Name</dt><dd>{req.patient_name}</dd>
        <dt>Reason</dt><dd>{req.reason}</dd>
        <dt>Sent</dt><dd>{formatWhen(req.created_at)}</dd>
      </dl>
    </Layout>
  )
}

export function ClinicQueue(props: { requests: RequestRow[]; bookings: SlotRow[]; msg?: { text: string; error?: boolean } }) {
  const toAct = props.requests.filter((r) => r.status === 'new' || r.status === 'no_reply')
  const waiting = props.requests.filter((r) => r.status === 'offered' || r.status === 'needs_times')
  const Table = (p: { rows: RequestRow[] }) => (
    <table class="t">
      <thead><tr><th scope="col">Patient</th><th scope="col">Urgency</th><th scope="col">Status</th><th scope="col">Received</th></tr></thead>
      <tbody>{p.rows.map((r) => (
        <tr>
          <td><a href={`/clinic/requests/${r.id}`}><strong>{r.patient_name}</strong></a><br /><span class="muted">{r.reason.length > 70 ? `${r.reason.slice(0, 70)}…` : r.reason}</span></td>
          <td><Urg u={r.urgency ?? r.suggested_urgency} />{!r.urgency && <><br /><span class="muted">suggested</span></>}</td>
          <td><Status s={r.status} /></td>
          <td class="muted">{formatWhen(r.created_at)}</td>
        </tr>
      ))}</tbody>
    </table>
  )
  return (
    <Layout title="Clinic queue" section="clinic">
      <Notice msg={props.msg} />
      <h1>Clinic queue</h1>
      <div class="card"><h2>Needs action ({toAct.length})</h2>
        {toAct.length === 0 ? <p class="muted">Nothing to triage.</p> : <Table rows={toAct} />}
      </div>
      <div class="card"><h2>Waiting for the patient ({waiting.length})</h2>
        {waiting.length === 0 ? <p class="muted">None.</p> : <Table rows={waiting} />}
      </div>
      <div class="card"><h2>Booked without a phone call ({props.bookings.length})</h2>
        {props.bookings.length === 0 ? <p class="muted">None yet.</p> : (
          <table class="t"><thead><tr><th scope="col">When</th><th scope="col">Clinician</th><th scope="col">Patient</th></tr></thead>
            <tbody>{props.bookings.map((s) => (
              <tr><td>{formatWhen(s.starts_at)}</td><td>{s.clinician}</td>
                <td><a href={`/clinic/requests/${s.request_id}`}>{props.requests.find((r) => r.id === s.request_id)?.patient_name}</a></td></tr>
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
    <Layout title={req.patient_name} section="clinic">
      <a class="back" href="/clinic">Back to queue</a>
      <Notice msg={props.msg} />
      <h1>{req.patient_name} <Urg u={urgency} /> <Status s={req.status} /></h1>
      <div class="two">
        <dl class="summary">
          <dt>Reason</dt><dd>{req.reason}</dd>
          <dt>Red flags</dt><dd>{flags.length ? <strong>{flags.join(', ')}</strong> : 'None ticked'}</dd>
          <dt>Mobile</dt><dd>{req.phone} · <a href={`/outbox/${req.phone}`}>texts</a></dd>
          <dt>Received</dt><dd>{formatWhen(req.created_at)}</dd>
        </dl>
        <dl class="summary">
          <dt>Free</dt>
          <dd>{props.availability.map((a) => <>{formatDay(a.day)} {a.half === 'am' ? 'morning' : 'afternoon'}<br /></>)}</dd>
        </dl>
      </div>

      {inQueue && (
        <form method="post" action={`/clinic/requests/${req.id}/urgency`} class="card" style="margin-top:1.4rem">
          <h2>Step 1: Triage</h2>
          <p>Suggested from the patient's answers: <Urg u={req.suggested_urgency} />.{' '}
            {req.urgency ? <>Confirmed as <Urg u={req.urgency} />.</> : <strong>Not confirmed yet.</strong>}</p>
          <button name="urgency" value="urgent" class={req.urgency === 'urgent' ? 'selected' : 'secondary'}>Urgent: within 24 hours, {OFFER_HOURS.urgent} hours to reply</button>
          <button name="urgency" value="routine" class={req.urgency === 'routine' ? 'selected' : 'secondary'}>Routine: {OFFER_HOURS.routine} hours to reply</button>
        </form>
      )}

      {inQueue && req.urgency && (
        props.matches.length > 0 ? (
          <form method="post" action={`/clinic/requests/${req.id}/offer`} class="card">
            <fieldset>
              <legend class="l" style="font-size:1.35rem">Step 2: Offer times</legend>
              <span class="hint">Open slots inside the patient's free times{req.urgency === 'urgent' ? ' in the next 24 hours' : ''}, soonest first. Choose up to {MAX_OFFER_SLOTS}.</span>
              {props.matches.slice(0, 12).map((s, i) => (
                <label class="cb"><input type="checkbox" name="slot_id" value={String(s.id)} checked={i < MAX_OFFER_SLOTS} />
                  <span><strong>{formatWhen(s.starts_at)}</strong> · {s.clinician} ({s.role})</span></label>
              ))}
            </fieldset>
            <p style="margin-top:1rem"><button>Text these times to the patient</button></p>
          </form>
        ) : (
          <form method="post" action={`/clinic/requests/${req.id}/ask-times`} class="card">
            <h2>Step 2: No open slot fits</h2>
            <p>No open slot falls inside the patient's free times{req.urgency === 'urgent' ? ' in the next 24 hours. For an urgent case you may want to phone them' : ''}.</p>
            <button>Ask the patient for more times</button>
          </form>
        )
      )}

      {req.status === 'offered' && offer?.status === 'pending' && (
        <div class="card">
          <h2>Offer sent</h2>
          <p>Held until <strong>{formatWhen(offer.expires_at)}</strong>:</p>
          <ul>{offer.slots.map((s) => <li>{formatWhen(s.starts_at)} · {s.clinician}</li>)}</ul>
          <form method="post" action={`/clinic/requests/${req.id}/expire`}>
            <button class="secondary">Demo: end this offer now</button>
          </form>
        </div>
      )}
      {req.status === 'needs_times' && <div class="inset">Waiting for the patient to add more times.</div>}
      {req.status === 'booked' && props.booked && (
        <div class="panel"><h1>Booked</h1><p>{formatWhen(props.booked.starts_at)} with {props.booked.clinician}</p></div>
      )}
      <p class="muted">Patient's page: <a href={`/r/${req.token}`}>open as the patient</a></p>
    </Layout>
  )
}

// Week calendar geometry: 08:00–18:30 London time.
const DAY_START = 8 * 60
const DAY_END = 18 * 60 + 30
const PX_PER_MIN = 1.5

export function Calendar(props: { days: string[]; slots: SlotRow[]; requests: RequestRow[]; now: Date }) {
  const clinicians = [...new Map(props.slots.map((s) => [s.clinician_id, s.clinician])).entries()]
  const lanes = clinicians.length || 1
  const height = (DAY_END - DAY_START) * PX_PER_MIN
  const today = londonParts(props.now)
  const names = new Map(props.requests.map((r) => [r.id, r.patient_name]))
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START / 60 + i).filter((h) => h * 60 <= DAY_END)
  const label = (s: SlotRow) => {
    const who = s.request_id ? names.get(s.request_id) : undefined
    const what = s.status === 'open' ? 'Free' : s.status === 'held' ? `Held for ${who}` : who ? `Booked: ${who}` : 'Booked'
    return `${hhmm(s.starts_at)} ${s.clinician}, ${what}`
  }
  return (
    <Layout title="Calendar" section="calendar" wide>
      <h1>Appointments this week</h1>
      <div class="key" aria-label="Key">
        <span><span class="sw" style="background:#e8f4ee;border-color:#00703c" />Free</span>
        <span><span class="sw" style="background:#fff7bf;border-color:#b58800" />Held for an offer</span>
        <span><span class="sw" style="background:#d2e2f1;border-color:#1d70b8" />Booked through this app</span>
        <span><span class="sw" style="background:#e5e6e7;border-color:#6f777b" />Booked by other patients</span>
        <span class="muted">Columns in each day: {clinicians.map(([, n]) => n).join(' · ')}</span>
      </div>
      <div class="cal-wrap">
        <div class="cal" style={`--hr:${60 * PX_PER_MIN}px`}>
          <div class="head" />
          {props.days.map((d) => (
            <div class={d === today.day ? 'head today' : 'head'}>
              <b>{formatDay(d)}</b>
              <div class="lanes" style={`grid-template-columns:repeat(${lanes},1fr)`}>
                {clinicians.map(([, n]) => <span title={n}>{initials(n)}</span>)}
              </div>
            </div>
          ))}
          <div class="times" style={`height:${height}px`}>
            {hours.map((h) => <span style={`top:${(h * 60 - DAY_START) * PX_PER_MIN}px${h * 60 === DAY_START ? ';transform:none' : ''}`}>{h <= 12 ? h : h - 12}{h < 12 ? 'am' : 'pm'}</span>)}
          </div>
          {props.days.map((d) => {
            const daySlots = props.slots.filter((s) => londonParts(new Date(s.starts_at)).day === d)
            return (
              <div class={daySlots.length ? 'col' : 'col closed'} style={`height:${height}px`}>
                {d === today.day && today.minutes >= DAY_START && today.minutes <= DAY_END && (
                  <div class="now" style={`top:${(today.minutes - DAY_START) * PX_PER_MIN}px`} aria-label="Now" />
                )}
                {daySlots.map((s) => {
                  const lane = clinicians.findIndex(([id]) => id === s.clinician_id)
                  const start = londonParts(new Date(s.starts_at)).minutes
                  const cls = `ev ${s.status === 'booked' && s.request_id ? 'mine' : s.status}${new Date(s.starts_at) < props.now ? ' past' : ''}`
                  const style = `top:${(start - DAY_START) * PX_PER_MIN}px;height:${Math.max(s.duration_min * PX_PER_MIN, 34)}px;` +
                    `left:${(lane * 100) / lanes}%;width:calc(${100 / lanes}% - 4px)`
                  const who = s.request_id ? initials(names.get(s.request_id) ?? '') : ''
                  const sub = s.status === 'open' ? 'Free' : s.status === 'held' ? `Held ${who}` : who || 'Booked'
                  const text = <>{hhmm(s.starts_at)}<small>{sub}</small></>
                  return s.request_id
                    ? <a class={cls} style={style} href={`/clinic/requests/${s.request_id}`} title={label(s)} aria-label={label(s)}>{text}</a>
                    : <div class={cls} style={style} title={label(s)} aria-label={label(s)}>{text}</div>
                })}
              </div>
            )
          })}
        </div>
      </div>
    </Layout>
  )
}

const linkify = (body: string) =>
  body.split(/(https?:\/\/\S+)/).map((part, i) => (i % 2 ? <a href={new URL(part).pathname}>{part}</a> : part))

/** Conversations, one per phone number, newest first. `messages` arrive newest first. */
export function Outbox(props: { messages: MessageRow[] }) {
  const threads = new Map<string, MessageRow[]>()
  for (const m of props.messages) threads.set(m.to_phone, [...(threads.get(m.to_phone) ?? []), m])
  return (
    <Layout title="Texts" section="texts">
      <h1>Texts</h1>
      <p>Every text the practice has sent, grouped by mobile number. In the real product these go out as SMS from "{PRACTICE}".</p>
      {threads.size === 0 ? <p>No texts yet.</p> : (
        <ul class="convos">
          {[...threads.entries()].map(([phone, msgs]) => (
            <li><a href={`/outbox/${encodeURIComponent(phone)}`}>
              <span class="avatar" aria-hidden="true">{initials(msgs[0].patient_name)}</span>
              <span class="meta">
                <span class="top"><strong>{msgs[0].patient_name}</strong><small>{formatWhen(msgs[0].created_at)}</small></span>
                <span class="prev" style="display:block">{msgs[0].body}</span>
                <small class="muted">{phone} · {msgs.length} {msgs.length === 1 ? 'text' : 'texts'}</small>
              </span>
            </a></li>
          ))}
        </ul>
      )}
    </Layout>
  )
}

/** One phone's thread, drawn as the patient's Messages app would show it. `messages` arrive newest first. */
export function Thread(props: { phone: string; messages: MessageRow[] }) {
  const msgs = [...props.messages].reverse()
  return (
    <Layout title={`Texts to ${props.phone}`} section="texts">
      <a class="back" href="/outbox">All texts</a>
      <div class="phone">
        <div class="bar">
          <span class="avatar" aria-hidden="true">{initials(PRACTICE)}</span>
          <b>{PRACTICE}</b>
          <small>Texts to {msgs[0]?.patient_name} · {props.phone}</small>
        </div>
        <div class="thread">
          {msgs.length === 0 && <p class="muted">No texts to this number.</p>}
          {msgs.map((m, i) => (
            <>
              {(i === 0 || new Date(m.created_at).getTime() - new Date(msgs[i - 1].created_at).getTime() > 15 * 60_000) &&
                <time datetime={m.created_at}>{formatWhen(m.created_at)}</time>}
              <div class="bubble">{linkify(m.body)}</div>
            </>
          ))}
        </div>
      </div>
    </Layout>
  )
}

export function NotFound() {
  return (
    <Layout title="Page not found">
      <h1>Page not found</h1>
      <p>If you typed the web address, check it is correct.</p>
      <p>If you followed a link from a text, it may be out of date. <a href="/">Go to the start</a>.</p>
    </Layout>
  )
}
